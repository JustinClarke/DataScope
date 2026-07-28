import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { DatasetMap } from './DatasetMap';
import { useDatasetsStore } from '../../stores/datasets';
import { useSelectionStore } from '../../stores/selection';
import { useRelationshipsStore } from '../../stores/relationships';
import { EducationalPanelProvider } from '../../app/EducationalPanelContext';
import type { ClassifiedColumn, Dataset, TableRegistryEntry } from '../../types';

// `DatasetDossier`'s "Show SQL" action calls `useEducationalPanel()`, which
// throws outside its provider — `WorkbenchShell` supplies it in the real app
// (W3); tests supply it here.
function renderMap() {
  return render(
    <EducationalPanelProvider>
      <DatasetMap />
    </EducationalPanelProvider>,
  );
}

// useDatasetBaseline (DatasetDossier's data layer, shared with VerdictBand/Erd
// at W4) reaches the DuckDB worker through these two services — mocked the
// same way JoinGraphModule.test.tsx/InsightFeed.test.tsx do, so this stays a
// UI test.
const { loadDossierInsightsMock, loadTimeCoverageMock } = vi.hoisted(() => ({
  loadDossierInsightsMock: vi.fn(),
  loadTimeCoverageMock: vi.fn(),
}));
vi.mock('../../services/dossier', () => ({
  loadDossierInsights: loadDossierInsightsMock,
  loadTimeCoverage: loadTimeCoverageMock,
}));
const { loadRelationshipsMock } = vi.hoisted(() => ({ loadRelationshipsMock: vi.fn() }));
vi.mock('../../services/relationships', () => ({ loadRelationships: loadRelationshipsMock }));
const { openDestinationMock } = vi.hoisted(() => ({ openDestinationMock: vi.fn() }));
// Partial mock (W5): OptionsStrip also reaches `isDestinationReady`/`MODULE_LABELS`
// from this module, so a full replacement would leave those undefined.
vi.mock('../../services/navigation', async () => {
  const actual = await vi.importActual<typeof import('../../services/navigation')>('../../services/navigation');
  return { ...actual, openDestination: openDestinationMock };
});

function col(name: string, semanticType: ClassifiedColumn['semanticType']): ClassifiedColumn {
  return {
    name,
    semanticType,
    physicalType: 'BIGINT',
    cardinality: 100,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

function table(id: string, tableName: string, columns: ClassifiedColumn[]): TableRegistryEntry {
  return {
    id,
    tableName,
    datasetId: 'd1',
    origin: 'sample',
    rowCount: 100,
    columnCount: columns.length,
    memoryBytes: 1000,
    createdAt: new Date().toISOString(),
    columns,
  };
}

const orders = table('o', 'orders', [col('order_id', 'Identifier'), col('customer_id', 'Categorical')]);
const customers = table('c', 'customers', [col('id', 'Identifier')]);
const dataset: Dataset = {
  id: 'd1',
  name: 'orders.csv',
  sourceType: 'file',
  tableNames: ['orders', 'customers'],
  ingestedAt: new Date().toISOString(),
};

describe('DatasetMap', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    loadDossierInsightsMock.mockReset().mockResolvedValue([]);
    loadTimeCoverageMock.mockReset().mockResolvedValue([]);
    loadRelationshipsMock.mockReset().mockResolvedValue([]);
    openDestinationMock.mockReset();
    useDatasetsStore.setState({ datasets: [], tables: [], workerStatus: 'idle', workerError: null });
    useSelectionStore.getState().clearSelection();
    useRelationshipsStore.getState().clearOverrides();
  });

  it('shows a drop-a-dataset placeholder with zero tables, mounting neither face', () => {
    const { getByText, queryByTestId } = renderMap();
    expect(getByText(/Drop a dataset/)).toBeTruthy();
    expect(queryByTestId('erd')).toBeNull();
    expect(queryByTestId('dataset-map-multi')).toBeNull();
  });

  it('one table renders the single-table Blueprint face (DatasetDossier) with no ERD', async () => {
    useDatasetsStore.setState({ datasets: [dataset], tables: [orders] });
    const { getByText, queryByTestId } = renderMap();
    await waitFor(() => expect(getByText(/Skip to data/)).toBeTruthy());
    expect(queryByTestId('erd')).toBeNull();
    expect(queryByTestId('verdict-band')).toBeNull();
    // The Blueprint already renders its own tier-1 ranked-action band (D68c) —
    // the options strip is multi-table-only (W5), not duplicated here.
    expect(queryByTestId('options-strip')).toBeNull();
  });

  it("the single-table face's Skip to data reaches that table's Profile tab via the nav facade", async () => {
    useDatasetsStore.setState({ datasets: [dataset], tables: [orders] });
    const { getByText } = renderMap();
    await waitFor(() => expect(getByText(/Skip to data/)).toBeTruthy());
    fireEvent.click(getByText(/Skip to data/));
    expect(openDestinationMock).toHaveBeenCalledWith('profile', 'o');
  });

  it('two or more tables render the ERD hero and the Verdict band, no side panel ever', async () => {
    useDatasetsStore.setState({ datasets: [dataset], tables: [orders, customers] });
    const { getByTestId, queryByTestId } = renderMap();
    expect(getByTestId('erd')).toBeTruthy();
    await waitFor(() => expect(getByTestId('verdict-band-headline')).toBeTruthy());
    expect(queryByTestId('map-side-panel')).toBeNull();
    // The options strip (W5) renders above the multi-table face.
    expect(getByTestId('options-strip')).toBeTruthy();
  });

  it('selecting a table on the ERD does not open an inline side panel', async () => {
    useDatasetsStore.setState({ datasets: [dataset], tables: [orders, customers] });
    const { getByTestId, queryByTestId } = renderMap();
    fireEvent.click(getByTestId('erd-card-c'));
    await waitFor(() => expect(useSelectionStore.getState().selectedTableId).toBe('c'));
    expect(queryByTestId('map-side-panel')).toBeNull();
  });
});
