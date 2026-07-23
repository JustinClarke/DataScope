# Infrastructure — Docker, Terraform, CI/CD

**Tier: cross-cutting — sequenced per release tier (table below).**
**Master spec:** §23.2–23.5 (D19), §16 (`infra/`, `Dockerfile`, `compose.yaml`,
`.github/workflows/`). Security controls these pipelines enforce:
[`security-model.md`](security-model.md).

## Docker — dev & CI parity only (§23.2)

**Non-goal: production runtime.** Production is static hosting + Cloudflare Workers
(workerd); there is no container to ship, and inventing one would contradict §4's
minimal-surface constraint. Docker's actual jobs:

| File | Job |
| :--- | :--- |
| `Dockerfile` | Multi-stage, pinned Node LTS base; reproducible static build. The same image builds locally and in CI. |
| `compose.yaml` | Local stack: `app` (Vite dev server), `edge` (`wrangler dev`), `e2e` (Playwright), optional `ollama` profile so the local-model AI mode (§5.1) is testable without polluting the host. |
| `.devcontainer/` | Points at the compose service; onboarding = clone + open. |

Rule: **CI runs in the same image developers use.** "Works on my machine" is a pipeline
failure, not an excuse.

**Published build provenance (D63, v0.5-era).** The reproducible build is promoted from CI
hygiene to a **public trust claim**: CI publishes the **bundle hashes + a SLSA-style provenance
attestation** on the D50 `/security` page, so anyone can verify the hosted bundle is
byte-identical to the audited source. Mostly CI discipline + publishing — near-zero app code. It
is piece (1) of the D63 **approval kit** ([`security-model.md`](security-model.md)); pieces (2)
signed `.dsps` and (3) a third-party audit sit outside the pipeline.

## Terraform — Cloudflare resources as code (§23.3)

Ownership boundary, drawn to avoid the classic wrangler-vs-Terraform drift fight:

| Owner | Resources |
| :--- | :--- |
| **Terraform** (`infra/`) | Long-lived account resources: DNS records, custom domain, static-hosting project, R2 buckets **and their lifecycle TTL rules** (the §12.3 retention policy becomes reviewable code — the rule is **30 days**, launch default, tunable), KV namespaces (vault), zone security settings, the **Workers Analytics Engine dataset + billing/alert notification resources** where the provider supports them (§23.5), Turnstile widget if §12.3 abuse controls ever need it. |
| **wrangler** (`edge/`) | Everything that ships with code: Worker script, bindings and routes (`wrangler.jsonc`), secrets (`wrangler secret`). **Terraform never deploys Worker code.** |

- **Environments:** `dev` and `prod` (staging = dev at this scale), via a Terraform
  workspace per env selecting a per-env `.tfvars` in `infra/envs/`; resource names carry
  the env suffix.
- **State:** remote backend, never committed local state. **Decided (ADR-009,
  2026-07-23): R2's S3-compatible API**, using Terraform's native S3-backend locking
  (`use_lockfile`, Terraform ≥ 1.10) — R2's conditional-write support on `PutObject`
  covers exactly what `use_lockfile` needs, confirmed against Cloudflare's own R2 API
  docs and its published worked example for this exact setup; no Terraform Cloud
  dependency, no DynamoDB-equivalent lock table. State bucket
  (`datascope-terraform-state`) is created once out-of-band (Terraform can't create the
  bucket its own state lives in inside the same `init`) and is the one resource in this
  tree's scope Terraform doesn't manage itself. See **ADR-009**
  ([`../architecture/adr/009-terraform-state-backend.md`](../architecture/adr/009-terraform-state-backend.md)).
- **Workflow:** `terraform plan` on every PR touching `infra/`; `apply` from main behind
  manual approval. Dashboard edits to Terraform-owned resources are incidents to reconcile,
  not shortcuts (§17).

## CI/CD — GitHub Actions (§23.4)

| Trigger | Pipeline |
| :--- | :--- |
| **Pull request** | Lint, typecheck, unit + worker tests, E2E against the compose stack, bundle-size budget check ([`performance-budgets.md`](performance-budgets.md)), `npm audit` gate, secret scan; `terraform plan` when `infra/` changes. |
| **Merge to main** | Build in the pinned Docker image → deploy static app + `wrangler deploy` edge to dev → smoke E2E against it. |
| **Release tag** | Promote to prod (static + edge); `terraform apply` behind manual approval; **publish the static build as a versioned self-host zip to GitHub Releases with COOP/COEP + degraded-no-SharedArrayBuffer header docs (D50)** — sovereignty-ladder rung 2, detail in [`security-model.md`](security-model.md). |

Workflows in `.github/workflows/`; Actions pinned to commit SHAs
([`security-model.md`](security-model.md) supply-chain row).

## Operational ceilings & kill switches (§23.5)

The core loop costs the owner nothing per user (§4), but the enumerated edge surface *does*
spend real resources per request — Workers-AI neurons, subrequests, KV/R2 ops. The quantified
operational contract around that surface (all numbers launch defaults, tunable from the
observability evidence below, D18):

- **Plan posture.** v0 (static only) runs on the Cloudflare free plan and costs nothing. **At
  the v0.5 edge ship the account moves to Workers Paid (~$5/mo, launch default)** — removing
  the 100k-req/day Free cliff that would otherwise take the *entire* edge dark under a spike,
  lifting the 50-subrequest cap the relay's pagination path can hit, and turning spend into a
  controllable variable instead of a hard outage.
