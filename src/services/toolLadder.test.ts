// The shared ladder's message-shaping contract.
import { describe, expect, it } from "vitest";
import { RUNG_INSTRUCTION, withRungInstruction } from "./toolLadder";


describe("withRungInstruction — the question must stay the last thing the model reads", () => {
  const sqlRung = RUNG_INSTRUCTION.sql;

  // Appending the instruction as its own user turn displaced the question:
  // with the tool catalog in between, small models answered "they didn't
  // specify the actual question" and emitted placeholder SQL.
  it("merges into the trailing user turn rather than appending a new one", () => {
    const out = withRungInstruction(
      [
        { role: "system", content: "schema" },
        { role: "user", content: "How many materials?" },
      ],
      "sql",
    );
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({
      role: "user",
      content: `How many materials?\n\n${sqlRung}`,
    });
  });

  // After a tool result there is no user turn to merge into, and the
  // instruction refers to the result directly above it.
  it("appends when the conversation ends in a tool result", () => {
    const out = withRungInstruction(
      [
        { role: "user", content: "How many materials?" },
        { role: "tool", content: '{"ok":false}' },
      ],
      "sql",
    );
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual({ role: "user", content: sqlRung });
  });

  it("leaves the messages untouched for a self-driving model", () => {
    const messages = [{ role: "user", content: "How many materials?" }];
    expect(withRungInstruction(messages, null)).toBe(messages);
  });
});
