// Tier 1 API ingestion (§7.4) — direct browser fetch, zero infra. Pure
// fetch/pagination/size-tier logic, independent of the DuckDB-touching
// registration path (services/ingestion.ts's loadUrl calls into this, then
// hands the resulting buffer to the same ingestBuffer path file upload uses).
// Kept separate so this module is unit-testable with an injected fetchImpl —
// no live DuckDB worker required, matching ingestion.test.ts's own note that
// the engine-touching half needs a real browser.
import {
  decideSizeTier,
  refusalMessage,
  type SizeTier,
} from "../features/ingestion/aggregateSize";
import { estimateHeadroomExceeded } from "../lib/memoryHeadroom";
import { fetchViaRelay, type RelayFetchOptions } from "./relayClient";

export type ApiFetchErrorCode =
  | "invalid-url"
  | "cors-suspected"
  | "http-error"
  | "invalid-json"
  | "too-large"
  | "timeout";

export class ApiFetchError extends Error {
  readonly code: ApiFetchErrorCode;

  constructor(code: ApiFetchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface ApiFetchOptions {
  fetchImpl?: typeof fetch;
  onProgress?: (pagesFetched: number, bytesAccumulated: number) => void;
  maxPages?: number;
  timeoutMs?: number;
}

export interface ApiFetchResult {
  buffer: Uint8Array;
  pagesFetched: number;
  bytesAccumulated: number;
  sizeTier: SizeTier;
}

// Matches the Tier-2 relay's own upstream timeout (§7.4) and the AI turn's
// §21.6 abort — one consistent client-side ceiling rather than inventing a
// third number.
export const API_FETCH_TIMEOUT_MS = 30_000;

// Matches the Tier-2 relay's per-ingestion-action cap (§7.4) so the cascade
// behaves the same regardless of which tier ends up landing the pages.
export const MAX_PAGES = 20;

function validateUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ApiFetchError("invalid-url", `"${rawUrl}" isn't a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiFetchError(
      "invalid-url",
      "Only http:// and https:// URLs are supported.",
    );
  }
  return url.toString();
}

// RFC 5988 Link header — GitHub's shape:
// '<https://api.github.com/…&page=2>; rel="next", <…>; rel="last"'. This is
// the one generically follow-able pagination pattern among the v0.5 token/
// no-auth platforms (D34) — confirmed by the ADR-006 pagination research
// (only GitHub, of GitHub/Lichess/Chess.com, exposes one at all). Other APIs'
// body-level cursors vary too much per-provider to detect generically; a
// manual "load more pages" fallback for that case is named in the leaf doc
// as an open scope gap, not built here.
function nextPageUrl(response: Response): string | null {
  const link = response.headers.get("link");
  if (!link) return null;
  const next = link
    .split(",")
    .map((part) => part.trim())
    .find((part) => /rel="next"/.test(part));
  return next?.match(/^<([^>]+)>/)?.[1] ?? null;
}

async function fetchOnePage(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiFetchError(
        "timeout",
        `Request to ${url} timed out after ${timeoutMs / 1000}s.`,
      );
    }
    // fetch() rejects with an opaque TypeError for CORS failures, DNS
    // failures, and offline networks alike — the Fetch API deliberately
    // exposes no way to tell these apart (no status, no headers reach JS).
    // CORS is named in the message because §7.4 calls it "the most common
    // blocker, ahead of auth" — this is presumptive, not confirmed. Tier 2
    // (the relay fallback, 02-api-tier2-relay) isn't built yet, so this
    // surfaces as a typed, distinguishable error rather than a silent retry —
    // the seam Tier 2 plugs into once it lands.
    throw new ApiFetchError(
      "cors-suspected",
      "Couldn't reach this URL directly — it may be blocking cross-origin requests.",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches and accumulates pages up to `maxPages`, delegating the actual
 * per-page transport to `fetchPage` — a direct browser fetch for Tier 1, a
 * relay round-trip for Tier 2 (fetchApiSourceViaRelay, below). Both tiers
 * share this loop unchanged: page-count/size-tier gating, JSON parsing, and
 * Link-header pagination all behave identically regardless of transport.
 */
async function accumulatePages(
  firstUrl: string,
  maxPages: number,
  onProgress:
    ((pagesFetched: number, bytesAccumulated: number) => void) | undefined,
  fetchPage: (url: string) => Promise<Response>,
): Promise<ApiFetchResult> {
  let currentUrl: string | null = firstUrl;

  const accumulatedRecords: unknown[] = [];
  let firstPageBytes: ArrayBuffer | null = null;
  let pagesFetched = 0;
  let bytesAccumulated = 0;
  let tier: SizeTier = "full";

  while (currentUrl && pagesFetched < maxPages) {
    const response = await fetchPage(currentUrl);
    if (!response.ok) {
      throw new ApiFetchError(
        "http-error",
        `The API returned ${response.status} ${response.statusText}`.trim(),
      );
    }

    const raw = await response.arrayBuffer();
    bytesAccumulated += raw.byteLength;
    pagesFetched += 1;
    onProgress?.(pagesFetched, bytesAccumulated);

    tier = decideSizeTier(
      bytesAccumulated,
      estimateHeadroomExceeded(bytesAccumulated),
    );
    if (tier === "refuse") {
      throw new ApiFetchError("too-large", refusalMessage(bytesAccumulated));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      throw new ApiFetchError(
        "invalid-json",
        `The response from ${currentUrl} wasn't valid JSON.`,
      );
    }

