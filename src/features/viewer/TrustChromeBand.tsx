// The D63 trust-chrome slot (W8, D62 Workbench amendment) — a full-width
// provenance band above viewer mode's canvas. Renders the D45 fields every
// DSPS document already carries (the structure-only claim + computed-at
// date); the signer/signature fields render an honest "not yet available"
// state rather than a fabricated one, since D63.2 (signed `.dsps`) is its own
// unbuilt design round.
import type { StructureReport } from '../../lib/structureReport';

interface TrustChromeBandProps {
  report: StructureReport;
}

export function TrustChromeBand({ report }: TrustChromeBandProps) {
  const generated = new Date(report.generatedAt).toLocaleString();

  return (
    <div
      data-testid="trust-chrome-band"
      className="flex flex-wrap items-center gap-4 border-b border-(--color-border) bg-(--color-bg-subtle) px-4 py-2 text-xs text-(--color-fg-muted)"
    >
      <span>Structure only — no data rows included. Computed {generated}.</span>
      <span className="ml-auto flex items-center gap-3">
        <span>Signer: Unsigned</span>
        <span>Signature: Signing not yet available</span>
      </span>
    </div>
  );
}
