# System Design

**Master spec:** §6 (architecture + stack), §16 (planned file structure).

## Component diagram (§6)

```
┌─────────────────────────────────────────────────────────────────────┐
│                          React Application                          │
│                                                                     │
│  ┌───────────┐   ┌──────────────┐   ┌───────────────────────────┐   │
│  │ File Drop │──▶│ DuckDB-Wasm  │──▶│ Schema Classifier         │   │
│  │ / API URL │   │ (Web Worker) │   │ & Capabilities Broker     │   │
│  └───────────┘   └──────┬───────┘   └────────────┬──────────────┘   │
│                         │                        │                  │
│            ┌────────────┼────────────────────────┼───────────┐      │
│            ▼            ▼                        ▼           ▼      │
│  ┌──────────────┐ ┌─────────────┐  ┌──────────────┐ ┌────────────┐  │
│  │ SQL Playgrnd │ │ AI Chat     │  │ Chart Modules│ │ Export /   │  │
│  │ (Monaco)     │ │ (NL→SQL     │  │ (Recharts /  │ │ Save/Share │  │
│  │              │ │  pipeline)  │  │  D3 / Canvas)│ │            │  │
│  └──────────────┘ └──────┬──────┘  └──────────────┘ └─────┬──────┘  │
└──────────────────────────┼────────────────────────────────┼─────────┘
                           │ (cloud mode only)              │ (explicit
                           ▼                                ▼  action)
              ┌────────────────────────┐        ┌────────────────────┐
              │ Cloudflare Worker edge │        │ R2 persistence     │
              │ · AI routing (Workers  │        │ · Saved datasets   │
              │   AI / BYOK pass-thru  │        │ · Share links      │
              │   or opt-in vault)     │        │   (opt-in, TTL)    │
              │ · Tier-2 CORS relay    │        └────────────────────┘
              │ · DSPS MCP endpoint    │
              │   (read-only, v0.5)    │
              └────────────────────────┘
```

