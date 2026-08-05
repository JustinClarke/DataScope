import type { EvalEngine } from '../../duckdb/duckdb';
import type { EvidencePacket, EvidenceRow } from './evidence';
import {
  assertBoundedMetric,
  describeMetric,
  metricId,
  type ColumnRef,
  type Metric,
} from './metrics';

export interface EvidenceFilter {
  column: ColumnRef;
  operator: 'equals' | 'not_equals';
  value: string | number;
}

export interface EcommerceEvidencePlan {
  id: string;
  metric: Metric;
  dimension?: { column: ColumnRef; timeGrain?: 'month' };
  filters: EvidenceFilter[];
  maxRows: number;
}

const COLUMNS: Record<ColumnRef['table'], ReadonlySet<string>> = {
  customers: new Set(['customer_id', 'name', 'email', 'country', 'signup_date']),
  products: new Set(['product_id', 'name', 'category', 'unit_price']),
  orders: new Set(['order_id', 'customer_id', 'order_date', 'status']),
  order_items: new Set(['order_item_id', 'order_id', 'product_id', 'quantity', 'unit_price']),
};

const RELATIONSHIPS = [
  { left: { table: 'orders', column: 'customer_id' }, right: { table: 'customers', column: 'customer_id' } },
  { left: { table: 'order_items', column: 'order_id' }, right: { table: 'orders', column: 'order_id' } },
  { left: { table: 'order_items', column: 'product_id' }, right: { table: 'products', column: 'product_id' } },
] as const satisfies ReadonlyArray<{ left: ColumnRef; right: ColumnRef }>;

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function assertColumn(ref: ColumnRef): void {
  if (!COLUMNS[ref.table].has(ref.column)) throw new Error(`unknown column ${ref.table}.${ref.column}`);
}

function metricRefs(metric: Metric): ColumnRef[] {
  switch (metric.kind) {
    case 'count_rows':
      return [];
    case 'count_distinct':
    case 'sum':
    case 'average':
      return [metric.column];
    case 'sum_product':
      return [metric.left, metric.right];
    case 'ratio':
      return [...metricRefs(metric.numerator), ...metricRefs(metric.denominator)];
  }
}

function metricRoot(metric: Metric): ColumnRef['table'] {
  switch (metric.kind) {
    case 'count_rows':
      return metric.table;
    case 'count_distinct':
    case 'sum':
    case 'average':
      return metric.column.table;
    case 'sum_product':
      return metric.left.table;
    case 'ratio':
      return metricRoot(metric.numerator);
  }
}

function metricSql(metric: Metric, aliases: ReadonlyMap<string, string>): string {
  const field = (ref: ColumnRef) => `${aliases.get(ref.table)}.${quoteIdentifier(ref.column)}`;
  switch (metric.kind) {
    case 'count_rows':
      return 'COUNT(*)';
    case 'count_distinct':
      return `COUNT(DISTINCT ${field(metric.column)})`;
    case 'sum':
      return `SUM(${field(metric.column)})`;
    case 'average':
      return `AVG(${field(metric.column)})`;
    case 'sum_product':
      return `SUM(${field(metric.left)} * ${field(metric.right)})`;
    case 'ratio': {
      const numerator = metricSql(metric.numerator, aliases);
      const denominator = metricSql(metric.denominator, aliases);
      return `((${numerator}) / NULLIF((${denominator}), 0)) * ${metric.scale}`;
    }
  }
}

function columnUnit(ref: ColumnRef): string {
  if (ref.column === 'quantity') return 'item';
  if (ref.column === 'unit_price') return 'USD/item';
  if (ref.column === 'order_id') return 'order';
  if (ref.column === 'product_id') return 'product';
  if (ref.column === 'customer_id') return 'customer';
  return 'value';
}

export function metricUnit(metric: Metric): string {
  switch (metric.kind) {
    case 'count_rows':
      return 'row';
    case 'count_distinct':
      return columnUnit(metric.column);
    case 'sum':
    case 'average':
      return columnUnit(metric.column);
    case 'sum_product': {
      const units = [columnUnit(metric.left), columnUnit(metric.right)].sort().join('*');
      return units === 'USD/item*item' ? 'USD' : units;
    }
    case 'ratio': {
      const numerator = metricUnit(metric.numerator);
      const denominator = metricUnit(metric.denominator);
      if (metric.scale === 100 && numerator === denominator) return '%';
      return numerator === denominator ? 'ratio' : `${numerator}/${denominator}`;
    }
  }
}

function pathFrom(start: string, target: string): typeof RELATIONSHIPS[number][] {
  if (start === target) return [];
  const queue: Array<{ table: string; path: typeof RELATIONSHIPS[number][] }> = [{ table: start, path: [] }];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const relationship of RELATIONSHIPS) {
      const tables = [relationship.left.table, relationship.right.table];
      if (!tables.includes(current.table as ColumnRef['table'])) continue;
      const next = tables[0] === current.table ? tables[1]! : tables[0]!;
      if (seen.has(next)) continue;
      const path = [...current.path, relationship];
      if (next === target) return path;
      seen.add(next);
      queue.push({ table: next, path });
    }
  }
  throw new Error(`no relationship path from ${start} to ${target}`);
}

