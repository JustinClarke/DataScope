# 09.3 BYOK Credential Vault

**Tier:** v0.5 · serves Phase 4 · **Master spec:** §11.2 (D9), §7.4 Tier 3 (future consumer)

## Objective

The opt-in server-side store behind "Remember my key": key in, reference token out, delete
control honored — the mechanism that also makes Tier-3 data-source ingestion cheap later (D4).

## Spec

- **Opt-in only (D9):** the default custody path (browser-memory + stateless pass-through)
  never touches the vault. The vault exists solely for users who chose "Remember my key"
  after explicit disclosure.
- Storage: Cloudflare secret/KV **keyed to session**; the browser holds only a reference
  token — never the raw key in plaintext, anywhere client-side.
- Operations: `store(key) → reference`, `resolve(reference) → key` (router-internal only —
  never an endpoint that returns the raw key to the client), `delete(reference)`.
- **Delete control:** immediate, verifiable removal; the client's settings UI calls it.
- **Vaulted-key lifecycle (§11.2, D9 disclosure — not a relitigation):** each vaulted key
  carries an **idle TTL — expire after 90 days without use** (launch default, tunable;
  refreshed on each `resolve`), stated in the "Remember my key" disclosure; a cap of **3
  vaulted credentials/session** prevents vault-stuffing (generous for one key per provider).
  This adds disclosed retention to the opt-in custody path, exactly parallel to §12.3's R2
  retention; the custody choice itself (D9) is unchanged.
- **Rate limit:** vault operations are rate-limited at **10/session/hour** (launch default,
  tunable) via the shared dual-keyed limiter (§23.5, §23.1).
- **Encryption at rest — scope closed:** KV values encrypted with a Worker-held secret is the
  **launch design**. No envelope-encryption or KMS build-out pre-launch — the baseline shape
  ships as-is; revisit only from evidence, never up front (avoids a security rabbit hole).
- **One pattern, two consumers (§11.2):** Tier-3 data-source ingestion
  ([`../../backlog/tier3-vault-ingestion.md`](../../backlog/tier3-vault-ingestion.md)) reuses
  this mechanism when revived — keep the API consumer-agnostic (a vaulted credential, not
  "an OpenAI key").

## Files

`edge/vault.ts` — the two client operations (`handleVault`: store, delete), the
router-internal `createVaultResolver`, AES-GCM encrypt/decrypt against the Worker secret, and
an in-memory store for tests. Consumed by `edge/byok.ts`, whose resolver now covers both D9
custody forms: a vaulted key is decrypted in-process and handed to the same closure a
pass-through key goes to, so both converge on one outbound `Authorization` header. Wired in
`edge/worker.ts` (`/vault` dispatch, `buildVaultEnv`), with the KV adapter in `edge/adapters.ts`
(`createKvVaultStore`), the binding types in `edge/bindings.ts` (`VAULT_KV`, `VAULT_SECRET`,
`VAULT_KILL_SWITCH`), the wire contract in `edge/protocol.ts`, and the counter shape in
`edge/shared/counters.ts`.

Client half: `src/stores/vault.ts` (the persisted reference + durable vault session),
`src/services/vaultClient.ts` (the two calls), the "Remember my key" control in
`src/features/ai/AISettingsPanel.tsx`, and the credential assembly in
`src/features/ai/AIChatModule.tsx` + the ladder's vault rung in `src/services/aiProvider.ts`.

**Design notes from the build (2026-07-23).**

- **The vault's session is durable and vault-specific.** The per-page-load id every other edge
  call carries cannot address a key across tab closes, which is the entire feature; a durable
  id is minted **only on the first store**, so a user who never opts in never gains one. It is
  stored with the reference and both halves are required to resolve — a reference alone names
  nothing. Master §5.2 records this.
- **Refresh-on-resolve is lazy**, at 1% of the idle window (≈21.6h on the 90-day default), and
  is expressed as a *fraction* of the TTL rather than a fixed interval — a fixed one would
  silently stop refreshing if the TTL were ever tuned below it, turning "expires after 90 days
  *without use*" into a hard expiry. (A test caught exactly that.)
- **Resolves do not spend the operation budget.** The 10/session/hour limit covers the
  client-facing store/delete; a resolve rides an already-rate-limited ai-router call, and
  counting it would cap a remembered-key user at ten questions an hour. Master §11.2 records this.
- **Fail closed.** With no KV binding or no `VAULT_SECRET`, every operation answers typed
  `unavailable` (503) — the vault never degrades to storing a key unencrypted, and the settings
  UI says so plainly rather than implying a key was remembered.
- **A vaulted record's own provider is trusted, not the request's claim about it**, so a stored
  key cannot be redirected at a different provider by someone holding only the reference.

## Dependencies

The **anonymous session-identity requirements** in §23.1 define what "keyed to session"
concretely means — tokens are server-minted, integrity-protected, and per-IP-rate-limited;
the mechanism (cookie vs header, HMAC scheme) is ADR-006. Shared dual-keyed rate limiter
(§23.5).

## Acceptance criteria

