// @vitest-environment node
//
// `runPilot.ts` is the one thing in this directory nothing else has ever
// driven end-to-end: a real analyst core over a real `Executor`, a real MCP
// session, a real ledger `EvalEngine`, and `tasks.ts`'s gold files, all wired
// together the way the actual pilot run will use them. Every other test in
// this directory either mocks the provider *and* the session
// (`forkedHarness.test.ts`), or exercises the ledger without a session at all
// (`tasks.test.ts`). This file is the missing link — proving the wiring
// itself is correct — using a scripted `AIProvider` in place of the live,
// currently-unreachable Ollama host (see `qwen3Provider.ts`'s file header:
// "Not yet run against a live host").
//
// It does not, and cannot yet, prove anything about `qwen3:8b` itself —
// only that `runOneTask` correctly assembles the executor, the catalog, the
// MCP session, the ledger, the gold-file checker, and `runExperiment15A`
// into one working path, and that `toMeteredComplete` correctly bridges an
// `AIProvider` into the `MeteredComplete` shape the harness expects.
import { describe, expect, it } from 'vitest';
import type { AIProvider, ProviderMessage, ProviderTurn } from '../../../src/types';
import type { CallUsage } from './contracts';
import type { MeteredComplete } from './forkedHarness';
import type { Qwen3CallUsage } from './qwen3Provider';
import { runOneTask, toMeteredComplete } from './runPilot';
import { taskById } from './tasks';

const USAGE: Qwen3CallUsage = {
  rawPromptTokens: 20,
  rawOutputTokens: 10,
  billablePromptTokens: 20,
  billableOutputTokens: 10,
  outputTokensEstimated: false,
};

function turn(text: string, calls: ProviderTurn['calls'] = []): ProviderTurn {
  return { text, calls };
}

/**
 * A scripted `MeteredComplete` — `runOneTask` takes this shape directly (not
 * an `AIProvider`), matching `forkedHarness.test.ts`'s own `scriptedComplete`
 * helper and matching production: `main()` builds exactly one
 * `MeteredComplete` via `toMeteredComplete` and passes it to every task, it
 * does not hand `runOneTask` a raw provider to adapt itself. `toMeteredComplete`
 * gets its own dedicated unit tests below instead.
 */
function scriptedComplete(script: readonly ProviderTurn[]): MeteredComplete {
  let i = 0;
  const usage: CallUsage = { rawPromptTokens: 20, rawOutputTokens: 10, billablePromptTokens: 20, billableOutputTokens: 10 };
  return async (_messages: ProviderMessage[], _tools, options) => {
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const turn = script[Math.min(i, script.length - 1)];
    i += 1;
    return { turn, usage };
  };
}

const VALID_CHECKPOINT_NO_EVIDENCE = JSON.stringify({
  candidateClaims: [],
  caveats: ['no evidence gathered yet'],
  openWork: [],
  recommendedNextAction: 'run the count query',
});

describe('toMeteredComplete', () => {
  it('bridges an AIProvider call into {turn, usage} using onUsage as the side channel', async () => {
    let reportedUsage: Qwen3CallUsage | null = null;
    const provider: AIProvider = {
      id: 'x',
      async complete() {
        reportedUsage = USAGE;
        return turn('hi');
      },
    };
    const captured = { last: null as Qwen3CallUsage | null };
    // Mirrors what `createUsageTrackedQwen3Provider` actually does: call the
    // capture's setter as a side effect of `complete()`, before it resolves.
    const wrapped: AIProvider = {
      id: 'x',
      async complete(messages, tools, options) {
        const t = await provider.complete(messages, tools, options);
        captured.last = reportedUsage;
        return t;
      },
    };
    const complete = toMeteredComplete(wrapped, captured);
    const result = await complete([], [], {});
    expect(result.turn.text).toBe('hi');
    expect(result.usage).toEqual(USAGE);
  });

  it('throws rather than silently reporting stale usage when onUsage never fires', async () => {
    const provider: AIProvider = { id: 'x', async complete() { return turn('hi'); } };
    const complete = toMeteredComplete(provider, { last: null });
    await expect(complete([], [], {})).rejects.toThrow(/without reporting usage/);
  });
});

describe('runOneTask — real executor, real MCP session, real ledger, scripted provider', () => {
  it(
    'ec-priority-order-count: an unsatisfying phase one forces a checkpoint, a briefing, and a fork — control satisfies, treatment does not',
    async () => {
      const task = taskById('ec-priority-order-count')!;
      const complete = scriptedComplete([
        turn('nothing to report yet'), // phase 1: voluntary stop, no evidence -> unsatisfied
        turn(VALID_CHECKPOINT_NO_EVIDENCE), // checkpoint request, valid on the first try
        turn('querying', [{ id: 'c1', name: 'run_sql', input: { sql: 'SELECT COUNT(*) AS priority_count FROM orders WHERE is_priority' } }]), // control: correct query, satisfies immediately
        turn('querying something irrelevant', [{ id: 't1', name: 'run_sql', input: { sql: 'SELECT 1 AS unrelated' } }]), // treatment: does not satisfy
        turn('giving up'), // treatment: voluntary stop, still unsatisfied
      ]);

      const report = await runOneTask(task, complete, 8000);

      expect(report.result.kind).toBe('scored');
      if (report.result.kind !== 'scored') throw new Error('expected a scored result');
      expect(report.result.control).toEqual({ kind: 'scored', arm: 'control', terminalReason: 'satisfied', materialUnmetRequirements: [] });
      expect(report.result.treatment.kind).toBe('scored');
      if (report.result.treatment.kind === 'scored') {
        expect(report.result.treatment.terminalReason).toBe('exhausted');
        expect(report.result.treatment.materialUnmetRequirements).not.toEqual([]);
      }

      // The real ledger actually recorded round accounting for all three rounds —
      // proof `runOneTask`'s own engine wiring (not just `runExperiment15A`'s
      // in-memory return value) is correct.
      expect(report.roundAccounting.phase1?.actualProviderCalls).toBe(1);
      expect(report.roundAccounting.control?.usage.calls).toBe(1);
      expect(report.roundAccounting.treatment?.usage.calls).toBe(2);
    },
    20_000,
  );

  it('ec-distinct-customer-count: full requirement satisfaction inside phase one short-circuits to satisfied_before_boundary', async () => {
    const task = taskById('ec-distinct-customer-count')!;
    const complete = scriptedComplete([
      turn('querying', [{ id: 'c1', name: 'run_sql', input: { sql: 'SELECT COUNT(DISTINCT customer) AS distinct_customers FROM orders' } }]),
    ]);

    const report = await runOneTask(task, complete, 8000);

    expect(report.result).toEqual({ kind: 'satisfied_before_boundary' });
    // Neither phase two ever ran, so there is nothing to read back for them.
    expect(report.roundAccounting.control ?? null).toBeNull();
    expect(report.roundAccounting.treatment ?? null).toBeNull();
  });

  it('a phase-one transport failure is caught as a runner_error for that task, not a crash', async () => {
    const task = taskById('ec-priority-order-count')!;
    const complete: MeteredComplete = async () => {
      throw new Error('simulated transport failure');
    };

    const report = await runOneTask(task, complete, 8000);

    expect(report.result).toEqual({ kind: 'runner_error', message: 'simulated transport failure' });
  });
});
