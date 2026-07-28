# 06 — Constrained Decoding into Typed Slots — How It Works

## The Core Idea in One Sentence

Instead of letting the AI write text and then checking it, make it **impossible for the AI to generate invalid output** in the first place — by constraining the AI's "keyboard" to only produce valid selections from a pre-defined schema.

---

## Why This Is Architecturally Different

Every other approach in this folder follows the pattern: **generate → check → maybe reject.** This one moves enforcement to **the moment of generation**:

```mermaid
flowchart LR
    subgraph Others["Approaches 01–05"]
        A1["AI generates<br/>free text"] --> A2["Check output<br/>after the fact"] --> A3["Accept or<br/>reject"]
    end

    subgraph This["Approach 06"]
        B1["AI generates into<br/>a constrained schema"] --> B2["Invalid tokens can<br/>NEVER be sampled"] --> B3["Nothing to<br/>reject"]
    end

    style A3 fill:#fff3cd
    style B3 fill:#d4edda
```

"Manchester" isn't rejected — it **can never be generated**, because the `domain` field is an enum of five strings and none of them is a city name.

---

## How Data Flows Through the System

```mermaid
flowchart TD
    A["📊 Dataset structural facts<br/>+ computed fact table"] --> B["📋 Stage 1: Build the<br/>Typed JSON Schema"]

    B --> C["Schema defines EXACTLY<br/>what the AI can output"]

    C --> D["domain: one of<br/>'ecommerce' | 'timeseries' | 'survey' |<br/>'transactional' | 'observational' | 'unknown'"]
    C --> E["spanFrom / spanTo:<br/>must reference a real<br/>temporal fact ID, or null"]
    C --> F["suitedFor: array of<br/>'clv' | 'churn' | 'seasonality' |<br/>'cohort-retention' | ..."]
    C --> G["headlineFact:<br/>must reference a real<br/>fact ID from the table"]

    D & E & F & G --> H["🤖 Stage 2: Constrained Generation<br/><i>AI's sampler is restricted to<br/>tokens valid for the schema</i>"]

    H --> I["AI output (structured, no prose):<br/>{<br/>  domain: 'transactional',<br/>  spanFrom: 'fact:orders.date.min',<br/>  suitedFor: ['clv', 'cohort-retention'],<br/>  headlineFact: 'fact:orders.count'<br/>}"]

    I --> J{"Are all fact IDs<br/>real and existent?"}
    J -->|"Yes"| K["📝 Stage 3: App Renders<br/>Paragraph from Slots<br/><i>Deterministic — no AI</i>"]
    J -->|"No"| L["🔄 Reject the fill"]

    K --> M["Final output: 'This transactional dataset<br/>spans 2021 to 2024 with 45,092 orders.<br/>It supports customer lifetime value<br/>and cohort retention analysis.'"]

    style H fill:#e8f5e9
    style M fill:#c8e6c9
```

### Stage 1: Build the Schema

Every content-bearing field is a **closed enum** or a **reference to a real fact ID**. No free-text fields exist. The key design decision: `unknown` must be a first-class option — a schema with no escape hatch forces a guess, which is how fabrication gets reinvented under a different name.

### Stage 2: Constrained Generation

The AI model's sampler is restricted so that at each token position, only tokens that keep the output valid against the JSON schema can be selected. "Manchester" is simply not a valid token in the `domain` field's position.

### Stage 3: Deterministic Rendering

The app renders the final paragraph from the filled slots. The AI contributes **structured judgment** (which domain, which analyses, which fact leads) and **zero prose**.

---

## The Critical Prerequisite: Platform Support Check

**This approach is gated on a capability that may not exist.** Before building anything:

```mermaid
flowchart TD
    Q1{"Does Ollama support<br/>schema-constrained decoding?"}
    Q1 -->|"Verify with a curl test"| Q2{"Does Cloudflare Workers AI<br/>support it for the pinned model?"}
    Q2 -->|"Yes on both"| GO["✅ Build the approach<br/>(constrained mode)"]
    Q2 -->|"Ollama yes,<br/>Cloudflare no"| FALLBACK["⚠️ Fallback: Validate JSON<br/>strictly after generation<br/>(loses 'unrepresentable' guarantee)"]
    Q2 -->|"No on either"| STOP["🛑 STOP — Record finding,<br/>approach fails R6 (portability)"]

    style GO fill:#d4edda
    style FALLBACK fill:#fff3cd
    style STOP fill:#f8d7da
```

- **Ollama**: supports structured outputs via a JSON-schema `format` parameter — but needs verification that it actually works on the installed version
- **Cloudflare Workers AI**: varies by model. If it doesn't support constrained decoding, the approach degrades into a strict-schema variant of Approach 01 (still safe, just no longer "impossible to generate wrong output")

---

## Kill Criteria

| Criterion | What It Tests |
|---|---|
| **(a)** Works on BOTH Ollama and Workers AI | If Cloudflare unsupported with no fallback → approach fails |
| **(b)** Zero fabrications | Expected by construction — if one appears, a free-text field leaked in |
| **(c)** `domain` is right or honestly `unknown` | Titanic classified as "ecommerce" is a hard fail; "observational" or "unknown" is fine |
| **(d)** `suitedFor` values match the data | "seasonality" on a dataset with no date column = fail |
| **(e)** N=5 stability | Structured output should be much more stable than prose — if it isn't, that's an important negative result |

---

## What It Doesn't Solve

- **Coverage**: a closed enum can only describe dataset shapes someone anticipated (same limitation as Approach 01)
- **F1 specifically**: `headlineFact` picks which fact leads, but the renderer template phrases it — misattribution becomes a **renderer bug** (code you own) rather than a model failure (a genuine improvement)
- **Reads as templated** as Approach 01 — combine with Approach 04 for fluency

## Status

**Untested, gated on a platform check.** If constrained decoding is supported, this provides the tightest guarantee in the folder. If not, it collapses into a strict-validation variant of Approach 01.
