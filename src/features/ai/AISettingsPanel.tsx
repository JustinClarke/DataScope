// AI settings (§5.1, §11.2, D2/D3/D9): switch modes, choose BYOK routing, and
// enter a key or endpoint. Key custody is the D9 default — the raw field value
// lives in browser memory only (useByokKeyStore, non-persisted), disclosed here
// in plain words. The field auto-detects its own shape (2026-07-22): a URL is a
// local Ollama endpoint (reached directly, never through the Worker, never
// vault-eligible); anything else is a bearer key. "Remember my key" (the
// server-side vault, build/09-edge/03-vault) is shown but not yet available, so
// the panel never implies a persisted key it can't deliver. BYOK routing
// overflow itself lives in the edge router (build/09-edge/01).
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSettingsStore } from "../../stores/settings";
import { useByokKeyStore } from "../../stores/byokKey";
import { useVaultStore } from "../../stores/vault";
import { useWebLLMStore } from "../../stores/webllm";
import { usePauseSignalStore } from "../../stores/pauseSignal";
import { WEBLLM_DOWNLOAD_SIZE } from "../../services/webllm";
import {
  isOllamaEndpoint,
  listOllamaModels,
  type OllamaModelInfo,
} from "../../services/ollamaProvider";
import { LocalRuntimeSection } from "./LocalRuntimeSection";
import {
  Section,
  HudButton,
  FieldNote,
  SavedIndicator,
} from "./settingsChrome";
import { storeVaultedKey, deleteVaultedKey } from "../../services/vaultClient";
import { usePersistenceStore } from "../../stores/persistence";
import {
  clearWorkspaceData,
  estimateWorkspaceBytes,
} from "../../services/workspace";
import { formatBytes } from "../../lib/formatBytes";
import type { VaultErrorCode } from "../../../edge/protocol";
import type { AIMode } from "../../types";

const MODE_LABELS: Record<AIMode, string> = {
  "local-only": "Local-only (AI off)",
  "local-model": "Local model (in-browser)",
  cloud: "API",
};

/**
 * Why a store attempt failed, in the user's terms. Each says what to do next —
 * an unavailable vault and a full one are different problems.
 */
const UNREACHABLE =
  "Couldn’t reach the vault — your key stays in this tab only.";

const STORE_FAILURE: Partial<Record<VaultErrorCode | "unreachable", string>> = {
  unavailable:
    "Remembering keys isn’t available on this deployment — your key stays in this tab only.",
  paused: "The vault is paused right now — your key stays in this tab only.",
  "cap-reached":
    "You’ve already stored the maximum of 3 keys. Remove one first.",
  "rate-limited": "Too many vault changes in a short time — try again shortly.",
  "bad-request": "That key couldn’t be stored.",
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
    <Section title="Workspace data">
      <FieldNote>
        Tables you drop in are stored on this device, in this browser, so a
        refresh doesn’t lose your workspace. Nothing is uploaded — this storage
        is inside the browser.
        {usedBytes !== null &&
          ` This site is currently using about ${formatBytes(usedBytes)}.`}
      </FieldNote>
      {stagingNote !== null && stagingStatus !== "ready" && (
        <p className="text-xs text-(--color-ink-3)" role="status">
          {stagingNote}
        </p>
      )}
      <HudButton
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setClearing(true);
          void clearWorkspaceData();
        }}
        disabled={clearing}
        tone={confirming ? "warn" : "normal"}
      >
        {confirming ? "Confirm — clear and reload" : "Clear workspace data"}
      </HudButton>
      {confirming && (
        <FieldNote>
          Removes the files this browser stored on this device and reloads the
          page. Your tables and tabs are gone after this; settings are kept.
        </FieldNote>
      )}
    </Section>
  );
}

interface AISettingsPanelProps {
  onClose: () => void;
  /** Skips the `Mode` fieldset — the Workbench's `ModeSwitches` (W7) owns mode selection there, above this panel. Old-shell call sites omit this and are unaffected. */
  hideModeSwitch?: boolean;
}

