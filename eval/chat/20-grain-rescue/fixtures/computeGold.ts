// DESIGN.md §2: every gold answer is computed by two independently-written
// SQL formulations that must agree numerically before the fixture is
// committed — a disagreement is a bug in the *question*, not a rounding
// issue. This script runs both formulations for every registered question
// against the combined catalog, gates each question's premises against
// dataset-facts.json (the gate that would have caught v1's weather.csv
// error at design time — OPUS_REVIEW.md B1), asserts tie-freedom for every
// argmax/top-N check, and writes the agreed values to
// fixtures/questions.json and fixtures/dataset-facts.json.
//
// Run: npx tsx eval/chat/20-grain-rescue/fixtures/computeGold.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DuckDBConnection } from '@duckdb/node-api';
import { ALL_TABLE_SOURCES, bootstrapAllDatasets } from '../bootstrap';
import { buildTableRegistry } from '../profiler';
import { buildDatasetFacts } from '../datasetFacts';
import { assertPremises, type Premise } from '../premises';
import { numericMatch, type ExecutedResult } from '../score';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(HERE, '..', 'runs', 'test', 'compute-gold.duckdb');
const FACTS_PATH = join(HERE, 'dataset-facts.json');
const QUESTIONS_PATH = join(HERE, 'questions.json');

export type Dataset = 'titanic' | 'weather' | 'stock_prices' | 'product_reviews' | 'chasm' | 'ecommerce';

export interface CheckSpec {
  label: string;
  grading: 'scalar' | 'rows';
  sqlA: string;
  sqlB: string;
  /** For argmax/top-N checks only: a query returning a single count that must be 0 for the boundary to be tie-free (DESIGN.md §2). */
  tieCheckSql?: string;
}

export interface QuestionSpec {
  id: string;
  dataset: Dataset;
  category: 'profiling' | 'analytical';
  trap: string[];
  text: string;
  /** DESIGN.md §2 paraphrase requirement: required for every G/X/V/M/TG-tagged question — a wording that never names the correct grain, sharing this question's gold value. Asserted present by `assertParaphrasesPresent` below. */
  paraphrase?: string;
  premises: Premise[];
  checks: CheckSpec[];
}

export interface ComputedCheck {
  label: string;
  grading: 'scalar' | 'rows';
  scalar?: number | string;
  rows?: Array<Array<number | string>>;
}

export interface ComputedQuestion {
  id: string;
  dataset: Dataset;
  category: string;
  trap: string[];
  text: string;
  wording: 'explicit' | 'paraphrase';
  checks: ComputedCheck[];
}

/** DESIGN.md §2: these trap tags require a committed paraphrase (a wording that never names the correct grain). */
const PARAPHRASE_REQUIRED_TRAPS = new Set(['G', 'X', 'V', 'M', 'TG']);

function assertParaphrasesPresent(questions: QuestionSpec[]): void {
  const missing = questions.filter((q) => q.trap.some((t) => PARAPHRASE_REQUIRED_TRAPS.has(t)) && !q.paraphrase);
  if (missing.length > 0) {
    throw new Error(`Missing required paraphrase (DESIGN.md §2) for: ${missing.map((q) => q.id).join(', ')}`);
  }
}

function normalizeCell(value: unknown): number | string {
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === null || value === undefined) return '';
  return value as number | string;
}

async function runSql(conn: DuckDBConnection, sql: string): Promise<ExecutedResult> {
  const result = await conn.run(sql);
  const columnNames = result.columnNames();
  const rows = (await result.getRowsJS()).map((row) => row.map(normalizeCell));
  return { columnNames, rows };
}

