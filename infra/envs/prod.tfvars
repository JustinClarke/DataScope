# Matches wrangler.toml's root (production) r2_buckets block.
# cloudflare_account_id is not set here — supply via TF_VAR_cloudflare_account_id
# (not secret, but kept out of checked-in tfvars so this tree stays account-agnostic).
persistence_bucket_name = "datascope-persistence"
