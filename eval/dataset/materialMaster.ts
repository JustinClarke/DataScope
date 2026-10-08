// Question set for the synthetic material master extract (public/samples/
// material_master.csv, 800 rows of oil & gas spare parts). Deliberately kept
// out of dataset/questions.ts so the D40 set stays pinned at 58 questions and
// EVAL-RESULTS.json's denominator doesn't move.
//
// Scored the same way as D40 — execution-match against `referenceSql`, order
// insensitive, rounded — so numbers here are comparable to that report.
//
// WHAT THIS SET IS FOR. The dataset carries four planted defects, and the
// questions are chosen to find out which of them the model can actually reach:
//
//   - the zero-variance column (mm-05: a filter on a value every row has)
//   - the 35%-null column (mm-02, mm-18)
//   - the eight spellings of one unit of measure (mm-07, mm-20)
//   - duplicate part numbers (mm-16, mm-17)
//
// and, running through the money questions, the arithmetic this dataset turns
// on: stock value is UNIT_PRICE_INR * STOCK_QTY. Summing UNIT_PRICE_INR alone
// is a meaningless number — it adds up per-unit catalogue prices across
// unrelated parts — and it is the mistake a model is most likely to make here,
// because a single-column SUM is the shape it has seen most often.
//
// mm-10 and mm-11 are a matched pair on exactly that: identical referenceSql,
// one naming the arithmetic and one not. The gap between them is the
// measurement, not either number on its own.
import type { EvalQuestion } from './questions';

const T = 'material_master';

