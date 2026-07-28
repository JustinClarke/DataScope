# DataScope: Complete Logical Component Guide

This guide explains every major logical component of DataScope, how it works, and how the pieces fit together. Think of it as a map of the entire system from the user's perspective down through the code.

---

## Part 1: The Big Picture

### What DataScope Does

When you drop a file or paste an API URL into DataScope, here's the journey:

1. **Ingest** — The file/API data becomes a table in DuckDB-Wasm
2. **Classify** — The app learns what each column *means* (text, number, date, category, etc.)
3. **Understand** — The app computes what you can *do* with this data (which charts work, which queries make sense)
4. **Show** — The UI displays findings, charts, and suggested explorations
5. **Query** — You can ask questions in natural language or write SQL
6. **Export** — You can download, share, or analyze the results

The key insight: **all analysis happens in your browser. Nothing leaves except what you explicitly share.**

---

## Part 2: The Core Logical Components

### 1. **Ingestion Layer** — Getting Data In

**What it does:** Accepts files (CSV, Parquet, JSON) or API URLs and loads them into the database.

**Components:**
- `IngestionPanel.tsx` — The UI that accepts drops and pastes
- `ingestion.ts` — The service that handles file → table conversion
- `DuckDB-Wasm` — Runs in a Web Worker; registers tables in its VFS

**The flow:**
```
User drops file.csv
  → Pre-scan size (warn if huge, sample if >500MB)
  → File → arrayBuffer → DuckDB registers it
  → CREATE TABLE foo AS SELECT * FROM read_csv_auto('file.csv')
  → Table now exists in the database
  → Table registry records: name, rows, cols, memory size
```

**Key decisions:**
- Files never cross the network—they stay in the browser
- DuckDB handles all parsing (CSV, Parquet, JSON)—no PapaParse or third-party libraries
- Large files warn the user before loading

---

### 2. **Table Registry** — The Single Source of Truth

**What it does:** Keeps one authoritative list of all tables currently loaded. Every other system reads from this, never maintains its own list.

**Components:**
- `stores/datasets.ts` — The Zustand store holding all table metadata
- `TableRegistryEntry` — The TypeScript type describing each table

**What it tracks per table:**
```ts
{
  name: "customers",
  rows: 50000,
  cols: 12,
  columns: [...],           // Full ClassifiedColumn[] info
  memory: 2.4,              // MB used
  source: "file",           // 'file', 'api', or 'derived'
  loadedAt: timestamp
}
```

**Why it matters:** If you add a new feature (e.g., "find duplicate rows"), you don't maintain a parallel table list. You read from the registry. This keeps the codebase coherent.

---

### 3. **Classification Engine** — Understanding Column Semantics

**What it does:** Looks at each column and figures out what it represents.

**Components:**
- `classifier.ts` — The core logic with rules for each type
- `ClassifiedColumn` — The TypeScript type describing a classified column
- `useSchemaClassifier.ts` — React hook wrapping the classifier

**Classification rules (simplified):**
```
If column name contains 'date' or values match ISO 8601 → Temporal
If column has >95% unique values among numeric types → Quantitative (continuous)
If column has <50 unique values and contains text → Categorical
If all rows are NULL → Unknown
If integer and only 0/1 → Binary
```

**Each ClassifiedColumn carries:**
```ts
{
  name: "age",
  semanticType: "Quantitative",    // The determined type
  dtype: "integer",                 // Raw database type
  cardinality: 87,                  // Unique values
  nullRate: 0.02,                   // % null
  sampleValues: [25, 34, 42, ...],  // First few real values
  // ... stats for quantitative: min, max, mean, std, median
  // ... stats for categorical: top values, concentration
}
```

**Why it matters:** Every other system uses these classifications to decide what's possible. Can't make a correlation chart if both columns aren't numeric. Can't do a cohort analysis if there's no temporal column.

---

### 4. **Capabilities Broker** — What Can You Do?

**What it does:** Reads the classified columns and decides which analysis methods are available.

**Components:**
- `capabilities.ts` — The main engine
- `DataCapabilities` — The output type listing what's available
- `rankNextActions()` — Sorts suggested explorations by relevance

**It asks:**
- Can I build a time-series chart? (Need at least 1 temporal + 1 quantitative)
- Can I build a correlation matrix? (Need 2+ quantitative columns)
- Can I do cohort analysis? (Need 1 temporal + 1 categorical + 1 quantitative)
- Can I suggest a pivot table? (Need 1+ categorical + 1+ quantitative)