The three server-touching paths above are the *entire* server surface (§1, §4). Everything
else — query execution, schema processing, profiling, charting, transforms, export — runs in
the browser tab. **DSPS** (the open, versioned DataScope Profile Spec; D31/D37) is the
first-class machine-readable interface the Save/Share/export box emits and the D38 read-only
MCP endpoint serves (stage A, over explicitly shared artifacts only). **Format-first (D64):
DSPS is the platform and the web app is its flagship client** — a published JSON Schema + a
small npm validator/parser library let third-party tools consume DSPS without our source, the
DSPS document (not the app's internal types) is the contract, and the **D62 universal `.dsps`
receiver** is the named reference consumer (any `.dsps` renders read-only, no data/login/install
— zero new server surface). Stage-B MCP tools and any server-side execution run only over
explicitly staged datasets — the **D39 hosted tier, chartered as the second platform rung on the
D61 ladder** (browser → hosted tier → desktop → rest on request) — and stay behind that
decision's design round; the tier is opt-in, never the default, bound by the D61
privacy-and-deletion promise (§5.2). The "no server-side query execution" surface is unchanged
until then.

## Three stable interfaces and the coherence principle (D58)

The system converges on a small set of orthogonal interfaces rather than on features —
usually what keeps a codebase legible past year three:

| Interface | Concern | Decision |
| :--- | :--- | :--- |
| **`QueryEngine`** | Execution (`execute` / `register` / `summarize`) | D49 |
| **`ViewSpec`** | Presentation (validated declarative layout; renderer never runs model output) | D55 |
| **DSPS** | The exported structural artifact | D31/D37 |

Beneath them the **table registry** is the `QueryEngine`-managed catalog every downstream
reads — profiling, classification, capabilities, export, AI, drift. It is already a
first-class component (the `stores/datasets.ts` session catalog with a `TableRegistryEntry`
record and the `loadDataset/removeDataset/profileDataset` contract; spec:
[`../build/02-ingestion/03-table-registry.md`](../build/02-ingestion/03-table-registry.md),
§7.5/D13) — D58 only elevates it here from a parenthetical to a named interface, since its
build-doc invariant "no module keeps its own table list" is the single-catalog case of the
principle below. The structural facts the classifier produces (§8) *are*
what DSPS serializes, so the NL→SQL schema-pruner (§11.1 stage 2) consumes a pruned *fragment*
of DSPS, not a parallel structure representation — it takes the facts only, never the
`dsps_version`/provenance machinery on that per-turn path (D45).

**The no-parallel-pipelines principle.** *Every new capability must produce or consume an
existing artifact (a registered `Table`, `DSPS`, or `ViewSpec`) through an existing interface
(`QueryEngine`, the registry, the broker) rather than introduce a parallel end-to-end path.*
It is the design-coherence analog of D42's falsifiable test — a proposal that needs a bypass
or a second pipeline is a smell to scrutinize, not a feature to wave through — and it
generalizes the [`data-flow.md`](data-flow.md) single-canonical-path invariant. It already
explains the system: APIs and derived SQL become tables, AI consumes a pruned DSPS fragment
rather than raw schema, the desktop client swaps only the `QueryEngine` implementation (D51),
Studio consumes the registry + classification + DSPS, and MCP serves DSPS, not the runtime
(D38). (Not adopted: a quality-gated broker reading profile stats — the v0 broker is
type-count-only, reading `ClassifiedColumn` and never raw profile; the linear classify→broker
flow is accurate, not a DAG. Deferred post-~40k-LOC: `lib/` → `core/`+`contracts/`, and moving
the deterministic domain hooks behind plain services.)

**The composition-layer contracts (D68).** The *view* layer composes through four typed,
rows-free slices projected from the substrate above — `FactRef` (a D45 fact, the universal
claim-carrier on every stated number), `RankedAction` (§9 Action Broker output), `DatasetVerdict`
(the tier-1 Dossier payload), and `ThreadConfig` (a module prefill). Each obeys the rule above —
a minimal projection of `Table` / DSPS facts / `ViewSpec`, never a new pipeline — so the
composition ladder (drop → Verdict → Thread → Takeaway) and its optional D56 AI producer swap in
at a seam by emitting the *identical* slice, touching one producer, never the UI or the contracts.

**The Workbench tab-spec seam (2026-07-24, D71 — master §13.3; the D55 generalization).** In
the flag-on shell every canvas surface is a tab described by a spec, and **serializability is
orthogonal to safety — the envelope invariant**: the tab *envelope* — type (from a fixed,
closed tab-type registry), identity, active-tab selection, initializer — is **authored only by
the app, never by a model**; model output enters solely as validated inner artifact specs
(ChartSpec via the §11.1 stage-6 translator, ViewSpec via the D55 renderer) through
`producerValidators` **before** any tab opens, and `stores/tabs.openTab` treats model-origin
payloads as untrusted input. Four structural rules ride with it: **(1) nav facade** —
`services/navigation.ts` (`openDestination`) is the single migration seam; flag-off drives the
ui store, flag-on the tabs store, and `WORKBENCH_ENABLED` lives at the composition root + this
facade **only**. **(2) Keep-mounted is the v0 tab norm** — restore-from-spec is a per-type
opt-in, full tab-list serialization deferred to the D61 hosted-tier round. **(3) Skeleton
purity is scoped honestly** — which panes exist given session state is a pure function
(asserted by the W1/W7 assembly tests); async producers, engine state, Monaco tabs, and
`.dsps`/`?share=` loads layer on as imperative updates over that skeleton, testable at their
own seams. **(4) Shell-wide selection** (table/column/map edge) is one store —
`stores/selection.ts` — feeding the options strip and inspector
([`../build/12-workbench/`](../build/12-workbench/)).

**D73 amendment (2026-07-26 — the workspace streamline, master §13.3/§19 v0.70,
[`../build/14-workspace-streamline/`](../build/14-workspace-streamline/README.md)).** Three of
these structural rules gain a consumer or a constraint; none is overturned. **(4)**'s selection
store now feeds the **drawer** (Info + SQL console) rather than a scent-only inspector, and the
options strip it also fed is retired — whatever renders the subject-scoped ranked list on the map
inherits the same one-ranker contract (D58). **(2)** keep-mounted extends to **query tabs**, the
artifact kind's first live member (pin-from-console or a chosen suggestion; per-instance, never
deduped). **(1)** the nav facade loses its `'sql'` destination — `TabType`, `TAB_TYPE_BY_MODULE`
and the palette entry go or re-point, since the console replaces the standalone page. The
envelope invariant is untouched: query tabs are app-authored envelopes carrying user-typed SQL.
**One new structural rule rides with it — the shared guarded run path.** Every runner (the
console and each query tab) executes through one path, and `TransformGuardModal` intercepts
there rather than mounting per surface; N independent runners each guarding themselves is a
data-loss path the single SQL page never had. Monaco's lazy boundary moves onto the console's
first open, since the drawer mounts in every session.

## Core technology stack (§6)

