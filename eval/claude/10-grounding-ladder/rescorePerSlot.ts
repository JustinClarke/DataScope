// One-time $0 unblock (11-gemini-comparison-arm.md session 8/9, 10-grounding-
// ladder.md's Verdict preamble): `RunRecord` persists C2/C3/C4 as aggregates
// across structural+quality+behavioral, but `scorePanel`'s own in-memory
// result is per-slot (`C2Disposition.slot`) and gets discarded before write.
// This replays every compliant record's persisted `raw` text back through
// `scorePanel`, with the same slot fact tables `runCell` would have built for
// that record's (dataset, a2, a3) — deterministic reconstruction, no model
// call, no new spend. Unblocks kill criterion (d) ("a directional effect on
// at least one slot") and the three Verdict rows currently sharing one
// combined C2 number.
//
// Also answers the Verdict preamble's other still-open $0 item: the
// rung-matched OPAQUE-vs-CLEAR contrast. variants.ts's recall-ablation block
// (a2=OPAQUE, a3=TRUE) at a1={0,max} is the exact OPAQUE counterpart to
// row-ladder-{0,max} (a2=CLEAR, a3=TRUE) — same rung, same fixture, same
// uncorrupted condition, differing only in a2. No new run needed; both cells
// already exist in RESULTS.json / RESULTS-gemini.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../../duckdb/duckdb';
import { loadEvalDatasets } from '../../dataset/tables';
import { computeStats } from '../08-computed-facts/computeStats';
import { buildSlotFactTables, type SlotFactTables } from './slotFacts';
import { applyFactIntegrity } from './corrupt';
import { buildOpaqueMapping, deanonymizePanelAnswer } from './opaque';
import { parsePanelAnswer } from './panelSchema';
import { scorePanel, type PanelScoreResult } from './scorePanel';
import { loadPanelKey, type RunRecord } from './run';
import type { PanelKeyEntry } from './buildKey';
import type { FactIntegrity, SchemaLegibility } from './variants';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SlotRow {
  provider: 'ollama' | 'gemini';
  dataset: string;
  cellId: string;
  block: string;
  a1: RunRecord['a1'];
  a2: SchemaLegibility;
  a3: FactIntegrity;
  repeat: number;
  slot: 'structural' | 'quality' | 'behavioral';
  total: number;
  ok: number;
  closedByRule: number;
  slotMisassigned: number;
  c3: number;
}

function rescoreRecord(
  record: RunRecord,
  panelKeyEntry: PanelKeyEntry,
  pristine: SlotFactTables,
  mapping: ReturnType<typeof buildOpaqueMapping> | undefined,
): PanelScoreResult | undefined {
  if (!record.compliant || !record.raw) return undefined;
  const integrity = applyFactIntegrity(pristine, record.a3);
  let parsed;
  try {
    parsed = parsePanelAnswer(record.raw);
  } catch {
    return undefined; // shouldn't happen for compliant:true, but don't let one bad row kill the pass
  }
  const answerForScoring = mapping ? deanonymizePanelAnswer(parsed, mapping) : parsed;
  return scorePanel(answerForScoring, panelKeyEntry, integrity.tables);
}

