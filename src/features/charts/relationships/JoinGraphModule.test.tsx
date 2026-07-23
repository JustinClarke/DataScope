import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { JoinGraphModule } from './JoinGraphModule';
import { useDatasetsStore } from '../../../stores/datasets';
import { useRelationshipsStore } from '../../../stores/relationships';
import * as relationshipsService from '../../../services/relationships';
import type { FkEdge } from '../../../lib/relationshipInference';
import type { ClassifiedColumn, TableRegistryEntry } from '../../../types';

vi.mock('../../../services/relationships', async () => {
  const actual = await vi.importActual<typeof relationshipsService>('../../../services/relationships');
  return { ...actual, loadRelationships: vi.fn() };
});

function col(name: string, semanticType: ClassifiedColumn['semanticType']): ClassifiedColumn {
  return { name, semanticType, physicalType: 'BIGINT', cardinality: 100, nullPercentage: 0, min: null, max: null, mean: null, stdDev: null };
}

function table(id: string, tableName: string, columns: ClassifiedColumn[]): TableRegistryEntry {
  return { id, tableName, datasetId: 'ds', origin: 'sample', rowCount: 100, columnCount: columns.length, memoryBytes: 1000, createdAt: new Date().toISOString(), columns };
}

const orders = table('o', 'orders', [col('order_id', 'Identifier'), col('customer_id', 'Categorical')]);
const customers = table('c', 'customers', [col('id', 'Identifier')]);

const edge: FkEdge = {
  id: 'orders.customer_id->customers.id',
  childTable: 'orders',
  childColumn: 'customer_id',
  parentTable: 'customers',
  parentColumn: 'id',
  containment: 0.87,
  coverage: 0.9,
  parentKeyUniqueness: 1,
  nameAgreement: true,
  confidence: 'confident',
  confidenceScore: 0.87,
  evidence: '87% of `orders.customer_id` values appear in `customers.id`',
  source: 'inferred',
};

const loadRelationships = vi.mocked(relationshipsService.loadRelationships);

describe('JoinGraphModule', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    useRelationshipsStore.getState().clearOverrides();
    loadRelationships.mockReset();
  });

  it('gates on two tables — one table shows the needs-two-tables message', () => {
    useDatasetsStore.setState({ tables: [orders] });
    const { getByText } = render(<JoinGraphModule />);
    expect(getByText(/needs at least two tables/i)).toBeTruthy();
    expect(loadRelationships).not.toHaveBeenCalled();
  });

  it('renders the beta badge and the inferred edge, labeled confident', async () => {
    loadRelationships.mockResolvedValue([edge]);
    useDatasetsStore.setState({ tables: [orders, customers] });
    const { getByText, container } = render(<JoinGraphModule />);
    await waitFor(() => expect(container.querySelector(`[data-testid="edge-${edge.id}"]`)).toBeTruthy());
    expect(getByText('beta')).toBeTruthy();
    expect(container.querySelector(`[data-confidence="confident"]`)).toBeTruthy();
    expect(getByText(/Confident \(1\)/)).toBeTruthy();
  });

  it('shows evidence on edge selection and removes the edge via the override store', async () => {
    loadRelationships.mockResolvedValue([edge]);
    useDatasetsStore.setState({ tables: [orders, customers] });
    const { getByText, container } = render(<JoinGraphModule />);
    await waitFor(() => expect(container.querySelector(`[data-testid="edge-${edge.id}"]`)).toBeTruthy());

    fireEvent.click(container.querySelector(`[data-testid="edge-${edge.id}"]`)!);
    expect(getByText(/values appear in/i)).toBeTruthy();

    fireEvent.click(getByText('Remove edge'));
    await waitFor(() => expect(container.querySelector(`[data-testid="edge-${edge.id}"]`)).toBeNull());
    expect(useRelationshipsStore.getState().removed).toEqual(['orders.customer_id']);
    // The removed edge is listed with a restore control.
    expect(within(container).getByText('Restore')).toBeTruthy();
  });

  it('reports an honest empty state when nothing is found, still offering a manual add', async () => {
    loadRelationships.mockResolvedValue([]);
    useDatasetsStore.setState({ tables: [orders, customers] });
    const { getByText } = render(<JoinGraphModule />);
    await waitFor(() => expect(getByText(/No relationship candidates found/i)).toBeTruthy());
    expect(getByText('Add relationship')).toBeTruthy();
  });
});
