import { useMemo, useState } from 'react';
import { Copy, TriangleAlert, X } from 'lucide-react';
import type { TableRegistryEntry } from '../../types';
import { useSettingsStore } from '../../stores/settings';
import { buildStructureReport, redactColumnNames } from '../../lib/structureReport';
import { findLikelySensitiveColumns } from '../../lib/sensitiveColumns';
import {
  buildShareBuffer,
  saveToCloud,
  PARQUET_CONTENT_TYPE,
  STRUCTURE_REPORT_CONTENT_TYPE,
  type ShareFailure,
} from '../../services/export';

// Launch default (§12.3) — the same number the Terraform-owned R2 lifecycle
// rule enforces server-side; this is disclosure copy, not an app-code check.
const SHARE_TTL_DAYS = 30;

const ERROR_MESSAGE: Record<ShareFailure['code'], string> = {
  'bad-request': "Something went wrong preparing this share — try again.",
  'not-found': "That share link doesn't exist.",
  'too-large': 'This dataset is too large to share (100 MB per-object limit).',
  'rate-limited': "You've hit today's save/share rate limit — try again later.",
  'quota-exceeded': "You've reached today's total save/share data limit — try again tomorrow.",
  paused: 'Save/share is temporarily paused — try again later.',
  unavailable: 'Save/share is temporarily unavailable — try again later.',
  unreachable: "Couldn't reach the server — check your connection and try again.",
};

interface ShareDialogProps {
  table: TableRegistryEntry;
  onClose: () => void;
}

/**
 * The "Save to cloud / Create share link" dialog (§12.3, D20). Structure-only
 * is the pre-selected default — schema, types, profile aggregates, no data
 * rows; escalating to a full-dataset share (raw rows included) is a second,
 * distinctly styled step, never the default. The likely-sensitive-column
 * nudge (D46) renders only when it finds something — an empty result renders
 * nothing here, never a "none found" line.
 */
export function ShareDialog({ table, onClose }: ShareDialogProps) {
  const addShareLink = useSettingsStore((state) => state.addShareLink);
  const [escalated, setEscalated] = useState(false);
  const [redact, setRedact] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ShareFailure['code'] | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const findings = useMemo(
    () => findLikelySensitiveColumns([{ tableName: table.tableName, columns: table.columns ?? [] }]),
    [table],
  );

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      let buffer: Uint8Array;
      let contentType: string;
      const kind: 'structure' | 'full-dataset' = escalated ? 'full-dataset' : 'structure';

      if (escalated) {
        buffer = await buildShareBuffer(table);
        contentType = PARQUET_CONTENT_TYPE;
      } else {
        let report = buildStructureReport([table], []);
        if (redact) report = redactColumnNames(report);
        buffer = new TextEncoder().encode(JSON.stringify(report));
        contentType = STRUCTURE_REPORT_CONTENT_TYPE;
      }

      const result = await saveToCloud(buffer, contentType);
      if (!result.ok) {
        setError(result.code);
        return;
      }

      const url = `${window.location.origin}${window.location.pathname}?share=${result.token}`;
      setSavedUrl(url);
      addShareLink({
        token: result.token,
        deleteToken: result.deleteToken,
        kind,
        label: table.tableName,
        createdAt: new Date().toISOString(),
        ttlSeconds: result.ttlSeconds,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!savedUrl) return;
    await navigator.clipboard.writeText(savedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${table.tableName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-(--color-border) bg-(--color-bg) p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-(--color-fg)">Share &quot;{table.tableName}&quot;</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-(--color-fg-muted) hover:bg-(--color-border)"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {savedUrl ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-(--color-fg)">Share link created — expires in {SHARE_TTL_DAYS} days.</p>
            <div className="flex items-center gap-2 rounded border border-(--color-border) px-3 py-2">
              <span className="flex-1 truncate font-mono text-xs text-(--color-fg-muted)">{savedUrl}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1 text-xs font-medium text-(--color-fg)"
              >
                <Copy size={12} aria-hidden="true" /> {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="self-end rounded border border-(--color-border) px-3 py-1 text-xs font-medium text-(--color-fg)"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-(--color-fg-muted)">
              {escalated
                ? 'The full dataset — every row — will be uploaded and stored on DataScope\'s servers.'
                : 'Structure only — no data rows included: schema, column types, and profile aggregates. No raw data ever uploads.'}{' '}
              Stored for {SHARE_TTL_DAYS} days, then automatically deleted. Anyone with the link can view it —
              links are unguessable but not private beyond that.
            </p>

            {findings.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-400/50 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  These columns may contain personal data — review before sharing:{' '}
                  {findings.map((f) => f.columnName).join(', ')}.
                </span>
              </div>
            )}

            {!escalated && (
              <label className="flex items-center gap-2 text-sm text-(--color-fg)">
                <input type="checkbox" checked={redact} onChange={(event) => setRedact(event.target.checked)} />
                Redact column names (column_1, column_2, ...)
              </label>
            )}

            {error && (
              <div className="rounded-lg border border-red-400/50 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
                {ERROR_MESSAGE[error]}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              {!escalated ? (
                <button
                  type="button"
                  onClick={() => setEscalated(true)}
                  className="text-xs text-(--color-fg-muted) underline"
                >
                  Include raw data rows instead
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setEscalated(false)}
                  className="text-xs text-(--color-fg-muted) underline"
                >
                  Back to structure only
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={busy}
                className={
                  escalated
                    ? 'rounded border border-red-500 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50 dark:text-red-400'
                    : 'rounded border border-(--color-border) px-4 py-2 text-sm font-medium text-(--color-fg) disabled:opacity-50'
                }
              >
                {busy ? 'Saving…' : escalated ? 'Save full dataset (includes raw rows)' : 'Save to cloud / Create share link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
