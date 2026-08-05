import { describeMetric, type ColumnRef, type Metric } from '../12-verified-claims/metrics';
import { averageOrderValueMetric, averageOrderValuePlan, monthlyRevenuePlan } from '../12-verified-claims/phase3Plans';
import {
  categoryQuantityPlan,
  categoryRevenuePlan,
  countryOrdersPlan,
  PHASE5_QUESTIONS,
  statusRevenuePlan,
} from '../12-verified-claims/phase5Protocol';
import type { EcommerceEvidencePlan } from '../12-verified-claims/ecommercePipeline';
import type {
  AnalysisOffer,
  AnalysisOfferCard,
  DatasetPassport,
  ProbeCandidate,
  ProbeCandidateCard,
} from './contracts';

function hasColumn(passport: DatasetPassport, ref: ColumnRef): boolean {
  const table = passport.tables.find((candidate) => candidate.name === ref.table);
  return table !== undefined && table.columns.some((column) => column.column === ref.column);
}

/**
 * The pre-registered answer key for a plan-backed candidate: every answerable question that
 * cites this exact plan. Scoring only — never projected onto a card (see
 * `ProbeCandidate.questionRelevance`).
 */
function questionRelevanceForPlan(plan: EcommerceEvidencePlan): string[] {
  return PHASE5_QUESTIONS.filter((question) => question.kind === 'answerable' && question.plans.includes(plan)).map(
    (question) => question.id,
  );
}

interface PlanCandidateDefinition {
  id: string;
  kind: 'summary' | 'group_metric' | 'time_series';
  plan: EcommerceEvidencePlan;
  metric: Metric;
  dimension?: ColumnRef;
  timeGrain?: 'month';
  costClass: 'small' | 'medium';
  requires: ColumnRef[];
  /**
   * Model-facing semantic tags: what the computation is *about*, in the dataset's own terms.
   * Deliberately describes data, not use cases — 'value' rather than 'revenue' (§ Probe
   * candidates forbids upgrading `sum(quantity * unit_price)` to authoritative revenue) and
   * never a word lifted from a question's phrasing.
   */
  topicTags: string[];
}

const PLAN_CANDIDATES: readonly PlanCandidateDefinition[] = [
  {
    id: 'monthly-revenue',
    kind: 'time_series',
    plan: monthlyRevenuePlan,
    metric: monthlyRevenuePlan.metric,
    dimension: { table: 'orders', column: 'order_date' },
    timeGrain: 'month',
    costClass: 'medium',
    requires: [
      { table: 'orders', column: 'order_date' },
      { table: 'order_items', column: 'quantity' },
      { table: 'order_items', column: 'unit_price' },
    ],
    topicTags: ['time', 'monthly', 'value'],
  },
  {
    id: 'average-order-value',
    kind: 'summary',
    plan: averageOrderValuePlan,
    metric: averageOrderValueMetric,
    costClass: 'small',
    requires: [
      { table: 'order_items', column: 'quantity' },
      { table: 'order_items', column: 'unit_price' },
      { table: 'orders', column: 'status' },
    ],
    topicTags: ['average', 'value', 'orders'],
  },
  {
    id: 'category-revenue',
    kind: 'group_metric',
    plan: categoryRevenuePlan,
    metric: categoryRevenuePlan.metric,
    dimension: { table: 'products', column: 'category' },
    costClass: 'small',
    requires: [
      { table: 'products', column: 'category' },
      { table: 'order_items', column: 'quantity' },
      { table: 'order_items', column: 'unit_price' },
    ],
    topicTags: ['category', 'value'],
  },
  {
    id: 'category-quantity',
    kind: 'group_metric',
    plan: categoryQuantityPlan,
    metric: categoryQuantityPlan.metric,
    dimension: { table: 'products', column: 'category' },
    costClass: 'small',
    requires: [
      { table: 'products', column: 'category' },
      { table: 'order_items', column: 'quantity' },
    ],
    topicTags: ['category', 'quantity'],
  },
  {
    id: 'status-revenue',
    kind: 'group_metric',
    plan: statusRevenuePlan,
    metric: statusRevenuePlan.metric,
    dimension: { table: 'orders', column: 'status' },
    costClass: 'small',
    requires: [
      { table: 'orders', column: 'status' },
      { table: 'order_items', column: 'quantity' },
      { table: 'order_items', column: 'unit_price' },
    ],
    topicTags: ['status', 'value'],
  },
  {
    id: 'country-orders',
    kind: 'group_metric',
    plan: countryOrdersPlan,
    metric: countryOrdersPlan.metric,
    dimension: { table: 'customers', column: 'country' },
    costClass: 'small',
    requires: [
      { table: 'customers', column: 'country' },
      { table: 'orders', column: 'order_id' },
    ],
    topicTags: ['country', 'orders'],
  },
];

