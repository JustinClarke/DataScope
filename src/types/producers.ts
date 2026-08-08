// AI producer seams (D68f, §6/§9/§13.1) — the two places an optional v0.5+ AI
// producer (D56) may substitute for the deterministic one: action ranking
// (§9, D68a) and findings narration (§12.2/§13.1, D65).
//
// DESIGN-ONLY FREEZE. This file declares the frozen shapes so Phase 6
// (build/06-ai) is a drop-in; there is no AI implementation in v0 and none
// here. The contract, alternatives, and rationale are ADR-010; routing,
// provider, model, and cost are ADR-007 (the AI producer runs over that path —
// the two ADRs compose, they do not overlap).
//
// The load-bearing invariant (D55/D58): the AI is a REPLACE-IN-PLACE producer
// over the deterministic baseline, never a from-scratch one. Each seam's
// producer takes the deterministic slice the app already computed + its cache
// fingerprint and returns the SAME slice type — reordered or re-phrased only.
// Swapping AI in touches one producer; the four D68 contracts, the UI, and the
// deterministic floor are untouched. The deterministic output is the complete
// product with AI off (D2/D28) — it always paints first and is what shows on
// any degrade.
import type { FactRef, RankedAction } from "./actions";

/**
 * Stable cache key over a producer's deterministic baseline (D45 fingerprint,
 * §11.2). Same data + same model ⇒ same fingerprint ⇒ the cached AI output is
 * reused with no second call; it survives a re-profile of unchanged data
 * (identical fact snapshots hash identically) and changes when the active model
 * changes (a model swap must invalidate). The concrete hash and cache store are
 * a Phase-6 detail (ADR-010, "Consequences"); only the role is frozen here.
 */
export type FactFingerprint = string;

/** Which producer actually filled a slice — the deterministic floor, or AI. */
export type ProducerSource = "deterministic" | "ai";

/**
 * Why the deterministic output is showing even though an AI producer exists —
 * one of four honest states (ADR-010, Decision 7), never a silent wrong answer.
 * Reported as content-free telemetry only (D41/§23.5): counts and latency,
 * never fact prose or dataset content.
 *  - `ai-off`      user is in a no-cloud mode, or AI is disabled (§5.1)
 *  - `ai-down`     edge error, timeout, or exhausted Workers-AI budget (§11.2)
 *  - `ai-uncached` first paint: no cache hit yet, AI request in flight
 *  - `ai-rejected` AI returned, but failed the seam's validator below
 */
export type ProducerDegradeReason =
  "ai-off" | "ai-down" | "ai-uncached" | "ai-rejected";

/**
 * What a seam hands the view after resolution. `source: 'deterministic'` always
 * carries a `degradeReason`; `source: 'ai'` never does. `value` is the same
 * slice type either way — the UI reads it identically and never knows or cares
 * which producer filled it. (The resolve function that produces this from a
 * producer attempt is a Phase-6 detail, not frozen here — ADR-010.)
 */
export interface ProducerResult<T> {
  value: T;
  source: ProducerSource;
  /** Set iff `source === 'deterministic'` and an AI producer was eligible. */
  degradeReason?: ProducerDegradeReason;
}

/**
 * A seam validator — the honesty boundary (ADR-010, Decision 8). Returns true
 * only when the AI `candidate` preserves every invariant the seam freezes; a
 * false result degrades to `baseline` with `ai-rejected`. The seam owns this and
 * the orchestrator applies it: a producer never self-certifies. Pure — no I/O,
 * no model call. Phase 6 must unit-test each validator against the D45 guard.
 */
export type ProducerValidator<T> = (baseline: T, candidate: T) => boolean;

/**
 * Seam 1 — action ranking (§9, D68a). The AI re-ranker receives the
 * deterministic `RankedAction[]` (the legal, evidence-attached, floor-gated set
 * the broker already produced) plus its fingerprint, and returns the SAME
 * actions reordered and/or with re-phrased `verb`s. It may NOT add or drop an
 * action, nor change any action's `module`, `tab`, `prefill`, `evidence`, or
 * `score` — those are the broker's grammar, not the model's to invent (ADR-010,
 * Decision 3). The orchestrator applies {@link RankedActionValidator} to the
 * result; the ranker does not self-certify.
 */
export interface ActionRanker {
  rerank(
    baseline: RankedAction[],
    fingerprint: FactFingerprint,
  ): Promise<RankedAction[]>;
}

/** Enforces action-set identity (module + prefill + evidence unchanged); order and `verb` may differ. */
export type RankedActionValidator = ProducerValidator<RankedAction[]>;

/**
 * Seam 2 — findings narration (§12.2/§13.1, D65). The AI narrator receives one
 * deterministic `FactRef` and its fingerprint and returns a `FactRef` with the
 * `statement` prose re-phrased ONLY. Every other field — `sql`, `snapshot`,
 * `confidence`, `provenance` — must be byte-identical, the numeric claim
 * preserved, and the D45 phrasing guard upheld (no permanence / causal /
 * "verified" wording). The narrator receives `sql` as read-only provenance and
 * never emits or runs SQL — the renderer still executes no model output (D55).
 * The orchestrator applies {@link NarrationValidator}; the narrator does not
 * self-certify.
 */
export interface FindingsNarrator {
  narrate(baseline: FactRef, fingerprint: FactFingerprint): Promise<FactRef>;
}

/** Enforces every non-`statement` `FactRef` field byte-identical + the D45 phrasing guard. */
export type NarrationValidator = ProducerValidator<FactRef>;
