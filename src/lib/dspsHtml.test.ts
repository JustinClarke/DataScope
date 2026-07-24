import { describe, expect, it } from 'vitest';
import { buildDspsHtml } from './dspsHtml';
import type { StructureReport } from './structureReport';

function report(overrides: Partial<StructureReport> = {}): StructureReport {
  return {
    dspsVersion: '1.0.0',
    generatedAt: '2026-07-23T00:00:00.000Z',
    tables: [
      {
        tableName: 'orders',
        rowCount: 891,
        columnCount: 1,
        columns: [
          { name: 'order_id', semanticType: 'Identifier', physicalType: 'BIGINT', nullPercentage: 0, cardinality: 891 },
        ],
      },
    ],
    insights: [],
    ...overrides,
  };
}

describe('buildDspsHtml', () => {
  it('produces a self-contained document with no external script/stylesheet references', () => {
    const html = buildDspsHtml(report(), 'https://app.example/?ref=dsps-report');
    expect(html).toContain('<!doctype html>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).toContain('<style>');
  });

  it('renders table/column data and never includes a raw row', () => {
    const html = buildDspsHtml(report(), 'https://app.example/?ref=dsps-report');
    expect(html).toContain('orders');
    expect(html).toContain('order_id');
    expect(html).toContain('891');
    expect(html).not.toContain('<td>1</td>'); // no per-row cell values anywhere
  });

  it('carries the D26 attribution footer with the tagged link', () => {
    const html = buildDspsHtml(report(), 'https://app.example/?ref=dsps-report');
    expect(html).toContain('Profiled with');
    expect(html).toContain('href="https://app.example/?ref=dsps-report"');
    expect(html).toContain('DataScope');
  });

  it('degrades to schema-only when relationships are omitted (D24 cut path) — no error, no empty section', () => {
    const html = buildDspsHtml(report(), 'https://app.example/');
    expect(html).not.toContain('Relationships');
  });

  it('renders relationships when present, confidence-labeled', () => {
    const html = buildDspsHtml(
      report({
        relationships: [
          {
            childTable: 'orders',
            childColumn: 'customer_id',
            parentTable: 'customers',
            parentColumn: 'id',
            confidence: 'confident',
            containment: 0.98,
            evidence: 'containment check',
          },
        ],
      }),
      'https://app.example/',
    );
    expect(html).toContain('Relationships');
    expect(html).toContain('confident');
    expect(html).toContain('98% containment');
  });

  it('renders insights with their D45 snapshot label and never renders the omitted section when empty', () => {
    const withInsights = buildDspsHtml(
      report({
        insights: [
          {
            tableName: 'orders',
            rule: 'high-uniqueness',
            description: 'order_id is 99.8% unique',
            provenance: 'derived-this-run',
            snapshot: { date: '2026-07-23T00:00:00.000Z', fileHash: null },
          },
        ],
      }),
      'https://app.example/',
    );
    expect(withInsights).toContain('order_id is 99.8% unique');
    expect(withInsights).toContain('computed as of');

    const withoutInsights = buildDspsHtml(report({ insights: [] }), 'https://app.example/');
    expect(withoutInsights).not.toContain('class="insights"');
  });

  it('HTML-escapes table/column names so a malicious source value never injects markup', () => {
    const html = buildDspsHtml(
      report({
        tables: [
          {
            tableName: '<img src=x onerror=alert(1)>',
            rowCount: 1,
            columnCount: 1,
            columns: [
              { name: '</code><script>alert(2)</script>', semanticType: 'x', physicalType: 'y', nullPercentage: 0, cardinality: 1 },
            ],
          },
        ],
      }),
      'https://app.example/',
    );
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>alert(2)</script>');
    expect(html).toContain('&lt;img');
  });
});
