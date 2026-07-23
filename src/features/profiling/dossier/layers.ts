// The three intelligence-layers the Blueprint presents its findings by:
// profiling (per-table stats), heuristics (data-sniffer / relationship
// signals), and AI-synthesis (the optional narration). The layers are mapped
// *onto* each panel's componentId here — never written into the tier axis,
// which stays exactly 1 | 2 | 3. Tier gates disclosure; layer groups what the
// disclosure reveals. The two tier-1 componentIds (the Verdict itself) belong
// to no layer — they are the briefing, above the layered detail — so they map
// to null and never render inside a layer section.
import type { ViewSpecComponentId } from '../../../lib/viewspec';

export type DossierLayer = 'heuristics' | 'profiling' | 'ai-synthesis';

const LAYER_BY_COMPONENT: Record<ViewSpecComponentId, DossierLayer | null> = {
  'identity-band': null,
  verdict: null,
  // Heuristics — relationship inference (the join graph), the shared-column
  // grid, the table strip, the data-quality headline, the date-coverage read,
  // and (once its v0.5 detector lands) sensitive columns.
  'hero-join-graph': 'heuristics',
  'hero-table-grid': 'heuristics',
  'table-strip': 'heuristics',
  'quality-headline': 'heuristics',
  'time-coverage': 'heuristics',
  'sensitive-columns': 'heuristics',
  // Profiling — the per-table insight detail.
  'top-insights': 'profiling',
  // AI-synthesis has no v0 componentId yet; the edge-synthesis (02) and WebLLM
  // (03) producers add one, mapped here, that renders in the section below.
};

// Accepts a plain string (a ViewSpec panel's componentId is untyped-by-design,
// so a future/unknown id resolves to no layer rather than a type error) while
// the map above stays keyed by the exhaustive registry — adding a component to
// the registry won't compile until it is given a layer here.
export function layerOf(componentId: string): DossierLayer | null {
  return (LAYER_BY_COMPONENT as Record<string, DossierLayer | null>)[componentId] ?? null;
}

// Reveal order inside the "full profile" disclosure: structural/relationship
// signals first, then per-table profiling, then any AI synthesis. A layer with
// no panels renders nothing — never an empty "AI synthesis" heading implying an
// all-clear (the positives-only silence rule).
export const LAYER_ORDER: DossierLayer[] = ['heuristics', 'profiling', 'ai-synthesis'];

export const LAYER_LABELS: Record<DossierLayer, string> = {
  heuristics: 'Signals & relationships',
  profiling: 'Per-table detail',
  'ai-synthesis': 'AI synthesis',
};
