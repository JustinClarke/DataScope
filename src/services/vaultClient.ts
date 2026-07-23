// The client for the BYOK vault endpoint (build/09-edge/03-vault) — the two
// operations behind the "Remember my key" checkbox.
//
// Every call is an explicit user action on that checkbox; nothing here runs in
// the background. The raw key crosses exactly once, on the store call, and the
// only thing that comes back is a reference. There is no resolve here because
// there is no resolve endpoint: the key is read server-side, inside the router,
// and never travels back to the browser.
import type { VaultErrorCode, VaultRequest, VaultResponse } from '../../edge/protocol';

/** The deployed vault endpoint. Falls back to staging if unset. */
export const EDGE_VAULT = (import.meta.env?.VITE_EDGE_VAULT ??
  'https://datascope-edge-staging.justinclarke.workers.dev/vault') as string;

export interface VaultClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

/** A failed call, carrying the endpoint's typed code so the UI can be specific. */
export type VaultFailure = { ok: false; code: VaultErrorCode | 'unreachable' };
export type StoreResult = { ok: true; ref: string } | VaultFailure;
export type DeleteResult = { ok: true } | VaultFailure;

async function call(body: VaultRequest, options: VaultClientOptions): Promise<VaultResponse | VaultFailure> {
  const doFetch = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(options.endpoint ?? EDGE_VAULT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: 'unreachable' };
  }
  if (!response.ok) {
    try {
      const error = (await response.json()) as { error?: VaultErrorCode };
      return { ok: false, code: error.error ?? 'unreachable' };
    } catch {
      return { ok: false, code: 'unreachable' };
    }
  }
  try {
    return (await response.json()) as VaultResponse;
  } catch {
    return { ok: false, code: 'unreachable' };
  }
}

/** Stores a bearer key and returns its reference. The key crosses only here. */
export async function storeVaultedKey(
  params: { sessionId: string; provider: string; key: string; model?: string },
  options: VaultClientOptions = {},
): Promise<StoreResult> {
  const result = await call({ op: 'store', ...params }, options);
  if ('ok' in result) return result;
  if ('ref' in result) return { ok: true, ref: result.ref };
  return { ok: false, code: 'unreachable' };
}

/** Deletes a stored key. A reference the vault no longer knows counts as gone. */
export async function deleteVaultedKey(
  params: { sessionId: string; ref: string },
  options: VaultClientOptions = {},
): Promise<DeleteResult> {
  const result = await call({ op: 'delete', ...params }, options);
  if ('ok' in result) {
    // `not-found` means the server-side record is already absent — the user's
    // intent (the key is not stored) holds, so this is a success, not an error
    // the UI should ask them to retry.
    return result.code === 'not-found' ? { ok: true } : result;
  }
  return { ok: true };
}