async function processProvider(provider: 'ollama' | 'gemini', resultsFile: string): Promise<SlotRow[]> {
  const resultsPath = path.resolve(__dirname, resultsFile);
  if (!fs.existsSync(resultsPath)) {
    console.log(`skip ${provider}: ${resultsFile} not found`);
    return [];
  }
  const { records } = JSON.parse(fs.readFileSync(resultsPath, 'utf-8')) as { records: RunRecord[] };
  console.log(`${provider}: ${records.length} records loaded from ${resultsFile}`);

  const engine = await createEvalEngine();
  const allDatasets = await loadEvalDatasets(engine);
  const panelKey = loadPanelKey();

  const byDataset = new Map<string, RunRecord[]>();
  for (const r of records) {
    if (!byDataset.has(r.dataset)) byDataset.set(r.dataset, []);
    byDataset.get(r.dataset)!.push(r);
  }

  const rows: SlotRow[] = [];
  for (const [datasetId, datasetRecords] of byDataset) {
    const dataset = allDatasets.find((d) => d.id === datasetId);
    if (!dataset) throw new Error(`fixture not found: ${datasetId}`);
    const panelKeyEntry = panelKey[datasetId];
    if (!panelKeyEntry) throw new Error(`PANEL-KEY.json has no entry for ${datasetId}`);

    const computedStats = await computeStats(engine, dataset.tables);
    const pristine = buildSlotFactTables(dataset.tables, computedStats);
    const mapping = buildOpaqueMapping(dataset.tables); // built once; only used for a2=OPAQUE records

    let rescored = 0;
    let skipped = 0;
    for (const record of datasetRecords) {
      const result = rescoreRecord(record, panelKeyEntry, pristine, record.a2 === 'OPAQUE' ? mapping : undefined);
      if (!result) {
        skipped += 1;
        continue;
      }
      rescored += 1;
      const bySlot = new Map<string, { total: number; ok: number; closedByRule: number; slotMisassigned: number }>();
      for (const d of result.c2) {
        const acc = bySlot.get(d.slot) ?? { total: 0, ok: 0, closedByRule: 0, slotMisassigned: 0 };
        acc.total += 1;
        if (d.ok) acc.ok += 1;
        if (d.closedByRule) acc.closedByRule += 1;
        if (d.slotMisassigned) acc.slotMisassigned += 1;
        bySlot.set(d.slot, acc);
      }
      const c3BySlot = new Map<string, number>();
      for (const occ of result.c3) c3BySlot.set(occ.slot, (c3BySlot.get(occ.slot) ?? 0) + 1);

      for (const slot of ['structural', 'quality', 'behavioral'] as const) {
        const acc = bySlot.get(slot) ?? { total: 0, ok: 0, closedByRule: 0, slotMisassigned: 0 };
        rows.push({
          provider,
          dataset: datasetId,
          cellId: record.cellId,
          block: record.block,
          a1: record.a1,
          a2: record.a2,
          a3: record.a3,
          repeat: record.repeat,
          slot,
          total: acc.total,
          ok: acc.ok,
          closedByRule: acc.closedByRule,
          slotMisassigned: acc.slotMisassigned,
          c3: c3BySlot.get(slot) ?? 0,
        });
      }
    }
    console.log(`  ${datasetId}: rescored ${rescored}, skipped ${skipped} (non-compliant or unparseable)`);
  }

  await engine.close();
  return rows;
}

// ---- Aggregation helpers ----

function groundingRate(rows: SlotRow[]): number | null {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const ok = rows.reduce((s, r) => s + r.ok, 0);
  return total > 0 ? ok / total : null;
}

function aggregateBySlotAndRung(rows: SlotRow[]): Record<string, Record<string, { total: number; ok: number; rate: number | null }>> {
  const out: Record<string, Record<string, { total: number; ok: number; rate: number | null }>> = {};
  for (const slot of ['structural', 'quality', 'behavioral']) {
    out[slot] = {};
    for (const a1 of [0, 10, 100, 'max']) {
      const subset = rows.filter((r) => r.slot === slot && r.a1 === a1 && r.block === 'row-ladder');
      const total = subset.reduce((s, r) => s + r.total, 0);
      const ok = subset.reduce((s, r) => s + r.ok, 0);
      out[slot][String(a1)] = { total, ok, rate: total > 0 ? ok / total : null };
    }
  }
  return out;
}

