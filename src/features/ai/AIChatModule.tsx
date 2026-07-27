// AI Chat (§11.1) — the NL→SQL pipeline's user surface. The composer runs a
// question through `askAI`; the transcript renders each turn's full audit trail
// (AITurnView). The chat is provider-agnostic: `resolveProvider` returns the
// backend for the active mode. Cloud mode routes through the edge AI router
// (build/09-edge/01) when an endpoint is configured; with no Worker deployed, or
// for a mode whose backend is still unwired (BYOK in 02-modes-byok, WebLLM in
// v0.25), it degrades to a clear message rather than a dead input. The transcript
// is never persisted — it is content-bearing (D41) and must not reach localStorage.
import { useRef, useState } from 'react';
import { SendHorizontal, ShieldCheck, Cloud } from 'lucide-react';
import { useAISessionStore } from '../../stores/aiSession';
import { useDatasetsStore } from '../../stores/datasets';
import { useSettingsStore } from '../../stores/settings';
import { useByokKeyStore } from '../../stores/byokKey';
import { useVaultStore } from '../../stores/vault';
import { useWebLLMStore } from '../../stores/webllm';
import { askAI } from '../../services/ai';
import { resolveProvider } from '../../services/aiProvider';
import { runChartQuery } from '../../services/charts';
import { isOllamaEndpoint } from '../../services/ollamaProvider';
import type { AITurn } from '../../types';
import type { CloudProviderConfig } from '../../services/cloudProvider';
import { AITurnView } from './AITurnView';
import { describeAIStatus, aiStatusLabel } from './aiStatusUtils';

// The deployed edge router endpoint. Falls back to staging if unset.
const EDGE_AI_ROUTER = (import.meta.env.VITE_EDGE_AI_ROUTER ?? 'https://datascope-edge-staging.justinclarke.workers.dev/ai-router') as string;

// One opaque, content-free session id per tab — keys the router's shared limiter.
const CLOUD_SESSION_ID = crypto.randomUUID();

function assistantError(content: string): AITurn {
  return { id: crypto.randomUUID(), role: 'assistant', content: '', createdAt: new Date().toISOString(), error: content };
}

export function AIChatModule() {
  const transcript = useAISessionStore((s) => s.transcript);
  const addTurn = useAISessionStore((s) => s.addTurn);
  const appendTurn = useAISessionStore((s) => s.appendTurn);
  const tables = useDatasetsStore((s) => s.tables);
  const aiMode = useSettingsStore((s) => s.aiMode);
  // The D3 toggle the settings panel writes — not the aiSession stub's field.
  const byokPreference = useSettingsStore((s) => s.byokPreference);
  const byokRoutingTouched = useSettingsStore((s) => s.byokRoutingTouched);
  const metadataOnlyRepair = useSettingsStore((s) => s.metadataOnlyRepair);
  const webllmConsent = useSettingsStore((s) => s.webllmConsent);
  const webllmStatus = useWebLLMStore((s) => s.status);
  const byokKey = useByokKeyStore((s) => s.key);
  const vaultRef = useVaultStore((s) => s.ref);
  const vaultSession = useVaultStore((s) => s.session);
  // Mirrors the provider ladder's local rung: the next question runs on-device.
  // Local model ignores the key/endpoint field entirely (resolveProvider's
  // local-model branch does too) — only API mode's WebLLM rung opts out when
  // a key or endpoint is set.
  const servedLocally =
    webllmStatus === 'ready' &&
    webllmConsent === 'accepted' &&
    aiMode !== 'local-only' &&
    aiMode !== null &&
    (aiMode === 'local-model' || (byokKey === null && vaultRef === null));
  const status = describeAIStatus({
    aiMode,
    servedLocally,
    byokValue: byokKey,
    // A remembered key is a standing choice of provider, the same as a key
    // typed into the field — it opts the same way out of the WebLLM handoff.
    vaulted: vaultRef !== null,
    byokPreference,
    byokRoutingTouched,
    endpointConfigured: EDGE_AI_ROUTER.length > 0,
  });

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const submit = async () => {
    const question = draft.trim();
    if (!question || busy) return;
    setDraft('');
    addTurn({ role: 'user', content: question });

    // Cloud (API mode) routes via the edge router (free tier by default, BYOK
    // when a bearer key is set). The raw key rides per-request as a stateless
    // pass-through (D9) — the router attaches and forwards it, never persists
    // it. OpenAI is the one provider the pass-through resolver speaks today.
    // A URL-shaped field value is a local Ollama endpoint, not a bearer
    // credential — resolveProvider routes it to Ollama directly and it never
    // reaches the edge router, so it's never attached here either.
    // A remembered key (D9 opt-in vault) serves when this tab holds no key of
    // its own: the reference and its durable session go up instead, and the
    // router reads the key server-side. The in-memory key wins when both exist
    // — it is what the user just typed.
    const cloudConfig: CloudProviderConfig = {
      endpoint: EDGE_AI_ROUTER,
      sessionId: CLOUD_SESSION_ID,
      routing: byokPreference,
      byok:
        byokKey !== null && !isOllamaEndpoint(byokKey)
          ? { provider: 'openai', key: byokKey }
          : byokKey === null && vaultRef !== null && vaultSession !== null
            ? { provider: 'openai', vaultRef, vaultSession }
            : undefined,
    };
    const { provider, overflowProvider } = resolveProvider(aiMode ?? "local-only", cloudConfig);
    if (!provider) {
      appendTurn(assistantError("AI chat isn’t ready in this mode yet."));
      return;
    }

    setBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const turn = await askAI(question, {
        provider,
        overflowProvider,
        overflowBaseUrl: overflowProvider !== undefined ? (byokKey ?? undefined) : undefined,
        tables,
        runSql: (sql) => runChartQuery(sql),
        metadataOnlyRepair,
        signal: controller.signal,
      });
      appendTurn(turn);
    } catch {
      // AbortError (superseded) — drop silently; a newer question is in flight.
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 space-y-4 overflow-auto">
        {transcript.length === 0 ? (
          <p className="text-sm text-(--color-fg-muted)">
            Ask a question in plain English — DataScope writes the SQL, runs it in your browser, and shows every query it ran.
          </p>
        ) : (
          transcript.map((turn) => <AITurnView key={turn.id} turn={turn} />)
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-(--color-fg-muted)" role="status">
        {status.kind === 'cloud' || status.kind === 'not-connected' ? (
          <Cloud size={14} aria-hidden="true" className="text-(--color-ai-2)" />
        ) : (
          <ShieldCheck size={14} aria-hidden="true" className="text-(--color-ai-2)" />
        )}
        {aiStatusLabel(status)}
      </p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. average fare by passenger class"
          className="flex-1 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-fg) focus:border-(--color-ai)/50"
          aria-label="Ask a question about your data"
        />
        <button
          type="submit"
          disabled={busy || draft.trim() === ''}
          className="rounded-lg bg-(--color-ai) px-3 py-2 text-(--color-ai-ink) disabled:opacity-40"
          aria-label="Send"
        >
          <SendHorizontal size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