export function AISettingsPanel({
  onClose,
  hideModeSwitch = false,
}: AISettingsPanelProps) {
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
  const setMetadataOnlyRepair = useSettingsStore(
    (s) => s.setMetadataOnlyRepair,
  );
  const ollamaModel = useSettingsStore((s) => s.ollamaModel);
  const setOllamaModel = useSettingsStore((s) => s.setOllamaModel);
  const ollamaThink = useSettingsStore((s) => s.ollamaThink);
  const setOllamaThink = useSettingsStore((s) => s.setOllamaThink);
  const ollamaTemperature = useSettingsStore((s) => s.ollamaTemperature);
  const setOllamaTemperature = useSettingsStore((s) => s.setOllamaTemperature);
  // What the daemon at the current endpoint actually has pulled. Probed rather
  // than assumed, so the model field offers real choices instead of asking the
  // user to remember exact tag strings. `probed` separates "asked, got nothing"
  // (fall back to free text) from "haven't asked yet".
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [ollamaModelsProbed, setOllamaModelsProbed] = useState(false);

  // D3 overflow (2026-07-23): an *explicit* free-tier-first choice tries the
  // shared cloud budget before this endpoint, so it is no longer genuinely
  // zero-egress — untouched or "prefer my key" routing still goes straight to
  // Ollama with nothing sent to the cloud.
  const isOllamaKey = key !== null && isOllamaEndpoint(key);
  const ollamaOverflowActive =
    isOllamaKey && byokRoutingTouched && byokPreference === "free-tier-first";

  // Re-probe whenever the endpoint changes: a different address is a different
  // daemon with a different set of models. Aborted on cleanup so a slow probe
  // for an old endpoint can't land after a newer one.
  useEffect(() => {
    if (!isOllamaKey || key === null) {
      setOllamaModels([]);
      setOllamaModelsProbed(false);
      return;
    }
    const controller = new AbortController();
    let live = true;
    void listOllamaModels({ baseUrl: key, signal: controller.signal }).then(
      (found) => {
        if (!live) return;
        setOllamaModels(found);
        setOllamaModelsProbed(true);
      },
    );
    return () => {
      live = false;
      controller.abort();
    };
  }, [isOllamaKey, key]);

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
        const result = await storeVaultedKey({
          sessionId: session,
          provider: "openai",
          key,
        });
        if (result.ok) remember(session, result.ref);
        else {
          if (result.code === "paused")
            usePauseSignalStore.getState().reportPaused("vault");
          setVaultMessage(STORE_FAILURE[result.code] ?? UNREACHABLE);
        }
      } else {
        if (vaultRef === null || vaultSession === null) return;
        const result = await deleteVaultedKey({
          sessionId: vaultSession,
          ref: vaultRef,
        });
        if (result.ok) forget();
        else {
          if (result.code === "paused")
            usePauseSignalStore.getState().reportPaused("vault");
          setVaultMessage(
            "Couldn’t reach the vault — your key is still stored. Try again.",
          );
        }
      }
    } finally {
      setVaultBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-(--color-scrim) p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI settings"
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-(--radius-md) border border-(--color-rule) bg-(--color-panel) p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between border-b border-(--color-rule) pb-4">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-(--color-ink)">
            AI settings
            <span aria-hidden="true" className="text-(--color-ai)">
              .
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-(--radius-md) p-1 text-(--color-ink-3) transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-(--color-elev) hover:text-(--color-ink)"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {!hideModeSwitch && (
          <fieldset className="space-y-2">
            <legend className="micro text-(--color-ink-3)">Mode</legend>
            {(Object.keys(MODE_LABELS) as AIMode[]).map((mode) => (
              <label
                key={mode}
                className="flex items-center gap-2 font-mono text-xs text-(--color-ink)"
              >
                <input
                  type="radio"
                  name="ai-mode"
                  checked={aiMode === mode}
                  onChange={() => setAIMode(mode)}
                  className="accent-(--color-active)"
                />
                {MODE_LABELS[mode]}
              </label>
            ))}
          </fieldset>
        )}

        {(aiMode === "cloud" || aiMode === "local-model") && (
          <Section title="In-browser model">
            <label className="flex items-start gap-2 font-mono text-xs text-(--color-ink)">
              <input
                type="checkbox"
                checked={webllmConsent === "accepted"}
                onChange={(e) =>
                  setWebllmConsent(e.target.checked ? "accepted" : "declined")
                }
                className="mt-0.5 accent-(--color-active)"
              />
              <span>
                In-browser local model
                {webllmStatus === "ready" && " — ready"}
                {(webllmStatus === "downloading" ||
                  webllmStatus === "warming") &&
                  " — loading…"}
                <span className="mt-1 block font-sans text-xs leading-relaxed text-(--color-ink-2)">
                  A one-time {WEBLLM_DOWNLOAD_SIZE} download; once warm,
                  questions and view tailoring run on your device with zero
                  egress. Not used while your own key or endpoint is set below —
                  that provider serves instead.
                </span>
              </span>
            </label>
          </Section>
        )}

        {aiMode === "cloud" && (
          <Section title="Provider">
            <FieldNote>
              API mode sends schema (table/column names, types), prompts,
              generated SQL, and error traces to the routed provider. Sample
              data rows only if metadata-only repair (below) is turned off
              {ollamaOverflowActive
                ? ' — and reaches your local Ollama endpoint only as overflow, after the shared free budget runs out; switch to "Prefer my key" routing for zero egress every time.'
                : " — and never at all when your key/endpoint below resolves to a local Ollama daemon."}
            </FieldNote>

            <fieldset className="space-y-2">
              <legend className="micro text-(--color-ink-3)">Routing</legend>
              <label className="flex items-center gap-2 font-mono text-xs text-(--color-ink)">
                <input
                  type="radio"
                  name="byok-preference"
                  checked={byokPreference === "free-tier-first"}
                  onChange={() => setByokPreference("free-tier-first")}
                  className="accent-(--color-active)"
                />
                Use the free shared budget first, then my key
              </label>
              <label className="flex items-center gap-2 font-mono text-xs text-(--color-ink)">
                <input
                  type="radio"
                  name="byok-preference"
                  checked={byokPreference === "prefer-key"}
                  onChange={() => setByokPreference("prefer-key")}
                  className="accent-(--color-active)"
                />
                Prefer my key (all requests use it)
              </label>
            </fieldset>

            <div>
              <label
                htmlFor="byok-key"
                className="block font-mono text-xs text-(--color-ink)"
              >
                Your API key or local endpoint
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="byok-key"
                  type={key && isOllamaEndpoint(key) ? "text" : "password"}
                  value={key ?? ""}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk-… or http://localhost:11434"
                  className="flex-1 rounded-(--radius-md) border border-(--color-rule) bg-(--color-canvas) px-3 py-2 font-mono text-xs text-(--color-ink)"
                />
                <HudButton onClick={clearKey} disabled={!key}>
                  Clear
                </HudButton>
              </div>
              {isOllamaKey ? (
                <p className="mt-2 text-xs text-(--color-ink-2)">
                  {ollamaOverflowActive
                    ? 'Detected as a local Ollama endpoint. With "Use the free shared budget first" routing, the shared cloud budget is tried first — this endpoint is reached directly only as overflow if that budget runs out. Switch to "Prefer my key" for zero egress every time.'
                    : "Detected as a local Ollama endpoint — requests go directly from your browser to that address, never through our servers. Zero egress, same as the in-browser model."}
                </p>
              ) : (
                <p className="mt-2 text-xs text-(--color-ink-2)">
                  {vaultRef !== null && key === null
                    ? "A remembered key is in use — this browser holds only a reference to it, so the field is empty. Uncheck below to delete the stored key."
                    : "Kept in this tab’s memory only — never saved to disk, and gone when you close the tab. It is attached per request and forwarded to your provider, never stored on our servers."}
                </p>
              )}
              {!isOllamaKey && (
                <div className="mt-2">
                  <label className="flex items-start gap-2 text-xs text-(--color-ink-2)">
                    <input
                      type="checkbox"
                      checked={vaultRef !== null}
                      disabled={vaultBusy || (vaultRef === null && !key)}
                      onChange={(e) => void toggleRemember(e.target.checked)}
                      className="mt-0.5 accent-(--color-active)"
                    />
                    <span>
                      Remember my key across sessions
                      <span className="mt-0.5 block">
                        Stores the key on our servers, encrypted, so it survives
                        closing the tab — this browser then keeps only a
                        reference, never the key itself. It expires after 90
                        days without use, and unchecking this deletes it.
                      </span>
                    </span>
                  </label>
                  {vaultMessage !== null && (
                    <p
                      className="mt-1 text-xs text-(--color-ink-2)"
                      role="status"
                    >
                      {vaultMessage}
                    </p>
                  )}
                </div>
              )}
            </div>

            {isOllamaKey && (
              <div className="space-y-3 rounded-(--radius-md) border border-(--color-rule) bg-(--color-card) p-3">
                <p className="micro text-(--color-ink-3)">Local model</p>

                <div>
                  <label
                    htmlFor="ollama-model"
                    className="block font-mono text-xs text-(--color-ink)"
                  >
                    Model
                  </label>
                  {ollamaModels.length > 0 ? (
                    <select
                      id="ollama-model"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      className="mt-1 w-full rounded-(--radius-md) border border-(--color-rule) bg-(--color-panel) px-3 py-2 font-mono text-xs text-(--color-ink)"
                    >
                      {/* The saved model may not be on this daemon — keep it
                          listed rather than silently switching the user to
                          something they didn't choose. */}
                      {!ollamaModels.some((m) => m.name === ollamaModel) && (
                        <option value={ollamaModel}>
                          {ollamaModel} (not on this server)
                        </option>
                      )}
                      {ollamaModels.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                          {m.sizeBytes > 0 ? ` — ${formatBytes(m.sizeBytes)}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="ollama-model"
                      type="text"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="qwen2.5-coder:1.5b"
                      className="mt-1 w-full rounded-(--radius-md) border border-(--color-rule) bg-(--color-panel) px-3 py-2 font-mono text-xs text-(--color-ink)"
                    />
                  )}
                  <p className="mt-1 text-xs leading-relaxed text-(--color-ink-2)">
                    {ollamaModels.length > 0
                      ? "Pulled on the server at the address above. A larger model answers harder questions but needs the memory to stay resident; if answers start timing out, try a smaller one."
                      : ollamaModelsProbed
                        ? "Couldn’t read the model list from that address — type the name instead. Check the daemon is running and reachable."
                        : "Any model you have pulled. A larger model answers harder questions but needs the memory to stay resident; if answers start timing out, try a smaller one."}
                  </p>
                </div>

                <label className="flex items-start gap-2 font-mono text-xs text-(--color-ink)">
                  <input
                    type="checkbox"
                    checked={ollamaThink}
                    onChange={(e) => setOllamaThink(e.target.checked)}
                    className="mt-0.5 accent-(--color-active)"
                  />
                  <span>
                    Let the model think first
                    <span className="mt-1 block font-sans text-xs leading-relaxed text-(--color-ink-2)">
                      Reasoning models can work through a question before
                      answering. It can help on harder questions, but it is much
                      slower, and on a memory-constrained machine it is enough
                      to push every turn past the timeout. Off unless you know
                      your model and machine can carry it. Models with no
                      thinking mode ignore this. Turning it off is a request,
                      not a guarantee — some models reason anyway and are slow
                      either way.
                    </span>
                  </span>
                </label>

                <div>
                  <label
                    htmlFor="ollama-temperature"
                    className="block font-mono text-xs text-(--color-ink)"
                  >
                    Temperature: {ollamaTemperature.toFixed(1)}
                  </label>
                  <input
                    id="ollama-temperature"
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={ollamaTemperature}
                    onChange={(e) =>
                      setOllamaTemperature(Number(e.target.value))
                    }
                    className="mt-1 w-full accent-(--color-active)"
                  />
                  <p className="mt-1 text-xs leading-relaxed text-(--color-ink-2)">
                    0 asks for the same query every time you ask the same
                    question, which is what you want when the answer is SQL.
                    Higher values vary the wording and the approach, so the same
                    question can return a different query — and a different
                    number.
                  </p>
                </div>
              </div>
            )}

          </Section>
        )}

        {aiMode === "cloud" && isOllamaKey && key !== null && (
          <LocalRuntimeSection baseUrl={key} />
        )}

        {aiMode === "cloud" && (
          <Section title="Privacy">
            <label className="flex items-start gap-2 font-mono text-xs text-(--color-ink)">
              <input
                type="checkbox"
                checked={metadataOnlyRepair}
                onChange={(e) => setMetadataOnlyRepair(e.target.checked)}
                className="mt-0.5 accent-(--color-active)"
              />
              <span>
                Metadata-only repair (recommended)
                <span className="mt-1 block font-sans text-xs leading-relaxed text-(--color-ink-2)">
                  When a query fails and needs fixing, only the error trace and
                  schema go back to the provider. Turn off to also send up to 3
                  real sample rows on that retry — never more, and only while
                  this is off. Takes effect on your next question.
                </span>
              </span>
            </label>
          </Section>
        )}

        <WorkspaceDataSection />
        <SavedIndicator subscribe={useSettingsStore.subscribe} />
      </div>
    </div>
  );
}
