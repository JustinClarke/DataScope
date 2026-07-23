# Cloudflare account resources as code (D19, §23.3). Bootstrapping note: the
# state bucket named below must exist *before* `terraform init` can use it —
# Terraform cannot create the bucket its own state lives in inside the same
# init. Create it once, out of band:
#   wrangler r2 bucket create datascope-terraform-state
#
# Backend blocks cannot reference variables or providers (they're parsed
# before the rest of the config), so the account-specific endpoint and the
# R2 credentials are supplied at init time via partial configuration, never
# written here:
#   terraform init -backend-config=backend.hcl
# where backend.hcl (gitignored, not this file) holds:
#   endpoints   = { s3 = "https://<account_id>.r2.cloudflarestorage.com" }
#   access_key  = "<R2 token access key id>"
#   secret_key  = "<R2 token secret>"
# The R2 token is scoped to Object Read & Write on datascope-terraform-state
# only (§23.1 least-privilege).

terraform {
  required_version = ">= 1.10.0" # backend "s3" use_lockfile needs 1.10+

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket = "datascope-terraform-state"
    key    = "datascope.tfstate"

    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    use_lockfile                = true # native conditional-write locking (ADR-009) — no DynamoDB equivalent

    # endpoints, access_key, secret_key: supplied via -backend-config, see above
  }
}

# Reads CLOUDFLARE_API_TOKEN from the environment — same discipline as
# wrangler secret storage, no token value ever lands in a .tf file.
provider "cloudflare" {}
