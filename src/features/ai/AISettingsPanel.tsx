// AI settings (§5.1, §11.2, D2/D3/D9): switch modes, choose BYOK routing, and
// enter a key or endpoint. Key custody is the D9 default — the raw field value
// lives in browser memory only (useByokKeyStore, non-persisted), disclosed here
// in plain words. The field auto-detects its own shape (2026-07-22): a URL is a
// local Ollama endpoint (reached directly, never through the Worker, never
// vault-eligible); anything else is a bearer key. "Remember my key" (the
// server-side vault, build/09-edge/03-vault) is shown but not yet available, so
// the panel never implies a persisted key it can't deliver. BYOK routing
// overflow itself lives in the edge router (build/09-edge/01).
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useSettingsStore } from '../../stores/settings';
import { useByokKeyStore } from '../../stores/byokKey';
import { useVaultStore } from '../../stores/vault';
import { useWebLLMStore } from '../../stores/webllm';
import { usePauseSignalStore } from '../../stores/pauseSignal';
import { WEBLLM_DOWNLOAD_SIZE } from '../../services/webllm';
import { isOllamaEndpoint } from '../../services/ollamaProvider';
import { storeVaultedKey, deleteVaultedKey } from '../../services/vaultClient';
import { usePersistenceStore } from '../../stores/persistence';
import { clearWorkspaceData, estimateWorkspaceBytes } from '../../services/workspace';
import { formatBytes } from '../../lib/formatBytes';
import type { VaultErrorCode } from '../../../edge/protocol';
import type { AIMode } from '../../types';

const MODE_LABELS: Record<AIMode, string> = {
  'local-only': 'Local-only (AI off)',
  'local-model': 'Local model (in-browser)',
  cloud: 'API',
};

/**
 * Why a store attempt failed, in the user's terms. Each says what to do next —
 * an unavailable vault and a full one are different problems.
 */
const UNREACHABLE = 'Couldn’t reach the vault — your key stays in this tab only.';

const STORE_FAILURE: Partial<Record<VaultErrorCode | 'unreachable', string>> = {
  unavailable: 'Remembering keys isn’t available on this deployment — your key stays in this tab only.',
  paused: 'The vault is paused right now — your key stays in this tab only.',
  'cap-reached': 'You’ve already stored the maximum of 3 keys. Remove one first.',
  'rate-limited': 'Too many vault changes in a short time — try again shortly.',
  'bad-request': 'That key couldn’t be stored.',
  unreachable: UNREACHABLE,
};

/**
 * "Clear workspace data" (S6.9 scope call 2) — the only user answer to "get
 * this off my machine" now that dataset bytes survive a refresh (§5.2, as
 * amended). It empties this browser's origin-private storage *and* the
 * persisted registry keys, then reloads, because a half-clear that leaves
 * metadata pointing at deleted bytes is the exact inconsistency 07d exists to
 * prevent. The copy states what is verifiable and never claims "securely
 * erased" (D21) — a browser cannot promise what the filesystem underneath it
 * did.
 */
function WorkspaceDataSection() {
  const [usedBytes, setUsedBytes] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const stagingStatus = usePersistenceStore((s) => s.status);
  const stagingNote = usePersistenceStore((s) => s.note);

  useEffect(() => {
    void estimateWorkspaceBytes().then(setUsedBytes);
  }, []);

  return (
    <div className="mt-5 space-y-2 border-t border-(--color-border) pt-4">
      <h3 className="text-sm font-medium text-(--color-fg)">Workspace data</h3>
      <p className="text-xs text-(--color-fg-muted)">
        Tables you drop in are stored on this device, in this browser, so a refresh doesn’t lose
        your workspace. Nothing is uploaded — this storage is inside the browser.
        {usedBytes !== null && ` This site is currently using about ${formatBytes(usedBytes)}.`}
      </p>
      {stagingNote !== null && stagingStatus !== 'ready' && (
        <p className="text-xs text-(--color-fg-muted)" role="status">
          {stagingNote}
        </p>
      )}
      <button
        type="button"
        disabled={clearing}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setClearing(true);
          void clearWorkspaceData();
        }}
        className="rounded-lg border border-(--color-border) px-3 py-2 text-sm text-(--color-fg) disabled:opacity-40"
      >
        {confirming ? 'Confirm — clear and reload' : 'Clear workspace data'}
      </button>
      {confirming && (
        <p className="text-xs text-(--color-fg-muted)">
          Removes the files this browser stored on this device and reloads the page. Your tables
          and tabs are gone after this; settings are kept.
        </p>
      )}
    </div>
  );
}

interface AISettingsPanelProps {
  onClose: () => void;
  /** Skips the `Mode` fieldset — the Workbench's `ModeSwitches` (W7) owns mode selection there, above this panel. Old-shell call sites omit this and are unaffected. */
  hideModeSwitch?: boolean;
}

