# ADR-009: Terraform layout & state backend

**Status:** Decided (2026-07-23), from evidence gathered when v0.5 infra work started on `09-edge/04-persistence-endpoints`'s Terraform-owned R2 lifecycle rule (D18, D19).

**Referenced by:** `architecture/system-design.md`, `foundations/infrastructure.md`

## Context
Resolves the Terraform layout and state backend: an R2 S3-compatible backend with lockfile locking vs. the Terraform Cloud free tier, plus the environment split (per D19). Deferred to when v0.5 infra work starts, so the choice is made from real infrastructure evidence rather than up front — that point is now, forced by `09-edge/04-persistence-endpoints`'s open lifecycle-TTL criterion needing a real Terraform tree to land the rule in.

## Decision
**R2 as the remote state backend, using Terraform's native S3-backend locking (`use_lockfile`, Terraform ≥ 1.10), not Terraform Cloud.** State lives in a dedicated bucket (`datascope-terraform-state`) in the same Cloudflare account everything else in `infra/` manages — one account to reason about, no external service dependency, no cost beyond what's already free-tier R2 storage for a single small state file.

`backend "s3"` is pointed at R2's S3-compatible endpoint with `use_lockfile = true`; no DynamoDB-equivalent lock table exists or is needed. The account-specific endpoint URL and R2 API-token credentials are supplied at `terraform init` time via partial configuration (`-backend-config=backend.hcl`, gitignored), never written into a checked-in `.tf` file (§23.1 — no secrets in repo or, where avoidable, in state).

## Alternatives considered
- **Terraform Cloud free tier.** Fully managed locking, no backend plumbing to get right. Rejected: adds a second external account/dependency for a single-person project when the account already being provisioned (Cloudflare, via R2) can hold its own state at zero extra cost — the "one account to reason about" property this project has favored elsewhere (e.g. the vault KV / R2 bucket isolation-by-environment precedent) tips this comparison.
- **R2 backend without locking** (plain `backend "s3"`, `use_lockfile` omitted). Rejected outright, not seriously considered: concurrent `apply` runs could corrupt state with no protection at all. Only worth naming because it's the trap a naive R2-backend setup falls into if the locking mechanism isn't checked first — which is exactly what this ADR's spike evidence exists to rule out.

## Consequences
- `terraform init` requires a one-time out-of-band bootstrap: create `datascope-terraform-state` via `wrangler r2 bucket create` (Terraform cannot create the bucket its own state lives in inside the same `init`), and a bucket-scoped R2 API token (Object Read & Write only) supplied as `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`-shaped credentials in the gitignored `backend.hcl`.
- Terraform requires **≥ 1.10.0** — `use_lockfile` doesn't exist on older releases. Recorded in `infra/providers.tf`'s `required_version`.
- No import of the state bucket itself into the tree it backs (avoids the self-referential bootstrap problem entirely) — it's the one Terraform-adjacent resource this project manages by hand, documented as such rather than pretended away.
- Environment split: `dev`/`prod` via per-env `.tfvars` in `infra/envs/` + a Terraform workspace per env (not two separate state files hand-managed) — chosen over workspaces-as-the-only-mechanism because the two environments' resource *sets* are otherwise identical (same resource blocks, different bucket name), so tfvars carries the one axis that actually varies.

## Spike evidence
Gathered 2026-07-23, targeted at the one open question — does R2's S3 API actually support what `use_lockfile` needs:

- **Terraform's native S3-backend locking (`use_lockfile`, GA in Terraform 1.10, Nov 2024) works by writing a `.tflock` object next to the state file using a conditional PUT (`If-None-Match`) — no DynamoDB or equivalent lock table.** [Terraform S3 backend docs](https://developer.hashicorp.com/terraform/language/backend/s3), [HashiCorp PR #35661](https://github.com/hashicorp/terraform/pull/35661).
- **Cloudflare's own R2 API docs confirm conditional-write support on `PutObject`, explicitly including `If-None-Match`** — the exact primitive `use_lockfile` depends on. [Cloudflare R2 S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/).
- A separate, unrelated caveat surfaced during the check: R2 does **not** support S3 Object Lock (WORM retention — `x-amz-object-lock-mode` etc.). This does not affect the decision — Object Lock is a compliance/retention feature, not the mechanism `use_lockfile` uses; conflating the two would have been a false blocker.
- **Cloudflare publishes an official worked example** for exactly this setup (S3-backend pointed at R2, `region = "auto"`, `skip_requesting_account_id = true`, `use_path_style = true`), confirming this is a supported, documented pattern rather than an unofficial workaround. [Cloudflare Terraform docs — remote R2 backend](https://developers.cloudflare.com/terraform/advanced-topics/remote-backend/).
- Not verified live this session (no Terraform tree existed yet to test against): an actual concurrent-`apply` lock-contention run against the real `datascope-terraform-state` bucket. Flagged as the one open verification for whoever runs the first `terraform apply` — the design is evidence-backed from documentation, not yet evidence-backed from this project's own live behavior.
