import type { EvalEngine } from '../../duckdb/duckdb';
import type {
  AnalysisPlan,
  ColumnRef,
  DatasetPassport,
  EvidencePacket,
  MetricSpec,
  ProbePlan,
  Relationship,
} from './contracts';

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function refsForMetric(metric: MetricSpec): ColumnRef[] {
  if (metric.aggregate === 'count') return [];
  if (metric.aggregate === 'sum_product') return [metric.left, metric.right];
  return [metric.column];
}

function metricRoot(metric: MetricSpec): string {
  if (metric.aggregate === 'count') return metric.table;
  if (metric.aggregate === 'sum_product') return metric.left.table;
  return metric.column.table;
}

function assertColumn(passport: DatasetPassport, ref: ColumnRef): void {
  const table = passport.tables.find((candidate) => candidate.name === ref.table);
  if (!table) throw new Error(`unknown table ${ref.table}`);
  if (!table.columns.some((column) => column.column === ref.column)) {
    throw new Error(`unknown column ${ref.table}.${ref.column}`);
  }
}

function assertTable(passport: DatasetPassport, tableName: string): void {
  if (!passport.tables.some((table) => table.name === tableName)) throw new Error(`unknown table ${tableName}`);
}

interface PathStep {
  from: string;
  to: string;
  relationship: Relationship;
}

function pathBetween(passport: DatasetPassport, start: string, target: string): PathStep[] {
  if (start === target) return [];
  const queue: { table: string; path: PathStep[] }[] = [{ table: start, path: [] }];
  const seen = new Set([start]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const relationship of passport.relationships) {
      const endpoints = [relationship.one.table, relationship.many.table];
      if (!endpoints.includes(current.table)) continue;
      const next = endpoints[0] === current.table ? endpoints[1]! : endpoints[0]!;
      if (seen.has(next)) continue;
      const step: PathStep = { from: current.table, to: next, relationship };
      const path = [...current.path, step];
      if (next === target) return path;
      seen.add(next);
      queue.push({ table: next, path });
    }
  }
  throw new Error(`no inferred relationship path from ${start} to ${target}`);
}

function sqlLiteral(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('filter number must be finite');
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function validateProbe(passport: DatasetPassport, probe: ProbePlan): void {
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(probe.id)) throw new Error(`invalid probe id ${probe.id}`);
  if (probe.title.trim().length < 3 || probe.title.length > 100) throw new Error(`invalid title for ${probe.id}`);
  if (!Number.isInteger(probe.limit) || probe.limit < 1 || probe.limit > 20) {
    throw new Error(`limit for ${probe.id} must be an integer from 1 to 20`);
  }
  const root = metricRoot(probe.metric);
  assertTable(passport, root);
  const metricRefs = refsForMetric(probe.metric);
  for (const ref of metricRefs) assertColumn(passport, ref);
  if (probe.metric.aggregate === 'sum_product' && probe.metric.left.table !== probe.metric.right.table) {
    throw new Error('sum_product columns must belong to the same table');
  }
  if (probe.kind === 'summary' && probe.dimension) throw new Error('summary probes cannot have a dimension');
  if (probe.kind !== 'summary' && !probe.dimension) throw new Error(`${probe.kind} requires a dimension`);
  if (probe.dimension) {
    assertColumn(passport, probe.dimension);
    const column = passport.tables
      .find((table) => table.name === probe.dimension!.table)!
      .columns.find((candidate) => candidate.column === probe.dimension!.column)!;
    if (probe.kind === 'trend' && column.semanticType !== 'Temporal') {
      throw new Error(`trend dimension ${probe.dimension.table}.${probe.dimension.column} is not temporal`);
    }
  }
  if (probe.kind === 'trend' && !probe.timeGrain) throw new Error('trend requires timeGrain');
  if (probe.kind !== 'trend' && probe.timeGrain) throw new Error('timeGrain is only valid for trend probes');
  for (const filter of probe.filters) assertColumn(passport, filter.column);
  const referencedTables = new Set([
    ...metricRefs.map((ref) => ref.table),
    ...(probe.dimension ? [probe.dimension.table] : []),
    ...probe.filters.map((filter) => filter.column.table),
  ]);
  for (const table of referencedTables) pathBetween(passport, root, table);
}

function collectJoinSteps(passport: DatasetPassport, root: string, targets: string[]): PathStep[] {
  const steps: PathStep[] = [];
  const keys = new Set<string>();
  for (const target of targets) {
    for (const step of pathBetween(passport, root, target)) {
      const key = [step.relationship.one.table, step.relationship.many.table].sort().join('|');
      if (!keys.has(key)) {
        keys.add(key);
        steps.push(step);
      }
    }
  }
  return steps;
}

function metricSql(metric: MetricSpec, aliases: Map<string, string>): string {
  const field = (ref: ColumnRef) => `${aliases.get(ref.table)}.${quoteIdentifier(ref.column)}`;
  switch (metric.aggregate) {
    case 'count':
      return 'COUNT(*)';
    case 'count_distinct':
      return `COUNT(DISTINCT ${field(metric.column)})`;
    case 'sum':
      return `SUM(${field(metric.column)})`;
    case 'average':
      return `AVG(${field(metric.column)})`;
    case 'sum_product':
      return `SUM(${field(metric.left)} * ${field(metric.right)})`;
  }
}

