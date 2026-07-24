// The DSPS "HTML" renderer (§12.2) — the human-facing half of DSPS's three
// renderers, alongside the DSPS JSON export (`structureReport.ts`'s
// `downloadStructureReport`) and "Copy for AI" (`aiContext.ts`). A single
// self-contained file: inline CSS, no script, no DataScope dependency to open
// — openable, attachable, and hostable anywhere. Carries the D26 attribution
// footer, tagged so the D25 edge counters can distinguish report-referred
// arrivals.
import type { StructureReport } from './structureReport';
import { formatSnapshotLabel } from './dsps';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the self-contained HTML string. `attributionUrl` is the D26 tagged
 * link — the caller supplies it (mirrors `buildAIContext`/`buildStructureReport`'s
 * DOM-free pure-builder shape) rather than this module reading `window`
 * itself, so it stays unit-testable without jsdom.
 */
export function buildDspsHtml(report: StructureReport, attributionUrl: string): string {
  const generated = new Date(report.generatedAt).toLocaleString();

  const tablesHtml = report.tables
    .map((table) => {
      const rows = table.columns
        .map(
          (c) => `
        <tr>
          <td><code>${escapeHtml(c.name)}</code></td>
          <td>${escapeHtml(c.semanticType)}</td>
          <td>${escapeHtml(c.physicalType)}</td>
          <td>${c.nullPercentage != null ? `${c.nullPercentage.toFixed(1)}%` : '—'}</td>
          <td>${c.cardinality.toLocaleString()}</td>
        </tr>`,
        )
        .join('');
      return `
      <section class="table">
        <h2>${escapeHtml(table.tableName)}</h2>
        <p class="meta">${table.rowCount.toLocaleString()} rows × ${table.columnCount} columns</p>
        <table>
          <thead><tr><th>Column</th><th>Semantic type</th><th>Physical type</th><th>Null %</th><th>Distinct</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join('');

  const insightsHtml =
    report.insights.length > 0
      ? `
      <section class="insights">
        <h2>Insights</h2>
        <ul>
          ${report.insights
            .map(
              (insight) =>
                `<li><strong>${escapeHtml(insight.tableName)}</strong> — ${escapeHtml(insight.description)}
                  <span class="snapshot">(${escapeHtml(formatSnapshotLabel(insight.snapshot))})</span></li>`,
            )
            .join('')}
        </ul>
      </section>`
      : '';

  const relationshipsHtml =
    report.relationships && report.relationships.length > 0
      ? `
      <section class="relationships">
        <h2>Relationships <span class="beta">beta</span></h2>
        <ul>
          ${report.relationships
            .map(
              (rel) =>
                `<li><code>${escapeHtml(rel.childTable)}.${escapeHtml(rel.childColumn)}</code> → <code>${escapeHtml(rel.parentTable)}.${escapeHtml(rel.parentColumn)}</code> (${rel.confidence}, ${Math.round(rel.containment * 100)}% containment)</li>`,
            )
            .join('')}
        </ul>
      </section>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DataScope structure report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; background: #fff; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1.05rem; margin-top: 2rem; border-bottom: 1px solid #e2e2e2; padding-bottom: 0.4rem; }
  .meta { color: #666; font-size: 0.85rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid #eee; }
  th { color: #666; font-weight: 600; }
  code { background: #f4f4f4; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.85em; }
  .snapshot { color: #888; font-size: 0.8em; }
  .beta { font-size: 0.7em; color: #888; border: 1px solid #ccc; border-radius: 3px; padding: 0 0.3em; vertical-align: middle; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e2e2e2; font-size: 0.8rem; color: #888; }
  footer a { color: inherit; }
</style>
</head>
<body>
  <h1>DataScope structure report</h1>
  <p class="meta">Generated ${escapeHtml(generated)} · structure only — no data rows included</p>
  ${tablesHtml}
  ${insightsHtml}
  ${relationshipsHtml}
  <footer>Profiled with <a href="${escapeHtml(attributionUrl)}">DataScope</a> — drop your own files.</footer>
</body>
</html>`;
}

/** Triggers a browser download of the HTML report. DOM-only, kept separate from the pure builder above. */
export function downloadDspsHtml(report: StructureReport, filename = 'datascope-structure-report.html'): void {
  const attributionUrl = `${window.location.origin}${window.location.pathname}?ref=dsps-report`;
  const blob = new Blob([buildDspsHtml(report, attributionUrl)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
