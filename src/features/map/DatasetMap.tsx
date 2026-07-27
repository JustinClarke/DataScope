// The dataset map — the Workbench's opening tab (W4, D71, master §13.3).
// One table: the single-table Blueprint face is `DatasetDossier` rendered
// unchanged (D48 "home moves, content survives verbatim" — with exactly one
// table, the Dossier's existing dataset-wide overview already *is* the
// single-table summary). Two or more: the multi-table ERD is the hero, with
// a persistent Verdict band and a selected-table side panel
// (`ProfileDashboard`, not the Dossier — see the leaf doc's scope call 3).
// No manual ERD/Blueprint toggle: face selection is structural on table
// count, matching the hallmark mock's two faces without duplicating the
// mock's own standalone demo toggle.
import { useDatasetsStore } from '../../stores/datasets';
import { useSelectionStore } from '../../stores/selection';
import { useEducationalPanel } from '../../app/useEducationalPanel';
import { openDestination } from '../../services/navigation';
import { useDatasetBaseline } from '../profiling/dossier/useDatasetBaseline';
import { DatasetDossier } from '../profiling/dossier/DatasetDossier';
import { ProfileDashboard } from '../profiling/ProfileDashboard';
import { Erd } from './Erd';
import { VerdictBand } from './VerdictBand';
import { OptionsStrip } from './OptionsStrip';
import type { Dataset, TableRegistryEntry } from '../../types';

function SingleTableBlueprint({ tableId }: { tableId: string }) {
  const { setContent } = useEducationalPanel();

  const handleShowSql = (label: string, sql: string) => {
    setContent(
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-(--color-fg)">{label}</p>
        <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-3 font-mono text-xs text-(--color-fg)">
          {sql}
        </pre>
      </div>,
    );
  };

  return (
    <DatasetDossier
      onOpenTable={(id) => openDestination('profile', id)}
      onNavigate={openDestination}
      onShowSql={handleShowSql}
      onSkipToData={() => openDestination('profile', tableId)}
    />
  );
}

function MultiTableMap({ tables, datasets }: { tables: TableRegistryEntry[]; datasets: Dataset[] }) {
  const selectedTableId = useSelectionStore((state) => state.selectedTableId);
  const selectTable = useSelectionStore((state) => state.selectTable);
  const selectedEdgeId = useSelectionStore((state) => state.selectedEdgeId);
  const selectEdge = useSelectionStore((state) => state.selectEdge);
  const selectColumn = useSelectionStore((state) => state.selectColumn);
  const { tableInsights, edges, baseline, tailored, paused, headlineFact } = useDatasetBaseline(tables, datasets);

  return (
    <div className="flex h-full" data-testid="dataset-map-multi">
      <div className="flex flex-1 flex-col overflow-hidden">
        <OptionsStrip tables={tables} tableInsights={tableInsights} selectedTableId={selectedTableId} />
        <VerdictBand
          tables={tables}
          datasets={datasets}
          baseline={baseline}
          tailored={tailored}
          paused={paused}
          headlineFact={headlineFact}
        />
        <Erd
          tables={tables}
          edges={edges}
          selectedTableId={selectedTableId}
          onSelectTable={selectTable}
          selectedEdgeId={selectedEdgeId}
          onSelectEdge={selectEdge}
          onSelectColumn={selectColumn}
        />
      </div>
      {selectedTableId && (
        <div
          data-testid="map-side-panel"
          className="w-96 flex-none overflow-auto border-l border-(--color-border) p-4"
        >
          <ProfileDashboard initialTableId={selectedTableId} />
        </div>
      )}
    </div>
  );
}

export function DatasetMap() {
  const tables = useDatasetsStore((state) => state.tables);
  const datasets = useDatasetsStore((state) => state.datasets);

  if (tables.length <= 1) {
    return tables.length === 1 ? (
      <SingleTableBlueprint tableId={tables[0].id} />
    ) : (
      <p className="text-center text-(--color-fg-muted)">Drop a dataset to get started.</p>
    );
  }

  return <MultiTableMap tables={tables} datasets={datasets} />;
}