function refLabel(ref: ColumnRef): string {
  return `${ref.table}.${ref.column}`;
}

function metricLabel(metric: MetricSpec): string {
  switch (metric.aggregate) {
    case 'count':
      return `count of rows in ${metric.table}`;
    case 'count_distinct':
      return `distinct count of ${refLabel(metric.column)}`;
    case 'sum':
      return `sum of ${refLabel(metric.column)}`;
    case 'average':
      return `average of ${refLabel(metric.column)}`;
    case 'sum_product':
      return `sum of ${refLabel(metric.left)} × ${refLabel(metric.right)}`;
  }
}

export function compileProbe(passport: DatasetPassport, probe: ProbePlan): string {
  validateProbe(passport, probe);
  const root = metricRoot(probe.metric);
  const targets = [
    ...refsForMetric(probe.metric).map((ref) => ref.table),
    ...(probe.dimension ? [probe.dimension.table] : []),
    ...probe.filters.map((filter) => filter.column.table),
  ];
  const steps = collectJoinSteps(passport, root, targets);
  const tableOrder = [root];
  for (const step of steps) {
    if (!tableOrder.includes(step.from)) tableOrder.push(step.from);
    if (!tableOrder.includes(step.to)) tableOrder.push(step.to);
  }
  const aliases = new Map(tableOrder.map((table, index) => [table, `t${index}`]));
  let from = `${quoteIdentifier(root)} ${aliases.get(root)}`;
  const joined = new Set([root]);
  const pending = [...steps];
  while (pending.length > 0) {
    const index = pending.findIndex((step) => joined.has(step.from) || joined.has(step.to));
    if (index < 0) throw new Error(`cannot order joins for ${probe.id}`);
    const [step] = pending.splice(index, 1);
    const nextTable = joined.has(step.from) ? step.to : step.from;
    const relationship = step.relationship;
    from +=
      ` LEFT JOIN ${quoteIdentifier(nextTable)} ${aliases.get(nextTable)} ON ` +
      `${aliases.get(relationship.many.table)}.${quoteIdentifier(relationship.many.column)} = ` +
      `${aliases.get(relationship.one.table)}.${quoteIdentifier(relationship.one.column)}`;
    joined.add(nextTable);
  }
  const where = probe.filters.map((filter) => {
    const operator = filter.operator === 'equals' ? '=' : '<>';
    return `${aliases.get(filter.column.table)}.${quoteIdentifier(filter.column.column)} ${operator} ${sqlLiteral(filter.value)}`;
  });
  const value = `ROUND(${metricSql(probe.metric, aliases)}, 2)`;
  if (!probe.dimension) {
    return `SELECT ${value} AS value FROM ${from}${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''}`;
  }
  const rawDimension = `${aliases.get(probe.dimension.table)}.${quoteIdentifier(probe.dimension.column)}`;
  const dimension =
    probe.kind === 'trend' ? `DATE_TRUNC('${probe.timeGrain}', ${rawDimension})` : rawDimension;
  const direction = probe.kind === 'trend' ? 'label ASC' : 'value DESC NULLS LAST';
  return (
    `SELECT ${dimension} AS label, ${value} AS value FROM ${from}` +
    `${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''} ` +
    `GROUP BY 1 ORDER BY ${direction} LIMIT ${probe.limit}`
  );
}

function formatCell(value: unknown, columnType: string | undefined): string {
  if (value === null || value === undefined) return 'null';
  if (/date|timestamp/i.test(columnType ?? '')) {
    const date = value instanceof Date ? value : new Date(typeof value === 'number' ? value : String(value));
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
}

export async function executePlan(
  engine: EvalEngine,
  passport: DatasetPassport,
  plan: AnalysisPlan,
): Promise<EvidencePacket[]> {
  if (plan.probes.length < 1 || plan.probes.length > 4) throw new Error('plan must contain 1 to 4 probes');
  const ids = new Set<string>();
  const evidence: EvidencePacket[] = [];
  for (const [probeIndex, probe] of plan.probes.entries()) {
    if (ids.has(probe.id)) throw new Error(`duplicate probe id ${probe.id}`);
    ids.add(probe.id);
    const sql = compileProbe(passport, probe);
    const result = await engine.execute(sql);
    const rows = result.rows
      .slice(0, 20)
      .map((row) => row.map((cell, index) => formatCell(cell, result.columnTypes[index])).join(' = '))
      .join('; ');
    const grouping = probe.dimension
      ? ` grouped by ${probe.dimension.table}.${probe.dimension.column}${probe.kind === 'trend' ? ` (${probe.timeGrain})` : ''}`
      : '';
    evidence.push({
      id: `evidence:${probeIndex + 1}`,
      title: probe.title,
      sql,
      result,
      statement: `${metricLabel(probe.metric)}${grouping}: ${rows || 'no rows'} (returned ${result.rowCount} row${result.rowCount === 1 ? '' : 's'})`,
    });
  }
  return evidence;
}
