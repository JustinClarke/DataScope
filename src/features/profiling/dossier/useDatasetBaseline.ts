// The Dossier's data layer (§13.1, D48) — gathers cross-table insights, time
// coverage, and (override-applied) inferred relationships, then builds the
// deterministic Verdict baseline and layers the D56 synthesis upgrade on top.
// Extracted from `DatasetDossier` at W4 (D71): the Workbench's persistent
// map-header Verdict band (`features/map/VerdictBand.tsx`) needs the same
// `{ tableInsights, timeCoverage, edges, baseline }` data `DatasetDossier`
// already computed inline, and duplicating that fetch-and-build logic a
// second time would be real duplication, not just similar-looking code.
// `DatasetDossier`'s own output is unchanged by this extraction — only where
// the logic lives moves.
import { useEffect, useMemo, useState } from 'react';
import { useRelationshipsStore } from '../../../stores/relationships';
import { useInferredEdgesStore } from '../../../stores/inferredEdges';
import {
  buildDatasetVerdict,
  type TableInsights,
  type TimeCoverageRow,
} from '../../../lib/dossier';
import { applyOverrides, type FkEdge, type RelationshipOverrides } from '../../../lib/relationshipInference';
import { JOIN_GRAPH_ENABLED } from '../../../lib/featureFlags';
import { loadDossierInsights, loadTimeCoverage } from '../../../services/dossier';
import { loadRelationships } from '../../../services/relationships';
import { useSynthesisUpgrade } from './useSynthesisUpgrade';
import type { Dataset, FactRef, RankedAction, TableRegistryEntry } from '../../../types';

export interface DatasetBaseline {
  tableInsights: TableInsights[] | null;
  timeCoverage: TimeCoverageRow[] | null;
  /** Override-applied FK edges — `[]` whenever `JOIN_GRAPH_ENABLED` is off. */
  edges: FkEdge[];
  /** The deterministic Verdict baseline `useSynthesisUpgrade` re-phrases/re-ranks in place; `null` while profiling. */
  baseline: { headlineFact: FactRef; actions: RankedAction[] } | null;
  tailored: boolean;
  paused: boolean;
  /** Non-null only once the D56 edge synthesis upgrade has accepted a replacement headline. */
  headlineFact: FactRef | null;
  actions: RankedAction[] | null;
}

export function useDatasetBaseline(tables: TableRegistryEntry[], datasets: Dataset[]): DatasetBaseline {
  // Stable per-field selection — a fresh-object selector would loop under Zustand v5.
  const removed = useRelationshipsStore((s) => s.removed);
  const repointed = useRelationshipsStore((s) => s.repointed);
  const added = useRelationshipsStore((s) => s.added);
  const overrides = useMemo<RelationshipOverrides>(() => ({ removed, repointed, added }), [removed, repointed, added]);
  const [tableInsights, setTableInsights] = useState<TableInsights[] | null>(null);
  const [timeCoverage, setTimeCoverage] = useState<TimeCoverageRow[] | null>(null);
  const [inferredEdges, setInferredEdges] = useState<FkEdge[]>([]);

  const classifiedCount = tables.filter((t) => t.columns).length;

  useEffect(() => {
    if (classifiedCount === 0) {
      setTableInsights(null);
      setTimeCoverage(null);
      setInferredEdges([]);
      useInferredEdgesStore.getState().setEdges([]);
      return;
    }
    let cancelled = false;
    setTableInsights(null);
    setTimeCoverage(null);
    void loadDossierInsights(tables).then((result) => {
      if (!cancelled) setTableInsights(result);
    });
    void loadTimeCoverage(tables).then((result) => {
      if (!cancelled) setTimeCoverage(result);
    });
    // The join graph needs at least two tables; below that it stays schema-only.
    // The fetched (pre-override) result is mirrored into `useInferredEdgesStore`
    // — this effect stays the single `loadRelationships` fetch owner; the W7
    // inspector reads the mirrored store instead of re-fetching (see that
    // store's own header comment).
    if (JOIN_GRAPH_ENABLED && classifiedCount >= 2) {
      void loadRelationships(tables).then((edges) => {
        if (!cancelled) {
          setInferredEdges(edges);
          useInferredEdgesStore.getState().setEdges(edges);
        }
      });
    } else {
      setInferredEdges([]);
      useInferredEdgesStore.getState().setEdges([]);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.map((t) => `${t.id}:${t.columns?.length ?? 0}`).join(','), classifiedCount]);

  const liveTableNames = useMemo(() => tables.map((t) => t.tableName), [tables]);
  const edges = useMemo(
    () => (JOIN_GRAPH_ENABLED ? applyOverrides(inferredEdges, overrides, liveTableNames) : []),
    [inferredEdges, overrides, liveTableNames],
  );

  const baseline = useMemo(() => {
    if (tables.length === 0 || tableInsights === null || timeCoverage === null) return null;
    const latest = [...datasets].sort((a, b) => a.ingestedAt.localeCompare(b.ingestedAt)).at(-1) ?? null;
    const verdict = buildDatasetVerdict({
      datasetLabel: datasets.length > 1 ? `${datasets.length} datasets` : (latest?.name ?? 'Dataset'),
      tables,
      tableInsights,
      timeCoverage,
      profiledAt: latest?.ingestedAt ?? '',
      relationships: edges,
    });
    return { headlineFact: verdict.headlineFact, actions: verdict.actions };
  }, [tables, tableInsights, timeCoverage, datasets, edges]);

  const { tailored, paused, headlineFact, actions } = useSynthesisUpgrade(tables, baseline);

  return { tableInsights, timeCoverage, edges, baseline, tailored, paused, headlineFact, actions };
}
