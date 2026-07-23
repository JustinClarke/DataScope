# Backlog: Tier-3 Credential-Vault Ingestion

**Tier:** backlog (D4) · **Master spec:** §7.4 Tier 3, §20.2

For APIs requiring a secret key: the key lives in a Cloudflare secret/KV binding keyed to
the user's session; the browser sends a reference; the Worker attaches the real
header/token server-side.

**Why it's cheap when revived:** the vault *mechanism* already ships in v0.5 for BYOK AI
keys ([`../build/09-edge/03-vault.md`](../build/09-edge/03-vault.md)) — this is a second
consumer of the same pattern. The build cost is small; the decision is a product/disclosure
one, not architectural (§20.2).

**Requirements on revival:** opt-in, clearly labeled ("this source requires storing your
API key server-side"), delete control, same disclosure standards as
[`../foundations/privacy-model.md`](../foundations/privacy-model.md). Keep the vault API
consumer-agnostic so this stays incremental.

**Trigger:** user demand for secret-key API sources that Tier 1/2 can't serve.
