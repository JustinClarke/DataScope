// The chat's execution wiring (A4 defect iv).
//
// `runSql: (sql) => runChartQuery(sql)` discarded `askAI`'s signal argument, and
// `runChartQuery` accepted no signal to forward it to — so the abort wiring
// below cancelled the *provider* while the query ran to completion in the
// worker and the UI reported it cancelled. It also meant the AI path never
// entered the shared guarded run path. Both are call-site facts, so they are
// asserted at the call site.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { AITurn } from '../../types';

const askAI = vi.fn(async (_question: string, _deps: unknown): Promise<AITurn> => ({
  id: 't', role: 'assistant', content: 'answer', createdAt: '',
}));
const CORE = { engine: 'duckdb-wasm' } as never;

vi.mock('../../services/ai', () => ({ askAI }));
vi.mock('../../services/analyst', () => ({ analystCore: () => CORE }));
vi.mock('../../services/aiProvider', () => ({
  resolveProvider: () => ({ provider: { id: 'mock', complete: vi.fn() } }),
}));

const { AIChatModule } = await import('./AIChatModule');

async function ask(question = 'how many rows?') {
  const { getByLabelText } = render(<AIChatModule />);
  fireEvent.change(getByLabelText('Ask a question about your data'), { target: { value: question } });
  fireEvent.click(getByLabelText('Send'));
  await waitFor(() => expect(askAI).toHaveBeenCalled());
  return askAI.mock.calls[0][1] as unknown as { core: unknown; signal?: AbortSignal; runSql?: unknown };
}

beforeEach(() => {
  cleanup();
  askAI.mockClear();
});

describe('AIChatModule — execution wiring', () => {
  it('runs the turn through the analyst core, not a bare query runner', async () => {
    const deps = await ask();
    expect(deps.core).toBe(CORE);
    // The seam that could not carry a signal is gone entirely, not merely unused.
    expect(deps.runSql).toBeUndefined();
  });

  it('hands the core a live caller signal, so a superseded question can cancel the query', async () => {
    const deps = await ask();
    expect(deps.signal).toBeInstanceOf(AbortSignal);
    expect(deps.signal?.aborted).toBe(false);
  });
});
