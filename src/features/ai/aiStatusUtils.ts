import { WEBLLM_MODEL_ID } from '../../services/webllm';
import { DEFAULT_OLLAMA_MODEL, isOllamaEndpoint } from '../../services/ollamaProvider';
import type { AIMode } from '../../types';
import type { BYOKPreference } from '../../stores/settings';

type AIStatus =
  | { kind: 'off' }
  | { kind: 'local'; engine: 'browser' | 'ollama'; model: string }
  | { kind: 'local-pending' }
  | { kind: 'cloud'; detail: string }
  | { kind: 'not-connected' };

export function describeAIStatus(params: {
  aiMode: AIMode | null;
  servedLocally: boolean;
  byokValue: string | null;
  /** Whether a key is remembered in the vault (D9 opt-in) — serves when the field is empty. */
  vaulted?: boolean;
  byokPreference: BYOKPreference;
  byokRoutingTouched: boolean;
  endpointConfigured: boolean;
}): AIStatus {
  const { aiMode, servedLocally, byokValue, byokPreference, byokRoutingTouched, endpointConfigured } = params;
  const vaulted = params.vaulted === true;
  if (aiMode === null || aiMode === 'local-only') return { kind: 'off' };
  if (servedLocally) return { kind: 'local', engine: 'browser', model: WEBLLM_MODEL_ID };
  // "Local model" narrows to in-browser WebLLM only (2026-07-22) — cold and
  // not served locally means not ready yet, never a silent Ollama claim.
  if (aiMode === 'local-model') return { kind: 'local-pending' };
  // aiMode === 'cloud', labeled "API" in the UI. A URL-shaped field value's
  // routing (2026-07-23, D3): an *explicit* free-tier-first tries the shared
  // cloud budget first, with this endpoint as the client-orchestrated
  // overflow — genuinely a cloud disposition, not the zero-egress `local` kind
  // below. Untouched or "prefer my key" routing goes straight to Ollama.
  if (byokValue !== null && isOllamaEndpoint(byokValue)) {
    if (byokRoutingTouched && byokPreference === 'free-tier-first' && endpointConfigured) {
      return { kind: 'cloud', detail: 'shared free tier, your local Ollama on overflow' };
    }
    return { kind: 'local', engine: 'ollama', model: DEFAULT_OLLAMA_MODEL };
  }
  if (!endpointConfigured) return { kind: 'not-connected' };
  if (byokValue !== null || vaulted) {
    const which = byokValue === null ? 'your remembered key' : 'your API key';
    return byokPreference === 'prefer-key'
      ? { kind: 'cloud', detail: which }
      : { kind: 'cloud', detail: `shared free tier, ${byokValue === null ? 'your remembered key' : 'your key'} on overflow` };
  }
  return { kind: 'cloud', detail: 'shared free tier' };
}

export function aiStatusLabel(status: AIStatus): string {
  switch (status.kind) {
    case 'off':
      return 'AI is off — answers come from deterministic templates only, nothing leaves your browser.';
    case 'local':
      return status.engine === 'browser'
        ? `Running locally in your browser — ${status.model}, zero egress.`
        : `Running locally via Ollama — ${status.model}, zero egress.`;
    case 'local-pending':
      return 'Local model selected — download it in AI settings to start answering questions.';
    case 'cloud':
      return `API — ${status.detail}.`;
    case 'not-connected':
      return 'API mode selected, but not connected yet.';
  }
}