**Output example:**
```ts
{
  canBuildChart: {
    timeSeries: { available: true, columns: ['date', 'revenue'] },
    correlation: { available: true, columns: [['age', 'income'], ...] },
    categorical: { available: true, columns: ['category'] },
  },
  rankedActions: [
    { rank: 1, action: "View revenue over time", query: "SELECT date, SUM(revenue)..." },
    { rank: 2, action: "Compare revenue by category", query: "SELECT category, AVG(revenue)..." },
    // ...
  ]
}
```

**Why it matters:** This is what populates the "Suggested Explorations" section and enables/disables buttons in the UI. It's the system's opinion about what's interesting about your data.

---

### 5. **QueryEngine** — Executing SQL

**What it does:** The abstraction layer that executes queries against the database.

**Components:**
- `duckdb.worker.ts` — The Web Worker that holds the DuckDB instance
- `useDuckDB.ts` — React hook managing the worker
- `QueryEngine` interface — The contract (execute, register, summarize)

**Methods:**
```ts
engine.execute(sql)          // Run a query, get results
engine.summarize(tableName)  // Get quick stats (COUNT, types, etc.)
engine.registerFile(name)    // Load a file into the DB
engine.exportTable(name)     // Get all rows as Arrow/Parquet
```

**Why it matters:**
1. Decouples the UI from DuckDB specifics—if we swap DuckDB for SQLite later, only this changes
2. Runs off-thread, so queries don't freeze the UI
3. Is the gating point for all query execution—cancellation happens here

**Key decision:** DuckDB runs in a Web Worker, not the main thread. Big queries don't freeze the UI.

---

### 6. **Profiling & Analysis** — Computing Insights

**What it does:** Runs SQL queries to compute statistics about each table and its columns.

**Components:**
- `columnStats.ts` — Computes per-column statistics
- `distributionSql.ts` — Generates SQL for distribution analysis
- `correlationSql.ts` — Generates SQL for correlation matrices
- `TableInsights` — The output type with all computed stats

**What it computes:**
- For numeric columns: min, max, mean, median, std, deciles, outliers
- For categorical columns: top values, cardinality, concentration
- For temporal columns: span (min/max date), coverage gaps
- Across columns: correlations, group-by breakdowns, variance-explained

**Why it matters:** These insights feed into the Dataset Dossier (see below) and the AI system. Real computed facts are more reliable than schema-only guessing.

---

### 7. **Dataset Dossier** — The Summary View

**What it does:** Renders a comprehensive overview of one table in your dataset.

**Components:**
- `DatasetDossier.tsx` — Main component (the full-page view)
- `ProfileDashboard.tsx` — The auto-profiling dashboard
- `useDatasetBaseline.ts` — Hook loading baseline insights

**What it shows (three levels of detail):**

**Level 1 (Rail):** Quick signpost—table name, row count, column list
**Level 2 (Info drawer):** Ambient scent—top insights, column types, quick stats
**Level 3 (Full Dossier tab):** Complete view—every stat, chart, distribution, outliers

**Each level is deeper, but never duplicates what's above.** This is the "detail ladder" design pattern.

---

### 8. **DSPS (DataScope Profile Specification)** — The Export Format

**What it does:** Serializes everything the app learned about your data into a portable JSON file.

**Components:**
- `dsps.ts` — The schema and validator
- `.dsps` files — The actual artifacts (any file ending in `.dsps`)

**What it contains:**
```json
{
  "dsps_version": "0.1",
  "dataset": {
    "name": "my_data",
    "rows": 50000,
    "tables": [
      {
        "name": "customers",
        "columns": [ /* ClassifiedColumn[] */ ],
        "facts": [ /* computed insights */ ],
        "stats": { /* aggregates */ }
      }
    ]
  },
  "metadata": {
    "createdAt": "2026-07-28",
    "hash": "abc123"
  }
}
```

**Why it matters:**
1. **Format-first design:** DSPS is the platform. The web app is just one client of it.
2. **Universal receiver:** Drop any `.dsps` file and the app opens it read-only, no upload, no login
3. **Sharing:** Generate a share link, someone else loads your `.dsps` without needing your data

---

### 9. **SQL System** — Query Writing & Execution

**What it does:** Provides a place to write SQL, suggests queries, executes them, and visualizes results.

**Components:**
- `SqlModule.tsx` — The main SQL interface (post-D73, lives in the console drawer)
- `sql.ts` — Service layer for query execution
- `stores/query.ts` — Stores query history and state
- `MonacoEditor` — Syntax highlighting and autocomplete

