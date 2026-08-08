import { useState } from "react";
import { Copy, Download, Share2 } from "lucide-react";
import { useDatasetsStore } from "../../stores/datasets";
import { downloadTable } from "../../services/export";
import { buildJupyterSnippet } from "./jupyterSnippet";
import { ShareDialog } from "./ShareDialog";
import { ShareLinksList } from "./ShareLinksList";
import type { TableRegistryEntry } from "../../types";

type ExportFormat = "parquet" | "csv";
type BusyAction = ExportFormat | "snippet";

/**
 * The OUTPUT group's "Export / Share" destination (§13.2) — every registered
 * table (ingested or derived), each downloadable as Parquet (the headline
 * format, §12.2) or CSV, plus a copy-to-Jupyter snippet carrying a derived
 * table's generating SQL. All client-side: `services/export.ts` runs `COPY`
 * inside DuckDB-Wasm and hands back a buffer, no network request.
 */
export function ExportModule() {
  const tables = useDatasetsStore((state) => state.tables);
  const [busy, setBusy] = useState<{
    tableId: string;
    action: BusyAction;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharingTable, setSharingTable] = useState<TableRegistryEntry | null>(
    null,
  );

  async function handleDownload(
    table: TableRegistryEntry,
    format: ExportFormat,
  ) {
    if (busy) return;
    setBusy({ tableId: table.id, action: format });
    try {
      await downloadTable(table, format);
    } finally {
      setBusy(null);
    }
  }

  async function handleCopySnippet(table: TableRegistryEntry) {
    if (busy) return;
    setBusy({ tableId: table.id, action: "snippet" });
    try {
      await navigator.clipboard.writeText(
        buildJupyterSnippet(table, "parquet"),
      );
      setCopiedId(table.id);
      setTimeout(
        () => setCopiedId((id) => (id === table.id ? null : id)),
        2000,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {tables.length === 0 ? (
        <p className="text-sm text-(--color-fg-muted)">
          Drop a dataset to export tables.
        </p>
      ) : (
        <div>
          <h2 className="text-sm font-medium text-(--color-fg)">Export</h2>
          <p className="text-sm text-(--color-fg-muted)">
            Download any table as Parquet or CSV, entirely in your browser —
            nothing is uploaded.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {tables.map((table) => {
          const isBusy = (action: BusyAction) =>
            busy?.tableId === table.id && busy.action === action;
          return (
            <li
              key={table.id}
              className="flex items-center justify-between rounded-lg border border-(--color-border) px-4 py-2"
            >
              <div>
                <span className="font-medium text-(--color-fg)">
                  {table.tableName}
                </span>
                <span className="ml-2 font-mono text-sm text-(--color-fg-muted)">
                  {table.rowCount.toLocaleString()} rows × {table.columnCount}{" "}
                  cols
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleDownload(table, "parquet")}
                  disabled={busy !== null}
                  className="flex items-center gap-1 rounded border border-(--color-border) px-2 py-1 font-medium text-(--color-fg) disabled:opacity-50"
                >
                  <Download size={12} aria-hidden="true" />{" "}
                  {isBusy("parquet") ? "Preparing…" : "Parquet"}
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(table, "csv")}
                  disabled={busy !== null}
                  className="flex items-center gap-1 rounded border border-(--color-border) px-2 py-1 font-medium text-(--color-fg) disabled:opacity-50"
                >
                  <Download size={12} aria-hidden="true" />{" "}
                  {isBusy("csv") ? "Preparing…" : "CSV"}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopySnippet(table)}
                  disabled={busy !== null}
                  title="Copy a ready-to-paste Jupyter cell that loads this export"
                  className="flex items-center gap-1 rounded border border-(--color-border) px-2 py-1 font-medium text-(--color-fg) disabled:opacity-50"
                >
                  <Copy size={12} aria-hidden="true" />{" "}
                  {copiedId === table.id ? "Copied!" : "Jupyter snippet"}
                </button>
                <button
                  type="button"
                  onClick={() => setSharingTable(table)}
                  disabled={busy !== null}
                  title="Save to cloud and create a share link (§12.3)"
                  className="flex items-center gap-1 rounded border border-(--color-border) px-2 py-1 font-medium text-(--color-fg) disabled:opacity-50"
                >
                  <Share2 size={12} aria-hidden="true" /> Share
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ShareLinksList />

      {sharingTable && (
        <ShareDialog
          table={sharingTable}
          onClose={() => setSharingTable(null)}
        />
      )}
    </div>
  );
}
