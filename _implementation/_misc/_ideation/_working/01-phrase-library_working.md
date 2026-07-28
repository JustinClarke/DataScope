# 01 — Capability-Keyed Phrase Library — How It Works

## The Core Idea in One Sentence

Instead of letting the AI write whatever it wants about a dataset, **humans pre-write all the possible descriptions**, and the AI just **picks which ones to show**.

---

## Why This Should Work

The fabrications (F2: "Manchester", F3: "sank in April 1912") are things **the AI made up from scratch**. If the AI can only choose from a menu of pre-written, pre-vetted phrases, it literally cannot invent new content — the same way a multiple-choice test prevents you from writing fiction.

---

## How Data Flows Through the System

```mermaid
flowchart TD
    A["📊 User uploads dataset"] --> B["🔍 Stage 1: Capability Detection<br/><i>Deterministic — no AI involved</i>"]
    B --> C{"What patterns exist<br/>in the data structure?"}

    C -->|"Has dates + numbers +<br/>categories"| D1["🏷️ 'seasonality'"]
    C -->|"Has dates + repeated<br/>entity keys"| D2["🏷️ 'cohort-retention'"]
    C -->|"Two tables joined,<br/>one has money + dates"| D3["🏷️ 'lifetime-value'"]
    C -->|"Category with exactly<br/>2 values + numbers"| D4["🏷️ 'group-comparison'"]
    C -->|"Multiple number<br/>columns"| D5["🏷️ 'correlation-study'"]

    D1 & D2 & D3 & D4 & D5 --> E["📚 Stage 2: Phrase Lookup<br/><i>Deterministic — no AI involved</i>"]

    E --> F["Each capability key has 3<br/>pre-written phrases to choose from"]

    F --> G["🤖 Stage 3: Model Selection<br/><i>The ONLY AI step</i>"]

    G -->|"AI returns indices only"| H["JSON: {suitedFor: [2, 0]}"]

    H --> I{"Are all indices<br/>valid integers?"}
    I -->|"Yes"| J["✅ Assemble final paragraph<br/>from counts + dates + selected phrases"]
    I -->|"No"| K["🔄 Fall back to<br/>deterministic template (D65)"]

    style A fill:#e3f2fd
    style B fill:#fff9c4
    style E fill:#fff9c4
    style G fill:#e8f5e9
    style J fill:#c8e6c9
    style K fill:#ffccbc
```

### Stage 1: Capability Detection (No AI)

The app looks at the **structure** of the data (column names, types, cardinalities, date ranges) and figures out what kinds of analysis the dataset is good for. For example:

- Does it have dates + numbers + categories? → Good for **seasonality analysis**
- Does it have two tables joined on a key with money columns? → Good for **lifetime value calculation**
- Does it have a 2-value category + number columns? → Good for **group comparison**

### Stage 2: Phrase Lookup (No AI)

Each detected capability maps to **3 pre-written phrases**. These were written by humans and reviewed once. Example for "lifetime-value":

- "estimating how much each customer is worth over time"
- "calculating customer lifetime value across purchase history"
- "measuring long-term revenue per customer"

### Stage 3: Model Selection (The Only AI Step)

The AI receives the detected capabilities and the candidate phrases, and returns **just index numbers** — not prose:

```json
{"suitedFor": [2, 0]}
```

This means "use phrase #2 for the first capability and phrase #0 for the second." If the AI returns anything other than valid in-range integers, it's rejected and the system falls back to the plain deterministic template.

### Final Assembly (No AI)

The app builds the paragraph from:
- Deterministic parts: table counts, row counts, date ranges
- Selected phrases (chosen by AI but written by humans)

---

## What Happened When They Tested It

**50 test runs** were performed (5 datasets × 5 repeats × 2 modes).

### The Two Modes Tested

```mermaid
flowchart LR
    subgraph Selective["Selective Mode"]
        S1["AI picks WHICH phrases<br/>to show from the menu"] --> S2["Serve rate: 16% 🔴"]
    end

    subgraph Extractive["Extractive-Floor Mode"]
        E1["AI only ORDERS<br/>pre-computed fact sentences"] --> E2["Serve rate: 84% ✅"]
    end

    style S2 fill:#f8d7da
    style E2 fill:#d4edda
```

### The Big Problem: AI Couldn't Follow Instructions

The selective mode only worked **16% of the time** (4 out of 25 runs). In 21 of 25 failures, the AI made the same mistake: it picked **more than one phrase from the same capability group** when told to pick at most one. The validator correctly caught every violation, but that meant falling back to the plain template 84% of the time.

The extractive-floor mode worked **84% of the time** — because it asked strictly less of the AI (just reorder items, don't select from groups).

### Detection Results — What Capabilities Were Found

| Dataset | What Was Detected | Notes |
|---|---|---|
| titanic | group-comparison, correlation-study | ✅ Correctly excluded seasonality (no date column) |
| weather | seasonality, correlation-study | The exact F2 case |
| stock_prices | correlation-study only | No categorical columns exist |
| product_reviews | seasonality (debatable) | ProductId is misclassified as Quantitative |
| ecommerce | seasonality, cohort-retention, lifetime-value, correlation-study | ✅ Found the target capabilities |

### Scoreboard

| Dimension | Result |
|---|---|
| R1 Grounding | ✅ **PASS** — Zero fabrications, structurally guaranteed |
| R2 Determinism | ⚠️ Safety is deterministic; which phrases are chosen is not |
| R3 Reach | ⚠️ Different from D65, not strictly better |
| R4 Cost | ✅ Cheaper than current (tiny JSON output) |
| R5 Authoring burden | ⚠️ 15 hand-authored strings; doesn't cover novel data shapes |
| R6 Portability | ❓ Not tested on Cloudflare this session |
| R7 Coverage | ✅ 5/5 samples fire, but rules were tuned to these exact datasets |

### The Verdict

**Grounding is solved** — the approach structurally cannot fabricate. But the AI can't reliably follow the "pick one per group" instruction (16% serve rate). The recommended fix: change the JSON format from a flat array to **one optional index per capability key**, making the violation structurally impossible rather than relying on the AI to follow a rule. Until that's tried, this approach is **inconclusive against D65**.

### What It Doesn't Fix

**F1 (misattribution) is untouched.** This approach only controls the "suited-for" phrases — the headline statistic still comes from the existing (unchecked) pipeline. If this approach wins, it needs Approach 03's citation check on the headline too.
