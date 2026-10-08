// Settings: the only store persisted to localStorage (§5.2, §21.7 state tree).
// Never dataset contents, never a raw BYOK key — `byokPreference` is the D3
// routing toggle only; key custody (D9) is the vault/BYOK service's job.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AIMode } from "../types";
import {
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_THINK,
  DEFAULT_OLLAMA_TEMPERATURE,
  DEFAULT_OLLAMA_KEEP_ALIVE,
} from "../services/ollamaProvider";

export type Theme = "light" | "dark" | "system";
export type BYOKPreference = "prefer-key" | "free-tier-first";
/** The in-browser local model download is ask-first: null = not asked yet. */
export type WebLLMConsent = "accepted" | "declined" | null;

export const SETTINGS_STORAGE_KEY = "datascope-settings";

/**
 * A share link this browser created (§12.3, build/08-persistence/02-r2-save-share)
 * — the "links I created" list the share dialog's delete control reads.
 * `deleteToken` is the ownership proof returned once at save time (never the
 * link's own `token`, which anyone holding the URL already has); losing it
 * (e.g. a cleared localStorage) leaves the object recoverable only by its
 * 30-day TTL expiring, since there is no other way to prove ownership.
 */
export interface CreatedShareLink {
  token: string;
  deleteToken: string;
  kind: "structure" | "full-dataset";
  /** The table or dataset name shown in the "your share links" list. */
  label: string;
  createdAt: string;
  ttlSeconds: number;
}

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
  // The ~924 MB in-browser model is never downloaded silently: the user is
  // asked once, and a decline leaves the quota'd cloud free tier serving.
  // The choice is a preference (safe to persist), never dataset content.
  webllmConsent: WebLLMConsent;
  // §11.3 / 06-ai/03: metadata-only by default (privacy-safer) — the retry
  // loop's stage-5 "data-sampled repair" only resamples real rows on a failed
  // attempt when this is explicitly turned off. A preference, not content.
  metadataOnlyRepair: boolean;
  // Local-Ollama generation controls. Exposed rather than fixed because the
  // right value depends on the model behind the endpoint, which only the user
  // knows: `ollamaModel` is whatever they have pulled, `ollamaThink` matters
  // only for hybrid-reasoning models, and temperature is a correctness/variety
  // trade the user owns. See services/ollamaProvider.ts for the measurements
  // behind the defaults. Preferences, never dataset content — safe to persist.
  ollamaModel: string;
  ollamaThink: boolean;
  ollamaTemperature: number;
  /**
   * How long the daemon keeps the model resident after a question. Exposed
   * because it is the setting that decides whether closing the tab leaves
   * gigabytes held on the machine: the browser cannot stop Ollama, so this
   * window (and the unload control beside it) is the whole of the user's
   * control over that memory.
   */
  ollamaKeepAlive: string;
  // The user's own "links I created" list — local only; the server holds no
  // reverse index from session to shares (§12.3). Losing this list still
  // leaves the links working for anyone holding the URL; it only loses the
  // local "delete now" convenience.
  shareLinks: CreatedShareLink[];

  setAIMode: (mode: AIMode) => void;
  setByokPreference: (preference: BYOKPreference) => void;
  setTheme: (theme: Theme) => void;
  setSkipToData: (skip: boolean) => void;
  setWebllmConsent: (consent: WebLLMConsent) => void;
  setMetadataOnlyRepair: (metadataOnly: boolean) => void;
  setOllamaModel: (model: string) => void;
  setOllamaThink: (think: boolean) => void;
  setOllamaTemperature: (temperature: number) => void;
  setOllamaKeepAlive: (keepAlive: string) => void;
  addShareLink: (link: CreatedShareLink) => void;
  removeShareLink: (token: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      aiMode: null,
      byokPreference: "free-tier-first",
      byokRoutingTouched: false,
      theme: "system",
      skipToData: false,
      webllmConsent: null,
      metadataOnlyRepair: true,
      ollamaModel: DEFAULT_OLLAMA_MODEL,
      ollamaThink: DEFAULT_OLLAMA_THINK,
      ollamaTemperature: DEFAULT_OLLAMA_TEMPERATURE,
      ollamaKeepAlive: DEFAULT_OLLAMA_KEEP_ALIVE,
      shareLinks: [],

      setAIMode: (mode) => set({ aiMode: mode }),
      setByokPreference: (preference) =>
        set({ byokPreference: preference, byokRoutingTouched: true }),
      setTheme: (theme) => set({ theme }),
      setSkipToData: (skip) => set({ skipToData: skip }),
      setWebllmConsent: (consent) => set({ webllmConsent: consent }),
      setMetadataOnlyRepair: (metadataOnly) =>
        set({ metadataOnlyRepair: metadataOnly }),
      setOllamaModel: (model) => set({ ollamaModel: model.trim() }),
      setOllamaThink: (think) => set({ ollamaThink: think }),
      // Ollama rejects anything outside 0-2; clamp rather than trust the input.
      setOllamaTemperature: (temperature) =>
        set({ ollamaTemperature: Math.min(2, Math.max(0, temperature)) }),
      setOllamaKeepAlive: (keepAlive) => set({ ollamaKeepAlive: keepAlive }),
      addShareLink: (link) =>
        set((state) => ({ shareLinks: [link, ...state.shareLinks] })),
      removeShareLink: (token) =>
        set((state) => ({
          shareLinks: state.shareLinks.filter((link) => link.token !== token),
        })),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