**Post-D73 changes:**
- Standalone SQL tab deleted
- SQL lives in the bottom-drawer **console**
- Query tabs are *artifact kind* first-class members (pin from console or select a suggestion)
- One shared guarded run path (prevents data loss from concurrent query tabs)

**The flow:**
```
User types SQL in console
  → Monaco lints it (catch syntax errors early)
  → Run button triggered
  → TransformGuardModal checks for transforms (data mutations)
  → Execute via QueryEngine
  → Results auto-chart if simple (time series, scatter, bar, etc.)
  → Pin to Query Tab to keep around
  → Export results as Parquet or copy-to-Jupyter
```

**Why it matters:** SQL is the "expert mode"—you're not constrained by UI patterns. You can ask arbitrary questions of your data.

---

### 10. **Charting System** — Visualizing Results

**What it does:** Takes query results and figures out the best chart type, then renders it.

**Components:**
- `ChartsModule.tsx` — Orchestration layer
- Specific chart components:
  - `TimeSeriesModule.tsx` — Line/area charts
  - `DistributionModule.tsx` — Histograms, box plots
  - `CategoricalModule.tsx` — Bar charts, pie charts
  - `CorrelationModule.tsx` — Scatter plots, heatmaps
- `chartMapper.ts` — SQL result → chart type logic
- `charts.ts` — Service layer

**Chart type selection logic:**
```
If one column is temporal and one is numeric:
  → Time series (line/area)
Else if two numeric columns:
  → Scatter plot (or heatmap if many points)
Else if one categorical and one numeric:
  → Bar chart (or small multiples)
Else if one numeric:
  → Histogram or box plot
Else if two categorical:
  → Stacked bar or heatmap
```

**Technology:**
- **Recharts** — Declarative, composable charts (the main choice)
- **D3.js** — Custom visuals and canvas rendering for 10k+ data points (performance optimization)

---

### 11. **AI System** — Natural Language Queries

**What it does:** Converts natural language questions into SQL, executes them, and shows results.

**Components:**
- `AIChatModule.tsx` — The chat UI
- `services/ai.ts` — The main AI orchestration
- `aiProvider.ts` — Provider abstraction (cloud, local, BYOK)
- `webllm.ts` — Local in-browser model via WebLLM
- Stages:
  - Stage 1: Input normalization (typo correction via Levenshtein distance)
  - Stage 2: Schema pruning (send only relevant columns to the model)
  - Stage 3: Generation (model writes SQL or a natural language plan)
  - Stage 4: Linting (parse the SQL, catch dialect errors)
  - Stage 5: Execution (run the query, retry if errors)
  - Stage 6: Charting (auto-select chart type for results)

**AI modes (§5 Privacy Model):**
1. **Local-Only:** No AI (AI off)
2. **Local Model:** WebLLM + WebGPU (in-browser, zero network egress)
3. **Cloud/BYOK:** Cloudflare Workers AI or your own API key

**The flow:**
```
User: "Show me the top categories by revenue"
  Stage 1 → Normalize: "category" matches table.category_name column
  Stage 2 → Prune schema: Send only relevant columns + types
  Stage 3 → Generate: Model writes SQL
    "SELECT category_name, SUM(revenue) 
     FROM sales GROUP BY category_name ORDER BY 2 DESC"
  Stage 4 → Lint: Check syntax (no backticks in DuckDB, etc.)
  Stage 5 → Execute: Run query
  Stage 6 → Chart: Result has 2 columns (category, number) → bar chart
  Display result with auto-generated chart
```

**Why it matters:** Lowers the barrier for non-SQL users to ask questions. Deterministic stages (1, 2, 4, 6) reduce hallucination. Tool-use loop with error recovery makes it resilient.

---

### 12. **ViewSpec & Rendering** — Safe Output Display

**What it does:** Defines how UI panels should be rendered, with strong safety guarantees.

**Components:**
- `ViewSpec` — The declarative specification (JSON schema)
- `ViewSpecRenderer.tsx` — Renders a ViewSpec into React components
- `producerValidators.ts` — Validates that model output is safe before rendering

**Key rule:** **The renderer never executes model output. It only renders pre-validated, structure-only specs.**

**Example ViewSpec:**
```ts
{
  type: "chart",
  config: {
    chartType: "bar",
    title: "Revenue by Category",
    xAxis: { column: "category" },
    yAxis: { column: "revenue", aggregate: "SUM" }
  }
}
```

