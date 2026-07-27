// The DSPS "HTML" renderer (§12.2) — the human-facing half of DSPS's three
// renderers, alongside the DSPS JSON export (`structureReport.ts`'s
// `downloadStructureReport`) and "Copy for AI" (`aiContext.ts`). A single
// self-contained file: inline CSS, no script, no DataScope dependency to open
// — openable, attachable, and hostable anywhere. Its stylesheet mirrors the
// app's token layer via `exportTheme.ts`, so a shared report looks like the app
// it came from and follows its reader's register (V6c). Carries the D26
// attribution footer, tagged so the D25 edge counters can distinguish
// report-referred arrivals.
import type { StructureReport } from './structureReport';
import { formatSnapshotLabel } from './dsps';
import { EXPORT_THEME_CSS } from './exportTheme';

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
/* design-system: design.md · designed-as-app — the token declarations are mirrored
 * by src/lib/exportTheme.ts, which a test pins to src/app/theme.css. */
${EXPORT_THEME_CSS}

* { box-sizing: border-box; }

body {
  max-width: 860px;
  margin: 0 auto;
  padding: var(--space-xl) var(--space-md);
  background: var(--color-canvas);
  color: var(--color-ink);
  font-family: var(--font-sans);
  font-size: var(--text-lg);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

h1 { margin: 0; font-size: var(--text-2xl); font-weight: 600; letter-spacing: -0.01em; }
.mark { color: var(--color-active); }

/* The system's single labelling device: mono, tracked out, uppercase. */
.micro, th, .beta {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--color-ink-3);
}
.micro { margin: var(--space-2xs) 0 0; }

.meta { margin: var(--space-xs) 0 0; font-family: var(--font-mono); font-size: var(--text-base); color: var(--color-ink-2); }

h2 {
  margin: var(--space-xl) 0 0;
  padding-bottom: var(--space-xs);
  border-bottom: 1px solid var(--color-rule);
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: 500;
}

table { width: 100%; margin-top: var(--space-xs); border-collapse: collapse; font-family: var(--font-mono); font-size: var(--text-base); }
th, td { text-align: left; padding: var(--space-2xs) var(--space-xs); border-bottom: 1px solid var(--color-rule-2); }
th { border-bottom: 1px solid var(--color-rule); }
td { color: var(--color-ink-2); }

code { font-family: var(--font-mono); padding: 0 var(--space-2xs); border-radius: var(--radius-xs); background: var(--color-elev); color: var(--color-ink); }

/* A default disc marker is the last generic left in the document — the system
 * ships its own dingbat set, so the list wears one. */
ul { margin: var(--space-xs) 0 0; padding-left: 0; list-style: none; }
li { margin-top: var(--space-2xs); }
li::before { content: '◆'; margin-right: var(--space-xs); font-size: var(--text-sm); color: var(--color-ink-3); }
.snapshot { font-family: var(--font-mono); font-size: var(--text-base); color: var(--color-ink-3); }
.beta { padding: 0 var(--space-2xs); border: 1px solid var(--color-rule); border-radius: var(--radius-xs); vertical-align: middle; }

footer {
  margin-top: var(--space-xl);
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-rule);
  font-family: var(--font-mono);
  font-size: var(--text-base);
  color: var(--color-ink-3);
}
footer a { color: var(--color-active); }
</style>
</head>
<body>
  <h1>Data<span class="mark">Scope</span></h1>
  <p class="micro">Structure report</p>
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
