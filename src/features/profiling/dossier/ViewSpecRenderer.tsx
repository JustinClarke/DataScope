// The deterministic ViewSpec renderer (D55) — walks `spec.panels[]` and maps
// each componentId to a hardcoded component via the fixed registry. This is
// the "never executes model output" half of the contract: there is no eval,
// no dynamic `import()` keyed by spec data, no dynamic component lookup by
// arbitrary string — an unrecognized componentId (a future AI producer
// proposing something the broker never declared legal, or a version skew)
// falls through to nothing rendered, not a crash and not a silent guess.
// Interaction callbacks are supplied by the host app, not carried in the
// spec — the spec itself is plain, JSON-serializable data end to end.
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { RankedAction, ViewSpec } from '../../../types';
import { validateViewSpec } from '../../../lib/viewspec';
import { IdentityBand, type IdentityBandProps } from './IdentityBand';
import { HeroJoinGraph, type HeroJoinGraphProps } from './HeroJoinGraph';
import { HeroTableGrid, type HeroTableGridProps } from './HeroTableGrid';
import { TableStrip, type TableStripProps } from './TableStrip';
import { QualityHeadline, type QualityHeadlineProps } from './QualityHeadline';
import { TimeCoverage, type TimeCoverageProps } from './TimeCoverage';
import { Verdict, type VerdictProps } from './Verdict';
import { TopInsights, type TopInsightsProps } from './TopInsights';
import { layerOf, LAYER_LABELS, LAYER_ORDER } from './layers';

export interface DossierInteractions {
  onOpenTable: (tableId: string) => void;
  onSelectAction: (action: RankedAction) => void;
  onExportReport: () => void;
  onExportHtml: () => void;
  onCopyForAI: () => void;
  onShowSql: (label: string, sql: string) => void;
}

function renderPanel(panel: ViewSpec['panels'][number], index: number, interactions: DossierInteractions) {
  switch (panel.componentId) {
    case 'identity-band':
      return (
        <IdentityBand
          key={index}
          {...(panel.props as unknown as IdentityBandProps)}
          onExportReport={interactions.onExportReport}
          onExportHtml={interactions.onExportHtml}
          onCopyForAI={interactions.onCopyForAI}
        />
      );
    case 'hero-join-graph':
      return <HeroJoinGraph key={index} {...(panel.props as unknown as HeroJoinGraphProps)} />;
    case 'hero-table-grid':
      return <HeroTableGrid key={index} {...(panel.props as unknown as HeroTableGridProps)} onOpenTable={interactions.onOpenTable} />;
    case 'table-strip':
      return <TableStrip key={index} {...(panel.props as unknown as TableStripProps)} onOpenTable={interactions.onOpenTable} />;
    case 'quality-headline':
      return <QualityHeadline key={index} {...(panel.props as unknown as QualityHeadlineProps)} />;
    case 'time-coverage':
      return <TimeCoverage key={index} {...(panel.props as unknown as TimeCoverageProps)} />;
    case 'verdict':
      return (
        <Verdict key={index} {...(panel.props as unknown as VerdictProps)} onSelectAction={interactions.onSelectAction} />
      );
    case 'top-insights':
      return <TopInsights key={index} {...(panel.props as unknown as TopInsightsProps)} onShowSql={interactions.onShowSql} />;
    // 'sensitive-columns' is a registered componentId with no v0 producer
    // yet (the D46 detector is unbuilt) — a spec could name it once that
    // lands without touching this renderer.
    default:
      return null;
  }
}

/**
 * Tier 1 (the Verdict) always paints — one screen, no scroll (D68c). Tiers
 * 2–3 sit behind one "see full profile" disclosure rather than a second
 * finer-grained gate: master/§4.2 describes the renderer as showing tier 1 and
 * gating "2–3" together, not staging them independently. What the disclosure
 * reveals is grouped by D69 intelligence-layer (layers.ts) — heuristics, then
 * per-table profiling, then any AI synthesis — so the layers structure the
 * opening view without ever being written into the tier enum, and no layer
 * ever renders at tier 1.
 */
export function ViewSpecRenderer({ spec, interactions }: { spec: ViewSpec; interactions: DossierInteractions }) {
  const [expanded, setExpanded] = useState(false);
  const { valid, errors } = validateViewSpec(spec);
  if (!valid) {
    return (
      <div className="rounded-lg border border-(--color-error)/40 bg-(--color-error)/5 p-4 text-sm text-(--color-error)">
        Invalid view spec: {errors.join('; ')}
      </div>
    );
  }

  // Carry each panel's global index as a stable React key, then split tier 1
  // (always painted) from the disclosed rest, which is grouped by layer.
  const indexed = spec.panels.map((panel, index) => ({ panel, index }));
  const tier1 = indexed.filter(({ panel }) => panel.tier === 1);
  const disclosed = indexed.filter(({ panel }) => panel.tier !== 1);
  const layerGroups = LAYER_ORDER.map((layer) => ({
    layer,
    items: disclosed.filter(({ panel }) => layerOf(panel.componentId) === layer),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {tier1.map(({ panel, index }) => renderPanel(panel, index, interactions))}
      {disclosed.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-fit items-center gap-1.5 text-sm text-(--color-accent) hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          {expanded ? 'Hide full profile' : 'See full profile'}
        </button>
      )}
      {expanded &&
        layerGroups.map(({ layer, items }) => (
          <section key={layer} aria-label={LAYER_LABELS[layer]} className="flex flex-col gap-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-(--color-fg-muted)">
              {LAYER_LABELS[layer]}
            </h3>
            {items.map(({ panel, index }) => renderPanel(panel, index, interactions))}
          </section>
        ))}
    </div>
  );
}