export const MATERIAL_MASTER_QUESTIONS: EvalQuestion[] = [
  // ── counts: the floor ────────────────────────────────────────────────
  { id: 'mm-01', dataset: 'material_master', question: 'How many materials are in the extract?',
    referenceSql: `SELECT count(*) AS n FROM ${T}`, tags: ['aggregate'] },
  { id: 'mm-02', dataset: 'material_master', question: 'How many materials have no manufacturer part number?',
    referenceSql: `SELECT count(*) AS n FROM ${T} WHERE "MFR_PART_NUMBER" IS NULL`, tags: ['filter', 'nulls'] },
  { id: 'mm-03', dataset: 'material_master', question: 'How many distinct manufacturers are there?',
    referenceSql: `SELECT count(DISTINCT "MANUFACTURER") AS n FROM ${T}`, tags: ['aggregate'] },
  { id: 'mm-04', dataset: 'material_master', question: 'How many materials have material type HIBE?',
    referenceSql: `SELECT count(*) AS n FROM ${T} WHERE "MATERIAL_TYPE" = 'HIBE'`, tags: ['filter'] },
  // Every row is plant VZ01. A correct answer is the row count; the interesting
  // failure is a model that treats a constant column as a discriminating filter.
  { id: 'mm-05', dataset: 'material_master', question: 'How many materials are held at plant VZ01?',
    referenceSql: `SELECT count(*) AS n FROM ${T} WHERE "PLANT" = 'VZ01'`, tags: ['filter', 'zero-variance'] },
  { id: 'mm-20', dataset: 'material_master', question: 'How many different values does the base unit of measure take?',
    referenceSql: `SELECT count(DISTINCT "BASE_UOM") AS n FROM ${T}`, tags: ['aggregate'] },

  // ── grouping ─────────────────────────────────────────────────────────
  { id: 'mm-06', dataset: 'material_master', question: 'How many materials are in each material group?',
    referenceSql: `SELECT "MATERIAL_GROUP", count(*) AS n FROM ${T} GROUP BY "MATERIAL_GROUP" ORDER BY "MATERIAL_GROUP"`, tags: ['groupby'] },
  // The UOM story: one concept stored eight ways.
  { id: 'mm-07', dataset: 'material_master', question: 'How many records are there for each base unit of measure?',
    referenceSql: `SELECT "BASE_UOM", count(*) AS n FROM ${T} GROUP BY "BASE_UOM" ORDER BY "BASE_UOM"`, tags: ['groupby'] },
  { id: 'mm-08', dataset: 'material_master', question: 'How many materials are there of each material type?',
    referenceSql: `SELECT "MATERIAL_TYPE", count(*) AS n FROM ${T} GROUP BY "MATERIAL_TYPE" ORDER BY "MATERIAL_TYPE"`, tags: ['groupby'] },
  { id: 'mm-09', dataset: 'material_master', question: 'Which 5 manufacturers have the most materials?',
    referenceSql: `SELECT "MANUFACTURER", count(*) AS n FROM ${T} WHERE "MANUFACTURER" IS NOT NULL GROUP BY "MANUFACTURER" ORDER BY n DESC LIMIT 5`, tags: ['topn'] },

  // ── money: the arithmetic this dataset turns on ──────────────────────
  // Matched pair, identical truth. mm-10 names the arithmetic, mm-11 doesn't.
  { id: 'mm-10', dataset: 'material_master', question: 'What is the total value of stock on hand, in INR, using unit price times stock quantity?',
    referenceSql: `SELECT round(sum("UNIT_PRICE_INR" * "STOCK_QTY"), 2) AS total_value FROM ${T}`, tags: ['aggregate', 'arithmetic'] },
  { id: 'mm-11', dataset: 'material_master', question: 'What is the total stock value?',
    referenceSql: `SELECT round(sum("UNIT_PRICE_INR" * "STOCK_QTY"), 2) AS total_value FROM ${T}`, tags: ['aggregate', 'arithmetic'] },
  { id: 'mm-12', dataset: 'material_master', question: 'Which 5 manufacturers have the highest total stock value, where stock value is unit price times stock quantity?',
    referenceSql: `SELECT "MANUFACTURER", round(sum("UNIT_PRICE_INR" * "STOCK_QTY"), 2) AS stock_value FROM ${T} WHERE "MANUFACTURER" IS NOT NULL GROUP BY "MANUFACTURER" ORDER BY stock_value DESC LIMIT 5`, tags: ['topn', 'arithmetic'] },
  { id: 'mm-19', dataset: 'material_master', question: 'Which 10 materials have the highest stock value (unit price times stock quantity)? Show the short text and the value.',
    referenceSql: `SELECT "SHORT_TEXT", round("UNIT_PRICE_INR" * "STOCK_QTY", 2) AS stock_value FROM ${T} ORDER BY stock_value DESC LIMIT 10`, tags: ['topn', 'arithmetic'] },
  { id: 'mm-13', dataset: 'material_master', question: 'What is the average unit price?',
    referenceSql: `SELECT round(avg("UNIT_PRICE_INR"), 2) AS avg_price FROM ${T}`, tags: ['aggregate'] },

  // ── time ─────────────────────────────────────────────────────────────
  { id: 'mm-14', dataset: 'material_master', question: 'How many materials were created in each year?',
    referenceSql: `SELECT extract(year FROM "CREATED_ON") AS year, count(*) AS n FROM ${T} GROUP BY year ORDER BY year`, tags: ['groupby', 'timeseries'] },
  { id: 'mm-15', dataset: 'material_master', question: 'How many materials were created before 2015?',
    referenceSql: `SELECT count(*) AS n FROM ${T} WHERE extract(year FROM "CREATED_ON") < 2015`, tags: ['filter', 'timeseries'] },

  // ── the duplicate questions: needs GROUP BY ... HAVING, then a subquery ──
  { id: 'mm-16', dataset: 'material_master', question: 'How many manufacturer part numbers appear on more than one material?',
    referenceSql: `SELECT count(*) AS n FROM (SELECT "MFR_PART_NUMBER" FROM ${T} WHERE "MFR_PART_NUMBER" IS NOT NULL GROUP BY "MFR_PART_NUMBER" HAVING count(*) > 1)`, tags: ['dedupe', 'having'] },
  { id: 'mm-17', dataset: 'material_master', question: 'How many materials share a manufacturer part number with at least one other material?',
    referenceSql: `SELECT count(*) AS n FROM ${T} WHERE "MFR_PART_NUMBER" IN (SELECT "MFR_PART_NUMBER" FROM ${T} WHERE "MFR_PART_NUMBER" IS NOT NULL GROUP BY "MFR_PART_NUMBER" HAVING count(*) > 1)`, tags: ['dedupe', 'subquery'] },
  { id: 'mm-18', dataset: 'material_master', question: 'What percentage of records are missing a manufacturer part number?',
    referenceSql: `SELECT round(100.0 * count(*) FILTER (WHERE "MFR_PART_NUMBER" IS NULL) / count(*), 1) AS pct FROM ${T}`, tags: ['aggregate', 'nulls'] },
];
