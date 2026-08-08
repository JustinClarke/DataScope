// The client half of the Tier-2 CORS relay (§7.4, build/07-connectivity/02-api-tier2-relay).
// One GET per page: the target URL and a per-page-load sessionId travel as
// query params (no body, mirroring the relay's own bodyless GET contract).
// Pagination itself lives in apiIngestion.ts's shared accumulation loop —
// this module only knows how to fetch one page through the relay and
// classify the relay's own control-plane failures.
//
// The relay forwards the target's HTTP status verbatim on a successful
// pass-through, so a non-2xx response here is ambiguous in principle
// (relay-native failure vs. a passed-through target error) — except for 429
// and 503, which are the relay's own fixed-status control signals
// (dual-keyed rate limit, kill switch) that the client must render
// distinctly per §7.4's acceptance criteria. Every other non-ok status
// (400/502/504, or a passed-through target error) is left as an ordinary
// Response for the shared loop's existing http-error classification —
// same treatment Tier 1 gives a non-ok target response.
export type RelayFetchErrorCode = "rate-limited" | "paused" | "unreachable";

export class RelayFetchError extends Error {
  readonly code: RelayFetchErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(
    code: RelayFetchErrorCode,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The deployed relay endpoint. Falls back to staging if unset. */
export const EDGE_CORS_RELAY = (import.meta.env?.VITE_EDGE_CORS_RELAY ??
  "https://datascope-edge-staging.justinclarke.workers.dev/cors-relay") as string;

export interface RelayFetchOptions {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
}

// Matches the relay's own upstream timeout (build/09-edge/02-cors-relay) —
// the client waits no longer than the relay itself would before giving up.
const DEFAULT_TIMEOUT_MS = 30_000;

/** Fetches one page through the relay. Throws RelayFetchError for the relay's own rate-limit/pause/unreachable states; any other status is returned as an ordinary Response. */
export async function fetchViaRelay(
  targetUrl: string,
  sessionId: string,
  options: RelayFetchOptions = {},
): Promise<Response> {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = new URL(options.endpoint ?? EDGE_CORS_RELAY);
  url.searchParams.set("url", targetUrl);
  url.searchParams.set("sessionId", sessionId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await doFetch(url.toString(), { signal: controller.signal });
  } catch {
    throw new RelayFetchError(
      "unreachable",
      "Couldn't reach the relay — try a direct fetch or upload instead.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    const retryAfterSeconds =
      Number(response.headers.get("retry-after")) || undefined;
    throw new RelayFetchError(
      "rate-limited",
      "The relay is rate-limited right now — try again in a bit.",
      retryAfterSeconds,
    );
  }
  if (response.status === 503) {
    throw new RelayFetchError(
      "paused",
      "The relay is temporarily paused — try a direct fetch or upload instead.",
    );
  }
  return response;
}
