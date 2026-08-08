// Validates manifest.ts's logging layer in isolation from runOneCall's own
// scoring logic (already covered by runner.test.ts): a trivial in-memory
// DuckDB connection and a mocked Ollama response are enough here, since this
// file only checks that runAndLog appends one well-formed JSONL row carrying
// the fields runOneCall itself has no way to know (dataset, machine, RSS).
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { appendManifestRow, runAndLog, type ManifestRow } from './manifest';
import type { ArmContext } from './runner';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, 'runs', 'test', 'manifest.jsonl');

afterEach(() => {
  vi.unstubAllGlobals();
});

function queueFetch(responses: Array<Record<string, unknown>>): void {
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const body = responses[i++];
      if (!body) throw new Error(`queueFetch: no more mocked responses (called ${i} times)`);
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

const emptyContext: ArmContext = { tables: [], facts: { generatedAt: '2026-08-08T00:00:00.000Z', tables: {} }, grainByTable: new Map(), views: [] };

describe('manifest logging', () => {
  let conn: DuckDBConnection;

  beforeAll(async () => {
    const instance = await DuckDBInstance.create(':memory:');
    conn = await instance.connect();
  });

  afterAll(() => conn?.closeSync());

  it('appendManifestRow writes one parseable JSONL line', () => {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH);
    const row = {
      arm: 'A0',
      model: 'qwen3:1.7b',
      questionId: 'T1',
      dataset: 'titanic',
      machine: 'test',
      peakRssBytes: 12345,
      timestamp: '2026-08-08T00:00:00.000Z',
    } as unknown as ManifestRow;
    appendManifestRow(MANIFEST_PATH, row);
    appendManifestRow(MANIFEST_PATH, row);
    const lines = readFileSync(MANIFEST_PATH, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ arm: 'A0', dataset: 'titanic', machine: 'test' });
  });

  it('runAndLog runs a real cell and appends dataset/machine/peakRssBytes/timestamp on top of the call result', async () => {
    if (existsSync(MANIFEST_PATH)) rmSync(MANIFEST_PATH);
    queueFetch([{ message: { content: JSON.stringify({ status: 'query', sql: 'SELECT 1', assumptions: [], result_shape: 'scalar' }) }, prompt_eval_count: 50, eval_count: 5 }]);

    const row = await runAndLog(MANIFEST_PATH, 'titanic', 'test-machine', {
      arm: 'A0',
      model: 'qwen3:1.7b',
      question: 'trivial',
      questionId: 'T0',
      ctx: emptyContext,
      conn,
      gold: { kind: 'scalar', scalar: 1 },
      allViewNames: [],
      correctViewName: null,
      numCtx: 16_384,
    });

    expect(row.bucket).toBe('correct');
    expect(row.dataset).toBe('titanic');
    expect(row.machine).toBe('test-machine');
    expect(row.peakRssBytes).toBeGreaterThan(0);
    expect(new Date(row.timestamp).toString()).not.toBe('Invalid Date');

    const lines = readFileSync(MANIFEST_PATH, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ dataset: 'titanic', machine: 'test-machine', bucket: 'correct' });
  });
});
