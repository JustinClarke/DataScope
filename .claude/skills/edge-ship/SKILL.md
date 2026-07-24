---
name: edge-ship
description: "Pre-flight gate before deploying the Cloudflare Worker (npm run edge:deploy:staging / scripts/deploy-edge-staging.sh) or when editing any edge/ handler or edge/shared. Checks the four things a deploy ships silently and no hook catches: kill-switch coverage, content-free counters, rate-limit coverage, and green tests. Triggers on: edge deploy, ship the worker, wrangler deploy, edge handler, kill switch, counters, rate limit, staging worker."
---

# edge-ship

The Stop hooks run `oxlint` + `tsc` on changed TypeScript. A deploy ships four things they
can't see: whether an endpoint can be paused, whether its telemetry leaks content, whether
it can be hammered, and whether its tests pass. This is that pre-flight. Run it before
`npm run edge:deploy:staging` (which calls `scripts/deploy-edge-staging.sh`), and when
editing anything under `edge/handlers/` or `edge/shared/`.

The endpoints: `ai-router`, `synthesis`, `vault`, `persistence`, `mcp`, `cors-relay`
(all `edge/handlers/*.ts`). The shared machinery each must use:

- `edge/shared/killSwitch.ts` — `isPaused(flag)`; an operator flips one env var (no deploy)
  and the endpoint returns a typed 503, client renders "cloud features paused".
- `edge/shared/counters.ts` — content-free metric shapes (`SynthesisMetric`,
  `AiRouterOutcome`, …). The type makes content-bearing telemetry *unrepresentable*.
- `edge/shared/limiter.ts` — `checkRateLimit()` + a `RateLimits` entry.

## The four checks — all must pass

1. **Kill-switch coverage.** Every new or changed endpoint reads its own env flag through
   `isPaused` and returns the typed 503 when paused. Scoped per endpoint — pausing one never
   touches another. A cloud endpoint with no pause path is not shippable.

2. **Counters stay content-free.** Any metric you add is a label / outcome class / coarse
   bucket (size, latency) — never a place a prompt, generated SQL, column name, narrative, or
   error string could land. If a new field could hold free text, it's wrong. This is a
   structural guarantee (D41), not a rule to remember: keep it unrepresentable.

3. **Rate-limit coverage.** Cost-bearing or mutating endpoints go through `checkRateLimit()`
   with a declared `RateLimits` budget. A new unlimited cloud endpoint is an abuse surface.

4. **Tests green.** `npm test` (vitest) covers the edge handlers — each has a `*.test.ts`.
   Run `make check` (lint + typecheck + test) before deploying. The deploy script itself does
   no verification beyond auth.

## Two standing cautions

- **Secrets.** Nothing reads or logs `CLOUDFLARE_API_TOKEN`, BYOK keys, or vault contents.
  The deploy script is deliberately silent about the token — keep it that way.
- **Staging state is not disposable.** `datascope-persistence-staging` (R2) carries a
  deliberate out-of-band TTL-lifecycle rule for expiry testing. Do **not** `terraform apply`
  away apparent "drift" there without checking the build docs first — the drift is the test.

## How to run

- `git status --porcelain` → which `edge/` files changed; scope the checks to them.
- For each changed handler: name its kill-switch flag, its rate-limit entry (or why exempt),
  and its test file.
- Grep new counter fields for free-text types.
- Run `make check`. Only green → deploy.

Report each check PASS / FAIL with file:line. All green → one line and the deploy command.
Any FAIL → stop, list them, don't deploy.
