// The result store (A0, master §11.5 "Evidence retention", D74h).
//
// Results are materialized once and paged from that materialization. The
// reason is correctness, not audit: re-running an unordered query for page 2
// returns different rows, because nothing in SQL promises a stable order
// across two executions of the same unordered statement. Materializing with an
// explicit ordinal and paging `ORDER BY` it removes that whole class of bug.
//
// Compaction is deterministic and versioned: the oldest bulky bodies are
// dropped and replaced by a **receipt** — result id, SQL, schema, row count,
// completeness — which stays re-readable through `read_result`. It never
// summarizes cells and never summarizes reasoning. Results that contributed to
// a prior statement are retained ahead of merely recent ones, because a
// recency-only rule evicts exactly the evidence a terminal answer needed.
import { quoteIdentifier, quoteLiteral } from '../../services/ingestion';
import type { Executor, OpSchemaField } from './types';

/** The materialization's ordinal column — added by the store, never returned to a caller. */
const ORDINAL = '__ds_ord';
const TABLE_PREFIX = '__ds_result_';

/**
 * Charged bytes per row for a DuckDB type. Fixed-width types are exact;
 * `VARCHAR`/`BLOB` use an assumed average because measuring the real width
 * costs a full scan per column, which is a worse trade than an estimate whose
 * constant is calibrated by A0's ceiling measurement. Nested types are charged
 * a flat overestimate so a store full of them refuses early rather than late.
 */
const VARIABLE_WIDTH_BYTES = 32;
const NESTED_BYTES = 64;

