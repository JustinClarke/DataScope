// A0's memory-ceiling measurement (master §11.5, `00-analyst-core.md`).
//
// The result store retains every materialization so a model can glance back
// rather than recompute (D74h). The known cost is memory, and master §11.5
// says the ceiling is *measured in A0, not guessed* — this is that
// measurement. Per result shape it reports the type estimate, DuckDB's own
// memory delta, and what the store therefore charges.
//
// The charged figure must never be *under* what the engine actually took —
// that is what makes the ceiling mean something. The last column is the check:
// 1.00× where the engine's figure binds, above 1.00× where the store is
// deliberately conservative. Below 1.00× would be a defect.
//
// Run: `npm run analyst:ceiling`  (dev/CI only, never product runtime — §11.4)
import { ResultStore, chargedBytes, estimateBytes } from '../../src/lib/analyst/resultStore';
import type { Executor } from '../../src/lib/analyst/types';
import { createWasmConformanceExecutor } from './wasmExecutor';
import { createNativeConformanceExecutor } from './nativeExecutor';

const MIB = 1024 * 1024;

/** `PRAGMA database_size` reports memory as a human string ("4.7 MiB"); this is the only place that shape is parsed. */
const UNITS: Record<string, number> = { bytes: 1, KiB: 1024, MiB: MIB, GiB: 1024 * MIB };

async function engineMemoryBytes(executor: Executor): Promise<number> {
  const result = await executor.execute('PRAGMA database_size');
  const index = result.columnNames.indexOf('memory_usage');
  const raw = String(result.rows[0]?.[index] ?? '0 bytes');
  const [value, unit] = raw.split(' ');
  return Number(value) * (UNITS[unit ?? 'bytes'] ?? 1);
}

interface Shape {
  name: string;
  /** A SELECT over `source` producing `rows` rows of this shape. */
  projection: string;
}

const SHAPES: Shape[] = [
  { name: 'narrow numeric (2 × BIGINT)', projection: 'i AS a, i * 2 AS b' },
  { name: 'mixed (BIGINT, DOUBLE, DATE, BOOLEAN)', projection: "i AS a, i * 1.5::DOUBLE AS b, DATE '2024-01-01' + (i % 365)::INTEGER AS c, (i % 2 = 0) AS d" },
  { name: 'wide text (4 × VARCHAR ~24 chars)', projection: "'value-' || i AS a, 'label-' || i AS b, 'note-' || i AS c, 'tag-' || i AS d" },
  { name: 'very wide text (4 × VARCHAR ~120 chars)', projection: "repeat('x', 120) || i AS a, repeat('y', 120) || i AS b, repeat('z', 120) || i AS c, repeat('w', 120) || i AS d" },
];

const ROW_COUNTS = [100_000, 500_000, 1_000_000];

async function measure(label: string, make: () => Promise<Executor & { close(): Promise<void> }>): Promise<void> {
  console.log(`\n## ${label}\n`);
  console.log('| shape | rows | type estimate | engine memory Δ | charged | charged ÷ engine |');
  console.log('| :--- | ---: | ---: | ---: | ---: | ---: |');

  for (const shape of SHAPES) {
    for (const rows of ROW_COUNTS) {
      const executor = await make();
      try {
        const store = new ResultStore(executor, Number.MAX_SAFE_INTEGER);
        const sql = `SELECT ${shape.projection} FROM range(${rows}) t(i)`;

        global.gc?.();
        const baseEngine = await engineMemoryBytes(executor);

        const { entry } = await store.materialize('run_sql', sql);

        global.gc?.();
        const engineDelta = (await engineMemoryBytes(executor)) - baseEngine;
        const estimate = estimateBytes(entry.schema, entry.rowCount);
        const charged = chargedBytes(estimate, engineDelta);

        console.log(
          `| ${shape.name} | ${rows.toLocaleString()} | ${(estimate / MIB).toFixed(1)} MB | ` +
            `${(engineDelta / MIB).toFixed(1)} MB | ${(charged / MIB).toFixed(1)} MB | ` +
            `${(charged / engineDelta).toFixed(2)}× |`,
        );
      } finally {
        await executor.close();
      }
    }
  }
}

await measure('DuckDB-Wasm (the tab\'s engine, run under Node)', createWasmConformanceExecutor);
await measure('Native DuckDB', createNativeConformanceExecutor);
console.log(`\nNode ${process.version} · ${process.platform}/${process.arch}`);
