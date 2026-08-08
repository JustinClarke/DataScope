import { beforeEach, describe, expect, it } from "vitest";
import { useAISessionStore } from "./aiSession";

const initial = {
  mode: "local-only" as const,
  byokPreference: "free-tier-first" as const,
  turnsUsedToday: 0,
  transcript: [],
};

beforeEach(() => {
  useAISessionStore.setState(initial);
});

describe("aiSession store", () => {
  it("defaults to local-only with an empty transcript", () => {
    const state = useAISessionStore.getState();
    expect(state.mode).toBe("local-only");
    expect(state.turnsUsedToday).toBe(0);
    expect(state.transcript).toEqual([]);
  });

  it("setMode switches the AI mode", () => {
    useAISessionStore.getState().setMode("cloud");
    expect(useAISessionStore.getState().mode).toBe("cloud");
  });

  it("addTurn appends a turn with a generated id and timestamp", () => {
    useAISessionStore
      .getState()
      .addTurn({ role: "user", content: "what tables do I have?" });

    const { transcript } = useAISessionStore.getState();
    expect(transcript).toHaveLength(1);
    expect(transcript[0].content).toBe("what tables do I have?");
    expect(transcript[0].id).toBeTruthy();
    expect(transcript[0].createdAt).toBeTruthy();
  });

  it("incrementTurnsUsed counts against the daily quota", () => {
    useAISessionStore.getState().incrementTurnsUsed();
    useAISessionStore.getState().incrementTurnsUsed();
    expect(useAISessionStore.getState().turnsUsedToday).toBe(2);
  });

  it("reset restores the initial session shape", () => {
    useAISessionStore.getState().setMode("cloud");
    useAISessionStore.getState().addTurn({ role: "user", content: "hi" });
    useAISessionStore.getState().incrementTurnsUsed();

    useAISessionStore.getState().reset();

    const state = useAISessionStore.getState();
    expect(state.mode).toBe("local-only");
    expect(state.transcript).toEqual([]);
    expect(state.turnsUsedToday).toBe(0);
  });
});
