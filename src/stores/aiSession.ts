// The AI conversation store (§21.7 state tree). Holds the AISession — mode, BYOK
// preference, turn count, and the per-turn transcript. Never persisted: the
// transcript is content-bearing (D41) and must not reach localStorage.
import { create } from "zustand";
import type { AIMode, AISession, AITurn } from "../types";

interface AISessionState extends AISession {
  setMode: (mode: AIMode) => void;
  addTurn: (turn: Omit<AITurn, "id" | "createdAt">) => void;
  /** Append a fully-formed turn (the pipeline builds the assistant turn with its audit trail). */
  appendTurn: (turn: AITurn) => void;
  incrementTurnsUsed: () => void;
  reset: () => void;
}

const initialSession: AISession = {
  mode: "local-only",
  byokPreference: "free-tier-first",
  turnsUsedToday: 0,
  transcript: [],
};

export const useAISessionStore = create<AISessionState>((set) => ({
  ...initialSession,

  setMode: (mode) => set({ mode }),

  addTurn: (turn) =>
    set((state) => ({
      transcript: [
        ...state.transcript,
        {
          ...turn,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        },
      ],
    })),

  appendTurn: (turn) =>
    set((state) => ({ transcript: [...state.transcript, turn] })),

  incrementTurnsUsed: () =>
    set((state) => ({ turnsUsedToday: state.turnsUsedToday + 1 })),

  reset: () => set(initialSession),
}));
