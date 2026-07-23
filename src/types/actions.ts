// Composition-layer contracts (D68) — the four typed, rows-free slices the
// view layer composes through. Each surface's props are exactly one of these;
// nothing downstream of the broker receives the whole registry. The slice is
// also the seam a later AI producer fills: it emits or re-ranks the *same*
// struct the deterministic producer emits, so swapping AI in touches one
// producer, never the UI or these types.
//
// This module owns FactRef, ThreadConfig, and RankedAction — the three the
// Action Broker (rankNextActions, lib/capabilities.ts) produces. DatasetVerdict
// (the tier-1 Dossier payload) lands with the Verdict work, not here.
import type { SidebarModule } from '../stores/ui';

/** How sure we are of a stated fact — not how *interesting* it is. */
export type FactConfidence = 'high' | 'medium' | 'low';

/** Where a fact came from: a §10 insight rule, or the dataset's own schema. */
export type FactProvenance = 'insight-rule' | 'schema';

/**
 * The universal claim-carrier (D45). Every number the app states, anywhere,
 * carries the SQL that produced it, the snapshot it was computed as-of, and a
 * confidence/provenance tag — so no claim is unfalsifiable. `sql` is empty for
 * a purely structural/schema fact (a column count is read off the registry, not
 * queried). Rows-free by construction.
 */
export interface FactRef {
  /** The honesty-guarded statement — a statistic, never a conclusion or causal claim. */
  statement: string;
  /** The query that produced it, or '' for a structural fact read off the schema. */
  sql: string;
  /** The as-of timestamp the fact was computed against (a table's ingest time). */
  snapshot: string;
  confidence: FactConfidence;
  provenance: FactProvenance;
}

/**
 * A module prefill (§10, D68e). `prefilledConfig` is deliberately open — the
 * Action Broker *populates* it (table/columns naming the destination) but no
 * analysis module *consumes* it yet; wiring modules to open on the answer is
 * later thread-prefill work. Rows-free: it names columns and config, never data.
 */
export interface ThreadConfig {
  module: SidebarModule;
  prefilledConfig: Record<string, unknown>;
}

/**
 * The Action Broker's output (§9, D68a) — a pre-configured destination with the
 * fact that motivates it attached. Joins broker legality (*what's possible*)
 * with the D10 insight interestingness score (*what's worth doing*). The
 * Dossier's "suggested next steps" band renders these; the tier-1 Verdict
 * consumes the top three.
 */
export interface RankedAction {
  /** Imperative destination label, e.g. "Chart revenue over order_date". */
  verb: string;
  /** The real module it routes to — never a "profile again" dead end. */
  module: SidebarModule;
  /** A sub-destination within `module` (e.g. which Charts tab), if the route names one — routing precision, not thread prefill. */
  tab?: string;
  /** Opens that module on the answer (§10, D68e); not consumed by modules yet. */
  prefill: ThreadConfig;
  /** The one computed fact motivating the action (D45). */
  evidence: FactRef;
  /** D10 interestingness (effect size × coverage); 0 for generic-floor routing. */
  score: number;
}
