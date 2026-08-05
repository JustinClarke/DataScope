import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import { AITurnView } from './AITurnView';
import type { AITurn } from '../../types';

const { runInConsoleMock } = vi.hoisted(() => ({ runInConsoleMock: vi.fn() }));
vi.mock('../../services/runPath', () => ({ runInConsole: runInConsoleMock }));

describe('AITurnView — transcript audit trail (§11.1)', () => {
  it('renders a user question as a plain bubble with no accent wash', () => {
    const turn: AITurn = { id: 'u1', role: 'user', content: 'average fare by class', createdAt: '' };
    const { getByText } = render(<AITurnView turn={turn} />);
    const bubble = getByText('average fare by class');
    expect(bubble).toBeTruthy();
    expect(bubble.className).toContain('bg-(--color-elev)');
    expect(bubble.className).not.toContain('color-accent');
  });

  it('gives every assistant turn a ✦ Copilot who-label', () => {
    const turn: AITurn = { id: 'a1', role: 'assistant', content: 'Class 1 paid the most on average.', createdAt: '' };
    const { getByText } = render(<AITurnView turn={turn} />);
    expect(getByText('✦ Copilot')).toBeTruthy();
  });

  it('shows the suggested SQL and per-attempt execution log for every attempt', () => {
    const turn: AITurn = {
      id: 'a1',
      role: 'assistant',
      content: 'Class 1 paid the most on average.',
      createdAt: '',
      corrections: [{ from: 'fair', to: 'fare' }],
      attempts: [
        { attempt: 1, op: 'run_sql', sql: 'SELECT avg(fair) FROM t', status: 'error', executionTimeMs: 0, error: 'Binder Error: column "fair" not found' },
        { attempt: 2, op: 'run_sql', sql: 'SELECT class, avg(fare) FROM t GROUP BY class', status: 'ok', executionTimeMs: 6, rowCount: 3 },
      ],
      chart: { kind: 'chart', spec: { type: 'categorical', title: 'x', xField: 'class', yFields: ['avg_fare'] } },
    };
    const { getByText, container } = render(<AITurnView turn={turn} />);

    // Every generated query is visible.
    expect(container.textContent).toContain('SELECT avg(fair) FROM t');
    expect(container.textContent).toContain('SELECT class, avg(fare) FROM t GROUP BY class');
    // The execution log: failure, then success with rows + timing and the call marker.
    expect(container.textContent).toContain('✗ failed');
    expect(container.textContent).toContain('Binder Error');
    expect(container.textContent).toContain('3 rows · 6 ms');
    expect(container.textContent).toContain('call 2');
    // Stage-1 correction and stage-6 chart are surfaced.
    expect(getByText(/Read “fair” as “fare”/)).toBeTruthy();
    expect(container.textContent).toContain('Chart · categorical');
  });

  it('draws the chart when the turn carries its rows, through the shared chart panel (A6)', () => {
    const turn: AITurn = {
      id: 'a1',
      role: 'assistant',
      content: 'Revenue climbs through Q1.',
      createdAt: '',
      chart: { kind: 'chart', spec: { type: 'categorical', title: 'Revenue by product', xField: 'product', yFields: ['revenue'] } },
      chartResult: {
        columnNames: ['product', 'revenue'],
        columnTypes: ['VARCHAR', 'DOUBLE'],
        rows: [['A', 100], ['B', 80]],
        rowCount: 2,
        executionTimeMs: 4,
      },
    };
    const { container, getByRole } = render(<AITurnView turn={turn} />);

    // The panel, not the one-line label it replaces: the picker is the tell,
    // and the model's own title is what it opened on.
    expect(container.textContent).toContain('Revenue by product');
    expect(container.textContent).not.toContain('Chart · categorical');
    expect(getByRole('button', { name: 'Table' })).toBeTruthy();
  });

  it('renders a single aggregate value as a stat card', () => {
    const turn: AITurn = { id: 'a1', role: 'assistant', content: '', createdAt: '', chart: { kind: 'kpi', label: 'total orders', value: '1,204' } };
    const { container } = render(<AITurnView turn={turn} />);
    expect(container.textContent).toContain('1,204');
  });

  it('falls back to the label when the turn has a recommendation but no rows', () => {
    // A stage-6 recommendation whose result was released, or an older turn.
    const turn: AITurn = {
      id: 'a1',
      role: 'assistant',
      content: '',
      createdAt: '',
      chart: { kind: 'chart', spec: { type: 'categorical', title: 'x', xField: 'class', yFields: ['avg_fare'] } },
    };
    const { container } = render(<AITurnView turn={turn} />);
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

  it('offers a run action on a failed attempt too (S4, J5) — the error is often the thing worth seeing', () => {
    runInConsoleMock.mockReset();
    const turn: AITurn = {
      id: 'a1',
      role: 'assistant',
      content: '',
      createdAt: '',
      attempts: [
        { attempt: 1, sql: 'SELECT avg(fair) FROM t', status: 'error', executionTimeMs: 0, error: 'Binder Error' },
      ],
    };
    const { container } = render(<AITurnView turn={turn} />);

    fireEvent.click(within(container).getByRole('button', { name: /run/i }));
    expect(runInConsoleMock).toHaveBeenCalledWith('SELECT avg(fair) FROM t');
  });
});
