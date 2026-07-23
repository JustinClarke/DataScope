# staging = dev at this scale (§23.3). Matches wrangler.toml's [env.staging]
# r2_buckets block. cloudflare_account_id is not set here — supply it via
# TF_VAR_cloudflare_account_id (not secret, but kept out of checked-in
# tfvars so this tree stays account-agnostic).
persistence_bucket_name = "datascope-persistence-staging"