function scalarsAgree(a: unknown, b: unknown): boolean {
  const an = typeof a === 'number' ? a : Number(a);
  const bn = typeof b === 'number' ? b : Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return numericMatch(an, bn);
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/** Sorted, coarsely-rounded key so two structurally different (but agreeing) formulations pair up the same logical row even with float noise. */
function sortKey(row: readonly unknown[]): string {
  return row.map((c) => (typeof c === 'number' ? c.toFixed(2) : String(c).toLowerCase())).join('|');
}

function rowsAgree(a: ExecutedResult, b: ExecutedResult): boolean {
  if (a.rows.length !== b.rows.length) return false;
  const aSorted = [...a.rows].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  const bSorted = [...b.rows].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  return aSorted.every((row, i) => {
    const other = bSorted[i]!;
    if (row.length !== other.length) return false;
    return row.every((cell, j) => scalarsAgree(cell, other[j]));
  });
}

async function computeCheck(conn: DuckDBConnection, questionId: string, check: CheckSpec): Promise<ComputedCheck> {
  const resultA = await runSql(conn, check.sqlA);
  const resultB = await runSql(conn, check.sqlB);

  if (check.tieCheckSql) {
    const tieResult = await runSql(conn, check.tieCheckSql);
    const tieCount = Number(tieResult.rows[0]?.[0] ?? 0);
    if (tieCount !== 0) {
      throw new Error(`${questionId}/${check.label}: tie detected at the reported boundary (excess=${tieCount}) — adjust or drop the question`);
    }
  }

  if (check.grading === 'scalar') {
    if (resultA.rows.length === 0 || resultA.rows[0]!.length === 0) throw new Error(`${questionId}/${check.label}: sqlA returned no rows`);
    if (resultB.rows.length === 0 || resultB.rows[0]!.length === 0) throw new Error(`${questionId}/${check.label}: sqlB returned no rows`);
    const a = resultA.rows[0]![0]!;
    const b = resultB.rows[0]![0]!;
    if (!scalarsAgree(a, b)) throw new Error(`${questionId}/${check.label}: sqlA (${a}) and sqlB (${b}) disagree`);
    return { label: check.label, grading: 'scalar', scalar: a as number | string };
  }

  if (!rowsAgree(resultA, resultB)) {
    throw new Error(
      `${questionId}/${check.label}: sqlA (${resultA.rows.length} rows: ${JSON.stringify(resultA.rows)}) and sqlB (${resultB.rows.length} rows: ${JSON.stringify(resultB.rows)}) disagree`,
    );
  }
  return { label: check.label, grading: 'rows', rows: resultA.rows as Array<Array<number | string>> };
}

// ---------------------------------------------------------------------------
// Question bank (DESIGN.md §2). Every G/X/V/M/TG-tagged question's *gold
// value* is computed by two structurally different formulations (CTE rollup
// vs. window function / DISTINCT-based de-duplication); plain profiling and
// floor/regression-guard questions use two independently-written but
// simpler formulations, per DESIGN.md's own distinction.
// ---------------------------------------------------------------------------

const titanic: QuestionSpec[] = [
  {
    id: 'T1',
    dataset: 'titanic',
    category: 'profiling',
    trap: ['-'],
    text: 'How many rows are in the dataset?',
    premises: [{ kind: 'column', table: 'titanic', column: 'PassengerId' }],
    checks: [
      { label: 'row_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM titanic', sqlB: 'SELECT COUNT(PassengerId) FROM titanic' },
    ],
  },
  {
    id: 'T2',
    dataset: 'titanic',
    category: 'profiling',
    trap: ['N'],
    text: 'What percentage of rows have a null Age?',
    premises: [{ kind: 'column', table: 'titanic', column: 'Age' }],
    checks: [
      {
        label: 'pct_null_age',
        grading: 'scalar',
        sqlA: 'SELECT 100.0 * COUNT(*) FILTER (WHERE Age IS NULL) / COUNT(*) FROM titanic',
        sqlB: 'SELECT 100.0 * (COUNT(*) - COUNT(Age)) / COUNT(*) FROM titanic',
      },
    ],
  },
  {
    id: 'T3',
    dataset: 'titanic',
    category: 'profiling',
    trap: ['-'],
    text: 'How many distinct values does Pclass have?',
    premises: [{ kind: 'column', table: 'titanic', column: 'Pclass' }],
    checks: [
      {
        label: 'distinct_pclass',
        grading: 'scalar',
        sqlA: 'SELECT COUNT(DISTINCT Pclass) FROM titanic',
        sqlB: 'SELECT COUNT(*) FROM (SELECT Pclass FROM titanic GROUP BY Pclass) t',
      },
    ],
  },
  {
    id: 'T4',
    dataset: 'titanic',
    category: 'analytical',
    trap: ['-'],
    text: 'What is the overall survival rate (%)?',
    premises: [{ kind: 'column', table: 'titanic', column: 'Survived' }],
    checks: [
      {
        label: 'survival_rate_pct',
        grading: 'scalar',
        sqlA: 'SELECT 100.0 * AVG(Survived) FROM titanic',
        sqlB: 'SELECT 100.0 * SUM(Survived) / COUNT(*) FROM titanic',
      },
    ],
  },
  {
    id: 'T5',
    dataset: 'titanic',
    category: 'analytical',
    trap: ['-'],
    text: 'What is the survival rate (%) by Pclass and Sex?',
    premises: [
      { kind: 'column', table: 'titanic', column: 'Pclass' },
      { kind: 'column', table: 'titanic', column: 'Sex' },
      { kind: 'column', table: 'titanic', column: 'Survived' },
    ],
    checks: [
      {
        label: 'survival_rate_by_pclass_sex',
        grading: 'rows',
        sqlA: 'SELECT Pclass, Sex, 100.0 * AVG(Survived) FROM titanic GROUP BY Pclass, Sex ORDER BY Pclass, Sex',
        sqlB: 'SELECT Pclass, Sex, 100.0 * SUM(Survived) / COUNT(*) FROM titanic GROUP BY Pclass, Sex ORDER BY Pclass, Sex',
      },
    ],
  },
  {
    id: 'T6',
    dataset: 'titanic',
    category: 'analytical',
    trap: ['N'],
    text: 'What fraction of all passengers were under 18?',
    premises: [{ kind: 'column', table: 'titanic', column: 'Age' }],
    checks: [
      {
        label: 'pct_under_18_of_all',
        grading: 'scalar',
        sqlA: 'SELECT 100.0 * COUNT(*) FILTER (WHERE Age < 18) / COUNT(*) FROM titanic',
        sqlB: 'SELECT 100.0 * (SELECT COUNT(*) FROM titanic WHERE Age < 18) / (SELECT COUNT(*) FROM titanic)',
      },
    ],
  },
  {
    id: 'T7',
    dataset: 'titanic',
    category: 'analytical',
    trap: ['F'],
    text: "What is the average Fare for passengers who embarked at 'C'?",
    premises: [
      { kind: 'column', table: 'titanic', column: 'Fare' },
      { kind: 'categoricalValue', table: 'titanic', column: 'Embarked', value: 'C' },
    ],
    checks: [
      {
        label: 'avg_fare_embarked_c',
        grading: 'scalar',
        sqlA: "SELECT AVG(Fare) FROM titanic WHERE Embarked = 'C'",
        sqlB: "SELECT SUM(Fare) / COUNT(*) FROM titanic WHERE Embarked = 'C'",
      },
    ],
  },
];

const weather: QuestionSpec[] = [
  {
    id: 'W1',
    dataset: 'weather',
    category: 'profiling',
    trap: ['-'],
    text: 'How many rows are in the dataset, and what date range does it cover?',
    premises: [{ kind: 'column', table: 'weather', column: 'Date' }],
    checks: [
      { label: 'row_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM weather', sqlB: 'SELECT COUNT(Date) FROM weather' },
      {
        label: 'date_range',
        grading: 'rows',
        sqlA: "SELECT MIN(Date)::VARCHAR, MAX(Date)::VARCHAR FROM weather",
        sqlB: "SELECT (SELECT MIN(Date) FROM weather)::VARCHAR, (SELECT MAX(Date) FROM weather)::VARCHAR",
      },
    ],
  },
  {
    id: 'W2',
    dataset: 'weather',
    category: 'profiling',
    trap: ['-'],
    text: 'Is there more than one location in this data?',
    premises: [{ kind: 'column', table: 'weather', column: 'City' }],
    checks: [
      {
        label: 'distinct_city_count',
        grading: 'scalar',
        sqlA: 'SELECT COUNT(DISTINCT City) FROM weather',
        sqlB: 'SELECT COUNT(*) FROM (SELECT DISTINCT City FROM weather) t',
      },
    ],
  },
  {
    id: 'W3',
    dataset: 'weather',
    category: 'analytical',
    trap: ['TG'],
    text: 'On average, how windy is the windiest day of a month?',
    paraphrase: 'If you look at whichever day was the gustiest within each month, how strong does the wind typically get on that day?',
    premises: [
      { kind: 'column', table: 'weather', column: 'WindKph' },
      { kind: 'column', table: 'weather', column: 'Date' },
    ],
    checks: [
      {
        label: 'avg_of_monthly_max_wind',
        grading: 'scalar',
        sqlA: 'WITH monthly AS (SELECT year(Date) y, month(Date) m, MAX(WindKph) mx FROM weather GROUP BY 1, 2) SELECT AVG(mx) FROM monthly',
        sqlB:
          'SELECT AVG(mx) FROM (SELECT DISTINCT year(Date) y, month(Date) m, MAX(WindKph) OVER (PARTITION BY year(Date), month(Date)) mx FROM weather) t',
      },
    ],
  },
  {
    id: 'W4',
    dataset: 'weather',
    category: 'analytical',
    trap: ['TG'],
    text: 'What is the average daily temperature swing (TempHighC - TempLowC) in each calendar month of the year?',
    paraphrase: 'Across the months of the year, how much does the temperature typically swing between the hottest and coldest point of the day?',
    premises: [
      { kind: 'column', table: 'weather', column: 'TempHighC' },
      { kind: 'column', table: 'weather', column: 'TempLowC' },
    ],
    checks: [
      {
        label: 'avg_swing_by_calendar_month',
        grading: 'rows',
        sqlA: 'SELECT month(Date) AS m, AVG(TempHighC - TempLowC) FROM weather GROUP BY 1 ORDER BY 1',
        sqlB: 'SELECT EXTRACT(month FROM Date) AS m, SUM(TempHighC - TempLowC) / COUNT(*) FROM weather GROUP BY 1 ORDER BY 1',
      },
    ],
  },
  {
    id: 'W5',
    dataset: 'weather',
    category: 'analytical',
    trap: ['-'],
    text: 'What is the single global average TempHighC across all days?',
    premises: [{ kind: 'column', table: 'weather', column: 'TempHighC' }],
    checks: [
      { label: 'global_avg_temp_high', grading: 'scalar', sqlA: 'SELECT AVG(TempHighC) FROM weather', sqlB: 'SELECT SUM(TempHighC) / COUNT(*) FROM weather' },
    ],
  },
  {
    id: 'W6',
    dataset: 'weather',
    category: 'analytical',
    trap: ['TG', 'F'],
    text: 'Considering only days with Humidity above 70, what is the average monthly-mean TempLowC?',
    paraphrase: "Sticking to the more humid days here — humidity above 70 — what's the typical overnight low, worked out month by month and then averaged?",
    premises: [
      { kind: 'column', table: 'weather', column: 'Humidity' },
      { kind: 'column', table: 'weather', column: 'TempLowC' },
    ],
    checks: [
      {
        label: 'avg_monthly_mean_templow_humid_gt_70',
        grading: 'scalar',
        sqlA:
          'WITH filtered AS (SELECT * FROM weather WHERE Humidity > 70), monthly AS (SELECT year(Date) y, month(Date) m, AVG(TempLowC) mm FROM filtered GROUP BY 1, 2) SELECT AVG(mm) FROM monthly',
        sqlB:
          'SELECT AVG(mm) FROM (SELECT DISTINCT year(Date) y, month(Date) m, AVG(TempLowC) OVER (PARTITION BY year(Date), month(Date)) mm FROM weather WHERE Humidity > 70) t',
      },
    ],
  },
  {
    id: 'W7',
    dataset: 'weather',
    category: 'analytical',
    trap: ['F'],
    text: 'What is the average WindKph in 2024?',
    premises: [
      { kind: 'column', table: 'weather', column: 'WindKph' },
      { kind: 'temporalYear', table: 'weather', column: 'Date', year: 2024 },
    ],
    checks: [
      {
        label: 'avg_wind_2024',
        grading: 'scalar',
        sqlA: 'SELECT AVG(WindKph) FROM weather WHERE year(Date) = 2024',
        sqlB: "SELECT SUM(WindKph) / COUNT(*) FROM weather WHERE Date >= '2024-01-01' AND Date < '2025-01-01'",
      },
    ],
  },
];

const stock: QuestionSpec[] = [
  {
    id: 'S1',
    dataset: 'stock_prices',
    category: 'profiling',
    trap: ['-'],
    text: 'How many rows / what date range does this cover?',
    premises: [{ kind: 'column', table: 'stock_prices', column: 'Date' }],
    checks: [
      { label: 'row_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM stock_prices', sqlB: 'SELECT COUNT(Date) FROM stock_prices' },
      {
        label: 'date_range',
        grading: 'rows',
        sqlA: 'SELECT MIN(Date)::VARCHAR, MAX(Date)::VARCHAR FROM stock_prices',
        sqlB: '(SELECT (SELECT MIN(Date) FROM stock_prices)::VARCHAR, (SELECT MAX(Date) FROM stock_prices)::VARCHAR)',
      },
    ],
  },
  {
    id: 'S2',
    dataset: 'stock_prices',
    category: 'analytical',
    trap: ['-'],
    text: 'What is the average daily trading range (High - Low)?',
    premises: [
      { kind: 'column', table: 'stock_prices', column: 'High' },
      { kind: 'column', table: 'stock_prices', column: 'Low' },
    ],
    checks: [
      { label: 'avg_daily_range', grading: 'scalar', sqlA: 'SELECT AVG(High - Low) FROM stock_prices', sqlB: 'SELECT SUM(High - Low) / COUNT(*) FROM stock_prices' },
    ],
  },
  {
    id: 'S3',
    dataset: 'stock_prices',
    category: 'analytical',
    trap: ['-'],
    text: 'On how many days did the stock close higher than it opened?',
    premises: [
      { kind: 'column', table: 'stock_prices', column: 'Close' },
      { kind: 'column', table: 'stock_prices', column: 'Open' },
    ],
    checks: [
      {
        label: 'days_closed_higher',
        grading: 'scalar',
        sqlA: 'SELECT COUNT(*) FROM stock_prices WHERE Close > Open',
        sqlB: 'SELECT SUM(CASE WHEN Close > Open THEN 1 ELSE 0 END) FROM stock_prices',
      },
    ],
  },
  {
    id: 'S4',
    dataset: 'stock_prices',
    category: 'analytical',
    trap: ['-'],
    text: 'What is the highest single-day Close price, and on what date?',
    premises: [{ kind: 'column', table: 'stock_prices', column: 'Close' }],
    checks: [
      {
        label: 'max_close',
        grading: 'scalar',
        sqlA: 'SELECT MAX(Close) FROM stock_prices',
        sqlB: 'SELECT Close FROM stock_prices ORDER BY Close DESC LIMIT 1',
        tieCheckSql: 'SELECT COUNT(*) - 1 FROM stock_prices WHERE Close = (SELECT MAX(Close) FROM stock_prices)',
      },
      {
        label: 'max_close_date',
        grading: 'scalar',
        sqlA: 'SELECT Date::VARCHAR FROM stock_prices WHERE Close = (SELECT MAX(Close) FROM stock_prices)',
        sqlB: 'SELECT Date::VARCHAR FROM stock_prices ORDER BY Close DESC LIMIT 1',
      },
    ],
  },
  {
    id: 'S5',
    dataset: 'stock_prices',
    category: 'analytical',
    trap: ['TG'],
    text: 'What is the average total monthly trading volume?',
    paraphrase: 'In a typical month of trading, roughly how many shares change hands in total?',
    premises: [
      { kind: 'column', table: 'stock_prices', column: 'Volume' },
      { kind: 'column', table: 'stock_prices', column: 'Date' },
    ],
    checks: [
      {
        label: 'avg_monthly_total_volume',
        grading: 'scalar',
        sqlA: 'WITH monthly AS (SELECT year(Date) y, month(Date) m, SUM(Volume) v FROM stock_prices GROUP BY 1, 2) SELECT AVG(v) FROM monthly',
        sqlB:
          'SELECT AVG(v) FROM (SELECT DISTINCT year(Date) y, month(Date) m, SUM(Volume) OVER (PARTITION BY year(Date), month(Date)) v FROM stock_prices) t',
      },
    ],
  },
];

const reviews: QuestionSpec[] = [
  {
    id: 'R1',
    dataset: 'product_reviews',
    category: 'profiling',
    trap: ['-'],
    text: 'How many distinct ProductIds are referenced in the reviews?',
    premises: [{ kind: 'column', table: 'product_reviews', column: 'ProductId' }],
    checks: [
      {
        label: 'distinct_product_ids',
        grading: 'scalar',
        sqlA: 'SELECT COUNT(DISTINCT ProductId) FROM product_reviews',
        sqlB: 'SELECT COUNT(*) FROM (SELECT DISTINCT ProductId FROM product_reviews) t',
      },
    ],
  },
  {
    id: 'R2',
    dataset: 'product_reviews',
    category: 'analytical',
    trap: ['-'],
    text: 'What is the average Rating per product category (product_reviews.ProductId -> products.product_id)?',
    premises: [
      { kind: 'column', table: 'product_reviews', column: 'Rating' },
      { kind: 'column', table: 'products', column: 'category' },
    ],
    checks: [
      {
        label: 'avg_rating_by_category',
        grading: 'rows',
        sqlA: 'SELECT p.category, AVG(pr.Rating) FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id GROUP BY p.category ORDER BY p.category',
        sqlB:
          'SELECT p.category, SUM(pr.Rating)::DOUBLE / COUNT(*) FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id GROUP BY p.category ORDER BY p.category',
      },
    ],
  },
  {
    id: 'R3',
    dataset: 'product_reviews',
    category: 'analytical',
    trap: ['F'],
    text: 'Which product has the highest average rating among products with at least 7 reviews?',
    premises: [{ kind: 'column', table: 'product_reviews', column: 'Rating' }],
    checks: [
      {
        // Threshold raised from the DESIGN.md draft's "at least 5" to 7: at 5,
        // 'Home Item 76' and 'Books Item 105' tie at exactly 4.2 (both 5
        // reviews) — a real tie, caught live by this script's tie-free gate,
        // not assumed away. Verified clean at 7 (winner 4.0 vs runner-up
        // 3.875) — see BUILD_NOTES.md.
        label: 'top_rated_product_min_7_reviews',
        grading: 'scalar',
        sqlA:
          'SELECT p.name FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id GROUP BY p.product_id, p.name HAVING COUNT(*) >= 7 ORDER BY AVG(pr.Rating) DESC LIMIT 1',
        sqlB:
          'WITH agg AS (SELECT p.product_id, p.name, AVG(pr.Rating) ar, COUNT(*) c FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id GROUP BY p.product_id, p.name HAVING COUNT(*) >= 7) SELECT name FROM agg WHERE ar = (SELECT MAX(ar) FROM agg)',
        tieCheckSql:
          'WITH agg AS (SELECT p.product_id, AVG(pr.Rating) ar, COUNT(*) c FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id GROUP BY p.product_id HAVING COUNT(*) >= 7) SELECT COUNT(*) - 1 FROM agg WHERE ar = (SELECT MAX(ar) FROM agg)',
      },
    ],
  },
  {
    id: 'R4',
    dataset: 'product_reviews',
    category: 'analytical',
    trap: ['-'],
    text: 'What is the overall average Rating across all reviews?',
    premises: [{ kind: 'column', table: 'product_reviews', column: 'Rating' }],
    checks: [
      { label: 'overall_avg_rating', grading: 'scalar', sqlA: 'SELECT AVG(Rating) FROM product_reviews', sqlB: 'SELECT SUM(Rating)::DOUBLE / COUNT(*) FROM product_reviews' },
    ],
  },
];

const chasm: QuestionSpec[] = [
  {
    id: 'C1',
    dataset: 'chasm',
    category: 'profiling',
    trap: ['-'],
    text: 'How many products, line items, and reviews are there?',
    premises: [
      { kind: 'column', table: 'products', column: 'product_id' },
      { kind: 'column', table: 'order_items', column: 'order_item_id' },
      { kind: 'column', table: 'product_reviews', column: 'ReviewId' },
    ],
    checks: [
      { label: 'product_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM products', sqlB: 'SELECT COUNT(DISTINCT product_id) FROM products' },
      { label: 'line_item_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM order_items', sqlB: 'SELECT COUNT(order_item_id) FROM order_items' },
      { label: 'review_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM product_reviews', sqlB: 'SELECT COUNT(ReviewId) FROM product_reviews' },
    ],
  },
  {
    id: 'C2',
    dataset: 'chasm',
    category: 'analytical',
    trap: ['X'],
    text: 'For each product category, what is the total revenue and the average review rating?',
    paraphrase: 'Category by category, how much money came in, and separately, how do customers rate the products in that category on average?',
    premises: [
      { kind: 'column', table: 'products', column: 'category' },
      { kind: 'column', table: 'order_items', column: 'quantity' },
      { kind: 'column', table: 'product_reviews', column: 'Rating' },
    ],
    checks: [
      {
        label: 'revenue_and_rating_by_category',
        grading: 'rows',
        sqlA:
          "WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) revenue FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.category), rat AS (SELECT p.category, AVG(pr.Rating) avg_rating FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id GROUP BY p.category) SELECT rev.category, rev.revenue, rat.avg_rating FROM rev JOIN rat ON rev.category = rat.category ORDER BY rev.category",
        sqlB:
          "WITH rev AS (SELECT DISTINCT p.category, SUM(oi.quantity * oi.unit_price) OVER (PARTITION BY p.category) revenue FROM order_items oi JOIN products p ON oi.product_id = p.product_id), rat AS (SELECT DISTINCT p.category, AVG(pr.Rating) OVER (PARTITION BY p.category) avg_rating FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id) SELECT rev.category, rev.revenue, rat.avg_rating FROM rev JOIN rat ON rev.category = rat.category ORDER BY rev.category",
      },
    ],
  },
  {
    id: 'C3',
    dataset: 'chasm',
    category: 'analytical',
    trap: ['X'],
    text: 'Which product category has the best average rating per dollar of revenue?',
    paraphrase: 'Which product category gives customers the most rating for their money, relative to how much revenue it brings in?',
    premises: [
      { kind: 'column', table: 'products', column: 'category' },
      { kind: 'column', table: 'order_items', column: 'quantity' },
      { kind: 'column', table: 'product_reviews', column: 'Rating' },
    ],
    checks: [
      {
        label: 'best_rating_per_revenue_dollar_category',
        grading: 'scalar',
        sqlA:
          "WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) revenue FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.category), rat AS (SELECT p.category, AVG(pr.Rating) avg_rating FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id GROUP BY p.category) SELECT rev.category FROM rev JOIN rat ON rev.category = rat.category ORDER BY rat.avg_rating / rev.revenue DESC LIMIT 1",
        sqlB:
          "WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) revenue FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.category), rat AS (SELECT p.category, AVG(pr.Rating) avg_rating FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id GROUP BY p.category), combined AS (SELECT rev.category, rat.avg_rating / rev.revenue AS metric FROM rev JOIN rat ON rev.category = rat.category) SELECT category FROM combined WHERE metric = (SELECT MAX(metric) FROM combined)",
        tieCheckSql:
          "WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) revenue FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.category), rat AS (SELECT p.category, AVG(pr.Rating) avg_rating FROM product_reviews pr JOIN products p ON pr.ProductId = p.product_id GROUP BY p.category), combined AS (SELECT rat.avg_rating / rev.revenue AS metric FROM rev JOIN rat ON rev.category = rat.category) SELECT COUNT(*) - 1 FROM combined WHERE metric = (SELECT MAX(metric) FROM combined)",
      },
    ],
  },
  {
    id: 'C4',
    dataset: 'chasm',
    category: 'analytical',
    trap: ['X', 'F'],
    text: 'Among products with at least 5 reviews, which has the highest total revenue?',
    paraphrase: "Looking only at products that have built up a decent number of reviews — 5 or more — which one has actually sold the most in dollar terms?",
    premises: [
      { kind: 'column', table: 'order_items', column: 'quantity' },
      { kind: 'column', table: 'product_reviews', column: 'Rating' },
    ],
    checks: [
      {
        label: 'top_revenue_product_min_5_reviews',
        grading: 'scalar',
        sqlA:
          'WITH rev AS (SELECT p.product_id, COALESCE(SUM(oi.quantity * oi.unit_price), 0) revenue FROM products p LEFT JOIN order_items oi ON oi.product_id = p.product_id GROUP BY p.product_id), rat AS (SELECT ProductId, COUNT(*) c FROM product_reviews GROUP BY ProductId) SELECT p.name FROM rev JOIN rat ON rev.product_id = rat.ProductId JOIN products p ON p.product_id = rev.product_id WHERE rat.c >= 5 ORDER BY rev.revenue DESC LIMIT 1',
        sqlB:
          'WITH rev AS (SELECT p.product_id, COALESCE(SUM(oi.quantity * oi.unit_price), 0) revenue FROM products p LEFT JOIN order_items oi ON oi.product_id = p.product_id GROUP BY p.product_id), rat AS (SELECT ProductId, COUNT(*) c FROM product_reviews GROUP BY ProductId), combined AS (SELECT rev.product_id, rev.revenue FROM rev JOIN rat ON rev.product_id = rat.ProductId WHERE rat.c >= 5) SELECT p.name FROM combined c2 JOIN products p ON p.product_id = c2.product_id WHERE c2.revenue = (SELECT MAX(revenue) FROM combined)',
        tieCheckSql:
          'WITH rev AS (SELECT p.product_id, COALESCE(SUM(oi.quantity * oi.unit_price), 0) revenue FROM products p LEFT JOIN order_items oi ON oi.product_id = p.product_id GROUP BY p.product_id), rat AS (SELECT ProductId, COUNT(*) c FROM product_reviews GROUP BY ProductId), combined AS (SELECT rev.revenue FROM rev JOIN rat ON rev.product_id = rat.ProductId WHERE rat.c >= 5) SELECT COUNT(*) - 1 FROM combined WHERE revenue = (SELECT MAX(revenue) FROM combined)',
      },
    ],
  },
];

const ecommerce: QuestionSpec[] = [
  {
    id: 'E1',
    dataset: 'ecommerce',
    category: 'profiling',
    trap: ['-'],
    text: 'How many rows in each of the four tables?',
    premises: [
      { kind: 'column', table: 'customers', column: 'customer_id' },
      { kind: 'column', table: 'orders', column: 'order_id' },
      { kind: 'column', table: 'order_items', column: 'order_item_id' },
      { kind: 'column', table: 'products', column: 'product_id' },
    ],
    checks: [
      { label: 'customers_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM customers', sqlB: 'SELECT COUNT(customer_id) FROM customers' },
      { label: 'orders_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM orders', sqlB: 'SELECT COUNT(order_id) FROM orders' },
      { label: 'order_items_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM order_items', sqlB: 'SELECT COUNT(order_item_id) FROM order_items' },
      { label: 'products_count', grading: 'scalar', sqlA: 'SELECT COUNT(*) FROM products', sqlB: 'SELECT COUNT(product_id) FROM products' },
    ],
  },
  {
    id: 'E2',
    dataset: 'ecommerce',
    category: 'profiling',
    trap: ['G'],
    text: 'On average, how many line items does an order have?',
    paraphrase: 'When someone places an order, how many separate line entries does it usually contain?',
    premises: [{ kind: 'column', table: 'order_items', column: 'order_id' }],
    checks: [
      {
        label: 'avg_line_items_per_order',
        grading: 'scalar',
        sqlA: 'WITH cnt AS (SELECT order_id, COUNT(*) n FROM order_items GROUP BY order_id) SELECT AVG(n) FROM cnt',
        sqlB: 'SELECT AVG(n) FROM (SELECT DISTINCT order_id, COUNT(*) OVER (PARTITION BY order_id) n FROM order_items) t',
      },
    ],
  },
  {
    id: 'E3',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['G', 'M'],
    text: 'What is the average order value?',
    paraphrase: 'When someone places an order here, how much do they typically spend on it?',
    premises: [
      { kind: 'column', table: 'order_items', column: 'quantity' },
      { kind: 'column', table: 'order_items', column: 'unit_price' },
    ],
    checks: [
      {
        label: 'avg_order_value_all_statuses',
        grading: 'scalar',
        sqlA: 'WITH ov AS (SELECT order_id, SUM(quantity * unit_price) v FROM order_items GROUP BY order_id) SELECT AVG(v) FROM ov',
        sqlB: 'SELECT AVG(v) FROM (SELECT DISTINCT order_id, SUM(quantity * unit_price) OVER (PARTITION BY order_id) v FROM order_items) t',
      },
    ],
  },
  {
    id: 'E4',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['G', 'F'],
    text: "What is the average order value for orders with status = 'completed'?",
    paraphrase: 'For orders that actually went through to completion, how much does a customer typically spend on one?',
    premises: [{ kind: 'categoricalValue', table: 'orders', column: 'status', value: 'completed' }],
    checks: [
      {
        label: 'avg_order_value_completed',
        grading: 'scalar',
        sqlA:
          "WITH ov AS (SELECT oi.order_id, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY oi.order_id) SELECT AVG(v) FROM ov",
        sqlB:
          "SELECT AVG(v) FROM (SELECT DISTINCT oi.order_id, SUM(oi.quantity * oi.unit_price) OVER (PARTITION BY oi.order_id) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed') t",
      },
    ],
  },
  {
    id: 'E5',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['F'],
    text: 'What is the total revenue from completed orders?',
    premises: [{ kind: 'categoricalValue', table: 'orders', column: 'status', value: 'completed' }],
    checks: [
      {
        label: 'total_revenue_completed',
        grading: 'scalar',
        sqlA: "SELECT SUM(oi.quantity * oi.unit_price) FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed'",
        sqlB:
          "WITH ov AS (SELECT oi.order_id, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY oi.order_id) SELECT SUM(v) FROM ov",
      },
    ],
  },
  {
    id: 'E6',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['G'],
    text: 'Which customer has the highest total spend across their completed orders?',
    paraphrase: "Who's our best customer, in terms of how much they've spent on orders that actually went through?",
    premises: [{ kind: 'categoricalValue', table: 'orders', column: 'status', value: 'completed' }],
    checks: [
      {
        label: 'top_spend_customer',
        grading: 'scalar',
        sqlA:
          "WITH spend AS (SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id) SELECT c.name FROM spend s JOIN customers c ON c.customer_id = s.customer_id ORDER BY s.v DESC LIMIT 1",
        sqlB:
          "WITH spend AS (SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id) SELECT c.name FROM spend s JOIN customers c ON c.customer_id = s.customer_id WHERE s.v = (SELECT MAX(v) FROM spend)",
        tieCheckSql:
          "WITH spend AS (SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id) SELECT COUNT(*) - 1 FROM spend WHERE v = (SELECT MAX(v) FROM spend)",
      },
    ],
  },
  {
    id: 'E7',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['G'],
    text: 'What is the average number of items per order?',
    paraphrase: 'When someone places an order, how many items do they usually end up with?',
    premises: [{ kind: 'column', table: 'order_items', column: 'quantity' }],
    checks: [
      {
        label: 'avg_units_per_order',
        grading: 'scalar',
        sqlA: 'WITH u AS (SELECT order_id, SUM(quantity) q FROM order_items GROUP BY order_id) SELECT AVG(q) FROM u',
        sqlB: 'SELECT AVG(q) FROM (SELECT DISTINCT order_id, SUM(quantity) OVER (PARTITION BY order_id) q FROM order_items) t',
      },
    ],
  },
  {
    id: 'E8',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['G', 'F', 'V'],
    text: 'Which product category generated the most total revenue from completed orders only?',
    paraphrase: 'Restricting to orders that actually completed, which category of product brought in the most money overall?',
    premises: [{ kind: 'categoricalValue', table: 'orders', column: 'status', value: 'completed' }],
    checks: [
      {
        label: 'top_revenue_category_completed_only',
        grading: 'scalar',
        sqlA:
          "WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id JOIN products p ON oi.product_id = p.product_id WHERE o.status = 'completed' GROUP BY p.category) SELECT category FROM rev ORDER BY v DESC LIMIT 1",
        sqlB:
          "WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id JOIN products p ON oi.product_id = p.product_id WHERE o.status = 'completed' GROUP BY p.category) SELECT category FROM rev WHERE v = (SELECT MAX(v) FROM rev)",
        tieCheckSql:
          "WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id JOIN products p ON oi.product_id = p.product_id WHERE o.status = 'completed' GROUP BY p.category) SELECT COUNT(*) - 1 FROM rev WHERE v = (SELECT MAX(v) FROM rev)",
      },
    ],
  },
  {
    id: 'E9',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['G'],
    text: 'What are the top 4 products by total units sold?',
    paraphrase: 'Which four products have customers bought the most of, in terms of sheer quantity moved?',
    premises: [{ kind: 'column', table: 'order_items', column: 'quantity' }],
    checks: [
      {
        // DESIGN.md's draft asked for "top 5"; ranks 2-4 tie at 105 units and
        // ranks 5-6 tie at 102 — a top-5 cut is genuinely ambiguous. Top-4 is
        // clean (105 vs. the next distinct value, 102) — verified live by
        // this script's tie-free gate, not assumed. See BUILD_NOTES.md.
        label: 'top_4_products_by_units',
        grading: 'rows',
        sqlA: 'SELECT p.name, SUM(oi.quantity) units FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.name ORDER BY units DESC LIMIT 4',
        sqlB:
          'SELECT name, units FROM (SELECT name, units, RANK() OVER (ORDER BY units DESC) rnk FROM (SELECT DISTINCT p.name, SUM(oi.quantity) OVER (PARTITION BY p.product_id) units FROM order_items oi JOIN products p ON oi.product_id = p.product_id) inner_t) outer_t WHERE rnk <= 4',
        tieCheckSql:
          'WITH agg AS (SELECT product_id, SUM(quantity) units FROM order_items GROUP BY product_id) SELECT COUNT(*) - 4 FROM agg WHERE units >= (SELECT units FROM agg ORDER BY units DESC LIMIT 1 OFFSET 3)',
      },
    ],
  },
  {
    id: 'E10',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['F'],
    text: 'How many orders are in each status?',
    premises: [{ kind: 'column', table: 'orders', column: 'status' }],
    checks: [
      {
        label: 'order_count_by_status',
        grading: 'rows',
        sqlA: 'SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY status',
        sqlB: 'SELECT status, COUNT(order_id) FROM orders GROUP BY status ORDER BY status',
      },
    ],
  },
  {
    id: 'E11',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['V'],
    text: 'What is the average price of a single line item across completed orders?',
    paraphrase: 'Looking at completed orders, if you priced out each individual item on its own — not the whole order — what would a typical one cost?',
    premises: [{ kind: 'categoricalValue', table: 'orders', column: 'status', value: 'completed' }],
    checks: [
      {
        label: 'avg_line_item_price_completed',
        grading: 'scalar',
        sqlA: "SELECT AVG(oi.unit_price) FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed'",
        sqlB: "SELECT SUM(oi.unit_price)::DOUBLE / COUNT(*) FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed'",
      },
    ],
  },
  {
    id: 'E12',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['V'],
    text: 'Which product category generated the most revenue overall, across every order status?',
    paraphrase: 'Regardless of whether the order ever completed, which product category has brought in the most revenue in total?',
    premises: [],
    checks: [
      {
        label: 'top_revenue_category_all_statuses',
        grading: 'scalar',
        sqlA:
          'WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.category) SELECT category FROM rev ORDER BY v DESC LIMIT 1',
        sqlB:
          'WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.category) SELECT category FROM rev WHERE v = (SELECT MAX(v) FROM rev)',
        tieCheckSql:
          'WITH rev AS (SELECT p.category, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN products p ON oi.product_id = p.product_id GROUP BY p.category) SELECT COUNT(*) - 1 FROM rev WHERE v = (SELECT MAX(v) FROM rev)',
      },
    ],
  },
  {
    id: 'E13',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['V', 'G'],
    text: 'What is the average total spend per customer, counting only completed orders?',
    paraphrase: "Looking only at customers who've completed at least one order, what's the average amount they've spent in total?",
    premises: [{ kind: 'categoricalValue', table: 'orders', column: 'status', value: 'completed' }],
    checks: [
      {
        label: 'avg_spend_per_customer_completed',
        grading: 'scalar',
        sqlA:
          "WITH spend AS (SELECT o.customer_id, SUM(oi.quantity * oi.unit_price) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed' GROUP BY o.customer_id) SELECT AVG(v) FROM spend",
        sqlB:
          "SELECT AVG(v) FROM (SELECT DISTINCT o.customer_id, SUM(oi.quantity * oi.unit_price) OVER (PARTITION BY o.customer_id) v FROM order_items oi JOIN orders o ON oi.order_id = o.order_id WHERE o.status = 'completed') t",
      },
    ],
  },
  {
    id: 'E14',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['V', 'M'],
    text: 'What is the average order value? (same gold as E3, graded against viewUsage)',
    // Same paraphrase as E3, deliberately — E14 duplicates E3's wording exactly
    // (both explicit and paraphrase) to isolate measure-selection (viewUsage)
    // as the sole variable between the two probes, not wording.
    paraphrase: 'When someone places an order here, how much do they typically spend on it?',
    premises: [
      { kind: 'column', table: 'order_items', column: 'quantity' },
      { kind: 'column', table: 'order_items', column: 'unit_price' },
    ],
    checks: [
      {
        label: 'avg_order_value_all_statuses_v2',
        grading: 'scalar',
        sqlA: 'WITH ov AS (SELECT order_id, SUM(quantity * unit_price) v FROM order_items GROUP BY order_id) SELECT AVG(v) FROM ov',
        sqlB: 'SELECT AVG(v) FROM (SELECT DISTINCT order_id, SUM(quantity * unit_price) OVER (PARTITION BY order_id) v FROM order_items) t',
      },
    ],
  },
  {
    id: 'E15',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['V'],
    text: 'How many distinct customers placed at least one order in 2024?',
    paraphrase: "Out of everyone who's ordered from us, how many different people bought something at some point during 2024?",
    premises: [{ kind: 'temporalYear', table: 'orders', column: 'order_date', year: 2024 }],
    checks: [
      {
        label: 'distinct_customers_ordered_2024',
        grading: 'scalar',
        sqlA: 'SELECT COUNT(DISTINCT customer_id) FROM orders WHERE year(order_date) = 2024',
        sqlB: "SELECT COUNT(*) FROM (SELECT DISTINCT customer_id FROM orders WHERE order_date >= '2024-01-01' AND order_date < '2025-01-01') t",
      },
    ],
  },
  {
    id: 'E16',
    dataset: 'ecommerce',
    category: 'analytical',
    trap: ['G'],
    text: 'On average, how much revenue does a customer generate?',
    paraphrase: "Across our whole customer base, what's the typical amount of revenue one customer brings in?",
    premises: [{ kind: 'column', table: 'customers', column: 'customer_id' }],
    checks: [
      {
        label: 'avg_revenue_per_customer_all_400',
        grading: 'scalar',
        sqlA:
          'WITH spend AS (SELECT c.customer_id, COALESCE(SUM(oi.quantity * oi.unit_price), 0) v FROM customers c LEFT JOIN orders o ON o.customer_id = c.customer_id LEFT JOIN order_items oi ON oi.order_id = o.order_id GROUP BY c.customer_id) SELECT AVG(v) FROM spend',
        sqlB: 'SELECT (SELECT SUM(quantity * unit_price) FROM order_items)::DOUBLE / (SELECT COUNT(*) FROM customers)',
      },
    ],
  },
];

export const QUESTIONS: QuestionSpec[] = [...titanic, ...weather, ...stock, ...reviews, ...chasm, ...ecommerce];

async function main() {
  assertParaphrasesPresent(QUESTIONS);
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const { conn, close } = await bootstrapAllDatasets(DB_PATH);
  try {
    const tables = await buildTableRegistry(conn, ALL_TABLE_SOURCES.map((s) => s.tableName));
    const facts = await buildDatasetFacts(conn, tables);
    mkdirSync(dirname(FACTS_PATH), { recursive: true });
    writeFileSync(FACTS_PATH, JSON.stringify(facts, null, 2));
    console.log(`Wrote dataset facts to ${FACTS_PATH}\n`);

    const computed: ComputedQuestion[] = [];
    for (const q of QUESTIONS) {
      const violations = assertPremises(facts, q.premises);
      if (violations.length > 0) {
        throw new Error(`${q.id}: premise violation — ${violations.map((v) => v.reason).join('; ')}`);
      }
      const checks: ComputedCheck[] = [];
      for (const check of q.checks) {
        checks.push(await computeCheck(conn, q.id, check));
      }
      // DESIGN.md §2: the gold value doesn't depend on wording, so the same
      // computed checks back both the explicit and paraphrase entries — they
      // are graded as separate checks against one shared gold value.
      computed.push({ id: q.id, dataset: q.dataset, category: q.category, trap: q.trap, text: q.text, wording: 'explicit', checks });
      if (q.paraphrase) {
        computed.push({ id: `${q.id}P`, dataset: q.dataset, category: q.category, trap: q.trap, text: q.paraphrase, wording: 'paraphrase', checks });
      }
      console.log(`${q.id}: OK — ${checks.map((c) => `${c.label}=${c.grading === 'scalar' ? c.scalar : JSON.stringify(c.rows)}`).join(', ')}`);
    }

    writeFileSync(QUESTIONS_PATH, JSON.stringify(computed, null, 2));
    console.log(`\nWrote ${computed.length} questions (${computed.reduce((n, q) => n + q.checks.length, 0)} checks) to ${QUESTIONS_PATH}`);
  } finally {
    close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
