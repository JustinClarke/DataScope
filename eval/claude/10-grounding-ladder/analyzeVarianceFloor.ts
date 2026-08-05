// R-C — the variance floor's own deliverable (11-gemini-comparison-arm.md,
// Phase 5 riders): "compute the per-slot, per-class variance... to detect a
// 10-point C2 grounding difference at this variance, you need N=k." This is
// the analysis half; riderVarianceFloor.ts is only the collection half, and
// deliberately checkpoints to VARIANCE-FLOOR-ollama.jsonl so it can be
// interrupted and resumed. This script reads whatever is on disk *right
// now* — it does not require the full 800-call run to have finished, and
// reports the actual repeat count behind every figure so a mid-run read
// can't be mistaken for the final one.
//
// Reconstruction, not new scoring: every variance-floor cell is
// a2=CLEAR/a3=TRUE by construction (variants.ts's rowLadderCells default),
// so there is no opaque mapping and no fact corruption to redo — unlike
// rescorePerSlot.ts, which has to handle both. Same underlying move as that
// script: replay the persisted `raw` panel back through scorePanel with a
// freshly-built (pristine) SlotFactTables, since RunRecord only persists
// panel-wide C2/C3/C4 aggregates and scorePanel's own per-slot breakdown
// (C2Disposition.slot) is what's needed here and gets discarded on write.
//
// Sample-size formula: standard two-independent-means comparison,
// n_per_arm = 2 * (z_a/2 + z_b)^2 * variance / delta^2, alpha=0.05 two-sided,
// power=0.80 — the conventional defaults, not a project-specific choice.
// Treats each repeat's per-slot C2 rate (ok/total for that repeat) as one
// observation of a continuous outcome; with ~5-10 claims per slot per
// repeat this is an approximation, matching the rider's own "floor, not an
// estimate" framing rather than a formal psychometric test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import { computeStats } from '../08-computed-facts/computeStats';
import { buildSlotFactTables } from './slotFacts';
import { parsePanelAnswer } from './panelSchema';
import { scorePanel } from './scorePanel';
import { loadPanelKey, type RunRecord } from './run';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IN_PATH = path.resolve(__dirname, 'VARIANCE-FLOOR-ollama.jsonl');
const OUT_PATH = path.resolve(__dirname, 'VARIANCE-FLOOR-ANALYSIS.json');

const SCORABLE_SLOTS = ['structural', 'quality', 'behavioral'] as const;
type ScorableSlot = (typeof SCORABLE_SLOTS)[number];

// alpha=0.05 two-sided, power=0.80 — conventional defaults (Cohen 1988).
const Z_ALPHA_2 = 1.959963985;
const Z_BETA = 0.841621234;
// The doc's own phrasing: "detect a 10-point C2 grounding difference."
const DELTA = 0.1;

interface Stats {
  n: number;
  mean: number | null;
  variance: number | null;
  sd: number | null;
}

function summarize(values: number[]): Stats {
  const n = values.length;
  if (n === 0) return { n, mean: null, variance: null, sd: null };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n === 1) return { n, mean, variance: null, sd: null };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return { n, mean, variance, sd: Math.sqrt(variance) };
}

function requiredNPerArm(variance: number | null): number | null {
  if (variance === null || variance <= 0) return null;
  return Math.ceil((2 * (Z_ALPHA_2 + Z_BETA) ** 2 * variance) / (DELTA * DELTA));
}

interface PerRepeatScore {
  repeat: number;
  c1DisagreementCount: number;
  bySlot: Record<ScorableSlot, { c2Total: number; c2Ok: number; c2Rate: number | null; c3: number; c4: number }>;
  combined: { c2Total: number; c2Ok: number; c2Rate: number | null; c3: number; c4: number };
}

function loadRecords(): RunRecord[] {
  if (!fs.existsSync(IN_PATH)) return [];
  return fs
    .readFileSync(IN_PATH, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunRecord);
}