**The safety flow:**
1. Model generates a ViewSpec JSON
2. `producerValidators` checks:
   - Chart type is in the allowed list
   - Columns exist in the table
   - No SQL injection or code
3. Only then does the renderer display it

**Why it matters:** Model output is untrusted. By separating spec generation from rendering, we ensure safety without sacrificing capability.

---

### 13. **Workbench Shell** — The Main UI Container

**What it does:** Orchestrates all the modules into one coherent experience.

**Components:**
- `WorkbenchShell.tsx` — The composition root (post-W8 cutover)
- `DatasetMap.tsx` — Left side: ERD and table browser
- `Inspector.tsx` — Right side: column details and SQL console (post-D73)
- `AIChatModule.tsx` — Right side: AI chat panel
- `CommandPalette.tsx` — Global search and navigation (⌘K)

**Layout (D71 Workbench):**
```
┌─────────────────────────────────────────────────────────────┐
│                          Title Bar                          │
├──────────────────┬──────────────────────────┬───────────────┤
│                  │                          │               │
│  Dataset Map     │      Main Canvas         │    AI Pane    │
│  (ERD, tables)   │  (Dossier/Charts/SQL)    │   (Chat)      │
│                  │                          │               │
├──────────────────┴──────────────────────────┴───────────────┤
│              Inspector Drawer (D73)                         │
│              Two views: Info | SQL Console                 │
└─────────────────────────────────────────────────────────────┘
```

**Key design rules (D71):**
1. **Tab envelope invariant:** The app controls which tabs exist, not the model
2. **Keep-mounted is the v0 norm:** Tabs stay in the DOM when you switch away
3. **Single selection store:** Table/column selection feeds all views
4. **Shared run path (D73):** All query execution (console + tabs) uses one guarded path

---

### 14. **Export & Persistence** — Getting Data Out

**What it does:** Lets you download your analysis or share it.

**Components:**
- `export.ts` — Service layer for all exports
- `ExportPanel.tsx` — UI for download/share options

**Export paths:**

**Client-side (always available):**
```
COPY <table> TO 'out.parquet' (FORMAT PARQUET)
→ Browser download
→ Copy-to-Jupyter snippet included
```

**Server-side (explicit opt-in):**
```
"Save to cloud" or "Create share link"
→ User confirms via privacy disclosure dialog
→ Sends to Cloudflare Worker
→ Stored in R2 (with TTL, delete controls)
→ Unguessable-token URL for sharing
```

**Why separate?** Client-side exports don't touch the network. Server-side is opt-in and privacy-transparent.

---

## Part 3: The Data Flow — How It All Works Together

### Flow 1: **Drop a File → See Results**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User drops file.csv                                      │
│    → IngestionPanel.tsx receives drop event                │
│    → ingestion.ts checks size                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Load into DuckDB                                         │
│    → QueryEngine.registerFile()                            │
│    → CREATE TABLE foo AS SELECT * FROM read_csv_auto(...)  │
│    → Table appears in the registry                         │
│    → datasets.ts (Zustand store) updates                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Classify columns                                         │
│    → classifier.ts examines each column                    │
│    → Assigns semantic types (Quantitative, Categorical, ...) │
│    → ClassifiedColumn[] stored in registry                 │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Compute insights                                         │
│    → columnStats.ts: min, max, mean, std, outliers, etc.   │
│    → correlationSql.ts: pairwise correlations              │
│    → distributionSql.ts: deciles, concentration            │
│    → Results stored in TableInsights                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Evaluate capabilities                                    │
│    → capabilities.ts reads ClassifiedColumn[]              │
│    → Asks: can I make a time series? correlation? pivot?   │
│    → RankedAction[] sorted by relevance                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Render UI                                                │
│    → DatasetDossier shows insights                         │
│    → ProfileDashboard shows charts                         │
│    → Suggested Explorations appear on map                 │
│    → AI system is now ready for questions                 │
└─────────────────────────────────────────────────────────────┘
```

### Flow 2: **Ask an AI Question**

```
┌─────────────────────────────────────────────────────────────┐
│ User: "Show me top categories by revenue"                   │
│ → AIChatModule captures the message                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Input Normalization                                │
│ → Fuzzy-match "categories" against column "category_name"   │
│ → Correct typos via Levenshtein distance                   │
│ → Emit corrected question                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 2: Schema Pruning                                     │
│ → Read table registry                                       │
│ → Extract only relevant columns + types + semantic roles    │
│ → Build pruned prompt: "Tables: sales (category_name TEXT,  │
│   revenue DECIMAL). Question: ..."                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: Generation                                         │
│ → Call AI provider (cloud, local, or BYOK)                 │
│ → Model has tools: [execute_local_sql]                     │
│ → Model writes: "SELECT category_name, SUM(revenue) FROM   │
│   sales GROUP BY category_name ORDER BY 2 DESC"            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 4: Dialect Linting                                    │
│ → Parse the SQL with pgsql-ast-parser                      │
│ → Check for DuckDB compatibility                           │
│ → Catch backticks, CONCAT vs ||, TOP vs LIMIT, etc.        │
│ → If error: capture and feed back to model for retry        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 5: Execution                                          │
│ → QueryEngine.execute() (via Worker)                       │
│ → Query runs against DuckDB                                │
│ → If error: sample schema + error trace + retry (max 3x)   │
│ → Return results                                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 6: Auto-Charting                                      │
│ → chartMapper.ts reads result columns                       │
│ → Decides: 2 columns (text, number) = bar chart             │
│ → Render chart via Recharts or D3                          │
└─────────────────────────────────────────────────────────────┘
```

### Flow 3: **Export Results**

```
┌─────────────────────────────────────────────────────────────┐
│ User: "Download as Parquet"                                 │
│ → export.ts calls QueryEngine.exportTable()                │
│ → DuckDB: COPY table TO 'out.parquet'                       │
│ → Browser downloads file directly                          │
└─────────────────────────────────────────────────────────────┘

