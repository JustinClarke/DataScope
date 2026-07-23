import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent } from '@testing-library/react';
import type { ViewSpec } from '../../../types';
import { VIEWSPEC_VERSION } from '../../../lib/viewspec';
import { ViewSpecRenderer, type DossierInteractions } from './ViewSpecRenderer';

function noopInteractions(): DossierInteractions {
  return {
    onOpenTable: vi.fn(),
    onSelectAction: vi.fn(),
    onExportReport: vi.fn(),
    onCopyForAI: vi.fn(),
    onShowSql: vi.fn(),
  };
}

const identityProps = { datasetLabel: 'acme', tableCount: 1, totalRows: 100, totalBytes: 1000, profiledAt: '2026-07-19T00:00:00.000Z', grain: 'orders: 100 rows' };
const verdictProps = { headlineFact: { statement: 'no single dominant finding', sql: '', snapshot: '2026-07-19T00:00:00.000Z', confidence: 'high' as const, provenance: 'schema' as const }, actions: [] };

function specWith(tier2and3Panels: ViewSpec['panels']): ViewSpec {
  return {
    viewspecVersion: VIEWSPEC_VERSION,
    panels: [
      { componentId: 'identity-band', tier: 1, props: identityProps },
      { componentId: 'verdict', tier: 1, props: verdictProps },
      ...tier2and3Panels,
    ],
  };
}

describe('ViewSpecRenderer', () => {
  // Verdict text repeats across specs, so isolate each render (no global RTL cleanup is configured).
  afterEach(() => cleanup());

  it('renders tier-1 panels unconditionally with no disclosure control when there is nothing below tier 1', () => {
    const { getByText, queryByText } = render(<ViewSpecRenderer spec={specWith([])} interactions={noopInteractions()} />);
    expect(getByText('no single dominant finding')).toBeTruthy();
    expect(queryByText('See full profile')).toBeNull();
  });

  it('hides tier 2/3 panels until "See full profile" is clicked', () => {
    const spec = specWith([{ componentId: 'table-strip', tier: 2, props: { tables: [{ id: 't1', tableName: 'orders', rowCount: 10 }] } }]);
    const tableButton = (_content: string, node: Element | null) => node?.tagName === 'BUTTON' && node.textContent === 'orders 10';
    const { getByText, queryByText } = render(<ViewSpecRenderer spec={spec} interactions={noopInteractions()} />);
    expect(queryByText(tableButton)).toBeNull();
    fireEvent.click(getByText('See full profile'));
    expect(getByText(tableButton)).toBeTruthy();
    expect(getByText('Hide full profile')).toBeTruthy();
  });

  it('groups revealed panels under their D69 layer headings, none shown at tier 1', () => {
    const spec = specWith([
      { componentId: 'table-strip', tier: 2, props: { tables: [{ id: 't1', tableName: 'orders', rowCount: 10 }] } },
      {
        componentId: 'top-insights',
        tier: 3,
        props: { insights: [{ tableName: 'orders', description: '3% duplicate rows', rule: 'duplicates', sql: 'SELECT 1' }] },
      },
    ]);
    const { getByText, queryByText, getByRole } = render(<ViewSpecRenderer spec={spec} interactions={noopInteractions()} />);
    // Before disclosure: the tier-1 Verdict is up but no layer heading exists.
    expect(getByText('no single dominant finding')).toBeTruthy();
    expect(queryByText('Signals & relationships')).toBeNull();
    expect(queryByText('Per-table detail')).toBeNull();
    // After disclosure: the heuristics (tier 2) and profiling (tier 3) layers appear as labeled sections.
    fireEvent.click(getByText('See full profile'));
    expect(getByRole('region', { name: 'Signals & relationships' })).toBeTruthy();
    expect(getByRole('region', { name: 'Per-table detail' })).toBeTruthy();
    expect(getByText('3% duplicate rows')).toBeTruthy();
  });

  it('shows an error instead of rendering when a panel carries an invalid tier', () => {
    const spec = {
      viewspecVersion: VIEWSPEC_VERSION,
      panels: [{ componentId: 'identity-band', tier: 4, props: identityProps }],
    } as unknown as ViewSpec;
    const { getByText } = render(<ViewSpecRenderer spec={spec} interactions={noopInteractions()} />);
    expect(getByText(/Invalid view spec/)).toBeTruthy();
  });
});
