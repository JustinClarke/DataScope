#!/usr/bin/env bash
# Deploy (or update) the staging edge Worker. Idempotent — re-running redeploys.
#
# Auth: expects CLOUDFLARE_API_TOKEN in the environment (a token with Workers
# Scripts:Edit and Account Settings:Read), or a prior `wrangler login`. Nothing
# here reads or prints the token.
set -euo pipefail
cd "$(dirname "$0")/.."

# Don't send Wrangler usage telemetry from a deploy run.
export WRANGLER_SEND_METRICS=false

WRANGLER="npx --yes wrangler@4"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  if ! $WRANGLER whoami >/dev/null 2>&1; then
    echo "error: set CLOUDFLARE_API_TOKEN or run 'wrangler login' first." >&2
    exit 1
  fi
fi

echo "==> Deploying staging Worker…"
$WRANGLER deploy --env staging

echo "==> Done. Verify with:  curl https://datascope-edge-staging.<your-subdomain>.workers.dev/health"
