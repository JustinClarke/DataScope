import { SkipForward } from "lucide-react";
import { useDatasetsStore } from "../../../stores/datasets";
import { buildDossierViewSpec } from "../../../lib/dossier";
import { useDatasetBaseline } from "./useDatasetBaseline";
import {
  buildStructureReport,
  downloadStructureReport,
} from "../../../lib/structureReport";
import { downloadDspsHtml } from "../../../lib/dspsHtml";
import { buildAIContext } from "../../../lib/aiContext";
import type { RankedAction } from "../../../types";
import type { SidebarModule } from "../../../stores/ui";
import { ViewSpecRenderer } from "./ViewSpecRenderer";

interface DatasetDossierProps {
  onOpenTable: (tableId: string) => void;
  onNavigate: (
    module: SidebarModule,
    tabId?: string | null,
    prefill?: Record<string, unknown> | null,
  ) => void;
  onShowSql: (label: string, sql: string) => void;
  /** The D68d "skip to data" escape hatch — jumps past the Blueprint to the raw data surface for the §2 second audience. */
  onSkipToData: () => void;
}

/**
 * The post-ingest landing view (§13.1, D48) — packages the already-shipped
 * profiling/classification/capability/insight modules into one scrollable
 * overview. Gathers (services/dossier.ts + services/relationships.ts),
 * assembles (lib/dossier.ts's deterministic ViewSpec producer), and renders
 * (ViewSpecRenderer). When the Join Graph (D24) is enabled it also infers the
 * relationships, applies any manual overrides, and threads the *accepted* graph
 * into the hero thumbnail, the structure report, and the "Copy for AI" block;
 * with the graph cut, all three degrade to schema-only.
 */
export function DatasetDossier({
  onOpenTable,
  onNavigate,
  onShowSql,
  onSkipToData,
}: DatasetDossierProps) {
  const tables = useDatasetsStore((state) => state.tables);
  const datasets = useDatasetsStore((state) => state.datasets);
  const {
    tableInsights,
    timeCoverage,
    edges,
    tailored,
    paused,
    headlineFact: aiHeadline,
    actions: aiActions,
  } = useDatasetBaseline(tables, datasets);

  if (tables.length === 0) {
    return (
      <p className="text-center text-(--color-fg-muted)">
        Drop a dataset to get started.
      </p>
    );
  }

  if (tableInsights === null || timeCoverage === null) {
    return <p className="text-sm text-(--color-fg-muted)">Profiling…</p>;
  }

  const latestDataset =
    [...datasets]
      .sort((a, b) => a.ingestedAt.localeCompare(b.ingestedAt))
      .at(-1) ?? null;
  const datasetLabel =
    datasets.length > 1
      ? `${datasets.length} datasets`
      : (latestDataset?.name ?? "Dataset");
  const profiledAt = latestDataset?.ingestedAt ?? new Date().toISOString();

  const spec = buildDossierViewSpec({
    datasetLabel,
    tables,
    tableInsights,
    timeCoverage,
    profiledAt,
    relationships: edges,
  });

  // The validated edge upgrade replaces the Verdict's headline/actions *in
  // place* (ADR-010's replace-in-place rule as built): the deterministic spec
  // above already painted, and only the two seam-validated fields are swapped —
  // a degraded or rejected seam leaves its deterministic value untouched.
  const renderedSpec =
    aiHeadline !== null || aiActions !== null
      ? {
          ...spec,
          panels: spec.panels.map((panel) =>
            panel.componentId === "verdict"
              ? {
                  ...panel,
                  props: {
                    ...panel.props,
                    ...(aiHeadline !== null
                      ? { headlineFact: aiHeadline }
                      : {}),
                    ...(aiActions !== null ? { actions: aiActions } : {}),
                  },
                }
              : panel,
          ),
        }
      : spec;

  const handleExportReport = () => {
    downloadStructureReport(buildStructureReport(tables, tableInsights, edges));
  };

  const handleExportHtml = () => {
    downloadDspsHtml(buildStructureReport(tables, tableInsights, edges));
  };

  const handleCopyForAI = () => {
    void navigator.clipboard?.writeText(buildAIContext(tables, edges));
  };

  // A ranked action routes to its real module (D68a) and carries it there
  // "on the answer" (D68e) — its `ThreadConfig.prefilledConfig` rides along
  // as `onNavigate`'s third argument for the destination module to consume
  // (`useThreadPrefill`). A profile-bound action (a missingness or
  // key-column finding) opens that table's profile in place when it names
  // one; a chart-shaped action names which Charts sub-tab to land on via
  // `action.tab` (D68d — chart sub-types are internal tabs now, not separate
  // modules); every other action just switches the active sidebar module.
  const handleSelectAction = (action: RankedAction) => {
    const { prefilledConfig } = action.prefill;
    if (action.module === "profile") {
      const tableName = prefilledConfig.tableName;
      const target =
        typeof tableName === "string"
          ? tables.find((t) => t.tableName === tableName)
          : undefined;
      if (target) {
        onNavigate("profile", target.id, prefilledConfig);
        return;
      }
    }
    onNavigate(action.module, action.tab ?? null, prefilledConfig);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* The Blueprint identity + the D68d escape hatch, sticky so the "skip to
          data" jump stays reachable however far the profile is scrolled. The
          deterministic Verdict below is the complete surface with AI off; the
          edge-synthesis and WebLLM upgrades layer onto it as async badges. */}
      <div className="sticky top-0 z-10 -mx-6 flex items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-bg)/95 px-6 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
            Blueprint
          </span>
          {tailored && (
            <span
              className="rounded-full bg-(--color-accent)/10 px-2 py-0.5 text-[10px] font-medium text-(--color-accent)"
              title="Re-phrased and re-ranked for this dataset by the edge — the underlying facts are unchanged."
            >
              Tailored to your data
            </span>
          )}
          {paused && (
            <span
              className="rounded-full bg-(--color-fg-muted)/10 px-2 py-0.5 text-[10px] font-medium text-(--color-fg-muted)"
              title="The cloud synthesis endpoint is temporarily paused by the operator. Everything below is the full deterministic Blueprint."
            >
              Cloud features paused
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSkipToData}
          className="flex items-center gap-1 rounded text-xs font-medium text-(--color-accent) hover:underline"
        >
          Skip to data
          <SkipForward size={13} aria-hidden="true" />
        </button>
      </div>
      <ViewSpecRenderer
        spec={renderedSpec}
        interactions={{
          onOpenTable,
          onSelectAction: handleSelectAction,
          onExportReport: handleExportReport,
          onExportHtml: handleExportHtml,
          onCopyForAI: handleCopyForAI,
          onShowSql,
        }}
      />
    </div>
  );
}
