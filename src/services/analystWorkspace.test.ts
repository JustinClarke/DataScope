// A6's app-side guarantee: a tab the model pinned and a tab the user pinned are
// the same object.
//
// `chartsAndPins.test.ts` proves the core hands the host only a result and a
// title. This covers the half that only exists in the browser — that the host
// then authors an envelope indistinguishable from S5's two existing producers',
// because it goes through their single creation path rather than a fourth one.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tabWorkspace } from './analyst';
import { pinConsoleQuery } from './queryTabs';
import { useTabsStore } from '../stores/tabs';
import { useQueryStore, getSession, CONSOLE_SESSION } from '../stores/query';
import { TAB_KIND } from '../types/tabs';
import * as runPath from './runPath';
import type { OpSchemaField } from '../lib/analyst/types';

vi.mock('./runPath', async () => {
  const actual = await vi.importActual<typeof runPath>('./runPath');
  return { ...actual, requestRun: vi.fn() };
});

// The engine is never reached on this path — a pin adopts a result already in
// hand — but `services/analyst.ts` imports the worker module lazily, so the
// mock keeps the import graph off duckdb-wasm.
vi.mock('../workers/duckdb.worker', () => ({ duckDBEngine: { execute: vi.fn() } }));

const SCHEMA: OpSchemaField[] = [
  { name: 'month', type: 'DATE' },
  { name: 'revenue', type: 'DOUBLE' },
];

const PIN = {
  title: 'Monthly revenue',
  sql: 'SELECT month, revenue FROM monthly ORDER BY 1',
  resultId: 'r1',
  schema: SCHEMA,
  rows: [[1704067200000, 1200.5]] as unknown[][],
  rowCount: 1,
  nextOffset: null,
  elapsedMs: 4,
};

beforeEach(() => {
  useTabsStore.setState({ tabs: [], activeTabId: null });
  useQueryStore.setState({ sessions: {}, history: [], lastRunSession: CONSOLE_SESSION });
  vi.mocked(runPath.requestRun).mockReset();
});

describe('the tab workspace seam', () => {
  it('opens a query tab carrying the SQL the user can edit and re-run', async () => {
    const { id } = await tabWorkspace.pin(PIN);

    const tab = useTabsStore.getState().tabs.find((t) => t.id === id);
    expect(tab?.type).toBe('query');
    expect(tab?.subject).toBe('Monthly revenue');
    // The model's title reached the label and nothing else: the envelope's other
    // fields are the app's, set by `openTab`'s own parameters.
    expect(tab?.initializer).toBeNull();

    const session = getSession(id);
    expect(session.sql).toBe(PIN.sql);
    expect(session.lastRunSql).toBe(PIN.sql);
    expect(session.result?.rows).toEqual(PIN.rows);
    // Adopted by reference, never re-executed — Pin's own behaviour since S5.
    expect(runPath.requestRun).not.toHaveBeenCalled();
  });

  it('carries the paging handle, so the grid pages the rest like any other result', async () => {
    const { id } = await tabWorkspace.pin({ ...PIN, rowCount: 5000, nextOffset: 1 });
    expect(getSession(id).result).toMatchObject({ resultId: 'r1', nextOffset: 1, rowCount: 5000 });
  });

  it('opens an empty, runnable tab when compaction released the body', async () => {
    const { id } = await tabWorkspace.pin({ ...PIN, rows: [], rowCount: 0 });
    const session = getSession(id);
    // No result adopted — showing zero rows would read as "that is the answer".
    expect(session.result).toBeNull();
    expect(session.sql).toBe(PIN.sql);
  });

  it('is the same producer as pin-from-console: per-instance, never deduped', async () => {
    useQueryStore.getState().setSql(CONSOLE_SESSION, 'SELECT 1');
    const fromConsole = pinConsoleQuery();
    const first = await tabWorkspace.pin(PIN);
    const second = await tabWorkspace.pin(PIN);

    // Two pins of the same result are two keepers, deliberately (§13.3).
    expect(first.id).not.toBe(second.id);
    expect(useTabsStore.getState().tabs).toHaveLength(3);
    for (const tab of useTabsStore.getState().tabs) {
      expect(TAB_KIND[tab.type]).toBe('artifact');
      expect(tab.type).toBe('query');
    }
    // And each has its own session, which is what "independently editable and
    // re-runnable" means concretely.
    useQueryStore.getState().setSql(first.id, 'SELECT 2');
    expect(getSession(second.id).sql).toBe(PIN.sql);
    expect(getSession(fromConsole!).sql).toBe('SELECT 1');
  });
});
