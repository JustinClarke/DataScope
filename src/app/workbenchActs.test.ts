import { describe, expect, it } from 'vitest';
import { selectWorkbenchAct, type WorkbenchAct } from './workbenchActs';
import type { WorkerStatus } from '../stores/datasets';

const ALL_STATUSES: WorkerStatus[] = ['idle', 'loading', 'compiling', 'ready', 'error'];

describe('selectWorkbenchAct — pure function of session state (§13.3)', () => {
  it('always returns shell once a dataset exists, regardless of worker status', () => {
    for (const workerStatus of ALL_STATUSES) {
      expect(selectWorkbenchAct({ hasDatasets: true, workerStatus })).toBe<WorkbenchAct>('shell');
    }
  });

  it('returns act1 while the worker is mid-ingest and no dataset exists yet', () => {
    expect(selectWorkbenchAct({ hasDatasets: false, workerStatus: 'loading' })).toBe<WorkbenchAct>('act1');
    expect(selectWorkbenchAct({ hasDatasets: false, workerStatus: 'compiling' })).toBe<WorkbenchAct>('act1');
  });

  it('returns act0 when idle, ready, or errored with no dataset yet', () => {
    expect(selectWorkbenchAct({ hasDatasets: false, workerStatus: 'idle' })).toBe<WorkbenchAct>('act0');
    expect(selectWorkbenchAct({ hasDatasets: false, workerStatus: 'ready' })).toBe<WorkbenchAct>('act0');
    expect(selectWorkbenchAct({ hasDatasets: false, workerStatus: 'error' })).toBe<WorkbenchAct>('act0');
  });
});
