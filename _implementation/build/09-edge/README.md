# 09 — Edge Services (Cloudflare Worker)

**Tier:** v0.5 · **Separate deploy** — the `edge/` tree in §16, wrangler-managed,
independent of the static app · **Depends on:** nothing in `src/` (it serves
[`../06-ai/`](../06-ai/), [`../07-connectivity/`](../07-connectivity/), and
[`../08-persistence/`](../08-persistence/) as clients).

The **entire** server surface (§1, §4): three enumerated paths, no general backend, no
server-side query execution, no always-on state. Anything not listed here does not get a
server component without revisiting the Decision Record.

**v0.25 adds one authorized path (D70).** The edge-warm synthesis Worker (`edge/synthesis.ts`)
is a post-launch addition documented in [`../v0.25/02-edge-synthesis.md`](../v0.25/02-edge-synthesis.md)
— it revisits the Decision Record per the rule above (D70), reuses [01-ai-router.md](01-ai-router.md)'s
provider routing rather than adding a second router, and rides this folder's shared dual-keyed
limiter / per-endpoint kill switch / content-free counters (ADR-006). Structure-only (DSPS
facts, never rows; D9/D45/D59), opt-in, stateless pass-through, never stored, and never called
in local-only mode (D2).

| Doc | Covers | `edge/` file (§16) |
| :--- | :--- | :--- |
| [01-ai-router.md](01-ai-router.md) | Workers AI / BYOK routing | `ai-router.ts` |
| [02-cors-relay.md](02-cors-relay.md) | Tier-2 relay + dual-keyed rate limiting | `cors-relay.ts` |
| [03-vault.md](03-vault.md) | BYOK vault — opt-in "remember my key" (D9) | `vault.ts` |
| [04-persistence-endpoints.md](04-persistence-endpoints.md) | R2 save/share, TTL/abuse | `persistence.ts` |

Shared infrastructure: the **rate limiter** is built once and consumed by **all four
endpoints** — AI router, relay, save, and vault (§11.2, §7.4, §12.3, §23.5), not just the
relay and save endpoint. It is **dual-keyed** — a per-session limit plus a coarser per-IP
floor so fresh-session farming still hits a wall (§23.1) — and **must not use plain KV**
(eventual consistency + free-tier write cost): the launch default is Cloudflare's native
Workers Rate Limiting binding, with a Durable Object counter only where per-session quota
semantics (e.g. the daily AI quota) exceed the binding (a recorded ADR-006 constraint). The "no plain KV" rule is
about **counters** and is unchanged; the vault's own **value** store is KV by design (native
TTL, write-once/read-back), which ADR-006 records as the complementary case rather than an
exception. Every
endpoint also checks a **per-endpoint kill-switch flag** — a Worker env var; flipping it is a
seconds-long `wrangler deploy` — and returns a **typed 503** when disabled, which each client
renders as a "cloud features paused" state (§23.5, §4 edge-independent core). Overall edge
layout, bindings, and limiter design are **ADR-006**.

**MCP surface & hosted staging (D38, D39).** A read-only, **DSPS-serving MCP endpoint**
(Streamable HTTP; `get_dsps`, `list_shared`) is added at the v0.5 edge ship — serving **only**
the structure-only artifacts a user explicitly shared to R2 (D5/§12.3), inheriting the
dual-keyed limiter, per-endpoint kill switch, and content-free counters above. **Stage B**
full-tool MCP (`run_sql`, `profile_dataset`, …) and any **server-side execution** run only
over explicitly staged datasets (D39, opt-in R2 stage — presigned PUT, lifecycle TTL, manual
"Clear temporary data") and stay behind the **dedicated D39 design round** (v1+): engine
placement, its own cost ceilings + §23.5 counters, abuse controls, disclosure copy. Until
then the "no server-side query execution" surface (§1, §4) is unchanged. Never a silent
fallback (§7.3 only *offers* staging).

**Traction counters (D25) + LLM metrics (D41).** The §23.5 Workers Analytics Engine dataset —
already content-free (endpoint, outcome class, size bucket; no URLs/payloads/tokens/IPs) —
also counts product **edge events**: hosted shares created, relay fetches, edge-routed
structure-report exports, AI-mode requests routed (attribution-tagged arrivals
distinguishable, D26). Per **D41** it additionally records **numeric-only LLM metrics** on the
cloud/edge path — tokens/turn, retry count, repair-rate, latency bucket (doubles + outcome
blob), **never prompt/SQL/error text** (that content lives only in the client-side §11.1
transcript). CDN-level request counts provide visitor volume with zero page-side tracking;
local-only mode stays uncounted by construction. OTel-style content-bearing Worker-path
tracing is out (a §5.2 violation); content-bearing traces for **staged datasets only** are a
D39-round question. These signals feed the §18 steering bars (D27).

**Exit criteria:** all four endpoints deployed to staging with the dual-keyed limiter active
on each and per-endpoint kill-switch flags that demonstrably disable their endpoint (each
returning the typed 503); the edge-dark E2E passes — origin blackholed, core still fully
functional, every typed 503/429/AI-quota response rendering its paused state (§4, §23.5); the
client phases' E2E suites run green against it.