export function bytesPerRow(type: string): number {
  const t = type.toUpperCase();
  const decimal = t.match(/^DECIMAL\((\d+)\s*,/);
  if (decimal) {
    const precision = Number(decimal[1]);
    return precision <= 4 ? 2 : precision <= 9 ? 4 : precision <= 18 ? 8 : 16;
  }
  if (t.endsWith('[]') || t.startsWith('STRUCT') || t.startsWith('MAP') || t.startsWith('UNION')) {
    return NESTED_BYTES;
  }
  switch (t) {
    case 'BOOLEAN':
    case 'TINYINT':
    case 'UTINYINT':
      return 1;
    case 'SMALLINT':
    case 'USMALLINT':
      return 2;
    case 'INTEGER':
    case 'UINTEGER':
    case 'FLOAT':
    case 'DATE':
      return 4;
    case 'BIGINT':
    case 'UBIGINT':
    case 'DOUBLE':
    case 'TIME':
    case 'TIMESTAMP':
    case 'TIMESTAMP WITH TIME ZONE':
      return 8;
    case 'HUGEINT':
    case 'UHUGEINT':
    case 'UUID':
    case 'INTERVAL':
      return 16;
    default:
      return VARIABLE_WIDTH_BYTES;
  }
}

/** The ordinal column the store adds is charged too — it is real memory. */
export function estimateBytes(schema: OpSchemaField[], rowCount: number): number {
  const perRow = schema.reduce((sum, field) => sum + bytesPerRow(field.type), 8);
  return perRow * rowCount;
}

const MEMORY_UNITS: Record<string, number> = {
  bytes: 1,
  KiB: 1024,
  MiB: 1024 * 1024,
  GiB: 1024 * 1024 * 1024,
};

/**
 * DuckDB's own accounting for the database holding the materializations.
 * A0's measurement found both engines report this identically, which is what
 * makes it usable as the charged figure rather than as instrumentation only.
 * It is reported to one decimal place of the chosen unit, so it reads 0 for
 * anything under roughly 100 KB — hence `chargedBytes` below takes the larger
 * of this and the type estimate.
 */
async function engineMemoryBytes(executor: Executor, signal?: AbortSignal): Promise<number> {
  const result = await executor.execute('PRAGMA database_size', signal);
  const index = result.columnNames.indexOf('memory_usage');
  if (index === -1) return 0;
  const [value, unit] = String(result.rows[0]?.[index] ?? '0 bytes').split(' ');
  return Number(value) * (MEMORY_UNITS[unit ?? 'bytes'] ?? 1);
}

/**
 * The greater of what the types imply and what the engine actually took.
 *
 * Neither alone is sound, and A0's measurement is why (`measureCeiling.ts`):
 * the type estimate assumes an average width for `VARCHAR`, which over-charges
 * short strings by ~1.5× — safe — but **under-charges 120-character text by
 * 4×**, which is not; while the engine's own figure is exact for anything
 * large but rounds to zero for a small result. Taking the maximum is right in
 * both directions.
 */
export function chargedBytes(estimate: number, measured: number): number {
  return Math.max(estimate, measured);
}

/** What survives compaction — everything except the rows themselves. */
export interface ResultReceipt {
  id: string;
  op: string;
  sql: string;
  schema: OpSchemaField[];
  rowCount: number;
  /** False once the body has been compacted away; `read_result` then returns the receipt. */
  materialized: boolean;
}

interface Entry extends ResultReceipt {
  /** The temp table holding the materialization; `null` once compacted. */
  tableName: string | null;
  estimatedBytes: number;
  contributed: boolean;
  lastReadAt: number;
  sequence: number;
}

export interface Page {
  rows: unknown[][];
  /** Rows remaining after this page, expressed as the offset to ask for next. */
  nextOffset: number | null;
  elapsedMs: number;
}

/** Raised when a single result cannot fit even an empty store — the caller turns it into `result_too_large`. */
export class ResultTooLargeError extends Error {
  readonly estimatedBytes: number;
  readonly maxBytes: number;

  constructor(estimatedBytes: number, maxBytes: number) {
    super(
      `The result needs about ${Math.round(estimatedBytes / 1_048_576)} MB, over the ${Math.round(
        maxBytes / 1_048_576,
      )} MB the result store retains.`,
    );
    this.name = 'ResultTooLargeError';
    this.estimatedBytes = estimatedBytes;
    this.maxBytes = maxBytes;
  }
}

export const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;

export class ResultStore {
  private readonly entries = new Map<string, Entry>();
  private sequence = 0;
  private readonly executor: Executor;
  private readonly maxBytes: number;

  constructor(executor: Executor, maxBytes: number = DEFAULT_MAX_BYTES) {
    this.executor = executor;
    this.maxBytes = maxBytes;
  }

  /**
   * Run `sql` once into a temp table carrying an ordinal, then never run it
   * again. `row_number() OVER ()` over an unordered relation assigns an
   * arbitrary order — the point is that it is assigned *once*, so every later
   * page agrees with every earlier one.
   */
  async materialize(op: string, sql: string, signal?: AbortSignal): Promise<{ entry: ResultReceipt; elapsedMs: number }> {
    const sequence = ++this.sequence;
    const id = `res_${sequence}`;
    const tableName = `${TABLE_PREFIX}${sequence}`;
    const quoted = quoteIdentifier(tableName);
    let elapsedMs = 0;

    const memoryBefore = await engineMemoryBytes(this.executor, signal);
    const created = await this.executor.execute(
      `CREATE TEMP TABLE ${quoted} AS SELECT row_number() OVER () AS ${quoteIdentifier(ORDINAL)}, * ` +
        `FROM (${stripTrailingSemicolon(sql)}) AS __ds_source`,
      signal,
    );
    elapsedMs += created.elapsedMs;
    const measuredBytes = (await engineMemoryBytes(this.executor, signal)) - memoryBefore;

    try {
      const counted = await this.executor.execute(`SELECT count(*) FROM ${quoted}`, signal);
      elapsedMs += counted.elapsedMs;
      const rowCount = Number(counted.rows[0]?.[0] ?? 0);

      // Column types come from DuckDB's own catalog rather than from the
      // engine's result metadata, so `schema[].type` is a DuckDB type name and
      // is identical on DuckDB-Wasm and native by construction — the one
      // divergence the conformance suite would otherwise have to police.
      const described = await this.executor.execute(
        `SELECT column_name, data_type FROM information_schema.columns ` +
          `WHERE table_name = ${quoteLiteral(tableName)} AND column_name <> ${quoteLiteral(ORDINAL)} ` +
          `ORDER BY ordinal_position`,
        signal,
      );
      elapsedMs += described.elapsedMs;
      const schema: OpSchemaField[] = described.rows.map((row) => ({
        name: String(row[0]),
        type: String(row[1]),
      }));

      const estimatedBytes = chargedBytes(estimateBytes(schema, rowCount), measuredBytes);
      if (estimatedBytes > this.maxBytes) {
        await this.drop(tableName, signal);
        throw new ResultTooLargeError(estimatedBytes, this.maxBytes);
      }
      await this.evictUntilFits(estimatedBytes, signal);

      const entry: Entry = {
        id,
        op,
        sql,
        schema,
        rowCount,
        materialized: true,
        tableName,
        estimatedBytes,
        contributed: false,
        lastReadAt: Date.now(),
        sequence,
      };
      this.entries.set(id, entry);
      return { entry: toReceipt(entry), elapsedMs };
    } catch (error) {
      if (!(error instanceof ResultTooLargeError)) await this.drop(tableName, signal);
      throw error;
    }
  }

  /** `null` when the id was never issued; a receipt with `materialized: false` when the body was compacted away. */
  receipt(id: string): ResultReceipt | null {
    const entry = this.entries.get(id);
    return entry ? toReceipt(entry) : null;
  }

  /**
   * Mark a result as having informed a statement. Contribution outranks
   * recency in eviction — the whole point of D74h's retention rule.
   */
  markContributed(id: string): void {
    const entry = this.entries.get(id);
    if (entry) entry.contributed = true;
  }

  /**
   * Page from the materialization. `null` when the body has been compacted;
   * the caller returns the receipt instead. `columns`, when given, projects
   * the page to just those columns (validated against the receipt's schema by
   * the caller) — the ordinal is never a valid choice since it was never
   * part of the schema handed back to anyone.
   */
  async page(id: string, offset: number, limit: number, signal?: AbortSignal, columns?: string[]): Promise<Page | null> {
    const entry = this.entries.get(id);
    if (!entry?.tableName) return null;
    entry.lastReadAt = Date.now();

    const selectList =
      columns && columns.length > 0
        ? columns.map((c) => quoteIdentifier(c)).join(', ')
        : `* EXCLUDE (${quoteIdentifier(ORDINAL)})`;
    const result = await this.executor.execute(
      `SELECT ${selectList} FROM ${quoteIdentifier(entry.tableName)} ` +
        `ORDER BY ${quoteIdentifier(ORDINAL)} LIMIT ${limit} OFFSET ${offset}`,
      signal,
    );
    const consumed = offset + result.rows.length;
    return {
      rows: result.rows,
      // An empty page ends the walk even when `offset` started past the end,
      // so a caller following `nextOffset` can never loop.
      nextOffset: result.rows.length > 0 && consumed < entry.rowCount ? consumed : null,
      elapsedMs: result.elapsedMs,
    };
  }

  usedBytes(): number {
    let total = 0;
    for (const entry of this.entries.values()) if (entry.tableName) total += entry.estimatedBytes;
    return total;
  }

  /** Every live entry, newest first — instrumentation for A0's ceiling measurement. */
  inventory(): ResultReceipt[] {
    return [...this.entries.values()].sort((a, b) => b.sequence - a.sequence).map(toReceipt);
  }

  async reset(signal?: AbortSignal): Promise<void> {
    for (const entry of this.entries.values()) {
      if (entry.tableName) await this.drop(entry.tableName, signal);
    }
    this.entries.clear();
  }

  /**
   * Drop bodies until `incoming` fits. Non-contributing results go first,
   * oldest-read first within each group, so evidence behind a statement the
   * caller already made is the last thing to go.
   */
  private async evictUntilFits(incoming: number, signal?: AbortSignal): Promise<void> {
    while (this.usedBytes() + incoming > this.maxBytes) {
      const victim = this.nextVictim();
      if (!victim) return;
      await this.drop(victim.tableName!, signal);
      victim.tableName = null;
      victim.materialized = false;
    }
  }

  private nextVictim(): Entry | null {
    let victim: Entry | null = null;
    for (const entry of this.entries.values()) {
      if (!entry.tableName) continue;
      if (!victim) {
        victim = entry;
        continue;
      }
      if (entry.contributed !== victim.contributed) {
        if (!entry.contributed) victim = entry;
        continue;
      }
      if (entry.lastReadAt < victim.lastReadAt) victim = entry;
    }
    return victim;
  }

  private async drop(tableName: string, signal?: AbortSignal): Promise<void> {
    await this.executor.execute(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`, signal);
  }
}

function toReceipt(entry: Entry): ResultReceipt {
  return {
    id: entry.id,
    op: entry.op,
    sql: entry.sql,
    schema: entry.schema,
    rowCount: entry.rowCount,
    materialized: entry.materialized,
  };
}

function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, '');
}
