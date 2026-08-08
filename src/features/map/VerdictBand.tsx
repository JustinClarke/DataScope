// The dataset map's persistent Verdict band (W4, D71, master §13.3) —
// "identity + the one headline FactRef under D68c tier-1 discipline," a
// slimmer echo of the full Blueprint's tier-1 Verdict (which also carries
// the top-3 ranked actions; this band deliberately doesn't — action routing
// stays the Blueprint face's job, not duplicated here). Takes its data as
// props rather than calling `useDatasetBaseline` itself — `DatasetMap` calls
// the hook once and hands the result to both this band and `Erd`, so the
// two mounting together never issues the underlying insight/relationship
// queries twice.
import type {
  Dataset,
  FactRef,
  RankedAction,
  TableRegistryEntry,
} from "../../types";

interface VerdictBandProps {
  tables: TableRegistryEntry[];
  datasets: Dataset[];
  baseline: { headlineFact: FactRef; actions: RankedAction[] } | null;
  tailored: boolean;
  paused: boolean;
  /** Non-null only once the D56 edge synthesis upgrade has accepted a replacement headline. */
  headlineFact: FactRef | null;
}

export function VerdictBand({
  tables,
  datasets,
  baseline,
  tailored,
  paused,
  headlineFact: aiHeadline,
}: VerdictBandProps) {
  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  const latestDataset =
    [...datasets]
      .sort((a, b) => a.ingestedAt.localeCompare(b.ingestedAt))
      .at(-1) ?? null;
  const datasetLabel =
    datasets.length > 1
      ? `${datasets.length} datasets`
      : (latestDataset?.name ?? "Dataset");

  const headline = aiHeadline ?? baseline?.headlineFact ?? null;

  return (
    <div
      data-testid="verdict-band"
      className="flex flex-col gap-1 border-b border-(--color-border) px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-(--color-fg)">
          {datasetLabel}
        </span>
        <span className="font-mono text-xs text-(--color-fg-muted)">
          {tables.length} tables · {totalRows.toLocaleString()} rows
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
            title="The cloud synthesis endpoint is temporarily paused by the operator. The headline below is the full deterministic Verdict."
          >
            Cloud features paused
          </span>
        )}
      </div>
      {headline ? (
        <p
          data-testid="verdict-band-headline"
          className="text-sm text-(--color-fg-muted)"
        >
          {headline.statement}
        </p>
      ) : (
        <p className="text-sm text-(--color-fg-muted)">Profiling…</p>
      )}
    </div>
  );
}
