import { describe, expect, it } from 'vitest';
import type { QueryResult } from '../types';
import {
  buildDateRangeSql,
  buildHistogramSql,
  buildMedianSql,
  buildSamplePreviewSql,
  buildTopValuesSql,
  buildWordCountSql,
  formatDateCell,
  HISTOGRAM_BUCKET_COUNT,
  parseDateRange,
  parseHistogram,
  parseMedian,
  parseSamplePreview,
  parseTopValues,
  parseWordCount,
} from './columnStats';

// DuckDB-Wasm's Arrow layer surfaces DATE/date_trunc results as raw
// epoch-millisecond numbers (live-verified: `SELECT date_trunc('month', DATE
// '2023-05-15')` came back as `1682899200000`, not a string) — fixtures below
// use real epoch-ms values, not the plain date strings a first pass at this
// test assumed, so a regression to naive `String(cell)` formatting is caught.
const MS = (iso: string): number => new Date(iso).getTime();

function resultOf(columnNames: string[], rows: unknown[][]): QueryResult {
  return { columnNames, columnTypes: columnNames.map(() => 'Utf8'), rows, rowCount: rows.length, executionTimeMs: 0 };
}

describe('histogram', () => {
  it('returns null for a degenerate column (min === max)', () => {
    expect(buildHistogramSql('t', 'col', 5, 5)).toBeNull();
  });

  it('returns null when min/max are not finite (e.g. a 100%-null column)', () => {
    expect(buildHistogramSql('t', 'col', NaN, NaN)).toBeNull();
  });

  it('bins counts into the right buckets across the min–max range', () => {
    const result = resultOf(
      ['bucket', 'freq'],
      [
        [0, 3],
        [9, 1],
      ],
    );
    const buckets = parseHistogram(result, 0, 100);
    expect(buckets).toHaveLength(HISTOGRAM_BUCKET_COUNT);
    expect(buckets[0]).toEqual({ rangeStart: 0, rangeEnd: 10, count: 3 });
    expect(buckets[9]).toEqual({ rangeStart: 90, rangeEnd: 100, count: 1 });
    expect(buckets[5].count).toBe(0);
  });

  it('ignores an out-of-range bucket index rather than throwing', () => {
    const result = resultOf(['bucket', 'freq'], [[42, 7]]);
    const buckets = parseHistogram(result, 0, 10);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it('honors a configurable bin count (05-distribution)', () => {
    const sql = buildHistogramSql('t', 'col', 0, 100, 5);
    expect(sql).toContain(', 4)'); // GREATEST(..., 0), binCount - 1 = 4
    const result = resultOf(['bucket', 'freq'], [[4, 3]]);
    const buckets = parseHistogram(result, 0, 100, 5);
    expect(buckets).toHaveLength(5);
    expect(buckets[4]).toEqual({ rangeStart: 80, rangeEnd: 100, count: 3 });
  });

  it('still returns null for a constant column at any bin count', () => {
    expect(buildHistogramSql('t', 'col', 5, 5, 20)).toBeNull();
  });
});

describe('median', () => {
  it('parses a numeric median', () => {
    expect(parseMedian(resultOf(['median'], [[42.5]]))).toBe(42.5);
  });

  it('returns null for an empty aggregate (e.g. a 100%-null column)', () => {
    expect(parseMedian(resultOf(['median'], [[null]]))).toBeNull();
  });

  it('quotes the table/column and filters nulls', () => {
    const sql = buildMedianSql('my table', 'col"1');
    expect(sql).toContain('"my table"');
    expect(sql).toContain('"col""1"');
    expect(sql).toContain('IS NOT NULL');
  });
});

describe('top values', () => {
  it('builds the exact educational-panel SQL shape (no null filter)', () => {
    const sql = buildTopValuesSql('t', 'col', 10);
    expect(sql).toBe('SELECT "col" AS value, COUNT(*) AS freq FROM "t" GROUP BY 1 ORDER BY 2 DESC LIMIT 10');
  });

  it('renders a null value as its own frequency row, not dropped', () => {
    const parsed = parseTopValues(resultOf(['value', 'freq'], [[null, 5]]));
    expect(parsed).toEqual([{ value: '(null)', count: 5 }]);
  });

  it('stringifies non-null values', () => {
    const parsed = parseTopValues(
      resultOf(
        ['value', 'freq'],
        [
          ['A', 3],
          ['B', 1],
        ],
      ),
    );
    expect(parsed).toEqual([
      { value: 'A', count: 3 },
      { value: 'B', count: 1 },
    ]);
  });
});

describe('date range + gap detection', () => {
  it('returns null when there are no non-null dates', () => {
    expect(parseDateRange(resultOf(['earliest', 'latest', 'max_gap_days', 'median_gap_days'], [[null, null, null, null]]))).toBeNull();
  });

  it('formats an earliest/latest epoch-ms cell as an ISO date, not a raw number string', () => {
    const parsed = parseDateRange(
      resultOf(['earliest', 'latest', 'max_gap_days', 'median_gap_days'], [[MS('2024-01-01'), MS('2024-01-10'), 1, 1]]),
    );
    expect(parsed?.earliest).toBe('2024-01-01');
    expect(parsed?.latest).toBe('2024-01-10');
  });

  it('reports no gaps when spacing is regular', () => {
    const parsed = parseDateRange(
      resultOf(['earliest', 'latest', 'max_gap_days', 'median_gap_days'], [[MS('2024-01-01'), MS('2024-01-10'), 1, 1]]),
    );
    expect(parsed?.gapDescription).toBe('No gaps detected');
  });

  it('flags a gap more than double the typical spacing', () => {
    const parsed = parseDateRange(
      resultOf(['earliest', 'latest', 'max_gap_days', 'median_gap_days'], [[MS('2024-01-01'), MS('2024-03-01'), 20, 1]]),
    );
    expect(parsed?.gapDescription).toContain('Largest gap: 20 days');
  });

  it('handles a single distinct date (no measurable gap)', () => {
    const parsed = parseDateRange(
      resultOf(['earliest', 'latest', 'max_gap_days', 'median_gap_days'], [[MS('2024-01-01'), MS('2024-01-01'), null, null]]),
    );
    expect(parsed).toEqual({ earliest: '2024-01-01', latest: '2024-01-01', gapDescription: 'No gaps detected' });
  });

  it('falls back to String() for a non-numeric cell rather than a crash', () => {
    expect(formatDateCell('not-a-date')).toBe('not-a-date');
  });

  it('truncates to a "YYYY-MM" month label at precision 7', () => {
    expect(formatDateCell(MS('2023-05-15'), 7)).toBe('2023-05');
  });

  it('includes date_diff and the ordered/deltas CTEs', () => {
    const sql = buildDateRangeSql('t', 'd');
    expect(sql).toContain("date_diff('day'");
    expect(sql).toContain('ordered');
    expect(sql).toContain('deltas');
  });
});

describe('textual stats', () => {
  it('parses avg word count', () => {
    expect(parseWordCount(resultOf(['avg_words'], [[3.5]]))).toBe(3.5);
  });

  it('returns null avg word count for an empty aggregate', () => {
    expect(parseWordCount(resultOf(['avg_words'], [[null]]))).toBeNull();
  });

  it('parses sample preview rows as strings', () => {
    expect(parseSamplePreview(resultOf(['col'], [['hello world'], ['second row']]))).toEqual([
      'hello world',
      'second row',
    ]);
  });

  it('word-count SQL filters nulls and counts spaces', () => {
    const sql = buildWordCountSql('t', 'review');
    expect(sql).toContain('IS NOT NULL');
    expect(sql).toContain("' '");
  });

  it('sample preview SQL respects the limit', () => {
    expect(buildSamplePreviewSql('t', 'review', 3)).toContain('LIMIT 3');
  });
});
