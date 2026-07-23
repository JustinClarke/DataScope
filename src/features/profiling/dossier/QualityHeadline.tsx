export interface QualityHeadlineProps {
  items: string[];
}

/**
 * "Worth knowing" — the above-the-fold quality summary (§13.1). Only ever
 * rendered when there's something positive to report; lib/dossier.ts omits
 * this panel from the spec entirely on an empty result, so there is no
 * "no issues found" state to accidentally ship here.
 */
export function QualityHeadline({ items }: QualityHeadlineProps) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-(--color-border) p-4">
      <h2 className="mb-1 text-sm font-medium text-(--color-fg-muted)">Worth knowing</h2>
      <p className="text-sm text-(--color-fg)">{items.join(' · ')}</p>
    </div>
  );
}
