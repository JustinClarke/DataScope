import { describe, expect, it } from 'vitest';
import { formatCellText, truncateForDisplay } from './cellFormat';

describe('formatCellText', () => {
  it('renders null and undefined as the literal string NULL, distinct from empty string', () => {
    expect(formatCellText(null, 'VARCHAR')).toBe('NULL');
    expect(formatCellText(undefined, 'VARCHAR')).toBe('NULL');
    expect(formatCellText('', 'VARCHAR')).toBe('');
  });

  it('formats a DATE column as YYYY-MM-DD', () => {
    expect(formatCellText(new Date(Date.UTC(2026, 6, 19)), 'Date32<DAY>')).toBe('2026-07-19');
  });

  it('formats a TIMESTAMP column as YYYY-MM-DD HH:mm:ss', () => {
    expect(formatCellText(new Date(Date.UTC(2026, 6, 19, 8, 30, 15)), 'Timestamp<MICROSECOND>')).toBe(
      '2026-07-19 08:30:15',
    );
  });

  it('passes numbers and strings through as-is', () => {
    expect(formatCellText(42, 'BIGINT')).toBe('42');
    expect(formatCellText('hello', 'VARCHAR')).toBe('hello');
  });
});

describe('truncateForDisplay', () => {
  it('leaves short strings untouched', () => {
    expect(truncateForDisplay('short')).toEqual({ display: 'short', isTruncated: false });
  });

  it('truncates long strings with an ellipsis and flags them', () => {
    const long = 'x'.repeat(200);
    const { display, isTruncated } = truncateForDisplay(long);
    expect(isTruncated).toBe(true);
    expect(display.endsWith('…')).toBe(true);
    expect(display.length).toBeLessThan(long.length);
  });
});
