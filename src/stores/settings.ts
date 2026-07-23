// Settings: the only store persisted to localStorage (§5.2, §21.7 state tree).
// Never dataset contents, never a raw BYOK key — `byokPreference` is the D3
// routing toggle only; key custody (D9) is the vault/BYOK service's job.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AIMode } from '../types';

export type Theme = 'light' | 'dark' | 'system';
export type BYOKPreference = 'prefer-key' | 'free-tier-first';
/** The in-browser local model download is ask-first: null = not asked yet. */
export type WebLLMConsent = 'accepted' | 'declined' | null;

export const SETTINGS_STORAGE_KEY = 'datascope-settings';

interface SettingsState {
  // D2: no silent default — null means the first-run AI-mode chooser hasn't run yet.
  aiMode: AIMode | null;
  byokPreference: BYOKPreference;
  /**
   * Whether the D3 routing toggle was ever explicitly chosen, vs. still sitting
   * on its stored default. An Ollama-shaped BYOK field only overflows through
   * the shared cloud budget under an *explicit* free-tier-first choice — an
   * untouched default must never silently start sending a local-Ollama user's
   * payloads to the cloud (2026-07-23).
   */
  byokRoutingTouched: boolean;
  theme: Theme;
  // D68d: the expert/returning-user escape hatch — remembered so a later
  // ingest lands straight on the per-table profile instead of the Verdict.
  skipToData: boolean;
  // The ~830 MB in-browser model is never downloaded silently: the user is
  // asked once, and a decline leaves the quota'd cloud free tier serving.
  // The choice is a preference (safe to persist), never dataset content.
  webllmConsent: WebLLMConsent;
  // §11.3 / 06-ai/03: metadata-only by default (privacy-safer) — the retry
  // loop's stage-5 "data-sampled repair" only resamples real rows on a failed
  // attempt when this is explicitly turned off. A preference, not content.
  metadataOnlyRepair: boolean;

  setAIMode: (mode: AIMode) => void;
  setByokPreference: (preference: BYOKPreference) => void;
  setTheme: (theme: Theme) => void;
  setSkipToData: (skip: boolean) => void;
  setWebllmConsent: (consent: WebLLMConsent) => void;
  setMetadataOnlyRepair: (metadataOnly: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      aiMode: null,
      byokPreference: 'free-tier-first',
      byokRoutingTouched: false,
      theme: 'system',
      skipToData: false,
      webllmConsent: null,
      metadataOnlyRepair: true,

      setAIMode: (mode) => set({ aiMode: mode }),
      setByokPreference: (preference) => set({ byokPreference: preference, byokRoutingTouched: true }),
      setTheme: (theme) => set({ theme }),
      setSkipToData: (skip) => set({ skipToData: skip }),
      setWebllmConsent: (consent) => set({ webllmConsent: consent }),
      setMetadataOnlyRepair: (metadataOnly) => set({ metadataOnlyRepair: metadataOnly }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