    if (pagesFetched === 1) firstPageBytes = raw;

    if (!Array.isArray(parsed)) {
      // Not a list shape — nothing to paginate/merge. Register as-is.
      currentUrl = null;
      break;
    }
    accumulatedRecords.push(...parsed);

    // Stop paginating early once the response has already crossed into
    // sampled/refuse territory — no reason to keep fetching pages that will
    // just be discarded past the SAMPLE_ROW_LIMIT cutoff.
    currentUrl =
      tier === "full" || tier === "warn" ? nextPageUrl(response) : null;
  }

  const buffer =
    pagesFetched === 1
      ? new Uint8Array(firstPageBytes!)
      : new TextEncoder().encode(JSON.stringify(accumulatedRecords));

  return { buffer, pagesFetched, bytesAccumulated, sizeTier: tier };
}

/**
 * Fetches a JSON API URL, following GitHub-style `Link: rel="next"`
 * pagination up to `maxPages`, and returns one buffer ready for the same
 * `read_json_auto` registration path file upload uses. A single-page
 * response's raw bytes pass through unchanged (no parse/reserialize
 * round-trip); a multi-page response is merged into one JSON array.
 */
export async function fetchApiSource(
  rawUrl: string,
  options: ApiFetchOptions = {},
): Promise<ApiFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = options.maxPages ?? MAX_PAGES;
  const timeoutMs = options.timeoutMs ?? API_FETCH_TIMEOUT_MS;
  const firstUrl = validateUrl(rawUrl);
  return accumulatePages(firstUrl, maxPages, options.onProgress, (url) =>
    fetchOnePage(url, fetchImpl, timeoutMs),
  );
}

export interface RelayApiFetchOptions extends RelayFetchOptions {
  onProgress?: (pagesFetched: number, bytesAccumulated: number) => void;
  maxPages?: number;
}

/**
 * Tier 2 (§7.4, build/07-connectivity/02-api-tier2-relay): the same
 * accumulation loop as fetchApiSource, but each page is fetched through the
 * CORS relay instead of directly. `sessionId` keys the relay's dual-keyed
 * rate limiter (build/09-edge/02-cors-relay) — one id per page load, shared
 * across every relay call an ingestion action makes.
 *
 * The relay forwards only `content-type` on a successful pass-through
 * (build/09-edge/02-cors-relay's handler never re-attaches the target's own
 * headers) — so `nextPageUrl`'s Link-header read below always comes back
 * empty over this transport, same as it would for any API that simply
 * doesn't send one. In practice this caps Tier 2 at one page per ingestion
 * today: real, not hidden, and named here rather than silently claimed as
 * full parity with Tier 1 — the same evidence-backed-gap treatment
 * 01-api-tier1-fetch.md gives its own non-Link-header pagination gap. The
 * cap/loop machinery stays in place and is still exercised (maxPages is
 * still honored) so it needs no rework if the relay ever forwards more
 * headers.
 */
export async function fetchApiSourceViaRelay(
  rawUrl: string,
  sessionId: string,
  options: RelayApiFetchOptions = {},
): Promise<ApiFetchResult> {
  const maxPages = options.maxPages ?? MAX_PAGES;
  const firstUrl = validateUrl(rawUrl);
  return accumulatePages(firstUrl, maxPages, options.onProgress, (url) =>
    fetchViaRelay(url, sessionId, {
      fetchImpl: options.fetchImpl,
      endpoint: options.endpoint,
      timeoutMs: options.timeoutMs,
    }),
  );
}

/** Derives a table name from a URL's last path segment, falling back to the hostname for a root/query-only URL. */
export function tableNameFromUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const segments = url.pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? url.hostname;
}