| Layer | Technology |
| :--- | :--- |
| Framework | React 18+ with TypeScript |
| Database engine | DuckDB-Wasm (OLAP SQL in a Web Worker) |
| Code editor | Monaco Editor |
| Charting | Recharts (declarative) + D3.js (custom visuals; canvas mode for 10k+ points) |
| AI inference | Workers AI (cloud default) / BYOK provider / local model (mode-dependent, §11.2) |
| SQL dialect lint | Postgres-dialect JS parser (`node-sql-parser` or `pgsql-ast-parser`) — scoped lint, **never hand-rolled** (A.3) |
| Edge services | Cloudflare Worker (AI routing, CORS relay, vault, read-only DSPS-serving MCP endpoint — D38 stage A, v0.5) + R2 (opt-in persistence, incl. opt-in dataset staging — D39) |
| Styling | Tailwind CSS + CSS custom properties |
| File parsing | DuckDB native readers (CSV, Parquet, JSON) — no PapaParse etc. |
| Threading | Web Workers (DuckDB off the main thread) |
| ML engine (deferred) | ml.js (classical) + Transformers.js (NLP) — §20.1 |

**Note:** DuckDB-Wasm's standard setup already instantiates the database inside a Web Worker
(the library's documented default). There is no custom "execution routing" layer to design —
the blueprint phase claiming otherwise was debunked (A.2).

Library choices are a July-2026 snapshot (A.0) — re-verify against current npm state before
building, and record the outcome as ADRs per [`decisions.md`](decisions.md).

## Planned file structure (§16 — frozen up front, D18 item 3)

Feature-based layout (avoids refactoring imports at 20,000 lines):

```
src/
├── app/                        # Shell, routing, providers — incl. WorkbenchShell.tsx (D71 second composition root; App.tsx branches on WORKBENCH_ENABLED)
├── features/
│   ├── ingestion/              # Drop zone, sample picker, API URL ingest, telemetry
│   ├── profiling/              # Auto-profile dashboard, column cards, schema table
│   ├── sql/                    # Monaco wrapper, suggestions, results grid, auto-chart — (D73) the drawer console + query tabs; the standalone SQL tab is deleted, and the shared guarded run path both call lives here
│   ├── inspector/              # (Workbench, D71) bottom region — (D73) the two-view drawer: Info + console, resize/expand, viewer-mode absence
│   ├── charts/                 # Time series, correlation, distribution, categorical
│   ├── explorer/               # (Workbench, D71) left explorer — grown from TableList; per-table actions, Add data, share-links entry
│   ├── map/                    # (Workbench, D71) dataset map — ERD + Blueprint face; ABSORBS JoinGraphModule (from charts/) and DossierModule (from profiling/) — a move, not an addition (§13.3)
│   ├── ai/                     # Chat UI, NL→SQL pipeline, mode/BYOK settings — Workbench: mode switches + Configure-workspace (§5.1)
│   ├── export/                 # Parquet download, R2 save/share, DSPS renderers (HTML/JSON/Copy-for-AI, D31/D37)
│   ├── studio/                 # (Studio arc) quality report, relationship inference, schema graph, dbt/semantic export
│   └── ml/                     # (post-v1) K-Means, regression, tree, NLP modules
├── components/                 # Shared presentational components
├── hooks/
│   ├── useDuckDB.ts            # DuckDB-Wasm init + query runner (genuine lifecycle/state)
│   ├── useSchemaClassifier.ts  # thin React adapter over lib/classifier.ts — pure logic stays in lib/ (D58)
│   └── useCapabilities.ts      # thin React adapter over lib/capabilities.ts
├── workers/
│   ├── duckdb.worker.ts        # DuckDB Web Worker
│   └── ml.worker.ts            # (post-v1) ML training worker
├── services/                   # Module API contracts (ingestion.ts, sql.ts, ai.ts, charts.ts, export.ts) + navigation.ts — the D71 nav facade (openDestination; flag-off drives ui store, flag-on drives tabs store)
├── lib/
│   ├── classifier.ts           # Semantic type rules
│   ├── capabilities.ts         # Broker evaluation + rankNextActions (Action Broker, §9/D68)
│   ├── qualityScore.ts         # (Studio arc) composite score + per-dimension rules
│   ├── relationshipInference.ts# (Studio arc) key detection, containment/cardinality analysis
│   ├── querySuggester.ts       # Auto-query generation
│   ├── chartMapper.ts          # Result → chart type mapping (shared with AI stage 6)
│   ├── viewspec.ts             # ViewSpec schema, viewspec_version + validation; deterministic producer over broker + Dossier (D55; optional AI producer v0.5+, D56)
│   ├── inputNormalizer.ts      # Fuzzy pre-match (AI stage 1)
│   ├── sqlLint.ts              # Dialect lint via pgsql-ast-parser (AI stage 4)
│   ├── dsps.ts                 # DSPS schema, dsps_version + forward/backward-compat rules (D31/D37)
│   └── featureFlags.ts         # WORKBENCH_ENABLED (D71; precedent JOIN_GRAPH_ENABLED)
├── stores/                     # App state — incl. the table registry (datasets.ts; session catalog, §7.5/D13, build/02-ingestion/03-table-registry.md), schema, query, AI session, settings;
│                                #   tabs.ts (Workbench tab instances — openTab validates model-origin payloads, §13.3/D55) + selection.ts (shell-wide selection: table/column/map edge) — the pre-existing "tabs" state here is this store made explicit, not a second one (D71)
├── types/                      # ClassifiedColumn, DataCapabilities, ChartSpec, ViewSpec, TableRegistryEntry, WorkerMessage,
│                                #   FactRef, RankedAction, DatasetVerdict, ThreadConfig (composition-layer contracts, D68),
│                                #   tabs.ts — TabSpec envelope: fixed tab-type registry, app-authored only (D71/§13.3), ...
└── data/samples/               # ecommerce/ (4-table folder), titanic.csv, stock_prices.csv, product_reviews.csv, weather.csv

edge/                           # Cloudflare Worker (separate deploy, wrangler-managed)
├── ai-router.ts                # Workers AI / BYOK routing
├── cors-relay.ts               # Tier-2 relay + rate limiting
├── vault.ts                    # BYOK credential vault (KV/secrets)
└── persistence.ts              # R2 save/share endpoints + TTL/abuse controls

infra/                          # Terraform — Cloudflare account resources (D19, §23.3)
├── providers.tf / main.tf      # provider pin, remote state backend (ADR-009)
├── dns.tf / hosting.tf         # zone records, static-hosting project / custom domain
├── r2.tf / kv.tf               # buckets + lifecycle TTL rules (§12.3), vault namespace
└── envs/                       # dev / prod variable files

.github/workflows/              # CI/CD pipelines (§23.4)
Dockerfile                      # dev/CI parity image (§23.2 — never the production runtime)
compose.yaml                    # app + edge + e2e (+ optional ollama) local stack
```

Known wrinkle: §14 says bundled samples ship in `/public/samples/`; §16 shows
`src/data/samples/`. Resolve at project bootstrap (samples must be fetchable at runtime, so
`/public/samples/` is the likely winner) and record in the bootstrap ADR.

## Interfaces first (§21.4)

Define these TypeScript types before implementation (in `src/types/`): `Dataset`,
`ClassifiedColumn`, `DataCapabilities`, `ChartSpec`, **`ViewSpec`** (D55 — versioned,
capability-gated declarative layout; fixed component registry + typed props + `ChartSpec`
panels), **`TableRegistryEntry`** (D58 — per-table catalog record: name, rows × cols, source/
origin, memory, derived-from), `QueryResult`, `WorkerMessage`, `WorkerResponse`, `AIMode`,
`AISession`, **`QueryEngine`** (plus `MLModel`/`MLJob` when §20.1 revives). The
**composition-layer contracts** (D68) — `FactRef`, `RankedAction`, `DatasetVerdict`,
`ThreadConfig` — are typed, rows-free view slices projected from the substrate, one per
composition rung.

**Engine-agnostic core — the `QueryEngine` boundary (D49, extends D18).** Profiling,
classification, insight generation, and DSPS emission are written against a **`QueryEngine`
interface** (execute / register / summarize), **never against duckdb-wasm directly**. The v0
implementation binds it to the DuckDB-Wasm worker (`useDuckDB.ts` / `duckdb.worker.ts` above);
the seam costs ~nothing now and is the entire pre-work for the **D51 desktop native-DuckDB
sidecar** (duckdb-rs behind the same interface, results over Arrow IPC) and a possible DSPS
CLI/CI surface (recorded, gated on Play-4 evidence). No new product surface today — the web
app and its edge surface (§1/§4) are unchanged; this is an internal boundary only.

## Module API contracts (§21.8)

Stable service interfaces in `src/services/`:
`loadDataset()/removeDataset()/profileDataset()`, `runQuery()/cancelQuery()/getHistory()`,
`buildChart()/recommendChart()`, `askAI()/setAIMode()`, `saveToCloud()/deleteShare()`.

`cancelQuery()` and `removeDataset()` are the **cancellation/lifecycle seam** (D58): user
abort, superseded request (a new AI turn preempts an in-flight tool-loop; a new query preempts
a running one), and Worker termination/restart are first-class control flow, not errors —
see [`data-flow.md`](data-flow.md) failure cases.
