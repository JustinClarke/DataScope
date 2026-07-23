import type { ChartSpec } from './chart';
import type { FactRef, RankedAction } from './actions';

/**
 * Declarative, capability-gated layout artifact (D55) — the renderer consumes
 * this and never executes model output. v0's only producer is deterministic
 * (the broker + Dossier assembly); an optional v0.5+ AI producer (D56) must
 * compose within the same rails and degrades to this when AI is off.
 */
export interface ViewSpecPanel {
  /** Component id from the fixed panel registry — never an arbitrary string. */
  componentId: string;
  props: Record<string, unknown>;
  chart?: ChartSpec;
  /**
   * Progressive-disclosure rung (D68c). Tier 1 (the Verdict) paints
   * unconditionally, one screen, no scroll; tiers 2–3 render only after the
   * renderer's "see full profile" disclosure is opened.
   */
  tier: 1 | 2 | 3;
}

export interface ViewSpec {
  viewspecVersion: string;
  panels: ViewSpecPanel[];
}

/**
 * The tier-1 Dossier payload (D68c) — identity + the *one* headline `FactRef`
 * + the top-3 `RankedAction`s. Emitted by the Dossier's tier-1 producer
 * (`lib/dossier.ts`'s `buildDatasetVerdict`); unlike `FactRef`/`RankedAction`/
 * `ThreadConfig` this contract is consumed only by the Verdict screen, not a
 * general-purpose slice threaded through multiple surfaces (§5).
 */
export interface DatasetVerdict {
  identity: {
    datasetLabel: string;
    tableCount: number;
    totalRows: number;
    totalBytes: number;
    profiledAt: string;
  };
  /** The top fact by interest score, or the honest floor sentence when none clears it — never null (D68c). */
  headlineFact: FactRef;
  /** What one row of the largest table represents, e.g. "orders: one row per order_id". */
  grain: string;
  /** Earliest–latest span of the largest table's primary date column, when one exists. */
  timeSpan?: string;
  /** Capped at 3 — the fuller ranked list stays in `rankNextActions`'s output, not here. */
  actions: RankedAction[];
}
