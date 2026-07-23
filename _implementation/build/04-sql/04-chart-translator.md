# 04.4 SQL → Chart Translator

**Tier:** v0 · Phase 2 · **Master spec:** §10 Module 2, §11.1 stage 6

## Objective

When a query returns, auto-detect the best chart and emit a strictly-typed, Recharts-ready
`ChartSpec`. **Implemented once, shared three ways:** playground results, insight-feed
"open as chart" (D10), and AI pipeline stage 6.

## Mapping rules (§10 M2)

| Query pattern / result shape | Auto-selected chart | Mapping |
| :--- | :--- | :--- |
| `GROUP BY` + `COUNT/SUM/AVG` | Bar chart | Group → X, Aggregate → Y |
| `ORDER BY date_column` | Line chart | Date → X, Value → Y |
| Two numeric columns returned | Scatter plot | Col 1 → X, Col 2 → Y |
| Single aggregate value | KPI card | Large number display |
| `LIMIT` on raw rows | Data grid | Tabular view ([03-results-grid.md](03-results-grid.md)) |

- Detection uses returned-column **types** (and light query-shape hints); output is a
  `ChartSpec` (§21.4) — never ad-hoc chart props.
- Always overridable: the user can switch chart type after auto-selection; the spec is the
  contract, the picker just mutates it.
- AI stage 6 (§11.1) calls exactly this function on the final result set — no fork.
- **The `ChartSpec` is the ViewSpec atom (§11.1, D55/D56):** the declarative ViewSpec layer
  composes these typed configs into panels — the deterministic producer for the Dossier's
  default view (v0), the optional AI view-composer (v0.5+) for its tailored variant. Both
  producers emit the same artifact; the renderer never executes model output.

**Type resolution (mechanism — leaf doc, not master; master specifies the outcome only).**
The three visual charts reduce to the existing `ChartType` union (§21.4): Bar → `categorical`,
Line → `time-series`, Scatter → `correlation`. `distribution`/`join-graph` are chart-module
types the translator never selects from a result shape. The other two mapping rows fall
*outside* `ChartSpec`, which carries axes a scalar and a table don't have: a single aggregate
value is a **KPI stat** (a plain number, no `ChartSpec`), and any ambiguous, too-wide, or
too-large result **degrades to the data grid** ([03-results-grid.md](03-results-grid.md)).
So the translator returns a `ChartRecommendation` — `{ chart, spec } | { kpi, … } | { grid,
reason }` — not a bare `ChartSpec`; the shared function AI stage 6 calls is this one, and the
KPI/grid arms are the two non-chart rows. Column types are read from the engine's Arrow type
strings (`Int64`/`Float64`/`Utf8`/`Date32<DAY>`), not DuckDB SQL names, since that is what a
`QueryResult` carries. Large series degrade to the grid at an interim row cap; the
canvas/downsampling threshold for big charts is deferred to the charting modules (ADR-005).
Recharts is the renderer per the §6 stack; it is lazy-loaded so it never enters the entry
bundle, and its shared primitives live in `src/components/charts/` for the chart modules to
reuse.

## Files

`src/lib/chartMapper.ts` (pure: `QueryResult` → `ChartRecommendation`), wrapped by
`src/services/charts.ts` (delegates + a one-off query runner for the "open as chart"
actions). Auto-chart panel in `src/features/sql/` (`AutoChartPanel`), rendering shared
chart primitives in `src/components/charts/` (`ChartRenderer` — the lazy Recharts boundary
the chart modules reuse — and `KpiCard`).

## Dependencies

[03-results-grid.md](03-results-grid.md) (grid case), `QueryResult`/`ChartSpec` types.
Chart *modules* (Phase 3) build their own visuals; they share primitives, not this mapper.

## Acceptance criteria

- [x] Each mapping row auto-selects correctly for a representative query
- [x] Ambiguous results degrade to the data grid, never a broken chart
- [x] Emitted `ChartSpec` is strictly typed; renderer consumes it without casts
- [x] Insight-feed "open as chart" and (later) AI stage 6 both call this same function

## Test plan

Unit: result-shape fixtures per rule row + ambiguous/edge shapes (0 rows, 1 row × 1 col,
all-text result). E2E: run each §10 suggested query on its sample, assert chart type.

## Definition of done

Single implementation, three consumers wired (playground now, feed in Phase 3, AI in
Phase 4); mapping table mirrored in tests.
