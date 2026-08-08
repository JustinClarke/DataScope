import { useState } from "react";
import { Copy, Download, FileCode } from "lucide-react";
import { formatBytes } from "../../../lib/formatBytes";

export interface IdentityBandProps {
  datasetLabel: string;
  tableCount: number;
  totalRows: number;
  totalBytes: number;
  profiledAt: string;
  /** What one row of the largest table represents (D68c) — "orders: one row per order_id". */
  grain: string;
  /** Earliest–latest span of the largest table's primary date column, when one exists. */
  timeSpan?: string;
}

/**
 * The band above the hero (§13.1): dataset label, shape, and DSPS's three
 * renderers (§12.2, D37) — "Copy for AI" (markdown), "Export structure
 * report" (DSPS JSON), and "Export HTML report" (the human-facing renderer).
 * Carries the D45 snapshot line — facts as-of-profile-time, never "verified".
 */
export function IdentityBand({
  datasetLabel,
  tableCount,
  totalRows,
  totalBytes,
  profiledAt,
  grain,
  timeSpan,
  onExportReport,
  onExportHtml,
  onCopyForAI,
}: IdentityBandProps & {
  onExportReport: () => void;
  onExportHtml: () => void;
  onCopyForAI: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const profiledDate = new Date(profiledAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const handleCopy = () => {
    onCopyForAI();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-1 border-b border-(--color-border) pb-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-(--color-fg)">
            {datasetLabel}
          </h2>
          <span className="font-mono text-sm text-(--color-fg-muted)">
            {tableCount} table{tableCount === 1 ? "" : "s"} ·{" "}
            {totalRows.toLocaleString()} rows · {formatBytes(totalBytes)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-fg) transition-colors hover:bg-(--color-border)/40"
          >
            <Copy size={14} aria-hidden="true" />
            {copied ? "Copied" : "Copy for AI"}
          </button>
          <button
            type="button"
            onClick={onExportReport}
            className="flex items-center gap-1.5 rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-fg) transition-colors hover:bg-(--color-border)/40"
          >
            <Download size={14} aria-hidden="true" />
            Export structure report
          </button>
          <button
            type="button"
            onClick={onExportHtml}
            className="flex items-center gap-1.5 rounded border border-(--color-border) px-3 py-1.5 text-sm text-(--color-fg) transition-colors hover:bg-(--color-border)/40"
          >
            <FileCode size={14} aria-hidden="true" />
            Export HTML report
          </button>
        </div>
      </div>
      <p className="text-xs text-(--color-fg-muted)">
        {grain}
        {timeSpan ? ` · ${timeSpan}` : ""}
      </p>
      <p className="text-xs text-(--color-fg-muted)">
        Profiled {profiledDate} · from your machine, nothing uploaded
      </p>
    </div>
  );
}
