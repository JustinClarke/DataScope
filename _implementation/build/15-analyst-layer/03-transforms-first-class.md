# A3 — Transforms as a first-class operation

**Tier:** v0.71 · **Depends on:** A0, **v0.70 S4** (the shared guarded run path) · **Spec:** master
§11.5, §12.1, §19 v0.71, D74

Half of this already exists in `src/services/transforms.ts`. The gap is **view support, lineage, and
exposing derivation as an operation** rather than only as a SQL-editor side effect.

## The operations

**`derive_table(name, sql)`** → runs `CREATE TABLE AS`, profiles and classifies the result, and
registers it as a derived table carrying its `generatingSql`. This is **exactly the existing
`runTransform` path** — which means the table appears in the explorer rail, is queryable by name,
and is **indistinguishable from one the user made**. Name sanitizing and dedupe use the existing
`formatPolicy` rules, not a second implementation.

**`create_view(name, sql)`** → a session view over the same objects. Cheaper than a table when an
intermediate grain will be queried twice.

**`drop_derived(name)`** → drops a derived table or view. **Refuses source tables** — not as a
security boundary, but because the mutation guard's materialize-onto-a-clone behaviour is the better
default for a human too. The model gets the same door the user gets.

## Why S4 is a hard dependency

v0.70 D73 established that the transform guard is **an interception, not an affordance**: it fires
*between* Run and execution, wherever a statement would mutate a source table, and therefore lives in
the **shared run path that both the console and every query tab call** — never re-mounted per
surface. D73 called this "the one item here that is not optional."

A3 adds a **third caller** to that path. The rule does not change and no second guard is written:
a derive operation that bypassed the shared path would be a data-loss route the SQL console never
had, which is the precise failure D73 legislated against.

**This is also A4 defect (iv) seen from the other side** — the AI chat currently calls
`runChartQuery` and skips the guarded path entirely. That is harmless only while the model's single
tool is a `SELECT`. **It stops being harmless the moment this phase ships**, which is why A4 is
sequenced ahead of A5 and why this phase must not land before the chat is on the shared path.

## Lineage and undo

- **Lineage** — what derived from what. The registry already stores `generatingSql` per derived
  table; lineage is the edge set over it, and it is what makes undo comprehensible rather than
  surprising ("dropping `orders_clean` orphans two tables derived from it").
- **Undo** — scoped to derivation, not to arbitrary statements. Dropping a derived object is
  undoable within the session because its `generatingSql` can rebuild it; a forced mutation of a
  source table is **not** undoable and the existing guard already says so with no undo. Do not
  widen that promise.

## Definition of done

- [x] All three operations route through the **v0.70 S4 shared guarded run path** — asserted by a
      test that fails if a new caller bypasses it.
- [x] A derived table created by the operation is **byte-identical in the registry** to one created
      by typing `CREATE TABLE AS` in the console (same profile, classification, origin,
      `generatingSql`) — one path, verified, not two that agree by inspection.
- [x] `drop_derived` refuses a source table with a structured `invalid_argument` and a mechanical
      hint naming the derived objects that *are* droppable.
- [x] Views appear in the explorer rail distinguishably from tables, and are queryable by name.
- [x] Lineage is queryable: for any derived object, what it came from and what depends on it.
- [x] Undo restores a dropped derived object from its `generatingSql` within the session; the
      no-undo promise on forced source mutation is **unchanged and still stated**.
- [x] A first-class derive action exists in the UI, so a user need not know that `CREATE TABLE AS`
      in the console does something special.

## Built (2026-08-02)

**The catalog seam.** A0's `Executor` lets the core *run* SQL on either engine and deliberately
cannot express what a derivation additionally means to the host — profiling, classifying,
registering, and passing the guard. So A3 added a second seam beside it, `Catalog`
([`src/lib/analyst/types.ts`](../../../src/lib/analyst/types.ts)): `objects()` / `derive()` /
`drop()`. The browser's implementation
([`src/services/analyst.ts`](../../../src/services/analyst.ts)) calls
`services/transforms.ts`'s `runTransformDetailed` — **the same function the console's run path
calls** — so the registry entry is identical by construction rather than by two implementations
agreeing. `eval/analyst/harnessCatalog.ts` supplies an engine-only one; per D74(d) that is a
harness, not a second product path. A core built without a catalog is read-only and the three
verbs refuse.

**Why not `runPath.requestRun`.** The guard is not *in* `runPath` — `runPath` is the UI entrance
to it, and what it adds (hoisting the guard modal, driving the console's Results/History panel) is
wrong for an operation that must return its outcome and must not overwrite what the user has on
screen. The interception itself (`isSourceMutation` → `MutationGuardRequired`) lives in
`transforms.ts`, so calling the same function the console calls is what "one path" means here.
`src/services/analyst.test.ts` asserts that every `CREATE` the engine saw came from that function.

**No seventeenth operation for lineage.** Master §11.5 enumerates the catalog and states it is near
its practical ceiling, so lineage rides on the operations that already exist: `describe_table`
notes what a derived object came from and what depends on it, and `drop_derived` names what a drop
would orphan and returns the `generatingSql` that rebuilds it. Direct edges only — the question undo
has to make comprehensible is what breaks *first*.

**Undo was already shipped.** `IngestionPanel`'s remove-is-undo plus its redo offer already replays
a derived table's `generatingSql` through `runTransform`; A3 did not rebuild it. What A3 added is
the same guarantee for objects dropped via the operation (`drop_derived` returns the rebuild SQL)
and for views. `forceMutation`'s no-undo promise is untouched.

**Views cost three small corrections in shipped code**, each a case of "table" having been assumed:
`classifyStatement` gained a `cview` class and `DROP VIEW` matching (so a view typed in the console
registers exactly like a `CREATE TABLE AS`); `ingestion.removeTable` issued `DROP TABLE IF EXISTS`
unconditionally, which would have left a view in DuckDB with no registry row pointing at it; and
S6.9's `listEngineTables` asked only `duckdb_tables()`, which would have reported every session view
as lost on a refresh.
