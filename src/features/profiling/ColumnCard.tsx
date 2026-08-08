import { useState, type ReactNode } from "react";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronRight,
  Hash,
  Key,
  Link as LinkIcon,
  Type as TypeIcon,
} from "lucide-react";
import type { ClassifiedColumn, SemanticType } from "../../types";
import type { ColumnCardStats } from "../../services/profiling";
import { Tooltip } from "../../components/Tooltip";
import { RunSqlButton } from "../sql/RunSqlButton";

// Semantic type is carried by the label text, not by hue (V6a). The four-colour
// encoding this replaced spent two reserved registers on data — purple on
// `Categorical` and amber on `Textual` — which made a profiling badge
// indistinguishable from an AI marker or a selection (design.md: neither
// register is available for data encoding). `Identifier` was already neutral,
// so this makes all five consistent with what it always did. Same mono
// micro-cap treatment as the explorer row's origin badge.
export function TypeBadge({ type }: { type: SemanticType }) {
  return (
    <span className="rounded-(--radius-xs) bg-(--color-elev) px-1.5 py-0.5 font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.1em] text-(--color-ink-2)">
      {type}
    </span>
  );
}

/** Icon shape hints at a column's DuckDB physical type; colour stays neutral — same register discipline as `TypeBadge` (V6a), just keyed off `physicalType` instead of `semanticType`. */
function physicalTypeIcon(physicalType: string) {
  const upper = physicalType.toUpperCase();
  if (/DATE|TIME/.test(upper)) return Calendar;
  if (/INT|DECIMAL|DOUBLE|FLOAT|NUMERIC|REAL/.test(upper)) return Hash;
  return TypeIcon;
}

function PhysicalTypeBadge({ physicalType }: { physicalType: string }) {
  const Icon = physicalTypeIcon(physicalType);
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-(--radius-xs) bg-(--color-elev) px-2 py-1 font-mono text-[length:var(--text-2xs)] uppercase tracking-[0.1em] text-(--color-ink-2)">
      <Icon size={12} aria-hidden="true" />
      {physicalType}
    </span>
  );
}

function NullCountBadge({ count }: { count: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-(--radius-xs) bg-(--color-warn)/10 px-1.5 py-0.5 text-xs font-medium text-(--color-warn)">
      <AlertCircle size={12} aria-hidden="true" />
      {count.toLocaleString()} nulls
    </span>
  );
}

/** `total <= 0` covers a 0-row table — SUMMARIZE has no percentage to report there either (see `ColumnProfile.nullPercentage`). */
function pctOf(n: number, total: number, decimals = 1): string {
  if (!Number.isFinite(total) || total <= 0) return "—";
  return `${((n / total) * 100).toFixed(decimals)}%`;
}

