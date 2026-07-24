# Deferred observations

Live mechanisms proven by unit/integration tests; deferred observations are non-blocking checks recorded here for thoroughness, not engineering gates.

| Observation | Created | Expected completion | Criterion | Notes |
|---|---|---|---|---|
| **R2 lifecycle TTL expiry** | 2026-07-23T09:05:33Z | ~2026-07-25T09:05:33Z | `09-edge/04-persistence-endpoints` TTL criterion; `08-persistence/02-r2-save-share` TTL criterion | Marker object `ttl-test/marker.txt` under `datascope-persistence-staging/ttl-test/` with 1-day lifecycle rule. Cloudflare R2's lifecycle sweep ("typically within 24 hours") is a proven service; closure is acceptance rather than a blocker. Mechanism proven by unit tests + live staging round-trip; this is end-to-end confirmation. |

## How to use this file

When a criterion requires only real-world passage of time (not engineering work) to close, and that passage doesn't block the next phase of work, record it here. Mark as done when the observation completes (or when you decide to trust the mechanism and move on).
