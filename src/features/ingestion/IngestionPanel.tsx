import { useCallback, useState } from "react";
import { DropZone } from "./DropZone";
import { SamplePicker } from "./SamplePicker";
import { UrlInputForm } from "./UrlInputForm";
import { TableList } from "./TableList";
import {
  TelemetryPanel,
  type TelemetryPhase,
  type TelemetryStats,
} from "./TelemetryPanel";
import { FormatRejectionModal } from "./FormatRejectionModal";
import { SummaryToast } from "./SummaryToast";
import { SAMPLE_MANIFEST } from "./samples";
import { detectFormat, isFormatRejection } from "./formatPolicy";
import { decideSizeTier, refusalMessage } from "./aggregateSize";
import { postIngestLandingTarget } from "./landing";
import { isZipFile } from "./zip";
import { tabMemoryMB } from "./tabMemory";
import {
  loadDataset,
  loadFiles,
  loadUrl,
  refreshTableFromSource,
  removeTable,
  IngestionError,
  type SkippedFile,
} from "../../services/ingestion";
import { runTransform } from "../../services/transforms";
import { useDatasetsStore } from "../../stores/datasets";
import { useUIStore } from "../../stores/ui";
import { useSettingsStore } from "../../stores/settings";
import { useDspsReceiverStore } from "../../stores/dspsReceiver";
import { formatBytes } from "../../lib/formatBytes";
import {
  estimateHeadroomExceeded,
  estimatedFootprintBytes,
} from "../../lib/memoryHeadroom";
import { parseDsps } from "../../lib/dsps";
import type { StructureReport } from "../../lib/structureReport";

interface IngestError {
  message: string;
  isModal: boolean;
  ariaLabel?: string;
}

type SizeBanner =
  { kind: "warn"; footprintBytes: number } | { kind: "sampled" };

interface BatchToast {
  ingestedCount: number;
  skipped: SkippedFile[];
}

interface RedoOffer {
  tableName: string;
  generatingSql: string;
}

const BUSY_PHASES: TelemetryPhase[] = ["fetching", "loading-engine", "parsing"];

// D48/D70: opens on the Blueprint (the promoted Dossier) after ingest — unless
// the D68d "skip to data" preference is on, in which case the expert/returning
// user lands straight on the per-table profile instead.
function navigateToPostIngestLanding() {
  const target = postIngestLandingTarget(
    useSettingsStore.getState().skipToData,
  );
  useUIStore.getState().setActiveModule(target);
}