OR

┌─────────────────────────────────────────────────────────────┐
│ User: "Create share link"                                   │
│ → Privacy disclosure dialog shown                          │
│ → User confirms                                            │
│ → DSPS generated (schema + insights + metadata)            │
│ → Sent to Cloudflare Worker                                │
│ → Stored in R2 with TTL                                    │
│ → Returns unguessable token URL                            │
│ → Link shared; anyone can drop the .dsps in viewer mode    │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 4: The Integration Principle — "No Parallel Pipelines"

This is the rule that keeps the system coherent:

**Every new feature must produce or consume an existing artifact through an existing interface, not introduce a parallel pipeline.**

**Examples:**

❌ **Bad:** "Let's add a new 'AutoInsight' feature that computes its own table list, classification, and charting."
→ Now you have two classification systems, two table lists, two workflows. Maintenance nightmare.

✅ **Good:** "Let's add an 'AutoInsight' feature that (1) reads the table registry, (2) consumes ClassifiedColumn[], (3) produces RankedAction[], which the broker then ranks and displays."
→ One pipeline, many outputs.

**The three stable interfaces:**
1. **QueryEngine** — Execution interface (execute, register, summarize)
2. **ViewSpec** — Presentation contract (safe declarative layouts)
3. **DSPS** — The exported structural artifact (portable, shareable)

Everything else reads through these.

---

## Part 5: Why This Architecture Matters

### **Browser-Native & Zero-Egress by Default**
All compute happens in the tab. No data leaves unless you explicitly share it. Privacy is the default, not an add-on.

### **Decoupled Interfaces**
QueryEngine abstracts DuckDB → could swap for SQLite or a native sidecar.
ViewSpec abstracts chart rendering → could swap renderers without breaking AI.
DSPS abstracts the export format → could use it in a CLI, a desktop app, or a server.

### **Single Sources of Truth**
- Table registry: One list of all tables
- Classification: One system for semantic types
- Capabilities: One broker deciding what's possible
- AI pipeline: One path from question to result (with stages)

This makes the codebase maintainable at scale.

### **Determinism & Auditability**
Every query is logged. Every classification rule is explicit. Every suggestion comes from a ranked action list. You can understand why the app did something.

### **Safety Without Sacrifice**
Model output is validated against schema before rendering. UI is declarative (ViewSpec), not imperative. Data mutations are guarded by a transform modal.

---

## Part 6: Reading the Code

**If you want to understand how a feature works, follow this path:**

1. **Start with the data flow docs** — `_implementation/architecture/data-flow.md`
2. **Read the decision record** — `_implementation/architecture/decisions.md` (find the relevant D-number)
3. **Read the master spec** — `_implementation/DATASCOPE.md` (find the relevant §)
4. **Use graphify** — `graphify explain "<concept>"` or `graphify query "<question>"`
5. **Read the TypeScript types** — `src/types/` (types are the contract, code is the implementation)
6. **Read the services** — `src/services/` (stable APIs)
7. **Read the components** — `src/features/` (UI implementations)