- [x] Store → reference → resolve round-trip works router-side; raw key never in any client
      response — *`vault.test.ts`; structurally, the endpoint has no resolve operation at all,
      so no response shape can carry key material back*
- [x] Delete removes the value; subsequent resolves fail cleanly — *and a delete of an unknown
      reference is a typed 404, never a blind success that would make the control unverifiable*
- [x] A vaulted key unused for its idle TTL expires; a `resolve` within the window refreshes it
      — *short-TTL test config with an injected clock; a separate test pins the lazy-refresh
      threshold so the write rate stays ~4/year per credential*
- [x] The 4th vaulted credential in a session is rejected (cap of 3 enforced) — *unit-tested per
      session (a different session is unaffected) and live against Miniflare KV: `200 200 409`.
      **Against real KV the cap is `eventual`, and the staging audit measured how eventual:** a
      back-to-back burst seated 5 records under the cap of 3, 3s spacing still passed, and the
      4th was rejected `409 cap-reached` only after a ~120s settle. Accepted as designed — the
      cap is hygiene and the strongly consistent op limiter (10/session/hour) is the real
      ceiling under burst (master §11.2, ADR-006)*
- [x] Vault operations beyond 10/session/hour are rate-limited (typed 429) — *including the
      per-IP floor case (fresh session ids from one IP still hit a wall) and the rule that a
      failed op still counts; live: requests 11+ returned `429 {"error":"rate-limited"}`*
- [x] Raw keys absent from logs and error messages — *live `wrangler dev` audit: zero
      occurrences of the stored key across the Worker log; the counter shape has nowhere to put
      one, and error bodies are the typed code alone*
- [x] Reference tokens are unguessable and session-scoped — *256-bit CSPRNG, base64url,
      non-repeating across mints; scoping is the storage key (`vault:{session}:{ref}`), so a
      reference presented under another session addresses nothing — resolve and delete both
      tested cross-session*
- [x] No vault interaction occurs for pass-through-mode users — *the resolver only reads the
      vault for a credential carrying both `vaultRef` and `vaultSession`; a raw-key credential
      returns before touching it, and the client sends the vault form only when this browser
      holds a reference and no in-memory key*
- [x] Encrypted at rest — *a raw dump of Miniflare's KV store after a live store contained
      neither the key nor the provider name; a record written under a rotated secret does not
      resolve*

## Test plan

Wrangler-dev unit/integration: round-trip, delete, cross-session resolution attempts (must
fail), idle-TTL expiry (short-TTL test config) with refresh-on-resolve, credential-cap
rejection, op-rate-limit exhaustion, log audit. Client-side §22 privacy row: key never in
browser storage in plaintext.

**Run 2026-07-23.** `edge/vault.test.ts` — 29 cases across round-trip, session scoping,
encryption-at-rest, idle TTL, abuse controls, fail-closed configuration, request hygiene, and
content-free counters; plus 5 vault cases in `edge/byok.test.ts` (a vaulted key reaches only the
`Authorization` header; both halves required; the record's provider is authoritative), 6 in
`src/services/vaultClient.test.ts`, 8 panel cases in `AISettingsPanel.test.tsx` (including the
§22 storage row: after remembering a key, no localStorage entry contains it, while the
reference does), 3 ladder cases, and 5 status-line cases. A live local `wrangler dev` pass
(real Miniflare KV + DO limiter, through `worker.ts`'s own wiring) confirmed store → ref,
cross-session delete blocked (404), the cap (409 on the 4th), non-POST rejection (400), a
verifiable delete, the op limiter (429 from the 11th), key material absent from both the log
and the on-disk KV store.

## Definition of done

D9 opt-in path green end-to-end from the Phase-4 settings UI; custody audit written up
alongside the ai-router one.

**Closed 2026-07-23 — live on staging.** Two KV namespaces were created (`VAULT_KV` and a
separate `staging-VAULT_KV`, so the staging Worker can never resolve a future production
record — the config previously assumed one shared id), `VAULT_SECRET` was set as a staging
`wrangler secret` from locally generated 32-byte entropy, and
`datascope-edge-staging.justinclarke.workers.dev` was redeployed with both bound.

Live round-trip against staging: store → ref; cross-session delete → `404 not-found`; non-POST
→ `400 bad-request`; delete → `{"deleted":true}` and the repeat → `404` (the delete is
verifiable in production KV, not only in Miniflare); the op limiter → `200`s through op 10 and
`429 rate-limited` from op 11, with a fresh session id unaffected; TTLs land ~90 days out on
every record. **Custody audit:** all 13 records in the namespace dumped through
`wrangler kv key get` are AES-GCM ciphertext — zero occurrences of the stored key, the string
`sk-`, or the provider name across the whole dump — and a `wrangler tail` capture spanning a
store, a delete, and a malformed request contains zero occurrences of the key (or of `sk-`)
across request lines, DO events, logs, and exceptions.

**One live-only divergence, recorded not papered over:** the credential cap is eventual against
real KV (see the criterion above) — the design's stated control, the op limiter, is what holds
during a burst. A first audit pass also returned route-level `404`s for `/vault` while the new
version was still propagating across colos; re-running after it settled gave the results above.