export function IngestionPanel() {
  const [phase, setPhase] = useState<TelemetryPhase>("idle");
  const [stats, setStats] = useState<TelemetryStats | null>(null);
  const [error, setError] = useState<IngestError | null>(null);
  const [toast, setToast] = useState<BatchToast | null>(null);
  const [aggregateWarningBytes, setAggregateWarningBytes] = useState<
    number | null
  >(null);
  const [sizeBanner, setSizeBanner] = useState<SizeBanner | null>(null);
  const [relayDisclosure, setRelayDisclosure] = useState(false);
  const [redoOffer, setRedoOffer] = useState<RedoOffer | null>(null);
  const [redoing, setRedoing] = useState(false);
  const [refreshingTableId, setRefreshingTableId] = useState<string | null>(
    null,
  );
  const [activeSampleId, setActiveSampleId] = useState<string | null>(null);

  const busy = BUSY_PHASES.includes(phase);

  // Single non-zip file — the 01-file-drop flow, unchanged. Batches (folder
  // drop, multi-select, or any drop containing a .zip) go through
  // runBatchIngest below instead, so a zip is never seen here as a rejected
  // format — handleFiles routes it to the batch path before this runs.
  const runIngest = useCallback(async (source: File | string) => {
    setError(null);
    setToast(null);
    setAggregateWarningBytes(null);
    setSizeBanner(null);

    if (source instanceof File) {
      const detected = detectFormat(source.name);
      if (isFormatRejection(detected)) {
        // Every rejected format (.xlsx, .pdf, ...) gets the modal — xlsx's
        // uses D8's exact copy, everything else the generic unsupported message.
        setError({ message: detected.message, isModal: true });
        return;
      }

      // Same "decide before any read" gate services/ingestion.ts enforces
      // internally — checked here too so a refused file never spins up the
      // engine just to be told no, matching the format-rejection precedent
      // above.
      const tier = decideSizeTier(
        source.size,
        estimateHeadroomExceeded(source.size),
      );
      if (tier === "refuse") {
        setError({
          message: refusalMessage(source.size),
          isModal: true,
          ariaLabel: "File too large",
        });
        return;
      }
      if (tier === "warn") {
        setSizeBanner({
          kind: "warn",
          footprintBytes: estimatedFootprintBytes(source.size),
        });
      } else if (tier === "sampled") {
        setSizeBanner({ kind: "sampled" });
      }

      setStats({
        label: source.name,
        sizeBytes: source.size,
        format: detected,
      });
    } else {
      const sample = SAMPLE_MANIFEST.find((s) => s.id === source);
      setStats({
        label: sample?.label ?? source,
        sizeBytes: 0,
        format: "sample",
      });
      setActiveSampleId(source);
    }

    setPhase("loading-engine");
    const start = performance.now();

    try {
      setPhase("parsing");
      const dataset = await loadDataset(source);
      const elapsedMs = performance.now() - start;
      const newTables = useDatasetsStore
        .getState()
        .tables.filter((t) => t.datasetId === dataset.id);
      const rowCount = newTables.reduce((sum, t) => sum + t.rowCount, 0);

      setStats((prev) =>
        prev
          ? {
              ...prev,
              rowCount,
              columnCount: newTables[0]?.columnCount,
              elapsedMs,
              tabMemoryMB: tabMemoryMB(),
            }
          : prev,
      );
      setPhase("done");
      navigateToPostIngestLanding();
    } catch (err) {
      setPhase("error");
      setError({
        message:
          err instanceof IngestionError
            ? err.message
            : "Something went wrong while loading this file.",
        isModal: false,
      });
    } finally {
      setActiveSampleId(null);
    }
  }, []);

  // Tier 1 API ingestion (§7.4) — direct browser fetch of a pasted URL.
  // `loadUrl` only learns the response's size tier once bytes have actually
  // arrived (unlike a file's pre-emptive size check on File.size), so the
  // warn/sampled banner here is set from its result rather than before the
  // call. A CORS-blocked URL retries transparently through the Tier-2 relay
  // (07-connectivity/02-api-tier2-relay) inside loadUrl itself — this
  // callback only renders the outcome: `result.usedRelay` drives the §5.2
  // disclosure note, and a relay-side rate-limit/pause surfaces through the
  // same error banner every other ingest failure uses (its message is
  // already the user-facing copy, no separate UI state needed).
  const runIngestUrl = useCallback(async (url: string) => {
    setError(null);
    setToast(null);
    setAggregateWarningBytes(null);
    setSizeBanner(null);
    setRelayDisclosure(false);
    setStats({ label: url, sizeBytes: 0, format: "api" });
    setPhase("fetching");
    const start = performance.now();

    try {
      const result = await loadUrl(url, (pagesFetched, bytesAccumulated) => {
        setStats((prev) =>
          prev ? { ...prev, pagesFetched, sizeBytes: bytesAccumulated } : prev,
        );
      });
      const elapsedMs = performance.now() - start;
      const newTables = useDatasetsStore
        .getState()
        .tables.filter((t) => t.datasetId === result.dataset.id);
      const rowCount = newTables.reduce((sum, t) => sum + t.rowCount, 0);

      setStats((prev) =>
        prev
          ? {
              ...prev,
              rowCount,
              columnCount: newTables[0]?.columnCount,
              elapsedMs,
              tabMemoryMB: tabMemoryMB(),
              sizeBytes: result.bytesAccumulated,
            }
          : prev,
      );

      if (result.sizeTier === "sampled") {
        setSizeBanner({ kind: "sampled" });
      } else if (result.sizeTier === "warn") {
        setSizeBanner({
          kind: "warn",
          footprintBytes: estimatedFootprintBytes(result.bytesAccumulated),
        });
      }
      setRelayDisclosure(result.usedRelay);

      setPhase("done");
      // The §5.2 disclosure note above renders only while this panel is
      // mounted — auto-navigating in the same tick would unmount it before
      // it ever paints (batched with the state updates above), so a relay
      // ingest stays here instead of jumping to Blueprint. The table is
      // already visible in TableList below; the user moves on manually.
      if (!result.usedRelay) navigateToPostIngestLanding();
    } catch (err) {
      setPhase("error");
      setError({
        message:
          err instanceof IngestionError
            ? err.message
            : "Something went wrong while fetching this URL.",
        isModal: false,
      });
    }
  }, []);

  // Folder drop, multi-select, and ZIP batches (§7.5, D13/D30) — one Dataset,
  // many tables, unsupported/failed files collected into one summary toast
  // rather than aborting or popping a modal per file.
  const runBatchIngest = useCallback(async (files: File[]) => {
    setError(null);
    setToast(null);
    setAggregateWarningBytes(null);
    setSizeBanner(null);

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    setStats({
      label: `${files.length} files`,
      sizeBytes: totalBytes,
      format: "batch",
    });
    setPhase("loading-engine");
    const start = performance.now();

    try {
      setPhase("parsing");
      const result = await loadFiles(files);
      const elapsedMs = performance.now() - start;
      const newTables = useDatasetsStore
        .getState()
        .tables.filter((t) => t.datasetId === result.dataset.id);
      const rowCount = newTables.reduce((sum, t) => sum + t.rowCount, 0);

      setStats((prev) =>
        prev
          ? { ...prev, rowCount, elapsedMs, tabMemoryMB: tabMemoryMB() }
          : prev,
      );
      setPhase("done");
      // The batch summary toast below still renders into this now-hidden
      // panel's local state — a real, flagged gap (not fixed here): a
      // skip-heavy batch's toast goes unseen unless the user navigates back
      // to Ingest. Fixing it means promoting batch-summary toasts to a
      // cross-module notification, out of scope for the landing-module choice
      // itself.
      navigateToPostIngestLanding();
      setToast({
        ingestedCount: result.dataset.tableNames.length,
        skipped: result.skipped,
      });
      if (result.aggregateWarning)
        setAggregateWarningBytes(result.aggregateBytes);
      // Per-table detail lives on TableList's persistent, never-silently-
      // dismissed badge; this is just the same-moment heads-up the
      // single-file path gets.
      if (newTables.some((t) => t.sampled)) setSizeBanner({ kind: "sampled" });
    } catch (err) {
      setPhase("error");
      setError({
        message:
          err instanceof IngestionError
            ? err.message
            : "Something went wrong while loading these files.",
        isModal: false,
      });
    }
  }, []);

  // The universal `.dsps` receiver (D62) — a dropped `.dsps` file never goes
  // through ingestion at all: it's read as text, parsed locally (zero network
  // call), and handed to the read-only viewer via its own store. A malformed
  // or unreadable/wrong-major-version file surfaces as this panel's ordinary
  // error banner rather than crashing the viewer.
  const openDspsFile = useCallback(async (file: File) => {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      useDspsReceiverStore.getState().fail(`"${file.name}" isn't valid JSON.`);
      return;
    }
    const result = parseDsps<StructureReport>(json);
    if (!result.ok) {
      useDspsReceiverStore
        .getState()
        .fail(
          `"${file.name}" isn't a DSPS document this version of DataScope can read (saw ${result.seenVersion}).`,
        );
      return;
    }
    useDspsReceiverStore.getState().open(result.doc);
  }, []);

  // Multi-select must behave identically to a folder drop (§18): both arrive
  // here as a flat File[] from DropZone with no way (or need) to tell them
  // apart, so both take the same branch below.
  const handleFiles = useCallback(
    (files: File[]) => {
      if (files.length === 1 && files[0].name.toLowerCase().endsWith(".dsps")) {
        void openDspsFile(files[0]);
      } else if (files.length === 1 && !isZipFile(files[0])) {
        void runIngest(files[0]);
      } else {
        void runBatchIngest(files);
      }
    },
    [runIngest, runBatchIngest, openDspsFile],
  );

  // "Refresh from source" (§7.4) — re-runs an API-sourced table's original
  // pull and replaces it in place. Reuses the same telemetry/size-banner/
  // relay-disclosure state the URL-ingest flow above renders through, since
  // this is the same tier cascade against the same kind of response; `busy`
  // (from `phase`) disables the drop zone/URL form for the duration too, so
  // no second ingest can interleave DuckDB writes with this one.
  const handleRefresh = useCallback(async (tableId: string) => {
    const table = useDatasetsStore
      .getState()
      .tables.find((t) => t.id === tableId);
    if (!table) return;

    setError(null);
    setSizeBanner(null);
    setRelayDisclosure(false);
    setRefreshingTableId(tableId);
    setStats({ label: table.tableName, sizeBytes: 0, format: "api" });
    setPhase("fetching");
    const start = performance.now();

    try {
      const result = await refreshTableFromSource(
        tableId,
        (pagesFetched, bytesAccumulated) => {
          setStats((prev) =>
            prev
              ? { ...prev, pagesFetched, sizeBytes: bytesAccumulated }
              : prev,
          );
        },
      );
      const elapsedMs = performance.now() - start;
      const refreshed = useDatasetsStore
        .getState()
        .tables.find((t) => t.id === tableId);

      setStats((prev) =>
        prev
          ? {
              ...prev,
              rowCount: refreshed?.rowCount,
              columnCount: refreshed?.columnCount,
              elapsedMs,
              tabMemoryMB: tabMemoryMB(),
              sizeBytes: result.bytesAccumulated,
            }
          : prev,
      );

      if (result.sizeTier === "sampled") {
        setSizeBanner({ kind: "sampled" });
      } else if (result.sizeTier === "warn") {
        setSizeBanner({
          kind: "warn",
          footprintBytes: estimatedFootprintBytes(result.bytesAccumulated),
        });
      }
      setRelayDisclosure(result.usedRelay);
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setError({
        message:
          err instanceof IngestionError
            ? err.message
            : `Couldn't refresh "${table.tableName}" — the previous data is unchanged.`,
        isModal: false,
      });
    } finally {
      setRefreshingTableId(null);
    }
  }, []);

  // Undo (§12.1) for a derived table *is* removing it — TableList already
  // relabels the same control "Undo" for those rows. What's new here: the
  // table's generating SQL is captured before it's dropped so a "Redo" offer
  // can replay it, since removeTable itself only knows the id, not the SQL
  // that produced the table it's about to purge.
  const handleRemove = useCallback((tableId: string) => {
    const table = useDatasetsStore
      .getState()
      .tables.find((t) => t.id === tableId);
    const redo =
      table?.origin === "derived" && table.generatingSql
        ? { tableName: table.tableName, generatingSql: table.generatingSql }
        : null;
    void removeTable(tableId).then(() => {
      if (redo) setRedoOffer(redo);
    });
  }, []);

  const handleRedo = useCallback(async () => {
    if (!redoOffer) return;
    setRedoing(true);
    try {
      await runTransform(redoOffer.generatingSql);
      setRedoOffer(null);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : "Redo failed.",
        isModal: false,
      });
    } finally {
      setRedoing(false);
    }
  }, [redoOffer]);

  return (
    <div className="flex flex-col gap-5">
      {/* V6d built the mock's `.ingest` grid here — the drop zone spanning both
          rows of a 1.3fr/1fr split with the URL form over the samples beside
          it. That split is superseded, not abandoned: Act 0's own viewport-fit
          frame is now the two-column grid (`WorkbenchShell.tsx`), and this
          panel *is* its right column, so re-splitting a ~640px column at `lg:`
          would leave a 330px drop target beside a 250px sidebar. The three
          entry points stack in the order the mock reads them instead.
          Everything below — the telemetry, the status blocks V6a voiced, the
          toast and the table list — is re-slotted, never re-styled. */}
      <div>
        <DropZone onFiles={handleFiles} disabled={busy} />
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-(--color-rule)" />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-(--color-ink-3)">
          or paste a link
        </span>
        <div className="h-px flex-1 bg-(--color-rule)" />
      </div>

      <div>
        <UrlInputForm onSubmit={runIngestUrl} disabled={busy} />
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-(--color-rule)" />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-(--color-ink-3)">
          or try a sample
        </span>
        <div className="h-px flex-1 bg-(--color-rule)" />
      </div>

      <div>
        <SamplePicker
          onSelect={runIngest}
          disabled={busy}
          activeId={activeSampleId}
        />
      </div>

      {!activeSampleId && <TelemetryPanel phase={phase} stats={stats} />}

      {error && !error.isModal && (
        <div className="rounded-lg border border-(--color-error)/40 bg-(--color-error)/5 p-4 text-sm text-(--color-error)">
          {error.message}
        </div>
      )}

      {aggregateWarningBytes != null && (
        <div className="rounded-lg border border-(--color-warn)/40 bg-(--color-warn)/5 p-4 text-sm text-(--color-warn)">
          Large batch detected — {formatBytes(aggregateWarningBytes)} combined.
          Performance may vary on devices with limited memory.
        </div>
      )}

      {sizeBanner?.kind === "warn" && (
        <div className="rounded-lg border border-(--color-warn)/40 bg-(--color-warn)/5 p-4 text-sm text-(--color-warn)">
          Large file detected. Performance may vary on devices with limited
          memory. Estimated memory footprint:{" "}
          {formatBytes(sizeBanner.footprintBytes)}.
        </div>
      )}

      {sizeBanner?.kind === "sampled" && (
        <div className="rounded-lg border border-(--color-warn)/40 bg-(--color-warn)/5 p-4 text-sm text-(--color-warn)">
          Showing a 100K-row sample. Full dataset exceeds browser memory limits.
        </div>
      )}

      {relayDisclosure && (
        <div className="rounded-lg border border-(--color-border) p-3 text-xs text-(--color-fg-muted)">
          This URL couldn't be reached directly, so the request and response
          passed through DataScope's relay to get around a cross-origin block.
        </div>
      )}

      {redoOffer && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-(--color-border) bg-(--color-bg) p-4 text-sm text-(--color-fg)">
          <span>
            Dropped <span className="font-mono">{redoOffer.tableName}</span>.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoing}
              className="rounded border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-fg) disabled:opacity-50"
            >
              {redoing ? "Redoing…" : "Redo"}
            </button>
            <button
              type="button"
              onClick={() => setRedoOffer(null)}
              aria-label="Dismiss"
              className="rounded p-1 text-(--color-fg-muted) hover:bg-(--color-border)"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {toast && (
        <SummaryToast
          ingestedCount={toast.ingestedCount}
          skipped={toast.skipped}
          onDismiss={() => setToast(null)}
        />
      )}

      <TableList
        onRemove={handleRemove}
        onRefresh={handleRefresh}
        refreshingTableId={refreshingTableId}
        refreshDisabled={busy}
      />

      {error?.isModal && (
        <FormatRejectionModal
          message={error.message}
          onDismiss={() => setError(null)}
          ariaLabel={error.ariaLabel}
        />
      )}
    </div>
  );
}