function literal(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('filter number must be finite');
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function validatePlan(plan: EcommerceEvidencePlan): void {
  if (!/^[a-z][a-z0-9-]{0,39}$/.test(plan.id)) throw new Error(`invalid evidence plan id ${plan.id}`);
  if (!Number.isInteger(plan.maxRows) || plan.maxRows < 1 || plan.maxRows > 100) {
    throw new Error('maxRows must be an integer from 1 to 100');
  }
  assertBoundedMetric(plan.metric);
  for (const ref of metricRefs(plan.metric)) assertColumn(ref);
  const validateProducts = (metric: Metric): void => {
    if (metric.kind === 'sum_product' && metric.left.table !== metric.right.table) {
      throw new Error('sum_product columns must use the same table');
    }
    if (metric.kind === 'ratio') {
      validateProducts(metric.numerator);
      validateProducts(metric.denominator);
    }
  };
  validateProducts(plan.metric);
  if (plan.dimension) {
    assertColumn(plan.dimension.column);
    if (plan.dimension.timeGrain && plan.dimension.column.column !== 'order_date') {
      throw new Error('month grain requires orders.order_date');
    }
  }
  for (const filter of plan.filters) assertColumn(filter.column);
}

export function compileEcommercePlan(plan: EcommerceEvidencePlan): string {
  validatePlan(plan);
  const root = metricRoot(plan.metric);
  const refs = [
    ...metricRefs(plan.metric),
    ...(plan.dimension ? [plan.dimension.column] : []),
    ...plan.filters.map((filter) => filter.column),
  ];
  const relationships = refs.flatMap((ref) => pathFrom(root, ref.table));
  const uniqueRelationships = [...new Map(relationships.map((relationship) => [
    `${relationship.left.table}.${relationship.left.column}:${relationship.right.table}.${relationship.right.column}`,
    relationship,
  ])).values()];
  const tables = [
    root,
    ...uniqueRelationships.flatMap((relationship) => [relationship.left.table, relationship.right.table]),
    ...refs.map((ref) => ref.table),
  ].filter((table, index, all) => all.indexOf(table) === index);
  const aliases = new Map(tables.map((table, index) => [table, `t${index}`]));
  let from = `${quoteIdentifier(root)} ${aliases.get(root)}`;
  const joined = new Set<string>([root]);
  const pending = [...uniqueRelationships];
  while (pending.length > 0) {
    const index = pending.findIndex((relationship) => joined.has(relationship.left.table) || joined.has(relationship.right.table));
    if (index < 0) throw new Error(`cannot order joins for ${plan.id}`);
    const relationship = pending.splice(index, 1)[0]!;
    const next = joined.has(relationship.left.table) ? relationship.right.table : relationship.left.table;
    from += ` LEFT JOIN ${quoteIdentifier(next)} ${aliases.get(next)} ON `
      + `${aliases.get(relationship.left.table)}.${quoteIdentifier(relationship.left.column)} = `
      + `${aliases.get(relationship.right.table)}.${quoteIdentifier(relationship.right.column)}`;
    joined.add(next);
  }
  const where = plan.filters.map((filter) => {
    const operator = filter.operator === 'equals' ? '=' : '<>';
    return `${aliases.get(filter.column.table)}.${quoteIdentifier(filter.column.column)} ${operator} ${literal(filter.value)}`;
  });
  const value = `ROUND(${metricSql(plan.metric, aliases)}, 2)`;
  const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  if (!plan.dimension) return `SELECT ${value} AS value FROM ${from}${whereSql}`;
  const rawDimension = `${aliases.get(plan.dimension.column.table)}.${quoteIdentifier(plan.dimension.column.column)}`;
  const dimension = plan.dimension.timeGrain ? `DATE_TRUNC('${plan.dimension.timeGrain}', ${rawDimension})` : rawDimension;
  return `SELECT ${dimension} AS label, ${value} AS value FROM ${from}${whereSql} GROUP BY 1 ORDER BY label ASC LIMIT ${plan.maxRows + 1}`;
}

function formatLabel(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const date = new Date(String(value));
  if (!Number.isNaN(date.getTime()) && /^\d{4}-\d{2}/.test(String(value))) return date.toISOString().slice(0, 10);
  return String(value);
}

function filterDescription(filters: readonly EvidenceFilter[]): string {
  if (filters.length === 0) return 'all rows';
  return filters.map((filter) => `${filter.column.table}.${filter.column.column} ${filter.operator === 'equals' ? 'equals' : 'does not equal'} ${String(filter.value)}`).join(' and ');
}

export async function executeEcommercePlan(engine: EvalEngine, plan: EcommerceEvidencePlan): Promise<{
  sql: string;
  evidence: EvidencePacket;
}> {
  const sql = compileEcommercePlan(plan);
  const result = await engine.execute(sql);
  const truncated = Boolean(plan.dimension && result.rows.length > plan.maxRows);
  const sourceRows = result.rows.slice(0, plan.maxRows);
  const rows: EvidenceRow[] = sourceRows.map((row, index) => ({
    rowId: `r${index + 1}`,
    label: plan.dimension
      ? formatLabel(row[0])
      : `${describeMetric(plan.metric)} for ${filterDescription(plan.filters)}`,
    value: typeof row[plan.dimension ? 1 : 0] === 'number' && Number.isFinite(row[plan.dimension ? 1 : 0])
      ? row[plan.dimension ? 1 : 0] as number
      : null,
    ...(plan.dimension ? { order: index } : {}),
  }));
  return {
    sql,
    evidence: {
      id: `evidence:${plan.id}`,
      metric: metricId(plan.metric),
      unit: metricUnit(plan.metric),
      ...(plan.dimension ? { dimension: `${plan.dimension.column.table}.${plan.dimension.column.column}${plan.dimension.timeGrain ? `/${plan.dimension.timeGrain}` : ''}` } : {}),
      completeness: truncated ? 'truncated' : 'complete',
      rows,
    },
  };
}
