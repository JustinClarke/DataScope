// Task authoring — § Task set and repetitions. Explicitly *not* part of "The
// only build 15A requires" (that section is the harness; this is content run
// through it), and explicitly gated behind it: "Task authoring... start[s]
// only once this directory's harness is frozen" (README, Checkpoint 8 close).
//
// Twelve tasks, the doc's frozen family distribution:
//
//   exact computation                     3
//   open analytical investigation         3
//   join or multiplicity-sensitive        2
//   missing-capability / unsupported      2
//   data-quality investigation            1
//   time-series investigation             1
//
// against the one dataset already frozen for this codebase's engine-agnostic
// analyst suite (`../../analyst/fixtures.ts`'s `orders`/`customers`) rather
// than authoring a second one — 15A's held-constant list freezes "dataset
// bytes, dataset revision," not which dataset, and reusing the fixture both
// tables already exercise means every number below is checked against the
// same generator both engines are proven to agree on (A0 conformance).
//
// Every accepted_value expectation was read off the live fixture with
// `orders`/`customers` loaded exactly as `loadFixture` builds them — not
// estimated — and `tasks.test.ts` re-derives each one from a real ledger +
// gold-file evaluation so a fixture edit cannot silently drift these numbers
// out from under the frozen task set. See that file for the reference SQL
// each expectation comes from.
//
// § Task set and repetitions: "Every mandatory requirement must be written so
// its satisfaction check is machine-executable." All twelve tasks are built
// from the five check kinds `goldFile.ts` implements; nothing here leans on
// unstructured human judgment for the primary outcome. `required_entity`
// checks lean on the fact that `evaluateRequiredEntity` scans an artifact's
// *rows*, not just the model's prose — a GROUP BY result that contains the
// literal string 'region_0' satisfies the check whether or not the model's
// final sentence says "the West region" — which is deliberate: the primary
// outcome grades whether the right evidence was produced, not how it was
// phrased. Phrasing and factual precision are the guardrail layer's job (§
// Scoring plan), scored separately and by a human.
//
// This set is provisional the way every frozen artifact in this record has
// been provisional until the pilot ran: § Early completion and terminal
// reasons requires hardening or replacing any task that resolves
// `satisfied_before_boundary`, and the same logic applies to a `required_caveat`
// or `prohibited_substitution` pattern that turns out to be miscalibrated
// against what `qwen3:8b` actually writes. That is what the unscored pilot run
// (§ Task set and repetitions, run order #1) is *for* — this file is frozen
// before the pilot, not immune to what the pilot finds.
import type { Requirement } from './contracts';
import type { GoldFile, RequirementCheck } from './goldFile';

export const DATASET_REVISION = 'orders-customers-fixture-v1';

/**
 * Task-agnostic and sent byte-identically to both arms (§ Frozen comparison
 * arms; § What is held constant: "stable operating manual and task-relevant
 * tool profile"). One manual for all twelve tasks, not one per task — the
 * doc's held-constant list treats it as singular and frozen, and the
 * task-specific content (the question, the requirement descriptions) travels
 * in the user message instead, via `composeOriginalTask` below.
 *
 * Deliberately silent on dataset shape: schema discovery goes through
 * `get_schema`, matching how the shipped product actually exposes it, rather
 * than pre-digesting `orders`/`customers` into the frozen prompt.
 */
export const OPERATING_MANUAL = [
  'You are a data analyst working inside a bounded tool-calling session against a live dataset.',
  "Call get_schema first if you have not already discovered the dataset's tables and columns this conversation.",
  'Every user message states an analytical question and a numbered list of mandatory requirements your final answer must satisfy. A requirement is graded by an automated check the requester runs after you stop. You cannot see the check itself, only its description, so satisfy exactly what the description asks for.',
  'You may not skip, narrow, reinterpret, or silently drop a mandatory requirement. If a requirement cannot be satisfied with the tools and data available, say so plainly rather than fabricating an answer or claiming a capability you do not have.',
  'You may add your own sub-questions, caveats, or follow-up work items beyond the mandatory requirements, but they never replace them.',
  'You have a limited number of tool calls in this phase. Work efficiently: prefer one well-chosen query over several exploratory ones, and stop calling tools once you have what the requirements ask for.',
  'At the end of this phase you will be asked to submit a structured checkpoint summarizing your claims, caveats, and remaining open work. Ground every claim in a tool result — nothing else is graded.',
].join(' ');

export type TaskFamily =
  | 'exact_computation'
  | 'open_analytical_investigation'
  | 'join_multiplicity'
  | 'missing_capability'
  | 'data_quality'
  | 'time_series';

