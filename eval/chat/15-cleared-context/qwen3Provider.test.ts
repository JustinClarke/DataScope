import { describe, expect, it, vi } from 'vitest';
import {
  ContextTruncationError,
  createUsageTrackedQwen3Provider,
  resolveQwen3,
  usageFromChatBody,
  type Qwen3CallUsage,
} from './qwen3Provider';
import type { AITool, ProviderMessage } from '../../../src/types';

/** No live network call in this suite — same rule as `geminiProvider.test.ts`. */
function fakeFetch(response: unknown, init: { status?: number } = {}): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(response), { status: init.status ?? 200 })) as unknown as typeof fetch;
}

const chatBody = (over: Record<string, unknown> = {}) => ({
  message: { content: 'ok', ...(over.message as object) },
  prompt_eval_count: 500,
  eval_count: 40,
  ...over,
});

describe('usageFromChatBody', () => {
  it('reports billable equal to raw — Ollama has no billing and no prefix cache', () => {
    const usage = usageFromChatBody({ message: { content: 'hello' }, prompt_eval_count: 1000, eval_count: 200 });
    expect(usage).toEqual({
      rawPromptTokens: 1000,
      rawOutputTokens: 200,
      billablePromptTokens: 1000,
      billableOutputTokens: 200,
      outputTokensEstimated: false,
    });
  });

  it('trusts eval_count when a thinking trace is present and plainly counted', () => {
    // 400 characters of thinking is ~100 tokens; an eval_count of 260 is well
    // above that, so the trace was counted and the figure stands.
    const usage = usageFromChatBody({
      message: { content: 'answer', thinking: 'x'.repeat(400) },
      prompt_eval_count: 100,
      eval_count: 260,
    });
    expect(usage.rawOutputTokens).toBe(260);
    expect(usage.outputTokensEstimated).toBe(false);
  });

  it('substitutes an estimate when eval_count plainly excluded the thinking trace', () => {
    // Experiment 13's recorded hazard: 4000 characters of thinking is ~1000
    // tokens, so an eval_count of 12 cannot have included it. Counting 12 would
    // undercount raw output by two orders of magnitude, and 15A's efficiency
    // limb is verified findings per 1,000 raw tokens.
    const usage = usageFromChatBody({
      message: { content: 'short', thinking: 'y'.repeat(4000) },
      prompt_eval_count: 100,
      eval_count: 12,
    });
    expect(usage.rawOutputTokens).toBe(Math.ceil((5 + 4000) / 4));
    expect(usage.outputTokensEstimated).toBe(true);
    // Billable follows raw rather than staying on the discredited count.
    expect(usage.billableOutputTokens).toBe(usage.rawOutputTokens);
  });

  it('throws rather than falling back to a sentinel when prompt_eval_count is missing', () => {
    expect(() => usageFromChatBody({ message: { content: 'x' }, eval_count: 10 })).toThrow(/missing token counts/);
  });

  it('throws when eval_count is missing', () => {
    expect(() => usageFromChatBody({ message: { content: 'x' }, prompt_eval_count: 10 })).toThrow(/missing token counts/);
  });
});

describe('resolveQwen3', () => {
  const tags = (over: Record<string, unknown> = {}) => ({
    models: [
      {
        name: 'qwen3:8b',
        digest: 'abc123def456',
        details: { quantization_level: 'Q4_K_M', parameter_size: '8.2B' },
        capabilities: ['completion', 'tools'],
        ...over,
      },
    ],
  });

  it('resolves the exact digest the protocol requires frozen before a scored call', async () => {
    const resolved = await resolveQwen3(fakeFetch(tags()));
    expect(resolved).toEqual({
      tag: 'qwen3:8b',
      digest: 'abc123def456',
      quantizationLevel: 'Q4_K_M',
      parameterSize: '8.2B',
      capabilities: ['completion', 'tools'],
    });
  });

  it('throws when the tag is absent, naming what the host does have', async () => {
    await expect(resolveQwen3(fakeFetch({ models: [{ name: 'llama3:8b', digest: 'x' }] }))).rejects.toThrow(
      /was not present with a digest.*llama3:8b/s,
    );
  });

  it('throws when the model cannot emit tool calls', async () => {
    // The check that has to happen at preflight rather than at call 400 of a
    // scored run: 13 drove this model through constrained JSON precisely
    // because structured tool calling was not settled for the small models
    // this repo has used.
    await expect(resolveQwen3(fakeFetch(tags({ capabilities: ['completion'] })))).rejects.toThrow(
      /without the "tools" capability/,
    );
  });

  it('throws on a tag entry carrying no digest', async () => {
    await expect(resolveQwen3(fakeFetch({ models: [{ name: 'qwen3:8b' }] }))).rejects.toThrow(/not present with a digest/);
  });
});