function aggregateOpaqueVsClear(
  rows: SlotRow[],
  provider: string,
): Record<string, Record<'0' | 'max', { CLEAR: unknown; OPAQUE: unknown }>> {
  const out: Record<string, Record<'0' | 'max', { CLEAR: unknown; OPAQUE: unknown }>> = {};
  for (const dataset of [...new Set(rows.filter((r) => r.provider === provider).map((r) => r.dataset))]) {
    out[dataset] = { '0': { CLEAR: null, OPAQUE: null }, max: { CLEAR: null, OPAQUE: null } };
    for (const a1 of [0, 'max'] as const) {
      const clear = rows.filter((r) => r.provider === provider && r.dataset === dataset && r.a1 === a1 && r.a2 === 'CLEAR' && r.a3 === 'TRUE' && r.block === 'row-ladder');
      const opaque = rows.filter((r) => r.provider === provider && r.dataset === dataset && r.a1 === a1 && r.a2 === 'OPAQUE' && r.a3 === 'TRUE' && r.block === 'recall-ablation');
      const summarize = (subset: SlotRow[]) => {
        const total = subset.reduce((s, r) => s + r.total, 0);
        const ok = subset.reduce((s, r) => s + r.ok, 0);
        const c3 = subset.reduce((s, r) => s + r.c3, 0);
        const nCalls = new Set(subset.map((r) => r.repeat)).size;
        return { nCalls, c2Total: total, c2Ok: ok, c2Rate: total > 0 ? ok / total : null, c3 };
      };
      out[dataset][a1 === 0 ? '0' : 'max'] = { CLEAR: summarize(clear), OPAQUE: summarize(opaque) };
    }
  }
  return out;
}

async function main(): Promise<void> {
  const ollamaRows = await processProvider('ollama', 'RESULTS.json');
  const geminiRows = await processProvider('gemini', 'RESULTS-gemini.json');
  const allRows = [...ollamaRows, ...geminiRows];

  const out = {
    ranAt: new Date().toISOString(),
    note:
      "$0 replay of persisted RESULTS.json/RESULTS-gemini.json 'raw' panels through scorePanel with " +
      'reconstructed slot fact tables — no model call, deterministic (corrupt.ts/opaque.ts/slotFacts.ts have ' +
      'no RNG). Unblocks kill criterion (d) (per-slot directional effect) and the rung-matched OPAQUE-vs-CLEAR ' +
      "contrast doc 10's Verdict preamble names as still-open.",
    perSlotOverall: {
      ollama: groundingRate(ollamaRows),
      gemini: groundingRate(geminiRows),
    },
    perSlotByRung: {
      ollama: aggregateBySlotAndRung(ollamaRows),
      gemini: aggregateBySlotAndRung(geminiRows),
    },
    opaqueVsClear: {
      ollama: aggregateOpaqueVsClear(allRows, 'ollama'),
      gemini: aggregateOpaqueVsClear(allRows, 'gemini'),
    },
    rows: allRows,
  };

  fs.writeFileSync(path.resolve(__dirname, 'PER-SLOT-RESCORE.json'), JSON.stringify(out, null, 2));
  console.log('\n=== Per-slot grounding rate by rung (row-ladder block only) ===');
  for (const provider of ['ollama', 'gemini'] as const) {
    console.log(`\n${provider}:`);
    const agg = provider === 'ollama' ? out.perSlotByRung.ollama : out.perSlotByRung.gemini;
    for (const [slot, byRung] of Object.entries(agg)) {
      const cells = ['0', '10', '100', 'max'].map((r) => {
        const c = byRung[r];
        return `${r}=${c.rate === null ? 'n/a' : (c.rate * 100).toFixed(1) + '%'} (${c.ok}/${c.total})`;
      });
      console.log(`  ${slot}: ${cells.join('  ')}`);
    }
  }

  console.log('\n=== OPAQUE vs CLEAR, rung-matched (a3=TRUE only) ===');
  for (const provider of ['ollama', 'gemini'] as const) {
    console.log(`\n${provider}:`);
    const agg = provider === 'ollama' ? out.opaqueVsClear.ollama : out.opaqueVsClear.gemini;
    for (const [dataset, byRung] of Object.entries(agg)) {
      for (const rung of ['0', 'max'] as const) {
        console.log(`  ${dataset} rows=${rung}:`, JSON.stringify(byRung[rung]));
      }
    }
  }

  console.log(`\nWrote ${allRows.length} slot-rows to PER-SLOT-RESCORE.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