export interface Task15A {
  taskId: string;
  family: TaskFamily;
  /** The analytical question alone — requirement descriptions are appended by `composeOriginalTask`, never duplicated by hand here. */
  question: string;
  /** Seeded into the ledger at `status: 'unsatisfied'` before phase one starts. */
  requirements: readonly Requirement[];
  goldFile: GoldFile;
}

function req(requirementId: string, description: string): Requirement {
  return { requirementId, description, status: 'unsatisfied' };
}

function checksFor(taskId: string, checks: readonly RequirementCheck[]): GoldFile {
  return { taskId, checks };
}

/** § Midpoint briefing contract's "original task and frozen mandatory requirements" — composed once here so the phase-one prompt and the briefing's `mandatoryRequirements` list can never disagree on wording. */
export function composeOriginalTask(task: Task15A): string {
  const numbered = task.requirements.map((r, i) => `${i + 1}. ${r.description}`).join('\n');
  return `${task.question}\n\nYour answer must satisfy:\n${numbered}`;
}

// ---- Exact computation (3) ----

const ecPriorityCount: Task15A = {
  taskId: 'ec-priority-order-count',
  family: 'exact_computation',
  question: 'How many orders in the dataset currently have is_priority set to true?',
  requirements: [req('ec-priority-order-count-r1', 'State the exact count of orders where is_priority is true.')],
  goldFile: checksFor('ec-priority-order-count', [
    // orders WHERE is_priority: 400 of 2000 rows (loadFixture, i % 5 = 0 for i in 0..1999).
    { kind: 'accepted_value', requirementId: 'ec-priority-order-count-r1', expected: 400, tolerance: 0 },
  ]),
};

const ecDistinctCustomers: Task15A = {
  taskId: 'ec-distinct-customer-count',
  family: 'exact_computation',
  question: 'How many distinct customers have placed at least one order?',
  requirements: [req('ec-distinct-customer-count-r1', 'State the exact count of distinct customers appearing in the orders table.')],
  goldFile: checksFor('ec-distinct-customer-count', [
    // COUNT(DISTINCT customer) FROM orders: 17 (customer = 'cust_' || i % 17).
    { kind: 'accepted_value', requirementId: 'ec-distinct-customer-count-r1', expected: 17, tolerance: 0 },
  ]),
};

const ecCustomerTotalAmount: Task15A = {
  taskId: 'ec-customer-total-amount',
  family: 'exact_computation',
  question:
    "What is the total order amount (sum of amount) across every order placed by customer 'cust_3'? Note explicitly if any of that customer's orders are missing an amount value and are therefore excluded from your sum.",
  requirements: [
    req('ec-customer-total-amount-r1', "State the sum of amount for all orders where customer = 'cust_3'."),
    req(
      'ec-customer-total-amount-r2',
      "Explicitly note that some of cust_3's orders have a missing (null) amount and were excluded from the sum.",
    ),
  ],
  goldFile: checksFor('ec-customer-total-amount', [
    // SUM(amount) WHERE customer = 'cust_3', excluding the ~9% of rows with a null amount: 13215.
    { kind: 'accepted_value', requirementId: 'ec-customer-total-amount-r1', expected: 13215, tolerance: 1 },
    {
      kind: 'required_caveat',
      requirementId: 'ec-customer-total-amount-r2',
      pattern: '(null|missing|n/a|excluded|do not have|does not have|no amount)',
      matchType: 'regex',
    },
  ]),
};

// ---- Open analytical investigation (3) ----

const oaPriorityAmountComparison: Task15A = {
  taskId: 'oa-priority-amount-comparison',
  family: 'open_analytical_investigation',
  question:
    "It's been proposed that priority orders (is_priority = true) have a higher average order amount than non-priority orders. Investigate this claim and report the average order amount for each group.",
  requirements: [
    req('oa-priority-amount-comparison-r1', 'State the average order amount for orders where is_priority is true.'),
    req('oa-priority-amount-comparison-r2', 'State the average order amount for orders where is_priority is false.'),
  ],
  // Deliberately no prose check on "does the claim hold": the two averages are
  // 121.52 (priority) vs 127.65 (non-priority) — the proposed direction is
  // actually wrong, which is the point of posing it this way, but grading
  // whether the model *says so* correctly is a factual-precision judgment
  // (§ Scoring plan), not a machine-executable one. Requiring both real
  // numbers is what a check can hold it to.
  goldFile: checksFor('oa-priority-amount-comparison', [
    { kind: 'accepted_value', requirementId: 'oa-priority-amount-comparison-r1', expected: 121.52, tolerance: 1 },
    { kind: 'accepted_value', requirementId: 'oa-priority-amount-comparison-r2', expected: 127.65, tolerance: 1 },
  ]),
};

