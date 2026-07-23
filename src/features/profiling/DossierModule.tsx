import { useEducationalPanel } from '../../app/useEducationalPanel';
import { useUIStore } from '../../stores/ui';
import { DatasetDossier } from './dossier/DatasetDossier';

/**
 * The DATA group's Blueprint destination (§13.1, D48/D68d/D70) — the promoted
 * post-ingest Verdict/overview the app opens on. A per-table finding routes to
 * the standalone Profile destination via `setActiveModule('profile', tableId)`,
 * carrying the target table as `activeTabId` (the generic sub-destination hint,
 * §21.7) since the Blueprint and Profile are separate top-level modules, not
 * nested view state within one. The skip-to-data escape hatch jumps to that same
 * per-table surface for the reader who wants the data, not the briefing.
 */
export function DossierModule() {
  const { setContent } = useEducationalPanel();
  const setActiveModule = useUIStore((state) => state.setActiveModule);

  const handleShowSql = (label: string, sql: string) => {
    setContent(
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-(--color-fg)">{label}</p>
        <pre className="overflow-x-auto rounded bg-(--color-border)/40 p-3 font-mono text-xs text-(--color-fg)">{sql}</pre>
      </div>,
    );
  };

  return (
    <DatasetDossier
      onOpenTable={(tableId) => setActiveModule('profile', tableId)}
      onNavigate={setActiveModule}
      onShowSql={handleShowSql}
      onSkipToData={() => setActiveModule('profile')}
    />
  );
}
