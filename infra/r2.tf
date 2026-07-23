# R2 save/share bucket (D5, §12.3) and its lifecycle TTL rule — the piece
# 09-edge/04-persistence-endpoints.md's box was left open on. One generic
# resource pair, applied once per environment (`terraform apply
# -var-file=envs/dev.tfvars` / `envs/prod.tfvars`, each in its own
# `terraform workspace` so state doesn't collide) — dev manages
# datascope-persistence-staging, prod manages datascope-persistence, matching
# §23.3's "resource names carry the env suffix" and the vault KV isolation
# precedent (a shared bucket would let staging resolve production share
# links).
#
# Both buckets already exist (created by `wrangler r2 bucket create` before
# this tree was authored), so they're adopted via `import` rather than
# created fresh; only the lifecycle rule beneath them is new. wrangler.toml's
# `[[r2_buckets]]` blocks keep binding the bucket to the Worker — Terraform
# owns the bucket and its lifecycle rule, never the binding or the Worker
# script (§23.3's ownership boundary).

import {
  to = cloudflare_r2_bucket.persistence
  id = "${var.cloudflare_account_id}/${var.persistence_bucket_name}/default"
}

resource "cloudflare_r2_bucket" "persistence" {
  account_id = var.cloudflare_account_id
  name       = var.persistence_bucket_name
}

# 30-day TTL (launch default, tunable) — the same number §12.3 discloses to
# the user, so the disclosed retention and the enforcement mechanism can
# never drift apart. Applies to every object (empty prefix); persistence.ts
# stores no path structure worth filtering on.
resource "cloudflare_r2_bucket_lifecycle" "persistence" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.persistence.name

  rules = [{
    id      = "expire-after-30-days"
    enabled = true

    conditions = {
      prefix = ""
    }

    delete_objects_transition = {
      condition = {
        type    = "Age"
        max_age = 60 * 60 * 24 * 30 # 2592000 seconds
      }
    }
  }]
}