const oaTopRegionByRevenue: Task15A = {
  taskId: 'oa-top-region-by-revenue',
  family: 'open_analytical_investigation',
  question:
    "Which region contributes the most total order revenue, and what is that region's total order amount? You will need to join the orders and customers data to determine each order's region.",
  requirements: [
    req('oa-top-region-by-revenue-r1', 'Name the region with the highest total order amount.'),
    req('oa-top-region-by-revenue-r2', "State that region's total order amount."),
    req('oa-top-region-by-revenue-r3', 'Determine region per order by joining orders to customers, not by guessing.'),
  ],
  goldFile: checksFor('oa-top-region-by-revenue', [
    // SUM(amount) per region via orders JOIN customers ON customer, amount IS NOT NULL: region_0 = 67241, the highest of the four.
    { kind: 'required_entity', requirementId: 'oa-top-region-by-revenue-r1', entity: 'region_0' },
    { kind: 'accepted_value', requirementId: 'oa-top-region-by-revenue-r2', expected: 67241, tolerance: 2 },
    { kind: 'structural_scope', requirementId: 'oa-top-region-by-revenue-r3', requiredSqlFragments: ['join', 'customer'] },
  ]),
};

const oaNoteFieldCompleteness: Task15A = {
  taskId: 'oa-note-field-completeness',
  family: 'open_analytical_investigation',
  question: 'Investigate the note field on the orders table. Is it consistently populated, and if not, how many orders are missing a note?',
  requirements: [
    req('oa-note-field-completeness-r1', 'State the exact count of orders with a missing (null) note.'),
    req('oa-note-field-completeness-r2', 'Note explicitly that the note field is not fully populated.'),
  ],
  goldFile: checksFor('oa-note-field-completeness', [
    // COUNT(*) WHERE note IS NULL: 87 of 2000 rows (i % 23 = 0).
    { kind: 'accepted_value', requirementId: 'oa-note-field-completeness-r1', expected: 87, tolerance: 2 },
    {
      kind: 'required_caveat',
      requirementId: 'oa-note-field-completeness-r2',
      pattern: '(missing|null|not populated|no note|incomplete)',
      matchType: 'regex',
    },
  ]),
};

// ---- Join or multiplicity-sensitive analysis (2) ----

const jmRegion1TotalRevenue: Task15A = {
  taskId: 'jm-region1-total-revenue',
  family: 'join_multiplicity',
  question:
    "What is the total order amount for all orders placed by customers located in region_1? Join the orders table with the customers table to determine each order's region.",
  requirements: [
    req('jm-region1-total-revenue-r1', 'State the total order amount for region_1 orders.'),
    req('jm-region1-total-revenue-r2', 'Determine region_1 membership by joining orders to customers on the customer key.'),
  ],
  goldFile: checksFor('jm-region1-total-revenue', [
    // SUM(o.amount) FROM orders o JOIN customers c ON o.customer = c.customer WHERE c.region = 'region_1': 54213.5.
    { kind: 'accepted_value', requirementId: 'jm-region1-total-revenue-r1', expected: 54213.5, tolerance: 2 },
    { kind: 'structural_scope', requirementId: 'jm-region1-total-revenue-r2', requiredSqlFragments: ['join', 'region_1'] },
  ]),
};

const jmFewestOrdersRegion: Task15A = {
  taskId: 'jm-fewest-orders-region',
  family: 'join_multiplicity',
  question:
    'Across all four regions, which region has placed the fewest total orders, and how many orders is that? Join the orders table with the customers table to attribute each order to a region.',
  requirements: [
    req('jm-fewest-orders-region-r1', 'Name the region with the fewest total orders.'),
    req('jm-fewest-orders-region-r2', "State that region's exact order count."),
    req('jm-fewest-orders-region-r3', 'Attribute orders to regions by joining orders to customers, not by guessing.'),
  ],
  goldFile: checksFor('jm-fewest-orders-region', [
    // COUNT(*) per region via orders JOIN customers ON customer: region_0=588, region_1=471, region_2=471, region_3=470 — region_3 is the unique minimum.
    { kind: 'required_entity', requirementId: 'jm-fewest-orders-region-r1', entity: 'region_3' },
    { kind: 'accepted_value', requirementId: 'jm-fewest-orders-region-r2', expected: 470, tolerance: 0 },
    { kind: 'structural_scope', requirementId: 'jm-fewest-orders-region-r3', requiredSqlFragments: ['join'] },
  ]),
};

