// `OpError` construction and the mechanical-hint rule (A0, master §11.5).
//
// A hint is derived, never composed: DuckDB already emits the nearest catalog
// match, the candidate column bindings and the error position, and an enum
// parameter already knows its own valid values. Nothing here decides what the
// caller should do next — that is the difference between a hint and advice.
import type { OpError, OpErrorCode } from "./types";

export function opError(
  code: OpErrorCode,
  message: string,
  hint?: string,
): OpError {
  return hint === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, hint };
}

/** `invalid_argument` for a parameter outside its allowed set — the hint is the set itself. */
export function invalidEnum(
  param: string,
  received: unknown,
  allowed: readonly string[],
): OpError {
  return opError(
    "invalid_argument",
    `${param} must be one of ${allowed.join(", ")} (received ${JSON.stringify(received)}).`,
    allowed.join(", "),
  );
}

/**
 * The lines DuckDB writes that are already a mechanical hint. Everything else
 * in the message stays in `message`, so nothing is lost by this being narrow.
 */
const HINT_LINE = /^(Did you mean|Candidate bindings:|LINE \d+:)/;

export function hintFromEngineMessage(message: string): string | undefined {
  const lines = message.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!HINT_LINE.test(line.trim())) continue;
    kept.push(line.trim());
    // A `LINE n:` excerpt is followed by its caret line, which is meaningless
    // without the original leading whitespace — keep it verbatim.
    if (line.trim().startsWith("LINE ") && lines[i + 1]?.includes("^"))
      kept.push(lines[i + 1]!);
  }
  return kept.length > 0 ? kept.join("\n") : undefined;
}

/** Everything before the first hint line — the error proper, without the excerpt DuckDB appends. */
function messageWithoutHint(message: string): string {
  const lines = message.split("\n");
  const firstHint = lines.findIndex((line) => HINT_LINE.test(line.trim()));
  const head = (firstHint === -1 ? lines : lines.slice(0, firstHint))
    .join("\n")
    .trim();
  return head.length > 0 ? head : message.trim();
}

function isAbort(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    (error.name === "AbortError" || /interrupt/i.test(error.message))
  );
}

/**
 * One engine failure → one `OpError`. `unknown_object` is split out from
 * `sql_error` because it is the failure a caller can actually act on: the
 * hint carries the name DuckDB thinks was meant.
 *
 * `wrapped` drops the `LINE n:` excerpt. The result store runs a caller's
 * statement inside a materializing wrapper, so those offsets point into SQL
 * the caller never wrote — showing it would be worse than showing nothing.
 * The nearest-name half of the hint, which is the useful half, survives.
 */
export function engineError(
  error: unknown,
  signal?: AbortSignal,
  options?: { wrapped?: boolean },
): OpError {
  if (signal?.aborted || isAbort(error)) {
    return opError("cancelled", "The operation was cancelled.");
  }
  const raw = error instanceof Error ? error.message : String(error);
  const code: OpErrorCode = /Catalog Error/i.test(raw)
    ? "unknown_object"
    : "sql_error";
  const hint = hintFromEngineMessage(raw);
  const kept = options?.wrapped
    ? hint
        ?.split("\n")
        .filter((line) => !line.startsWith("LINE ") && !line.includes("^"))
        .join("\n") || undefined
    : hint;
  return opError(code, messageWithoutHint(raw), kept);
}
