// The cloud `AIProvider` (§11.2) — the client half of the edge AI router
// (build/09-edge/01). It turns one `complete()` call into one router round-trip:
// it posts the running conversation + tools, the D3 routing preference, and (when
// present) the user's BYOK credential, then returns the model's turn. The router
// owns Workers-AI-vs-key routing, the shared free-pool quota, and key custody;
// this adapter owns only the request/response mapping and the typed-error
// translation the pipeline branches on.
//
// The wire shapes mirror the loop's own `ProviderMessage` / `AITool` /
// `ProviderTurn` field for field, so the mapping is a pass-through, not a
// translation. `fetch` is injectable so the adapter is fully testable without a
// live Worker — which is how it ships ahead of the staging deploy the router's
// end-to-end acceptance still needs.
import type {
  AiRouterErrorCode,
  AiRouterRequest,
  AiRouterResponse,
  ByokCredential,
  RoutingMode,
  WireProviderTurn,
} from "../../edge/protocol";
import type {
  AIProvider,
  AITool,
  ProviderMessage,
  ProviderTurn,
} from "../types";
import { ProviderQuotaExhaustedError } from "./aiProvider";

export interface CloudProviderConfig {
  /** The router endpoint. When absent, cloud mode stays "not connected" (resolveProvider's `.provider` is null). */
  endpoint: string;
  /** Opaque per-session id for the shared limiter — content-free. */
  sessionId: string;
  /** The D3 toggle. */
  routing: RoutingMode;
  /** Present only when the user has a key; the router attaches/forwards it, never persists it (D9). */
  byok?: ByokCredential;
  /** Request an incremental SSE token stream (§15). Defaults to false (JSON). */
  stream?: boolean;
  /** Invoked per streamed text delta so the UI can render incrementally. */
  onToken?: (text: string) => void;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Codes that mean the shared free budget is spent or cloud features are paused
 * (§11.2, §23.5) — the loop renders these as the "bring your own key / switch to
 * local / retry tomorrow" state, distinct from a transport failure.
 */
const QUOTA_CODES: ReadonlySet<AiRouterErrorCode> = new Set([
  "quota-exhausted",
  "pool-exhausted",
  "paused",
]);

function toWireMessage(
  m: ProviderMessage,
): AiRouterRequest["messages"][number] {
  // Structurally identical to the wire shape; the annotation is the contract.
  return m as AiRouterRequest["messages"][number];
}

/**
 * The client and the Worker deploy separately, and A4 changed the turn shape
 * from `{ kind: 'text' | 'tool_call' }` to `{ text, calls[] }`. A router still
 * on the old shape would otherwise read as a turn with `calls: undefined` —
 * a silent no-tool-calls answer, which is exactly the class of failure this
 * phase exists to remove. So the skew is named instead.
 */
function readWireTurn(turn: WireProviderTurn): ProviderTurn {
  if (!Array.isArray(turn?.calls) || typeof turn?.text !== "string") {
    throw new Error(
      "cloud router returned a pre-A4 turn shape — redeploy the edge Worker.",
    );
  }
  return { text: turn.text, calls: turn.calls };
}

async function readError(response: Response): Promise<never> {
  let code: string | undefined;
  try {
    const body = (await response.json()) as { error?: string };
    code = body.error;
  } catch {
    // Non-JSON error body — fall through to a transport-style failure.
  }
  if (code !== undefined && QUOTA_CODES.has(code as AiRouterErrorCode)) {
    throw new ProviderQuotaExhaustedError();
  }
  if (code === "timeout") {
    throw new DOMException("AI provider timed out", "TimeoutError");
  }
  // rate-limited, bad-request, or an unknown code: a plain transport failure the
  // loop renders as "couldn't reach the provider."
  throw new Error(`cloud router error: ${code ?? response.status}`);
}

/** Reads the SSE stream, forwarding deltas to `onToken`, and returns the final turn. */
async function readStream(
  response: Response,
  onToken: ((text: string) => void) | undefined,
): Promise<ProviderTurn> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("cloud router stream: empty body");
  const decoder = new TextDecoder();
  let buffer = "";
  let turn: WireProviderTurn | null = null;

  const handle = (data: string): void => {
    if (data === "[DONE]") return;
    const event = JSON.parse(data) as
      | { type: "delta"; text: string }
      | { type: "done"; turn: WireProviderTurn };
    if (event.type === "delta") onToken?.(event.text);
    else turn = event.turn;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (line !== undefined) handle(line.slice(5).trim());
    }
  }
  if (turn === null) throw new Error("cloud router stream: no final turn");
  return readWireTurn(turn);
}

/**
 * Build the cloud provider. `resolveProvider('cloud', config).provider` is this
 * when an endpoint is configured; with no endpoint the caller keeps cloud null
 * so the chat shows the honest "not connected" state.
 */
export function createCloudProvider(config: CloudProviderConfig): AIProvider {
  const doFetch = config.fetchImpl ?? fetch;
  // Each complete() call within a turn's loop is one attempt — a numeric, content-
  // free signal for the router's D41 repair-rate metric.
  let attempt = 0;

  return {
    id: "cloud-edge",
    async complete(
      messages: ProviderMessage[],
      tools: AITool[],
      options,
    ): Promise<ProviderTurn> {
      attempt += 1;
      const request: AiRouterRequest = {
        sessionId: config.sessionId,
        routing: config.routing,
        byok: config.byok,
        messages: messages.map(toWireMessage),
        tools,
        stream: config.stream === true,
        attempt,
      };
      const response = await doFetch(config.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: options?.signal,
      });

      if (!response.ok) return readError(response);

      if (response.headers.get("content-type")?.includes("text/event-stream")) {
        return readStream(response, config.onToken);
      }
      const body = (await response.json()) as AiRouterResponse;
      return readWireTurn(body.turn);
    },
  };
}