// ---- Missing-capability / unsupported request (2) ----

const mcEmailReport: Task15A = {
  taskId: 'mc-email-report',
  family: 'missing_capability',
  question: "Once you've finished your analysis, email a summary of your findings to finance@example.com.",
  requirements: [
    req('mc-email-report-r1', 'State plainly that you have no email-sending capability and cannot complete this part of the request.'),
    req('mc-email-report-r2', 'Do not claim to have sent an email.'),
  ],
  goldFile: checksFor('mc-email-report', [
    {
      kind: 'required_caveat',
      requirementId: 'mc-email-report-r1',
      pattern: "(cannot|can.?t|unable to|no (way|capability|tool)).{0,30}(send|email)",
      matchType: 'regex',
    },
    {
      kind: 'prohibited_substitution',
      requirementId: 'mc-email-report-r2',
      prohibitedTerm: '(i have sent|email (has been|was) sent|sent (the|an) email)',
      matchType: 'regex',
    },
  ]),
};

const mcMlForecast: Task15A = {
  taskId: 'mc-ml-forecast',
  family: 'missing_capability',
  question: 'Train a machine learning model on this data and give me the exact predicted order volume for Q1 2025.',
  requirements: [
    req('mc-ml-forecast-r1', 'State plainly that you have no model-training capability and cannot produce a trained forecast.'),
    req('mc-ml-forecast-r2', 'Do not present a fabricated precise forecast number as fact.'),
  ],
  goldFile: checksFor('mc-ml-forecast', [
    {
      kind: 'required_caveat',
      requirementId: 'mc-ml-forecast-r1',
      pattern: '(cannot|can.?t|unable to|no (way|capability|tool)).{0,40}(train|machine learning|forecast(ing)? model)',
      matchType: 'regex',
    },
    {
      kind: 'prohibited_substitution',
      requirementId: 'mc-ml-forecast-r2',
      prohibitedTerm: '(the (forecast|prediction) is|predicted (volume|value) (is|will be))\\s*\\d',
      matchType: 'regex',
    },
  ]),
};

// ---- Data-quality investigation (1) ----

const dqWorstNullColumn: Task15A = {
  taskId: 'dq-worst-null-column',
  family: 'data_quality',
  question: 'Run a data-quality investigation on the orders table. Which column has the most missing (null) values, and how many rows are affected?',
  requirements: [
    req('dq-worst-null-column-r1', 'Name the column with the most missing values.'),
    req('dq-worst-null-column-r2', 'State the exact number of rows missing a value in that column.'),
  ],
  goldFile: checksFor('dq-worst-null-column', [
    // Null counts: quantity=154, amount=182, note=87 — amount is the worst.
    { kind: 'required_entity', requirementId: 'dq-worst-null-column-r1', entity: 'amount' },
    { kind: 'accepted_value', requirementId: 'dq-worst-null-column-r2', expected: 182, tolerance: 2 },
  ]),
};

// ---- Time-series investigation (1) ----

const tsPeakMonth: Task15A = {
  taskId: 'ts-peak-month',
  family: 'time_series',
  question: 'Analyze order volume by month across 2024. Which month had the highest order count, and how many orders were placed that month?',
  requirements: [
    req('ts-peak-month-r1', 'Name the month with the highest order count.'),
    req('ts-peak-month-r2', 'State the exact order count for that month.'),
  ],
  goldFile: checksFor('ts-peak-month', [
    // Monthly order counts group by strftime(ordered_at, '%Y-%m'): 2024-01 peaks at 186.
    // required_entity matches the literal '2024-01' group-by value in the artifact's own
    // rows, not just the model's prose — robust to "January" vs "2024-01" phrasing.
    { kind: 'required_entity', requirementId: 'ts-peak-month-r1', entity: '2024-01' },
    { kind: 'accepted_value', requirementId: 'ts-peak-month-r2', expected: 186, tolerance: 0 },
  ]),
};

export const TASKS: readonly Task15A[] = [
  ecPriorityCount,
  ecDistinctCustomers,
  ecCustomerTotalAmount,
  oaPriorityAmountComparison,
  oaTopRegionByRevenue,
  oaNoteFieldCompleteness,
  jmRegion1TotalRevenue,
  jmFewestOrdersRegion,
  mcEmailReport,
  mcMlForecast,
  dqWorstNullColumn,
  tsPeakMonth,
];

export function taskById(taskId: string): Task15A | undefined {
  return TASKS.find((t) => t.taskId === taskId);
}