export function AISettingsPanel({ onClose, hideModeSwitch = false }: AISettingsPanelProps) {
  const aiMode = useSettingsStore((s) => s.aiMode);
  const setAIMode = useSettingsStore((s) => s.setAIMode);
  const byokPreference = useSettingsStore((s) => s.byokPreference);
  const setByokPreference = useSettingsStore((s) => s.setByokPreference);
  const byokRoutingTouched = useSettingsStore((s) => s.byokRoutingTouched);
  const key = useByokKeyStore((s) => s.key);
  const setKey = useByokKeyStore((s) => s.setKey);
  const clearKey = useByokKeyStore((s) => s.clearKey);
  const webllmConsent = useSettingsStore((s) => s.webllmConsent);
  const setWebllmConsent = useSettingsStore((s) => s.setWebllmConsent);
  const webllmStatus = useWebLLMStore((s) => s.status);
  const metadataOnlyRepair = useSettingsStore((s) => s.metadataOnlyRepair);
  const setMetadataOnlyRepair = useSettingsStore((s) => s.setMetadataOnlyRepair);

  // D3 overflow (2026-07-23): an *explicit* free-tier-first choice tries the
  // shared cloud budget before this endpoint, so it is no longer genuinely
  // zero-egress — untouched or "prefer my key" routing still goes straight to
  // Ollama with nothing sent to the cloud.
  const isOllamaKey = key !== null && isOllamaEndpoint(key);
  const ollamaOverflowActive = isOllamaKey && byokRoutingTouched && byokPreference === 'free-tier-first';

  // The D9 opt-in custody path. Checking the box sends the key to the vault
  // once and keeps only the returned reference; unchecking deletes it. A failed
  // delete deliberately leaves the box checked — dropping the reference locally
  // would strand a real stored key with no way left to address it.
  const vaultSession = useVaultStore((s) => s.session);
  const vaultRef = useVaultStore((s) => s.ref);
  const remember = useVaultStore((s) => s.remember);
  const forget = useVaultStore((s) => s.forget);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultMessage, setVaultMessage] = useState<string | null>(null);

  const toggleRemember = async (checked: boolean) => {
    setVaultBusy(true);
    setVaultMessage(null);
    try {
      if (checked) {
        if (key === null) return;
        const session = vaultSession ?? crypto.randomUUID();
        const result = await storeVaultedKey({ sessionId: session, provider: 'openai', key });
        if (result.ok) remember(session, result.ref);
        else {
          if (result.code === 'paused') usePauseSignalStore.getState().reportPaused('vault');
          setVaultMessage(STORE_FAILURE[result.code] ?? UNREACHABLE);
        }
      } else {
        if (vaultRef === null || vaultSession === null) return;
        const result = await deleteVaultedKey({ sessionId: vaultSession, ref: vaultRef });
        if (result.ok) forget();
        else {
          if (result.code === 'paused') usePauseSignalStore.getState().reportPaused('vault');
          setVaultMessage('Couldn’t reach the vault — your key is still stored. Try again.');
        }
      }
    } finally {
      setVaultBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--color-scrim) p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI settings"
        className="w-full max-w-md rounded-lg border border-(--color-border) bg-(--color-bg) p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-(--color-fg)">AI settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-(--color-fg-muted) hover:bg-(--color-border)">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {!hideModeSwitch && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-(--color-fg)">Mode</legend>
            {(Object.keys(MODE_LABELS) as AIMode[]).map((mode) => (
              <label key={mode} className="flex items-center gap-2 text-sm text-(--color-fg)">
                <input
                  type="radio"
                  name="ai-mode"
                  checked={aiMode === mode}
                  onChange={() => setAIMode(mode)}
                  className="accent-(--color-accent)"
                />
                {MODE_LABELS[mode]}
              </label>
            ))}
          </fieldset>
        )}

        {(aiMode === 'cloud' || aiMode === 'local-model') && (
          <div className="mt-5 border-t border-(--color-border) pt-4">
            <label className="flex items-start gap-2 text-sm text-(--color-fg)">
              <input
                type="checkbox"
                checked={webllmConsent === 'accepted'}
                onChange={(e) => setWebllmConsent(e.target.checked ? 'accepted' : 'declined')}
                className="mt-0.5 accent-(--color-accent)"
              />
              <span>
                In-browser local model
                {webllmStatus === 'ready' && ' — ready'}
                {(webllmStatus === 'downloading' || webllmStatus === 'warming') && ' — loading…'}
                <span className="mt-0.5 block text-xs text-(--color-fg-muted)">
                  A one-time {WEBLLM_DOWNLOAD_SIZE} download; once warm, questions and view
                  tailoring run on your device with zero egress. Not used while your own key or
                  endpoint is set below — that provider serves instead.
                </span>
              </span>
            </label>
          </div>
        )}

        {aiMode === 'cloud' && (
          <div className="mt-5 space-y-3 border-t border-(--color-border) pt-4">
            <p className="text-xs text-(--color-fg-muted)">
              API mode sends schema (table/column names, types), prompts, generated SQL, and
              error traces to the routed provider. Sample data rows only if metadata-only
              repair (below) is turned off
              {ollamaOverflowActive
                ? ' — and reaches your local Ollama endpoint only as overflow, after the shared free budget runs out; switch to "Prefer my key" routing for zero egress every time.'
                : ' — and never at all when your key/endpoint below resolves to a local Ollama daemon.'}
            </p>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-(--color-fg)">Routing</legend>
              <label className="flex items-center gap-2 text-sm text-(--color-fg)">
                <input
                  type="radio"
                  name="byok-preference"
                  checked={byokPreference === 'free-tier-first'}
                  onChange={() => setByokPreference('free-tier-first')}
                  className="accent-(--color-accent)"
                />
                Use the free shared budget first, then my key
              </label>
              <label className="flex items-center gap-2 text-sm text-(--color-fg)">
                <input
                  type="radio"
                  name="byok-preference"
                  checked={byokPreference === 'prefer-key'}
                  onChange={() => setByokPreference('prefer-key')}
                  className="accent-(--color-accent)"
                />
                Prefer my key (all requests use it)
              </label>
            </fieldset>

            <div>
              <label htmlFor="byok-key" className="block text-sm font-medium text-(--color-fg)">
                Your API key or local endpoint
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="byok-key"
                  type={key && isOllamaEndpoint(key) ? 'text' : 'password'}
                  value={key ?? ''}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk-… or http://localhost:11434"
                  className="flex-1 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-fg)"
                />
                <button
                  type="button"
                  onClick={clearKey}
                  disabled={!key}
                  className="rounded-lg border border-(--color-border) px-3 py-2 text-sm text-(--color-fg) disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
              {isOllamaKey ? (
                <p className="mt-2 text-xs text-(--color-fg-muted)">
                  {ollamaOverflowActive
                    ? 'Detected as a local Ollama endpoint. With "Use the free shared budget first" routing, the shared cloud budget is tried first — this endpoint is reached directly only as overflow if that budget runs out. Switch to "Prefer my key" for zero egress every time.'
                    : 'Detected as a local Ollama endpoint — requests go directly from your browser to that address, never through our servers. Zero egress, same as the in-browser model.'}
                </p>
              ) : (
                <p className="mt-2 text-xs text-(--color-fg-muted)">
                  {vaultRef !== null && key === null
                    ? 'A remembered key is in use — this browser holds only a reference to it, so the field is empty. Uncheck below to delete the stored key.'
                    : 'Kept in this tab’s memory only — never saved to disk, and gone when you close the tab. It is attached per request and forwarded to your provider, never stored on our servers.'}
                </p>
              )}
              {!isOllamaKey && (
                <div className="mt-2">
                  <label className="flex items-start gap-2 text-xs text-(--color-fg-muted)">
                    <input
                      type="checkbox"
                      checked={vaultRef !== null}
                      disabled={vaultBusy || (vaultRef === null && !key)}
                      onChange={(e) => void toggleRemember(e.target.checked)}
                      className="mt-0.5 accent-(--color-accent)"
                    />
                    <span>
                      Remember my key across sessions
                      <span className="mt-0.5 block">
                        Stores the key on our servers, encrypted, so it survives closing the tab —
                        this browser then keeps only a reference, never the key itself. It expires
                        after 90 days without use, and unchecking this deletes it.
                      </span>
                    </span>
                  </label>
                  {vaultMessage !== null && (
                    <p className="mt-1 text-xs text-(--color-fg-muted)" role="status">
                      {vaultMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

            <label className="flex items-start gap-2 text-sm text-(--color-fg)">
              <input
                type="checkbox"
                checked={metadataOnlyRepair}
                onChange={(e) => setMetadataOnlyRepair(e.target.checked)}
                className="mt-0.5 accent-(--color-accent)"
              />
              <span>
                Metadata-only repair (recommended)
                <span className="mt-0.5 block text-xs text-(--color-fg-muted)">
                  When a query fails and needs fixing, only the error trace and schema go back
                  to the provider. Turn off to also send up to 3 real sample rows on that
                  retry — never more, and only while this is off. Takes effect on your next
                  question.
                </span>
              </span>
            </label>
          </div>
        )}

        <WorkspaceDataSection />
      </div>
    </div>
  );
}
