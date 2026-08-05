# Backlog: Runtime Data-Boundary Indicator

**Tier:** backlog — trust / privacy UX · **Related:** §5.1–5.2 privacy posture, D2 AI
routing, D9 BYOK, D20 sharing, D25 content-free edge signals

Make DataScope's local-first behavior continuously visible in the Workbench, using the
existing status-bar privacy posture as the starting point. The goal is not another badge; it
is an accurate, inspectable answer to: **what data, if any, just crossed the browser boundary?**

**Do not build anything yet.** The current status item remains in place until this work is
scheduled.

## Why

The Workbench status bar currently derives a green **"nothing leaves"** / amber **"may leave
your browser"** message from the selected AI mode alone
([`StatusBar.tsx`](../../src/features/status/StatusBar.tsx)). The placement and ambient posture
are useful, but the claim is broader than the state behind it:

- remote API ingestion and local-model downloads create network traffic;
- CORS fallback can pass an API request and response through DataScope's relay;
- Ollama uses a browser-to-localhost connection;
- API-mode AI can send context to a configured provider or shared edge;
- creating a share link deliberately uploads an artifact.

A credible trust signal must distinguish **network activity** from **user-data egress**. Avoid
packet-level language unless the product actually observes packet-level behavior.

## Product shape

Keep the indicator permanently visible in the existing Workbench status-bar position. Prefer
plain, specific copy over a generic shield or "secure" badge.

Suggested states:

| State | Ambient label | Detail / active copy |
| :--- | :--- | :--- |
| Local analysis, idle | **Data stays in this browser** | SQL, profiling, charts, and deterministic analysis run locally. |
| Inbound fetch or model download | **Data stays in this browser** | **Fetching from `host`…** or **Downloading local model…**; clarify that data is arriving, not being uploaded. |
| Browser-to-localhost | **Local connection** | **Sending AI context to local Ollama…**; never describe this as no network activity. |
| Cloud-capable AI, idle | **Cloud AI enabled** | Name the configured routing posture without implying that a request is currently active. |
| Cloud AI request | **Sending AI context…** | Name the destination and the payload class, such as schema, question, selected/sample rows, or error context. |
| Relay fallback | **Relay used** | State that the URL request and response passed through DataScope's relay. |
| Share creation | **Uploading share…** | Name whether the artifact is structure-only, sampled, or full-data. |

Use the existing green status register for verified local posture, amber for a permitted or
active boundary crossing, and the error register only for failed exchanges. Colour must never
carry the meaning alone.

## Inspectable exchange ledger

Clicking the status item should open a small, ephemeral **Recent exchanges** view. Each entry
should disclose:

- time and initiating feature;
- destination category and host (browser, localhost, user-configured provider, DataScope edge,
  relay, or share storage);
- direction (inbound, outbound, or both);
- payload class, stated conservatively;
- outcome (active, completed, failed, or blocked).

Do not record payload contents, credentials, prompts, SQL, column names, URLs containing secrets,
or row values. Keep the ledger in memory by default; it is a user-facing runtime explanation,
not telemetry.

## Implementation seam

The indicator must be driven by actual owned exchange paths, not inferred solely from settings.
Introduce a small typed exchange-event seam and instrument the existing boundaries: API ingestion,
relay fallback, WebLLM model download, cloud/BYOK AI, localhost Ollama, vault access, and sharing.
The status bar consumes the resulting active/recent state.

Be explicit about the limit of the guarantee: an application-level ledger can account for
DataScope-owned request paths, but it is not a replacement for the browser's network inspector
and must not claim to observe extensions, browser services, or uninstrumented dependencies.

## Guardrails

- Replace **"nothing leaves"** with **"Data stays in this browser"** only when runtime state
  supports that statement.
- Do not imply that selecting API mode means data has already been sent; distinguish capability,
  active transfer, and completed transfer.
- Do not call an inbound download "egress."
- Preserve the existing just-in-time relay disclosure in
  [`IngestionPanel.tsx`](../../src/features/ingestion/IngestionPanel.tsx); the ambient indicator
  supplements it rather than hiding it.
- Share and full-row escalation remain explicit, consent-gated actions.
- No new analytics or server-side exchange history.
- Avoid decorative packet animations. A brief state change is enough; respect reduced motion.

## Done when

1. Every DataScope-owned external boundary emits a typed, redacted exchange event.
2. The status bar correctly distinguishes local, inbound, localhost, cloud-enabled, outbound,
   relay, sharing, failed, and blocked states.
3. The recent-exchanges view identifies destination, direction, payload class, and outcome without
   retaining content.
4. Tests prove that local SQL and deterministic analysis emit no exchange and that each networked
   path produces the expected disclosure.
5. Narrow and mobile Workbench layouts keep the posture visible without displacing primary status
   information.
6. Copy is reviewed against the actual routing ladder and privacy model; no state overclaims
   "zero network" or "nothing leaves."

## Revive trigger

Schedule with the next Workbench trust/privacy polish pass, or sooner if user testing shows that
people do not understand the current local-first posture or mistake API mode selection for an
active upload.
