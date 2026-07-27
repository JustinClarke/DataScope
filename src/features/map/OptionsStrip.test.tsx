import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { OptionsStrip } from './OptionsStrip';
import type { ClassifiedColumn, SemanticType, TableRegistryEntry } from '../../types';
import type { SidebarModule } from '../../stores/ui';

const { openDestinationMock, isDestinationReadyMock, actualRef } = vi.hoisted(() => ({
  openDestinationMock: vi.fn(),
  isDestinationReadyMock: vi.fn<(module: SidebarModule) => boolean>(),
  actualRef: {} as { isDestinationReady: (module: SidebarModule) => boolean },
}));
vi.mock('../../services/navigation', async () => {
  const actual = await vi.importActual<typeof import('../../services/navigation')>('../../services/navigation');
  actualRef.isDestinationReady = actual.isDestinationReady;
  return { ...actual, openDestination: openDestinationMock, isDestinationReady: isDestinationReadyMock };
});

function col(semanticType: SemanticType, name: string): ClassifiedColumn {
  return {
    name,
    semanticType,
    physicalType: 'DOUBLE',
    cardinality: 10,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

function table(id: string, tableName: string, columns: ClassifiedColumn[], rowCount: number): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: 'd1',
    origin: 'file',
    rowCount,
    columnCount: columns.length,
    memoryBytes: 1000,
    createdAt: '2026-07-25T00:00:00.000Z',
    columns,
  };
}

// orders: identifier-only, uninteresting and never the largest.
// regions: one categorical column -> a categorical-breakdown generic action.
// metrics: one quantitative column, largest -> both a distribution generic
// action and the profile floor action target it. No correlation action
// exists (only one quantitative column total), so nothing here is
// dataset-wide/unprefilled — every action names a specific table.
const orders = table('a', 'orders', [col('Identifier', 'id')], 10);
const regions = table('b', 'regions', [col('Categorical', 'region')], 5);
const metrics = table('c', 'metrics', [col('Quantitative', 'amount')], 500);
const tables = [orders, regions, metrics];

describe('OptionsStrip', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    openDestinationMock.mockReset();
    isDestinationReadyMock.mockReset();
    isDestinationReadyMock.mockImplementation(actualRef.isDestinationReady);
  });

  it('with no selection, shows the full dataset-wide ranked list', () => {
    const { getByTestId } = render(<OptionsStrip tables={tables} tableInsights={[]} selectedTableId={null} />);
    expect(getByTestId('strip-action-charts-categorical')).toBeTruthy();
    expect(getByTestId('strip-action-charts-distribution')).toBeTruthy();
    expect(getByTestId('strip-action-profile')).toBeTruthy();
  });

  it('a ready destination (profile) renders enabled and opens on click', () => {
    const { getByTestId } = render(<OptionsStrip tables={tables} tableInsights={[]} selectedTableId={null} />);
    const button = getByTestId('strip-action-profile') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    expect(openDestinationMock).toHaveBeenCalledWith('profile', undefined, { tableName: 'metrics' });
  });

  it('a W7.5-wired destination (charts) renders enabled and opens on click, carrying its chart sub-type', () => {
    const { getByTestId } = render(<OptionsStrip tables={tables} tableInsights={[]} selectedTableId={null} />);
    const button = getByTestId('strip-action-charts-distribution') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    expect(openDestinationMock).toHaveBeenCalledWith('charts', 'distribution', expect.any(Object));
  });

  it('selecting metrics keeps only the actions scoped to it', () => {
    const { getByTestId, queryByTestId } = render(
      <OptionsStrip tables={tables} tableInsights={[]} selectedTableId="c" />,
    );
    expect(getByTestId('strip-action-charts-distribution')).toBeTruthy();
    expect(getByTestId('strip-action-profile')).toBeTruthy();
    expect(queryByTestId('strip-action-charts-categorical')).toBeNull();
  });

  it('selecting a table with no scoped or dataset-wide actions renders the empty state', () => {
    const { getByText, queryByTestId } = render(
      <OptionsStrip tables={tables} tableInsights={[]} selectedTableId="a" />,
    );
    expect(getByText('No suggested actions for this selection.')).toBeTruthy();
    expect(queryByTestId('strip-action-charts-categorical')).toBeNull();
    expect(queryByTestId('strip-action-charts-distribution')).toBeNull();
    expect(queryByTestId('strip-action-profile')).toBeNull();
  });

  it('exactly one button — the first rendered — carries the ranked-top marker (V5)', () => {
    const { container } = render(<OptionsStrip tables={tables} tableInsights={[]} selectedTableId={null} />);
    const buttons = container.querySelectorAll('[data-testid^="strip-action-"]');
    expect(buttons.length).toBeGreaterThan(1);
    expect(buttons[0]?.textContent).toContain('▲ top');
    Array.from(buttons)
      .slice(1)
      .forEach((button) => expect(button.textContent).not.toContain('▲ top'));
  });

  it('never renders the ranked-top marker when the top action is not ready (V5)', () => {
    isDestinationReadyMock.mockReturnValue(false);
    const { container } = render(<OptionsStrip tables={tables} tableInsights={[]} selectedTableId={null} />);
    expect(container.querySelectorAll('[data-testid^="strip-action-"]').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('▲ top');
  });
});