/** `warn` reuses the same amber token the collapsed header's null-count badge already carries (`NullCountBadge`) — a column with missing data reads the same way whether its card is open or closed. */
function StatBox({
  label,
  value,
  percentage,
  warn = false,
}: {
  label: string;
  value: string;
  percentage: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-(--radius-sm) border px-3 py-2 ${warn ? "border-(--color-warn)/30" : "border-(--color-border)"}`}
    >
      <span
        className={`text-xs ${warn ? "text-(--color-warn)" : "text-(--color-fg-muted)"}`}
      >
        {label}
      </span>
      <span className="font-mono text-sm text-(--color-fg)">
        {value}{" "}
        <span className="text-xs text-(--color-fg-muted)">{`(${percentage})`}</span>
      </span>
    </div>
  );
}

function DistributionBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-(--radius-sm) border border-(--color-border) px-3 py-2.5">
      <span className="text-xs text-(--color-fg-muted)">
        Distribution Preview
      </span>
      {children}
    </div>
  );
}

function Histogram({
  buckets,
}: {
  buckets: { rangeStart: number; rangeEnd: number; count: number }[];
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div
      className="flex h-10 items-end gap-0.5"
      aria-label="Value distribution histogram"
    >
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
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

interface ColumnCardProps {
  column: ClassifiedColumn;
  stats: ColumnCardStats | undefined;
  /** The table's total row count — denominator for the Unique Values / Missing (Nulls) / distribution-bar percentages. */
  rowCount: number;
  onShowSql: (label: string, sql: string) => void;
  /** Additive (W7): selects this column in the shell-wide selection store for the bottom inspector. Omitted call sites are unaffected. */
  onSelect?: () => void;
  selected?: boolean;
  /** True when a relationship inference edge points at this column but it isn't also the table's Identifier — draws the FK link icon instead of the PK key. Mutually exclusive with the key by construction (only checked when `semanticType !== 'Identifier'`). */
  isForeignKey?: boolean;
  /** Forces the expanded body's stat grid to a single column regardless of viewport width — the explorer rail (`TableList`) is far narrower than the `sm:` breakpoint accounts for, so the two-column layout would overflow it. */
  compact?: boolean;
  /** Initial expand state (default true, matching the Profile tab's "everything visible" precedent). The rail's disclosure starts every row collapsed instead — opening one table shouldn't dump every column's stats at once. */
  defaultExpanded?: boolean;
}

// Show and Run travel together (S4): Copy/Show is for taking a query elsewhere,
// Run is the journey the app could not make before. Pairing them here rather
// than at the four call sites keeps every stats block consistent by
// construction.
function SqlButton({
  label,
  sql,
  onShowSql,
}: {
  label: string;
  sql: string;
  onShowSql: (label: string, sql: string) => void;
}) {
  return (
    <span className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onShowSql(label, sql)}
        className="text-xs text-(--color-accent) hover:underline"
      >
        Show SQL
      </button>
      <RunSqlButton sql={sql} />
    </span>
  );
}

/**
 * One column's disclosure row (§10 Module 1, Phase 1) — rendered inside a
 * table's card ({@link ProfileDashboard}) or the explorer rail's own column
 * disclosure ({@link TableList}'s `ColumnDisclosure`, `compact`). `stats` is
 * undefined while this table's supplemental-stats query batch is still in
 * flight — type-specific body renders a lightweight loading line rather than
 * nothing, since `ColumnProfile`'s own fields (cardinality, null %,
 * min/max/mean/stddev) are already available synchronously from the
 * registry and render immediately either way.
 */
export function ColumnCard({
  column,
  stats,
  rowCount,
  onShowSql,
  onSelect,
  selected = false,
  isForeignKey = false,
  compact = false,
  defaultExpanded = true,
}: ColumnCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const nullPct = column.nullPercentage;
  const nullCount =
    nullPct === null ? 0 : Math.round((nullPct / 100) * rowCount);

  // `compact` (the rail's disclosure, TableList) navigates away entirely on select — jumping
  // to the Profile tab — so a click there reveals first and only selects on a second, deliberate
  // click. The full Profile tab (`compact` false) has nowhere to jump to; a click is a plain
  // open/shut accordion there, with `onSelect` riding along silently to update the bottom
  // inspector (no visible effect on the card itself — see the `selected` styling below).
  const handleRowClick = () => {
    if (compact) {
      if (!expanded) {
        setExpanded(true);
        return;
      }
      onSelect?.();
      return;
    }
    setExpanded((v) => !v);
    onSelect?.();
  };

  return (
    <div
      className={`flex flex-col gap-2 rounded-(--radius-sm) border border-transparent px-3 py-2.5 ${selected ? "bg-(--color-elev) shadow-[inset_2px_0_0_var(--color-active)]" : ""}`}
    >
      <div
        className={`flex items-center justify-between gap-2 rounded-(--radius-xs) ${onSelect ? "cursor-pointer outline-none focus-visible:bg-(--color-elev)" : ""}`}
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onClick={onSelect ? handleRowClick : undefined}
        onKeyDown={
          onSelect
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleRowClick();
                }
              }
            : undefined
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${column.name}`}
            aria-expanded={expanded}
            className="shrink-0 rounded p-0.5 text-(--color-ink-3) hover:bg-(--color-elev) hover:text-(--color-ink-2)"
          >
            {expanded ? (
              <ChevronDown size={14} aria-hidden="true" />
            ) : (
              <ChevronRight size={14} aria-hidden="true" />
            )}
          </button>
          {column.semanticType === "Identifier" ? (
            <Key
              size={13}
              aria-hidden="true"
              className="shrink-0 text-(--color-pk)"
            />
          ) : (
            isForeignKey && (
              <LinkIcon
                size={13}
                aria-hidden="true"
                className="shrink-0 text-(--color-fk)"
              />
            )
          )}
          <span
            className="truncate font-mono text-sm text-(--color-fg)"
            title={column.name}
          >
            {column.name}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {nullPct !== null && nullPct > 0 && (
            <NullCountBadge count={nullCount} />
          )}
          <PhysicalTypeBadge physicalType={column.physicalType} />
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 pl-6">
          <div className="flex items-center gap-2">
            <TypeBadge type={column.semanticType} />
            {column.classificationReason && (
              <Tooltip content={column.classificationReason}>
                <span className="text-xs text-(--color-fg-muted) underline decoration-dotted">
                  why?
                </span>
              </Tooltip>
            )}
          </div>

          <div
            className={`grid grid-cols-1 items-start gap-3 ${compact ? "" : "sm:grid-cols-2"}`}
          >
            <div
              className={
                compact ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2"
              }
            >
              <StatBox
                label="Unique Values"
                value={column.cardinality.toLocaleString()}
                percentage={pctOf(column.cardinality, rowCount)}
              />
              <StatBox
                label="Missing values"
                value={nullCount.toLocaleString()}
                percentage={nullPct === null ? "—" : `${nullPct.toFixed(1)}%`}
                warn={nullCount > 0}
              />
            </div>

            <DistributionBox>
              {column.semanticType === "Quantitative" &&
                (stats?.kind === "Quantitative" ? (
                  <div className="flex flex-col gap-2">
                    <StatRow label="min" value={fmtNum(Number(column.min))} />
                    <StatRow label="max" value={fmtNum(Number(column.max))} />
                    <StatRow label="mean" value={fmtNum(column.mean)} />
                    <StatRow label="median" value={fmtNum(stats.median)} />
                    <StatRow label="std dev" value={fmtNum(column.stdDev)} />
                    {stats.histogram && <Histogram buckets={stats.histogram} />}
                    <SqlButton
                      label={`${column.name} — descriptive statistics`}
                      sql={stats.medianSql}
                      onShowSql={onShowSql}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-(--color-fg-muted)">Loading…</p>
                ))}

              {column.semanticType === "Categorical" &&
                (stats?.kind === "Categorical" ? (
                  <div className="flex flex-col gap-1">
                    {stats.topValues.length === 0 ? (
                      <p className="text-sm text-(--color-fg-muted)">
                        No values.
                      </p>
                    ) : (
                      stats.topValues.map((v) => (
                        <div
                          key={v.value}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span
                            className="w-24 shrink-0 truncate text-(--color-fg-muted)"
                            title={v.value}
                          >
                            {v.value}
                          </span>
                          <div className="h-3 flex-1 overflow-hidden rounded bg-(--color-border)">
                            <div
                              className="h-full rounded bg-(--chart-1)/70"
                              style={{ width: pctOf(v.count, rowCount, 0) }}
                            />
                          </div>
                          <span className="w-12 shrink-0 text-right font-mono text-xs text-(--color-fg)">
                            {pctOf(v.count, rowCount, 0)}
                          </span>
                        </div>
                      ))
                    )}
                    <SqlButton
                      label={`${column.name} — value frequencies`}
                      sql={stats.sql}
                      onShowSql={onShowSql}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-(--color-fg-muted)">Loading…</p>
                ))}

              {column.semanticType === "Temporal" &&
                (stats?.kind === "Temporal" ? (
                  <div className="flex flex-col gap-2">
                    {stats.range ? (
                      <>
                        <StatRow
                          label="earliest"
                          value={stats.range.earliest}
                        />
                        <StatRow label="latest" value={stats.range.latest} />
                        <p className="text-sm text-(--color-fg-muted)">
                          {stats.range.gapDescription}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-(--color-fg-muted)">
                        No dates.
                      </p>
                    )}
                    {stats.sql && (
                      <SqlButton
                        label={`${column.name} — date range`}
                        sql={stats.sql}
                        onShowSql={onShowSql}
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-(--color-fg-muted)">Loading…</p>
                ))}

              {column.semanticType === "Textual" &&
                (stats?.kind === "Textual" ? (
                  <div className="flex flex-col gap-2">
                    <StatRow
                      label="avg word count"
                      value={fmtNum(stats.avgWordCount)}
                    />
                    {stats.samplePreview.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {stats.samplePreview.map((sample, i) => (
                          <p
                            key={i}
                            className="truncate text-sm text-(--color-fg-muted)"
                            title={sample}
                          >
                            “{sample}”
                          </p>
                        ))}
                      </div>
                    )}
                    <SqlButton
                      label={`${column.name} — sample preview`}
                      sql={stats.sampleSql}
                      onShowSql={onShowSql}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-(--color-fg-muted)">Loading…</p>
                ))}

              {column.semanticType === "Identifier" && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm italic text-(--color-fg-muted)">
                    Uniform or complex distribution
                  </p>
                  <p className="text-xs text-(--color-fg-muted)">
                    Near-unique per row — excluded from most analysis (override
                    in the classifier above).
                  </p>
                </div>
              )}
            </DistributionBox>
          </div>
        </div>
      )}
    </div>
  );
}