describe('createUsageTrackedQwen3Provider', () => {
  const usages: Qwen3CallUsage[] = [];
  const providerWith = (response: unknown, numCtx?: number) => {
    usages.length = 0;
    return createUsageTrackedQwen3Provider({
      fetchImpl: fakeFetch(response),
      onUsage: (u) => usages.push(u),
      ...(numCtx === undefined ? {} : { numCtx }),
    });
  };
  const ask = (provider: ReturnType<typeof createUsageTrackedQwen3Provider>, tools: AITool[] = []) =>
    provider.complete([{ role: 'user', content: 'go' }] as ProviderMessage[], tools);

  it('reports usage for the call through onUsage', async () => {
    await ask(providerWith(chatBody()));
    expect(usages).toEqual([
      {
        rawPromptTokens: 500,
        rawOutputTokens: 40,
        billablePromptTokens: 500,
        billableOutputTokens: 40,
        outputTokensEstimated: false,
      },
    ]);
  });

  it('parses every tool call in a turn, not just the first', async () => {
    const turn = await ask(
      providerWith(
        chatBody({
          message: {
            content: '',
            tool_calls: [
              { function: { name: 'get_schema', arguments: {} } },
              { function: { name: 'column_stats', arguments: { table: 'orders', column: 'amount' } } },
            ],
          },
        }),
      ),
    );
    expect(turn.calls.map((c) => c.name)).toEqual(['get_schema', 'column_stats']);
    expect(turn.calls[1]!.input).toEqual({ table: 'orders', column: 'amount' });
    // Ollama supplies no call id, so the seam mints one per call — the harness
    // pairs each `tool` response message to it.
    expect(new Set(turn.calls.map((c) => c.id)).size).toBe(2);
  });

  it('accepts arguments handed back as a JSON string', async () => {
    const turn = await ask(
      providerWith(
        chatBody({
          message: { content: '', tool_calls: [{ function: { name: 'sample_rows', arguments: '{"table":"orders"}' } }] },
        }),
      ),
    );
    expect(turn.calls[0]!.input).toEqual({ table: 'orders' });
  });

  it('keeps a malformed-argument call as a call, so the failure is counted rather than hidden', async () => {
    // The amendment converts small-model tool-call fragility into a measured
    // quantity. Dropping the call here would remove it from the failed-operation
    // count that measurement depends on.
    const turn = await ask(
      providerWith(
        chatBody({ message: { content: '', tool_calls: [{ function: { name: 'run_sql', arguments: 'not json' } }] } }),
      ),
    );
    expect(turn.calls).toHaveLength(1);
    expect(turn.calls[0]!.input).toEqual({});
  });

  it('throws ContextTruncationError when the prompt reaches the served window', async () => {
    // The confound the amendment exists to prevent: the control arm carries the
    // whole phase-one transcript, so it is the arm that would silently truncate.
    const provider = providerWith(chatBody({ prompt_eval_count: 4090 }), 4096);
    await expect(ask(provider)).rejects.toThrow(ContextTruncationError);
  });

  it('does not report usage for a truncated call', async () => {
    const provider = providerWith(chatBody({ prompt_eval_count: 4090 }), 4096);
    await expect(ask(provider)).rejects.toThrow(ContextTruncationError);
    // Checked before onUsage precisely so a cut-off call never contaminates the
    // totals the verdict is computed from.
    expect(usages).toEqual([]);
  });

  it('allows a prompt comfortably inside the window', async () => {
    const provider = providerWith(chatBody({ prompt_eval_count: 3000 }), 4096);
    await expect(ask(provider)).resolves.toBeDefined();
    expect(usages).toHaveLength(1);
  });

  it('surfaces a transport failure rather than returning an empty turn', async () => {
    const provider = createUsageTrackedQwen3Provider({
      fetchImpl: fakeFetch({ error: 'model not found' }, { status: 404 }),
      onUsage: (u) => usages.push(u),
    });
    await expect(ask(provider)).rejects.toThrow(/ollama http 404/);
  });
});
