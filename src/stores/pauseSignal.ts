// Reactive, last-known kill-switch signal (W7, master §13.3 status-bar
// paragraph). Pause flags (`edge/shared/killSwitch.ts`) are per-endpoint env
// vars checked server-side only when a request is actually attempted — there
// is no `/status` endpoint or proactive client-side tracking. This store only
// ever reflects the most recent surface that actually hit a `'paused'` code;
// it never polls. Wired at the vault path only — the AI-router path
// deliberately collapses `'paused'` into `ProviderQuotaExhaustedError` already
// (`services/cloudProvider.ts`), an existing, intentional design decision this
// store does not reopen.
import { create } from 'zustand';

interface PauseSignal {
  surface: string;
  at: string;
}

interface PauseSignalState {
  lastPaused: PauseSignal | null;
  reportPaused: (surface: string) => void;
  clear: () => void;
}

export const usePauseSignalStore = create<PauseSignalState>((set) => ({
  lastPaused: null,
  reportPaused: (surface) => set({ lastPaused: { surface, at: new Date().toISOString() } }),
  clear: () => set({ lastPaused: null }),
}));
