import type { ClassifiedColumn, SemanticType } from '../../types';
import type { ColumnCardStats } from '../../services/profiling';
import { Tooltip } from '../../components/Tooltip';

// Semantic type is carried by the label text, not by hue (V6a). The four-colour
// encoding this replaced spent two reserved registers on data — purple on
// `Categorical` and amber on `Textual` — which made a profiling badge
// indistinguishable from an AI marker or a selection (design.md: neither
// register is available for data encoding). `Identifier` was already neutral,
// so this makes all five consistent with what it always did. Same mono
// micro-cap treatment as the explorer row's origin badge.
function TypeBadge({ type }: { type: SemanticType }) {
  return (
    <span className="rounded-(--radius-xs) bg-(--color-elev) px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.1em] text-(--color-ink-2)">
      {type}
    </span>
  );
}

function NullBar({ nullPercentage }: { nullPercentage: number | null }) {
  const pct = nullPercentage ?? 0;
  return (
    <div className="flex items-center gap-2" title={`${pct.toFixed(1)}% null`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--color-border)">
        <div className="h-full rounded-full bg-(--color-fg-muted)" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right text-xs text-(--color-fg-muted)">
        {nullPercentage === null ? '—' : `${pct.toFixed(1)}% null`}
      </span>
    </div>
  );
}

function Histogram({ buckets }: { buckets: { rangeStart: number; rangeEnd: number; count: number }[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="flex h-10 items-end gap-0.5" aria-label="Value distribution histogram">
      {buckets.map((bucket, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm bg-(--chart-1)/70"
          style={{ height: `${Math.max(2, (bucket.count / max) * 100)}%` }}
          title={`${bucket.rangeStart.toFixed(2)}–${bucket.rangeEnd.toFixed(2)}: ${bucket.count.toLocaleString()}`}
        />
      ))}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-(--color-fg-muted)">{label}</span>
      <span className="font-mono text-(--color-fg)">{value}</span>
    </div>
  );
}

function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface ColumnCardProps {
  column: ClassifiedColumn;
  stats: ColumnCardStats | undefined;
  onShowSql: (label: string, sql: string) => void;
  /** Additive (W7): selects this column in the shell-wide selection store for the bottom inspector. Omitted call sites are unaffected. */
  onSelect?: () => void;
  selected?: boolean;
}

function SqlButton({ label, sql, onShowSql }: { label: string; sql: string; onShowSql: (label: string, sql: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onShowSql(label, sql)}
      className="text-xs text-(--color-accent) hover:underline"
    >
      Show SQL
    </button>
  );
}

/**
 * One column's stat card (§10 Module 1, Phase 1). `stats` is undefined while
 * this table's supplemental-stats query batch is still in flight —
 * type-specific body renders a lightweight loading line rather than nothing,
 * since ColumnProfile's own fields (null %, min/max/mean/stddev) are already
 * available synchronously from the registry and render immediately either way.
 */
export function ColumnCard({ column, stats, onShowSql, onSelect, selected = false }: ColumnCardProps) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 ${selected ? 'border-(--color-accent) ring-1 ring-(--color-accent)' : 'border-(--color-border)'}`}
    >
      <div
        className={`flex items-center justify-between gap-2 ${onSelect ? 'cursor-pointer' : ''}`}
        role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect}
        onKeyDown={
          onSelect
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect();
                }
              }
            : undefined
        }
      >
        <span className="truncate font-medium text-(--color-fg)" title={column.name}>
          {column.name}
        </span>
        <TypeBadge type={column.semanticType} />
      </div>

      {column.classificationReason && (
        <Tooltip content={column.classificationReason}>
          <span className="text-xs text-(--color-fg-muted) underline decoration-dotted">why?</span>
        </Tooltip>
      )}

      <NullBar nullPercentage={column.nullPercentage} />

      {column.semanticType === 'Quantitative' &&
        (stats?.kind === 'Quantitative' ? (
          <div className="flex flex-col gap-2">
            <StatRow label="min" value={fmtNum(Number(column.min))} />
            <StatRow label="max" value={fmtNum(Number(column.max))} />
            <StatRow label="mean" value={fmtNum(column.mean)} />
            <StatRow label="median" value={fmtNum(stats.median)} />
            <StatRow label="std dev" value={fmtNum(column.stdDev)} />
            {stats.histogram && <Histogram buckets={stats.histogram} />}
            <SqlButton label={`${column.name} — descriptive statistics`} sql={stats.medianSql} onShowSql={onShowSql} />
          </div>
        ) : (
          <p className="text-sm text-(--color-fg-muted)">Loading…</p>
        ))}

      {column.semanticType === 'Categorical' &&
        (stats?.kind === 'Categorical' ? (
          <div className="flex flex-col gap-1">
            {stats.topValues.length === 0 ? (
              <p className="text-sm text-(--color-fg-muted)">No values.</p>
            ) : (
              (() => {
                const max = Math.max(1, ...stats.topValues.map((v) => v.count));
                return stats.topValues.map((v) => (
                  <div key={v.value} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 truncate text-(--color-fg-muted)" title={v.value}>
                      {v.value}
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded bg-(--color-border)">
                      <div
                        className="h-full rounded bg-(--chart-1)/70"
                        style={{ width: `${(v.count / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-xs text-(--color-fg)">
                      {v.count.toLocaleString()}
                    </span>
                  </div>
                ));
              })()
            )}
            <SqlButton label={`${column.name} — value frequencies`} sql={stats.sql} onShowSql={onShowSql} />
          </div>
        ) : (
          <p className="text-sm text-(--color-fg-muted)">Loading…</p>
        ))}

      {column.semanticType === 'Temporal' &&
        (stats?.kind === 'Temporal' ? (
          <div className="flex flex-col gap-2">
            {stats.range ? (
              <>
                <StatRow label="earliest" value={stats.range.earliest} />
                <StatRow label="latest" value={stats.range.latest} />
                <p className="text-sm text-(--color-fg-muted)">{stats.range.gapDescription}</p>
              </>
            ) : (
              <p className="text-sm text-(--color-fg-muted)">No dates.</p>
            )}
            {stats.sql && <SqlButton label={`${column.name} — date range`} sql={stats.sql} onShowSql={onShowSql} />}
          </div>
        ) : (
          <p className="text-sm text-(--color-fg-muted)">Loading…</p>
        ))}

      {column.semanticType === 'Textual' &&
        (stats?.kind === 'Textual' ? (
          <div className="flex flex-col gap-2">
            <StatRow label="avg word count" value={fmtNum(stats.avgWordCount)} />
            {stats.samplePreview.length > 0 && (
              <div className="flex flex-col gap-1">
                {stats.samplePreview.map((sample, i) => (
                  <p key={i} className="truncate text-sm text-(--color-fg-muted)" title={sample}>
                    “{sample}”
                  </p>
                ))}
              </div>
            )}
            <SqlButton label={`${column.name} — sample preview`} sql={stats.sampleSql} onShowSql={onShowSql} />
          </div>
        ) : (
          <p className="text-sm text-(--color-fg-muted)">Loading…</p>
        ))}

      {column.semanticType === 'Identifier' && (
        <p className="text-sm text-(--color-fg-muted)">
          Near-unique per row — excluded from most analysis (override in the classifier above).
        </p>
      )}
    </div>
  );
}
