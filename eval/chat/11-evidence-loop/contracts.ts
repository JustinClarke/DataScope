import type { QueryResult } from '../../../src/types';

export interface ColumnRef {
  table: string;
  column: string;
}

export interface PassportColumn extends ColumnRef {
  physicalType: string;
  semanticType: string;
  distinctCount: number;
  nullCount: number;
  min: string | number | null;
  max: string | number | null;
}

export interface PassportTable {
  name: string;
  rowCount: number;
  columns: PassportColumn[];
  candidateKeys: string[];
  duplicateRows: number;
}

export interface Relationship {
  one: ColumnRef;
  many: ColumnRef;
  orphanCount: number;
}

export interface QualityFinding {
  severity: 'info' | 'warning';
  code: 'nulls' | 'duplicates' | 'constant' | 'orphans';
  message: string;
}

export interface DatasetPassport {
  datasetId: string;
  header: {
    tableCount: number;
    totalRows: number;
    dateRange: { min: string; max: string } | null;
  };
  tables: PassportTable[];
  relationships: Relationship[];
  quality: QualityFinding[];
}

export type MetricSpec =
  | { aggregate: 'count'; table: string }
  | { aggregate: 'count_distinct' | 'sum' | 'average'; column: ColumnRef }
  | { aggregate: 'sum_product'; left: ColumnRef; right: ColumnRef };

export interface ProbeFilter {
  column: ColumnRef;
  operator: 'equals' | 'not_equals';
  value: string | number;
}

export interface ProbePlan {
  id: string;
  title: string;
  kind: 'breakdown' | 'ranking' | 'trend' | 'summary';
  metric: MetricSpec;
  dimension?: ColumnRef;
  timeGrain?: 'day' | 'month' | 'quarter' | 'year';
  filters: ProbeFilter[];
  limit: number;
}

export interface AnalysisPlan {
  rationale: string;
  probes: ProbePlan[];
}

export interface EvidencePacket {
  id: string;
  title: string;
  sql: string;
  result: QueryResult;
  statement: string;
}

export interface DraftFinding {
  observation: string;
  implication: string;
  evidenceIds: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface DraftAnswer {
  summary: string;
  findings: DraftFinding[];
  presentationIdeas: string[];
  transformIdeas: string[];
  limits: string[];
}

export interface RejectedFinding {
  finding: DraftFinding;
  reasons: string[];
}

export interface ValidatedAnswer extends Omit<DraftAnswer, 'findings'> {
  findings: DraftFinding[];
  rejected: RejectedFinding[];
}