async function main(): Promise<void> {
  const records = loadRecords();
  if (records.length === 0) {
    console.log(`No data yet at ${IN_PATH} — run riderVarianceFloor.ts first (it checkpoints as it goes, so this ` +
      'script can be re-run against a partial file at any point).');
    return;
  }

  const byDatasetRung = new Map<string, RunRecord[]>();
  for (const r of records) {
    const key = `${r.dataset}::${r.a1}`;
    if (!byDatasetRung.has(key)) byDatasetRung.set(key, []);
    byDatasetRung.get(key)!.push(r);
  }

  const engine = await createEvalEngine();
  const allDatasets = await loadEvalDatasets(engine);
  const panelKey = loadPanelKey();

  // One pristine SlotFactTables per dataset — a3=TRUE is a no-op
  // (corrupt.ts: `if (mode === 'TRUE') return { tables, mode }`), so there's
  // no per-record integrity variant to reconstruct here, unlike anchor-probe
  // or crossed-cell data.
  const pristineByDataset = new Map<string, ReturnType<typeof buildSlotFactTables>>();
  for (const datasetId of new Set(records.map((r) => r.dataset))) {
    const dataset = allDatasets.find((d) => d.id === datasetId);
    if (!dataset) throw new Error(`fixture not found: ${datasetId}`);
    const computedStats = await computeStats(engine, dataset.tables);
    pristineByDataset.set(datasetId, buildSlotFactTables(dataset.tables, computedStats));
  }
  await engine.close();

  const perCellOut: Array<{
    dataset: string;
    a1: RunRecord['a1'];
    nRepeatsTotal: number;
    nRepeatsCompliant: number;
    nRepeatsRescored: number;
    c1: Stats;
    combined: { c2Rate: Stats; c3: Stats; c4: Stats; requiredNFor10pt: number | null };
    bySlot: Record<ScorableSlot, { c2Rate: Stats; c3: Stats; c4: Stats; requiredNFor10pt: number | null }>;
  }> = [];

  let maxRequiredN = 0;
  let maxRequiredNLocation = '';

  for (const [key, cellRecords] of byDatasetRung) {
    const [dataset, a1Raw] = key.split('::');
    const a1 = (a1Raw === 'max' ? 'max' : Number(a1Raw)) as RunRecord['a1'];
    const pristine = pristineByDataset.get(dataset)!;
    const panelKeyEntry = panelKey[dataset];
    if (!panelKeyEntry) throw new Error(`PANEL-KEY.json has no entry for ${dataset}`);

    const perRepeat: PerRepeatScore[] = [];
    let compliantCount = 0;
    for (const record of cellRecords) {
      if (!record.compliant || !record.raw) continue;
      compliantCount += 1;
      let parsed;
      try {
        parsed = parsePanelAnswer(record.raw);
      } catch {
        continue; // shouldn't happen for compliant:true, but don't let one bad row kill the pass
      }
      const score = scorePanel(parsed, panelKeyEntry, pristine);

      const bySlot = {} as PerRepeatScore['bySlot'];
      let combinedTotal = 0;
      let combinedOk = 0;
      let combinedC3 = 0;
      let combinedC4 = 0;
      for (const slot of SCORABLE_SLOTS) {
        const c2 = score.c2.filter((d) => d.slot === slot);
        const c3 = score.c3.filter((o) => o.slot === slot).length;
        const c4 = score.c4Residue.filter((c) => c.slot === slot).length;
        const total = c2.length;
        const ok = c2.filter((d) => d.ok).length;
        bySlot[slot] = { c2Total: total, c2Ok: ok, c2Rate: total > 0 ? ok / total : null, c3, c4 };
        combinedTotal += total;
        combinedOk += ok;
        combinedC3 += c3;
        combinedC4 += c4;
      }

      perRepeat.push({
        repeat: record.repeat,
        c1DisagreementCount: score.c1.length,
        bySlot,
        combined: { c2Total: combinedTotal, c2Ok: combinedOk, c2Rate: combinedTotal > 0 ? combinedOk / combinedTotal : null, c3: combinedC3, c4: combinedC4 },
      });
    }

    const c1Stats = summarize(perRepeat.map((p) => p.c1DisagreementCount));
    const combinedRateStats = summarize(perRepeat.map((p) => p.combined.c2Rate).filter((v): v is number => v !== null));
    const combinedC3Stats = summarize(perRepeat.map((p) => p.combined.c3));
    const combinedC4Stats = summarize(perRepeat.map((p) => p.combined.c4));
    const combinedRequiredN = requiredNPerArm(combinedRateStats.variance);
    if (combinedRequiredN !== null && combinedRequiredN > maxRequiredN) {
      maxRequiredN = combinedRequiredN;
      maxRequiredNLocation = `${dataset}/rows=${a1}/combined`;
    }

    const bySlotOut = {} as (typeof perCellOut)[number]['bySlot'];
    for (const slot of SCORABLE_SLOTS) {
      const rateStats = summarize(perRepeat.map((p) => p.bySlot[slot].c2Rate).filter((v): v is number => v !== null));
      const c3Stats = summarize(perRepeat.map((p) => p.bySlot[slot].c3));
      const c4Stats = summarize(perRepeat.map((p) => p.bySlot[slot].c4));
      const requiredN = requiredNPerArm(rateStats.variance);
      if (requiredN !== null && requiredN > maxRequiredN) {
        maxRequiredN = requiredN;
        maxRequiredNLocation = `${dataset}/rows=${a1}/${slot}`;
      }
      bySlotOut[slot] = { c2Rate: rateStats, c3: c3Stats, c4: c4Stats, requiredNFor10pt: requiredN };
    }

    perCellOut.push({
      dataset,
      a1,
      nRepeatsTotal: cellRecords.length,
      nRepeatsCompliant: compliantCount,
      nRepeatsRescored: perRepeat.length,
      c1: c1Stats,
      combined: { c2Rate: combinedRateStats, c3: combinedC3Stats, c4: combinedC4Stats, requiredNFor10pt: combinedRequiredN },
      bySlot: bySlotOut,
    });
  }

  perCellOut.sort((a, b) => (a.dataset === b.dataset ? String(a.a1).localeCompare(String(b.a1)) : a.dataset.localeCompare(b.dataset)));

  const targetN = 100; // riderVarianceFloor.ts's own target per cell
  const partialCells = perCellOut.filter((c) => c.nRepeatsRescored < targetN).map((c) => `${c.dataset}/rows=${c.a1} (${c.nRepeatsRescored}/${targetN})`);

  const out = {
    ranAt: new Date().toISOString(),
    note:
      'Per-slot, per-class variance of the 7B tier\'s run-to-run C2 grounding rate at a pinned temperature ' +
      '(11-gemini-comparison-arm.md R-C), replayed from VARIANCE-FLOOR-ollama.jsonl\'s persisted `raw` panels ' +
      'through scorePanel — no new model calls. requiredNFor10pt is the per-arm N a two-independent-means ' +
      'comparison needs to detect a 10-point difference in C2 grounding rate at this variance (alpha=0.05 ' +
      'two-sided, power=0.80). Caveat, stated in the doc and true here: derived from the 7B tier directly (not ' +
      'borrowed from a frontier ceiling), but still "a smaller model is usually more variable" only in the ' +
      'downward direction relative to nothing smaller having been measured — this is not itself a floor across ' +
      'every possible tier below 7B.',
    alpha: 0.05,
    power: 0.8,
    deltaPoints: DELTA,
    targetRepeatsPerCell: targetN,
    isPartial: partialCells.length > 0,
    partialCells,
    verdict: {
      maxRequiredNFor10pt: maxRequiredN || null,
      maxRequiredNLocation: maxRequiredNLocation || null,
      ladderBlockActualN: 20,
      underpowered: maxRequiredN > 20,
    },
    perCell: perCellOut,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

  console.log(`\n=== R-C variance floor — per-cell C2 grounding rate (n = repeats rescored) ===`);
  for (const cell of perCellOut) {
    const partial = cell.nRepeatsRescored < targetN ? ` [PARTIAL: ${cell.nRepeatsRescored}/${targetN}]` : '';
    console.log(`\n${cell.dataset} rows=${cell.a1}${partial}`);
    console.log(
      `  combined: rate=${cell.combined.c2Rate.mean?.toFixed(3) ?? 'n/a'} sd=${cell.combined.c2Rate.sd?.toFixed(3) ?? 'n/a'} (n=${cell.combined.c2Rate.n}) ` +
        `-> N needed for 10pt delta: ${cell.combined.requiredNFor10pt ?? 'n/a (zero variance observed)'}`,
    );
    for (const slot of SCORABLE_SLOTS) {
      const s = cell.bySlot[slot];
      console.log(
        `  ${slot}: rate=${s.c2Rate.mean?.toFixed(3) ?? 'n/a'} sd=${s.c2Rate.sd?.toFixed(3) ?? 'n/a'} (n=${s.c2Rate.n}) -> N=${s.requiredNFor10pt ?? 'n/a'}`,
      );
    }
  }

  console.log(`\n=== Verdict ===`);
  if (out.isPartial) {
    console.log(`PARTIAL DATA — ${partialCells.length} cell(s) below the target ${targetN} repeats: ${partialCells.join(', ')}`);
    console.log('Figures below will shift as riderVarianceFloor.ts collects more repeats; re-run this script to refresh.');
  }
  if (maxRequiredN > 0) {
    console.log(`Worst-case N needed to detect a 10-point C2 grounding difference: ${maxRequiredN} (at ${maxRequiredNLocation}).`);
    console.log(
      maxRequiredN > 20
        ? `The ladder block runs N=20 -> UNDERPOWERED for this comparison at this variance.`
        : `The ladder block runs N=20 -> sufficient for this comparison at this variance.`,
    );
  } else {
    console.log('No non-zero variance observed yet — insufficient data to size N (or the rate is perfectly stable so far).');
  }
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
