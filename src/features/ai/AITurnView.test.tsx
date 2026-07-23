import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AITurnView } from './AITurnView';
import type { AITurn } from '../../types';

describe('AITurnView — transcript audit trail (§11.1)', () => {
  it('renders a user question as a plain bubble', () => {
    const turn: AITurn = { id: 'u1', role: 'user', content: 'average fare by class', createdAt: '' };
    const { getByText } = render(<AITurnView turn={turn} />);
    expect(getByText('average fare by class')).toBeTruthy();
  });

  it('shows the suggested SQL and per-attempt execution log for every attempt', () => {
    const turn: AITurn = {
      id: 'a1',
      role: 'assistant',
      content: 'Class 1 paid the most on average.',
      createdAt: '',
      corrections: [{ from: 'fair', to: 'fare' }],
      attempts: [
        { attempt: 1, sql: 'SELECT avg(fair) FROM t', status: 'error', executionTimeMs: 0, error: 'Binder Error: column "fair" not found' },
        { attempt: 2, sql: 'SELECT class, avg(fare) FROM t GROUP BY class', status: 'ok', executionTimeMs: 6, rowCount: 3 },
      ],
      chart: { kind: 'chart', spec: { type: 'categorical', title: 'x', xField: 'class', yFields: ['avg_fare'] } },
    };
    const { getByText, container } = render(<AITurnView turn={turn} />);

    // Every generated query is visible.
    expect(container.textContent).toContain('SELECT avg(fair) FROM t');
    expect(container.textContent).toContain('SELECT class, avg(fare) FROM t GROUP BY class');
    // The execution log: failure, then success with rows + timing and the retry marker.
    expect(container.textContent).toContain('✗ failed');
    expect(container.textContent).toContain('Binder Error');
    expect(container.textContent).toContain('3 rows · 6 ms');
    expect(container.textContent).toContain('retry 1');
    // Stage-1 correction and stage-6 chart are surfaced.
    expect(getByText(/Read “fair” as “fare”/)).toBeTruthy();
    expect(container.textContent).toContain('Chart · categorical');
  });

  it('renders a clean error turn', () => {
    const turn: AITurn = { id: 'e1', role: 'assistant', content: '', createdAt: '', error: 'The AI provider timed out.' };
    const { getByText } = render(<AITurnView turn={turn} />);
    expect(getByText('The AI provider timed out.')).toBeTruthy();
  });

  it('discloses the D3 Ollama overflow when the turn finished on it (2026-07-23)', () => {
    const turn: AITurn = { id: 'o1', role: 'assistant', content: 'Answer.', createdAt: '', servedByOllamaOverflow: true };
    const { getByText } = render(<AITurnView turn={turn} />);
    expect(getByText(/finished on your local Ollama endpoint/i)).toBeTruthy();
  });
});