**Red flags (skip unless you're debugging):**
- Reading raw SQL queries? You're going too deep.
- Tracing through React component props? Wrong level of abstraction.
- Looking at Zustand actions? Check the service layer above it first.

**Green flags (read these):**
- Type definitions → these are the contracts
- Service interfaces → these are the public APIs
- Architecture docs → these explain the "why"
- Data-flow diagrams → these show how pieces talk

---

## Summary

DataScope is a **browser-native data analysis tool** built on three stable interfaces (QueryEngine, ViewSpec, DSPS) that feed data through **one coherent pipeline**: ingest → classify → evaluate → visualize → query → export.

Every component reads from the registry, no module maintains parallel state, and all AI output is validated before rendering. This makes it safe, auditable, and maintainable.

The key insight: **structure is computed once, used everywhere.** This is why classification runs once and feeds the capabilities broker, the profiler, the AI system, and the export engine.


What I would improve
1. Explicitly separate "facts" from "opinions"
Right now there are three different kinds of outputs:
computed statistics
capabilities
ranked suggestions
Those are very different.
For example:

mean(revenue)=245.3

is a fact.
correlation available

is a capability.
Explore revenue by region

is a recommendation.
I'd call these out explicitly.

Maybe something like:

Data
↓

Facts
(what is true)

↓

Capabilities
(what is possible)

↓

Recommendations
(what is worth doing)

That's an elegant conceptual distinction.
2. Clarify "Profiler" vs "Classifier"
A new reader could easily wonder:
Doesn't the profiler already classify?
Right now:
Classifier computes semantic meaning.

Profiler computes statistics.

I'd probably say this somewhere very explicitly.

For example:

Classification determines what a column is.
Profiling determines how that column behaves.
That's a memorable distinction.
3. DSPS could be elevated
Right now DSPS appears as one component among many.
Reading the document, though, it actually feels more fundamental.

Everything eventually produces information that DSPS can serialize.

I'd almost present the architecture like this:

                DSPS
                  ▲
                  │
         all computed knowledge
                  ▲
                  │
Ingest → Registry → Classification
                  │
                  ▼
      Profiling / Capabilities
                  │
                  ▼
        UI / AI / Export

That emphasizes DSPS as the persistent representation of the application's understanding, not just an export format.
4. Mention lifecycle/state transitions
The document explains components well but not object lifecycles.
For example, what states can a dataset occupy?

Dropped

↓

Loading

↓

Registered

↓

Classified

↓

Profiled

↓

Ready

↓

Archived

↓

Removed

Having a lifecycle diagram makes debugging much easier.
5. Explain why capabilities exist separately
This is a subtle but important architectural decision.
Someone unfamiliar might ask:

Why not just have the chart picker inspect the schema directly?
Your answer is:
Because every consumer would duplicate logic.

I'd make that explicit.

Capabilities are effectively a compiler pass over the schema.

6. Add architecture principles near the front
Instead of waiting until Part 5, I'd introduce the core design principles early:
Browser-first.
Single source of truth.
Compute once, reuse everywhere.
No parallel pipelines.
Stable interfaces over concrete implementations.
Privacy by default.
Then each section reinforces them.
One thing I'd add: an "Architecture in One Picture"
If someone asked me to summarize the entire document in a single diagram, I'd sketch something like this:
             User
              │
              ▼
      Ingestion Layer
              │
              ▼
        QueryEngine
              │
              ▼
        DuckDB-Wasm
              │
              ▼
      Table Registry
              │
      ┌───────┼────────┐
      ▼       ▼        ▼
Classifier  Profiler  Query
      │       │        │
      └───────┼────────┘
              ▼
     Capabilities Broker
              │
      ┌───────┼─────────────┐
      ▼       ▼             ▼
Dataset   SQL Console   AI Pipeline
Dossier                   │
                           ▼
                     ViewSpec
                           ▼
                        Renderer
                           │
                           ▼
                         Export
                           │
                           ▼
                          DSPS

That one page would let a new engineer orient themselves in minutes.
Overall assessment
I'd rate this around 9.5/10 as an internal architecture guide.
It succeeds because it's organized around responsibilities and data flow rather than source files or framework details. It consistently explains why components exist, not just what they do.

The main opportunity isn't adding more technical detail; it's making the conceptual model even sharper by distinguishing facts, capabilities, and recommendations, clarifying the roles of classification versus profiling, and elevating DSPS as the canonical representation of the application's accumulated knowledge. Those refinements would make the document read less like a collection of components and more like a cohesive architectural philosophy.


