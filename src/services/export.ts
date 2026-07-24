// Client-side table export (§12.2) — `COPY ... TO` runs inside DuckDB-Wasm and
// hands back a buffer for a browser download; no server, no network request.
//
// R2 save/share (§12.3, build/08-persistence/02-r2-save-share) lives here too:
// `saveToCloud`/`getSharedObject`/`deleteShare` are the client half of the
// Worker endpoints build/09-edge/04-persistence-endpoints already ships. Save
// and get carry the object as a raw body (not JSON) for the same reason the
// Worker does — a dataset buffer can run to the 100MB cap, and base64-in-JSON
// would inflate that by a third for nothing; control fields travel as query
// params, mirroring vaultClient.ts's/relayClient.ts's own DI-friendly shape
// (an injectable `fetchImpl` for tests, no implicit global fetch dependency).
import type { PersistenceErrorCode, PersistenceSaveResponse, PersistenceDeleteResponse } from '../../edge/protocol';
import type { TableRegistryEntry } from '../types';

type EngineModule = typeof import('../workers/duckdb.worker');
let engineModule: Promise<EngineModule> | null = null;
function loadEngine(): Promise<EngineModule> {
  if (!engineModule) engineModule = import('../workers/duckdb.worker');
  return engineModule;
}

const MIME_TYPES: Record<'parquet' | 'csv', string> = {
  parquet: 'application/vnd.apache.parquet',
  csv: 'text/csv;charset=utf-8',
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Downloads a registered table (ingested or derived) as Parquet or CSV — the whole table, not a query's row-capped preview. */
export async function downloadTable(table: TableRegistryEntry, format: 'parquet' | 'csv'): Promise<void> {
  const engine = await loadEngine();
  const buffer = await engine.duckDBEngine.exportTable(table.tableName, format);
  downloadBlob(new Blob([buffer], { type: MIME_TYPES[format] }), `${table.tableName}.${format}`);
}

/** Builds the Parquet buffer a full-dataset share uploads — the same COPY path `downloadTable` uses, minus the browser download. */
export async function buildShareBuffer(table: TableRegistryEntry): Promise<Uint8Array> {
  const engine = await loadEngine();
  return engine.duckDBEngine.exportTable(table.tableName, 'parquet');
}

/** The deployed persistence endpoint. Falls back to staging if unset. */
export const EDGE_PERSISTENCE = (import.meta.env?.VITE_EDGE_PERSISTENCE ??
  'https://datascope-edge-staging.justinclarke.workers.dev/persistence') as string;

// One id per page load, shared across every save this tab makes — keys the
// Worker's dual-keyed save-rate/byte-quota limiter (build/09-edge/04-persistence-endpoints),
// the same per-page-load-constant pattern ingestion.ts's RELAY_SESSION_ID uses.
const PERSISTENCE_SESSION_ID = crypto.randomUUID();

export const PARQUET_CONTENT_TYPE = 'application/vnd.apache.parquet';
/** DSPS's own content type (D37/D64) — lets `edge/handlers/mcp.ts`'s `get_dsps` tell a structure-only share apart from a full-dataset one by content type alone, without opening the object. */
export const STRUCTURE_REPORT_CONTENT_TYPE = 'application/vnd.datascope.dsps+json';

/** A failed call, carrying the endpoint's typed code so the UI can be specific. */
export type ShareFailure = { ok: false; code: PersistenceErrorCode | 'unreachable' };
export type SaveShareResult = { ok: true; token: string; deleteToken: string; ttlSeconds: number } | ShareFailure;
export type GetShareResult = { ok: true; buffer: Uint8Array; contentType: string } | ShareFailure;
export type DeleteShareResult = { ok: true } | ShareFailure;

export interface ShareClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

async function errorCodeOf(response: Response): Promise<PersistenceErrorCode | 'unreachable'> {
  try {
    const body = (await response.json()) as { error?: PersistenceErrorCode };
    return body.error ?? 'unreachable';
  } catch {
    return 'unreachable';
  }
}

/**
 * Uploads a buffer (a share's Parquet bytes, or a structure report's JSON) and
 * returns its share token + one-time delete-ownership proof. Explicit-call
 * only — nothing here runs unprompted; every caller is a "Save to cloud /
 * Create share link" button click (§12.3's "explicit action only" requirement).
 */
export async function saveToCloud(
  buffer: Uint8Array,
  contentType: string,
  options: ShareClientOptions = {},
): Promise<SaveShareResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(options.endpoint ?? EDGE_PERSISTENCE);
  url.searchParams.set('sessionId', PERSISTENCE_SESSION_ID);

  let response: Response;
  try {
    response = await doFetch(url.toString(), {
      method: 'POST',
      headers: { 'content-type': contentType, 'content-length': String(buffer.byteLength) },
      // Cast: BodyInit's ArrayBufferView is pinned to an ArrayBuffer-backed
      // view; a plain `Uint8Array` return (e.g. DuckDB-Wasm's exportTable)
      // types as the wider ArrayBufferLike-backed generic. Same bytes either way.
      body: buffer as BodyInit,
    });
  } catch {
    return { ok: false, code: 'unreachable' };
  }

  if (!response.ok) return { ok: false, code: await errorCodeOf(response) };

  try {
    const body = (await response.json()) as PersistenceSaveResponse;
    return { ok: true, token: body.token, deleteToken: body.deleteToken, ttlSeconds: body.ttlSeconds };
  } catch {
    return { ok: false, code: 'unreachable' };
  }
}

/** Fetches a shared object by its token — the "open a share link" read path. */
export async function getSharedObject(token: string, options: ShareClientOptions = {}): Promise<GetShareResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(options.endpoint ?? EDGE_PERSISTENCE);
  url.searchParams.set('token', token);

  let response: Response;
  try {
    response = await doFetch(url.toString());
  } catch {
    return { ok: false, code: 'unreachable' };
  }

  if (!response.ok) return { ok: false, code: await errorCodeOf(response) };

  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  const buffer = new Uint8Array(await response.arrayBuffer());
  return { ok: true, buffer, contentType };
}

/**
 * Deletes a shared object using the ownership proof returned at save time.
 * Mirrors vaultClient.ts's deleteVaultedKey precedent: a `not-found` response
 * means the server-side object is already gone, so the user's intent (the
 * share is gone) already holds — treated as success, not a retry-worthy error.
 */
export async function deleteShare(
  token: string,
  deleteToken: string,
  options: ShareClientOptions = {},
): Promise<DeleteShareResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(options.endpoint ?? EDGE_PERSISTENCE);
  url.searchParams.set('op', 'delete');
  url.searchParams.set('token', token);
  url.searchParams.set('deleteToken', deleteToken);

  let response: Response;
  try {
    response = await doFetch(url.toString(), { method: 'POST' });
  } catch {
    return { ok: false, code: 'unreachable' };
  }

  if (response.ok) {
    const body = (await response.json()) as PersistenceDeleteResponse;
    return { ok: body.deleted };
  }

  const code = await errorCodeOf(response);
  return code === 'not-found' ? { ok: true } : { ok: false, code };
}
