variable "cloudflare_account_id" {
  description = "Cloudflare account ID that owns every resource in this tree. Not secret, but not hardcoded either — supply via TF_VAR_cloudflare_account_id so this tree stays account-agnostic."
  type        = string
}

variable "persistence_bucket_name" {
  description = "Name of this environment's R2 save/share bucket — the one axis that actually differs between dev and prod (envs/*.tfvars)."
  type        = string
}
