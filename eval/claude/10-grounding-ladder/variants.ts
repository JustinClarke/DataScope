// The A1/A2/A3 cell definitions (10-grounding-ladder.md, Phase 1). Full cross
// is 24 cells and unjustified; this is the pruned ~10-cell design, per
// dataset, the doc specifies: row ladder, recall ablation, anchor probe, and
// the one crossed cell — plus stock_prices' ladder-only ceiling control.
export type RowsSent = 0 | 10 | 100 | 'max';
export type SchemaLegibility = 'CLEAR' | 'OPAQUE';
export type FactIntegrity = 'TRUE' | 'CORRUPTED' | 'DELETED';

export type VariantBlock = 'row-ladder' | 'recall-ablation' | 'anchor-probe' | 'crossed-cell' | 'ceiling-control' | 'uncapped';

export interface VariantCell {
  id: string;
  block: VariantBlock;
  a1: RowsSent;
  a2: SchemaLegibility;
  a3: FactIntegrity;
  /** N — non-uniform by design: the ladder block is where R2 is read off, so
   * it alone gets N=20; every other block runs at N=5 (doc, "N is no longer
   * uniform, because auditing is no longer the constraint"). */
  repeats: number;
}

/** titanic and product_reviews — the pair whose rows fit in the model's
 * context; the full A1/A2/A3 cross runs on these. */
export const IN_SCOPE_FIXTURES = ['titanic', 'product_reviews'] as const;

/** ~37k tokens — does not fit. Runs the row-ladder block only, as the ceiling
 * control: what happens when "max-that-fits" is genuinely a fraction. */
export const CEILING_FIXTURE = 'stock_prices';

const LADDER_ROWS: RowsSent[] = [0, 10, 100, 'max'];

function rowLadderCells(repeats: number, block: VariantBlock = 'row-ladder'): VariantCell[] {
  return LADDER_ROWS.map((a1) => ({
    id: `${block}-${a1}`,
    block,
    a1,
    a2: 'CLEAR',
    a3: 'TRUE',
    repeats,
  }));
}

function recallAblationCells(): VariantCell[] {
  return ([0, 'max'] as RowsSent[]).map((a1) => ({
    id: `recall-ablation-${a1}`,
    block: 'recall-ablation',
    a1,
    a2: 'OPAQUE',
    a3: 'TRUE',
    repeats: 5,
  }));
}

function anchorProbeCells(): VariantCell[] {
  const cells: VariantCell[] = [];
  for (const a1 of [0, 'max'] as RowsSent[]) {
    for (const a3 of ['CORRUPTED', 'DELETED'] as FactIntegrity[]) {
      cells.push({ id: `anchor-probe-${a1}-${a3}`, block: 'anchor-probe', a1, a2: 'CLEAR', a3, repeats: 5 });
    }
  }
  return cells;
}

function crossedCell(): VariantCell[] {
  return [{ id: 'crossed-cell', block: 'crossed-cell', a1: 'max', a2: 'OPAQUE', a3: 'CORRUPTED', repeats: 5 }];
}

/** The 11-cell design run on each in-scope fixture (titanic, product_reviews). */
export const PHASE1_CELLS: VariantCell[] = [
  ...rowLadderCells(20),
  ...recallAblationCells(),
  ...anchorProbeCells(),
  ...crossedCell(),
];

/** stock_prices' ladder-only ceiling control, at the same N=5 every non-ladder cell runs at. */
export const CEILING_CELLS: VariantCell[] = rowLadderCells(5, 'ceiling-control');

/** Total panel calls across both in-scope fixtures plus the ceiling control —
 * should equal the doc's own count (250) whenever these cells change. */
export function totalPanelCalls(): number {
  const inScope = PHASE1_CELLS.reduce((n, c) => n + c.repeats, 0) * IN_SCOPE_FIXTURES.length;
  const ceiling = CEILING_CELLS.reduce((n, c) => n + c.repeats, 0);
  return inScope + ceiling;
}

/** The uncapped cell (11-gemini-comparison-arm.md, "Panel arm and the
 * uncapped cell") — a separate exported list, not folded into `PHASE1_CELLS`/
 * `CEILING_CELLS`, so `totalPanelCalls()` stays at 250 regardless. `run.ts`
 * gates this to `EVAL_PROVIDER=gemini` and, for this block only, sends every
 * row with no packing budget — `a1: 'max'` means "max-that-fits" everywhere
 * else, but here there is deliberately no fit-to-budget step at all. Both
 * in-scope fixtures plus the ceiling fixture, N=5 (~15 calls total). */
export const UNCAPPED_CELLS: VariantCell[] = [{ id: 'uncapped-max', block: 'uncapped', a1: 'max', a2: 'CLEAR', a3: 'TRUE', repeats: 5 }];
