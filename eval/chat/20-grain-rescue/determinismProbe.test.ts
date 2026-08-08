// Validates DESIGN.md §4's determinism probe: the pure decision rule
// (summarizeDeterminismProbe) at and around the 95% threshold, and the live
// wrapper (runDeterminismProbe) against a mocked Ollama /api/chat, following
// this experiment area's existing fetch-mocking convention
// (17-duckdb-local-chat/chat.test.ts's queueFetch).
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../17-duckdb-local-chat/ollama';
import { DETERMINISM_PROBE_THRESHOLD, runDeterminismProbe, summarizeDeterminismProbe } from './determinismProbe';

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

function proposalResponse(sql: string): Record<string, unknown> {
  return {
    message: { content: JSON.stringify({ status: 'query', sql, assumptions: [], result_shape: 'scalar' }) },
    prompt_eval_count: 100,
    eval_count: 20,
  };
}

describe('summarizeDeterminismProbe (pure decision rule)', () => {
  it('20/20 identical -> rate 1.0, recommends N=2', () => {
    const result = summarizeDeterminismProbe('m', Array(20).fill('same'));
    expect(result.identicalRate).toBe(1);
    expect(result.recommendedN).toBe(2);
  });

  it('exactly at the 95% threshold recommends N=2 (boundary is inclusive)', () => {
    const responses = [...Array(19).fill('same'), 'different'];
    const result = summarizeDeterminismProbe('m', responses);
    expect(result.identicalRate).toBeCloseTo(DETERMINISM_PROBE_THRESHOLD, 5);
    expect(result.recommendedN).toBe(2);
  });

  it('just below the threshold (18/20 = 90%) recommends N=5', () => {
    const responses = [...Array(18).fill('same'), 'a', 'b'];
    const result = summarizeDeterminismProbe('m', responses);
    expect(result.identicalRate).toBeCloseTo(0.9, 5);
    expect(result.recommendedN).toBe(5);
  });

  it('uses the largest identical group, not just whether the first call matches the rest', () => {
    // First call is the outlier; 19 of the remaining 20 agree.
    const responses = ['outlier', ...Array(19).fill('same')];
    const result = summarizeDeterminismProbe('m', responses);
    expect(result.identicalRate).toBeCloseTo(19 / 20, 5);
    expect(result.recommendedN).toBe(2);
  });

  it('0 repeats is treated as non-deterministic (rate 0, N=5) rather than dividing by zero', () => {
    const result = summarizeDeterminismProbe('m', []);
    expect(result.identicalRate).toBe(0);
    expect(result.recommendedN).toBe(5);
  });
});

describe('runDeterminismProbe (live wrapper, mocked Ollama)', () => {
  const messages: ChatMessage[] = [{ role: 'user', content: 'What is the average order value?' }];

  it('all-identical responses across 5 calls -> rate 1.0, N=2', async () => {
    queueFetch(Array(5).fill(proposalResponse('SELECT 1')));
    const result = await runDeterminismProbe('qwen3:1.7b', messages, 5);
    expect(result.repeats).toBe(5);
    expect(result.identicalRate).toBe(1);
    expect(result.recommendedN).toBe(2);
  });

  it('3/5 identical, 2 different -> rate 0.6, N=5', async () => {
    queueFetch([
      proposalResponse('SELECT 1'),
      proposalResponse('SELECT 1'),
      proposalResponse('SELECT 1'),
      proposalResponse('SELECT 2'),
      proposalResponse('SELECT 3'),
    ]);
    const result = await runDeterminismProbe('qwen3:1.7b', messages, 5);
    expect(result.identicalRate).toBeCloseTo(0.6, 5);
    expect(result.recommendedN).toBe(5);
  });

  it('calls are sequential, not parallel — the Nth fetch reflects the Nth queued response in order', async () => {
    queueFetch([proposalResponse('SELECT 1'), proposalResponse('SELECT 2'), proposalResponse('SELECT 3')]);
    const result = await runDeterminismProbe('qwen3:1.7b', messages, 3);
    expect(result.responses).toEqual([
      JSON.stringify({ status: 'query', sql: 'SELECT 1', assumptions: [], result_shape: 'scalar' }),
      JSON.stringify({ status: 'query', sql: 'SELECT 2', assumptions: [], result_shape: 'scalar' }),
      JSON.stringify({ status: 'query', sql: 'SELECT 3', assumptions: [], result_shape: 'scalar' }),
    ]);
  });
});
