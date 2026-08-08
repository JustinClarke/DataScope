// In-browser local model (WebLLM) download/warm state — memory only, never
// persisted: on reload the model shards are still in Cache Storage, so a fresh
// warm-up is cheap and the state machine restarts honestly from 'idle'.
//
// The states are the three-rung degrade ladder's input: only 'ready' lets the
// provider ladder and the synthesis producer route to WebLLM; every other state
// leaves the edge (then the deterministic surface) serving.
import { create } from "zustand";

export type WebLLMStatus =
  /** Not started — no consent yet, or the app just loaded. */
  | "idle"
  /** This browser cannot run it (no WebGPU) — the offer never shows. */
  | "unavailable"
  /** Model shards downloading in the background (progress 0–1). */
  | "downloading"
  /** Shards down; engine compiling/loading onto the GPU. */
  | "warming"
  /** Warm — WebLLM serves chat and synthesis client-side, zero egress. */
  | "ready"
  /** Download or engine failure — the surface stays on the edge rung. */
  | "error";

interface WebLLMState {
  status: WebLLMStatus;
  /** 0–1 while downloading; WebLLM's own progress signal. */
  progress: number;
  /** Human-readable progress line ("Fetching param shard 12/30…"). */
  progressText: string;
  error: string | null;

  setStatus: (status: WebLLMStatus) => void;
  setProgress: (progress: number, progressText: string) => void;
  setError: (error: string) => void;
}

export const useWebLLMStore = create<WebLLMState>((set) => ({
  status: "idle",
  progress: 0,
  progressText: "",
  error: null,

  setStatus: (status) =>
    set({ status, ...(status === "ready" ? { error: null } : {}) }),
  setProgress: (progress, progressText) => set({ progress, progressText }),
  setError: (error) => set({ status: "error", error }),
}));