function planCandidates(passport: DatasetPassport): ProbeCandidate[] {
  return PLAN_CANDIDATES.filter((definition) => definition.requires.every((ref) => hasColumn(passport, ref))).map(
    (definition) => ({
      id: definition.id,
      kind: definition.kind,
      metric: definition.metric,
      ...(definition.dimension === undefined ? {} : { dimension: definition.dimension }),
      ...(definition.timeGrain === undefined ? {} : { timeGrain: definition.timeGrain }),
      filters: definition.plan.filters,
      maxResultRows: definition.plan.maxRows,
      estimatedCostClass: definition.costClass,
      questionRelevance: questionRelevanceForPlan(definition.plan),
      topicTags: definition.topicTags,
      resolution: { mode: 'plan', plan: definition.plan },
    }),
  );
}

function missingnessCandidate(passport: DatasetPassport): ProbeCandidate | null {
  const columnCount = passport.tables.reduce((sum, table) => sum + table.columns.length, 0);
  if (columnCount === 0) return null;
  return {
    id: 'table-missingness',
    kind: 'missingness',
    metric: null,
    filters: [],
    maxResultRows: columnCount,
    estimatedCostClass: 'small',
    questionRelevance: ['understand-ecommerce'],
    topicTags: ['completeness', 'fields'],
    resolution: { mode: 'missingness' },
  };
}

function joinCoverageCandidate(passport: DatasetPassport): ProbeCandidate | null {
  if (passport.relationships.length === 0) return null;
  return {
    id: 'join-coverage',
    kind: 'join_coverage',
    metric: null,
    filters: [],
    maxResultRows: passport.relationships.length,
    estimatedCostClass: 'small',
    questionRelevance: ['understand-ecommerce'],
    topicTags: ['relationships', 'completeness'],
    resolution: { mode: 'join_coverage' },
  };
}

function comparePeriodsCandidate(passport: DatasetPassport): ProbeCandidate | null {
  const source = PLAN_CANDIDATES.find((definition) => definition.id === 'monthly-revenue');
  if (!source || !source.requires.every((ref) => hasColumn(passport, ref))) return null;
  return {
    id: 'largest-monthly-change',
    kind: 'compare_periods',
    metric: null,
    filters: [],
    maxResultRows: 12,
    estimatedCostClass: 'medium',
    questionRelevance: ['odd-sales-investigation'],
    topicTags: ['time', 'change', 'value'],
    resolution: { mode: 'compare_periods', sourceCandidateId: 'monthly-revenue' },
  };
}

/**
 * Deterministic in the dataset hash: a pure function of the passport, no clocks or randomness.
 * Two calls against the same passport produce byte-identical candidates (Checkpoint 1 test gate).
 */
export function generateCandidates(passport: DatasetPassport): ProbeCandidate[] {
  const derived = [missingnessCandidate(passport), joinCoverageCandidate(passport), comparePeriodsCandidate(passport)].filter(
    (candidate): candidate is ProbeCandidate => candidate !== null,
  );
  return [...planCandidates(passport), ...derived];
}

function describeCandidate(candidate: ProbeCandidate): string {
  if (candidate.resolution.mode === 'missingness') return 'table and field missingness across the dataset';
  if (candidate.resolution.mode === 'join_coverage') return 'row coverage across every inferred relationship';
  if (candidate.resolution.mode === 'compare_periods') return 'the largest complete month-to-month change in monthly revenue';
  const base = describeMetric(candidate.metric!);
  if (!candidate.dimension) return base;
  const grain = candidate.timeGrain ? ` by ${candidate.timeGrain}` : '';
  return `${base} grouped by ${candidate.dimension.table}.${candidate.dimension.column}${grain}`;
}

/** The only projection of a candidate a model prompt may see — `questionRelevance` never leaves the server. */
export function candidateCard(candidate: ProbeCandidate): ProbeCandidateCard {
  return {
    id: candidate.id,
    description: describeCandidate(candidate),
    estimatedCostClass: candidate.estimatedCostClass,
    topicTags: candidate.topicTags,
  };
}

/** One deterministic executable offer per candidate operation (§ Probe candidates, final bullet). */
export function generateOffers(candidates: readonly ProbeCandidate[]): AnalysisOffer[] {
  return candidates.map((candidate) => ({
    id: `offer:${candidate.id}`,
    description: `Compute ${describeCandidate(candidate)} as the next analysis step.`,
    questionRelevance: candidate.questionRelevance,
    topicTags: candidate.topicTags,
  }));
}

/** The only projection of an offer a model prompt may see. */
export function offerCard(offer: AnalysisOffer): AnalysisOfferCard {
  return { id: offer.id, description: offer.description, topicTags: offer.topicTags };
}