- **Budget ceiling.** A declared **monthly edge-spend ceiling ($25/mo, launch default)**, with
  Cloudflare billing notifications at ~50% and ~80% — Terraform-managed where the provider
  supports it, else a documented dashboard step (an allowed, recorded exception to the
  no-dashboard rule).
- **Kill switches.** Every edge endpoint (ai-router, the v0.25 synthesis endpoint, relay, save,
  vault, and — from v0.5 — the D38 read-only DSPS-serving MCP endpoint) checks a
  **per-endpoint enable flag** — a Worker env
  var in `wrangler.jsonc`; flipping one is a seconds-long `wrangler deploy`, with the exact
  command in the runbook. A disabled endpoint returns a **typed 503** the client renders as
  "cloud features paused" (§4 edge-independent core). Deliberately the env-var-flag version,
  **not** a KV-read-per-request dynamic flag service — upgrade only if redeploy latency ever
  proves inadequate. The D39 hosted-staging endpoint inherits the same machinery; its
  server-side *execution* tier is real per-request compute and gets its own cost ceilings and
  abuse controls in the dedicated D39 design round (v1+).
- **Observability (content-free, privacy-compatible).** Cloudflare's built-in Workers/R2
  dashboards are the free baseline; one **Workers Analytics Engine dataset** records
  content-free counters per request — endpoint, outcome class (ok / 429 / 5xx / killed), coarse
  size bucket, **no URLs, payloads, session tokens, or IPs** (never joined to user data, §5.2).
  Per **D25** the same dataset doubles as the product traction graph: it counts **edge
  events** — hosted shares created, relay fetches, edge-routed structure-report exports,
  AI-mode requests routed (attribution-tagged arrivals distinguishable, D26) — while
  CDN-level request counts give visitor volume with zero page-side tracking; local-only
  mode is uncounted by construction. These feed the §18 steering bars (D27). Per **D41** the
  same dataset also records **numeric-only LLM metrics** on the cloud/edge path — tokens/turn,
  retry count, repair-rate, latency bucket (doubles + outcome blob) — and **never prompt/SQL/
  error text** (that content lives only in the client-side §11.1 transcript). OTel-style
  content-bearing Worker-path tracing is out (a §5.2 violation); content-bearing traces for
  **staged datasets only** (D39) are a D39-round question.
  **Alerts** (launch defaults, tunable): Workers-AI usage ≥ 80% of the daily allocation, R2
  storage ≥ 8 GB, edge error-rate spike, daily request count ≥ 50k, plus the billing alerts
  above. The Analytics Engine dataset and notification resources are Terraform-owned where
  supported.
- **Rate-limiter backend constraint (recorded ADR-006 input; the limiter backend is now
  decided).** The shared limiter these ceilings depend on **must not use plain KV** (eventually
  consistent — a KV counter doesn't actually limit under burst — and free-tier KV writes would be
  exhausted by the limiter itself). Acceptable shapes: Cloudflare's **native Workers Rate Limiting
  binding** (per-key, in-colo, no storage cost) or a **Durable Object counter** where per-session
  quota semantics exceed the binding. **Decided (ADR-006, from live staging audits):** **both the
  per-minute dual-keyed limiter and the daily AI quota use a Durable Object counter** — a KV
  counter under-counted each under burst (the 60s limiter window read 13 requests ~1s apart back
  as 5; the daily quota's "86,400s window dwarfs the slop" assumption then failed its own live
  burst test, reading 21 requests over ~95s back as 8 — window width doesn't protect against
  burst pacing, and burst is the adversarial shape). KV remains fine for the vault's low-write
  use.
- **Escalation trigger.** Adopt Turnstile on the affected endpoint when sustained 429/abuse
  rates (per the counters above) show session + IP limiting is insufficient — a data-triggered
  escalation, not a launch feature (Terraform provisions the widget, §23.3 table above).

## Sequencing by release tier

| Tier | Infrastructure deliverables |
| :--- | :--- |
| **v0** (Phase 1 bootstrap → public ship) | `Dockerfile` + `compose.yaml` (`app`, `e2e`) + devcontainer; PR pipeline (lint/type/test/E2E/audit/secret-scan/bundle-budget); security headers deployed and verified; Terraform bootstrap for DNS + hosting so prod is reproducible from an empty Cloudflare account from the first public URL. |
| **v0.5** (edge services) | `edge` + `ollama` compose services; **Workers Paid plan posture (§23.5)**; Terraform becomes load-bearing: R2 buckets + 30-day lifecycle TTL, KV namespace, dev/prod env split, Analytics Engine dataset + notification resources; ADR-009 written; **per-endpoint kill-switch flags + billing alerts** wired; edge deploy + SSRF/rate-limit tests in CI; release-tag promotion flow. |
| **v1** (Studio arc) | Nothing new — no new server surface (§4). Pipeline unchanged. |

## Acceptance criteria

- [ ] Fresh clone → `docker compose up` → working app + edge stack, no host Node install
- [ ] CI green run includes every PR-pipeline stage above, executed in the pinned image
- [ ] `terraform apply` from an empty Cloudflare account recreates dev end-to-end; plan
      against prod shows no drift
- [ ] R2 lifecycle TTL rule in Terraform = 30 days (launch default, tunable), matching the
      §12.3 disclosed retention policy
- [ ] Each edge endpoint's kill-switch flag demonstrably disables it in staging (returns the
      typed 503); billing alerts fire against a simulated threshold
- [ ] No secrets in repo, bundle output, or state (secret scan green)
- [ ] Each release publishes a versioned self-host zip (static build + COOP/COEP + degraded-no-SAB
      docs) to GitHub Releases, and the `/security` page's enumerated network surface matches the
      deployed CSP (D50)
