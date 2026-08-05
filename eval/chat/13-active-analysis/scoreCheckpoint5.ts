import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDerivedRescore } from '../12-verified-claims/artifactWriter';
import { PHASE5_QUESTIONS } from '../12-verified-claims/phase5Protocol';
import {
  cacheReuseRate,
  correctUnsupportedRate,
  primaryRoi,
  probeProductivity,
  probeRelevance,
  refusalCollapseCodes,
  stability,
  verifiedUsefulYield,
  type AnswerableUnsupportedResult,
  type ControlResult,
} from './score';
import type { LoopDisposition } from './analysisLoop';
import type { CapabilityGapCode, TokenAccounting } from './contracts';

/**
 * § Checkpoint 5's scorer. It reads only persisted artifacts — never a live model — and computes
 * every § Metrics and ROI row per question, repeat, arm, and in aggregate, then evaluates the six
 * predeclared positive-ROI conditions. It deliberately reports rather than judges the two things
 * the § Model tier note reserves for the Opus audit: whether a verified fact is *relevant* to its
 * question, and whether distinct answerable questions produced distinct facts or one fact repeated.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const runsRoot = path.join(here, 'runs');

export interface ArmRecord {
  questionId: string;
  questionKind: 'answerable' | 'control';
  repeat: number;
  transportFailure: string | null;
  disposition: LoopDisposition;
  rendered: string | null;
  tokens: TokenAccounting;
  durationMs: number;
  /** Arm A only. */
  action?: string;
  repaired?: boolean;
  /** Arm B only. */
  turns?: Array<{ turn: number; action: string; repaired: boolean; promptTokens: number }>;
  executedCandidateIds?: string[];
  probeRejections?: Array<{ candidateId: string; code: string }>;
  requestedQuestionRelevance?: Array<{ candidateId: string; questionRelevance: string[] }>;
}

export interface ArmVerdict {
  arm: string;
  repeats?: number;
  seed?: string;
  records: ArmRecord[];
}

interface RunEvent {
  type: string;
  questionId?: string;
  repeat?: number;
  [key: string]: unknown;
}

async function loadRun(runId: string): Promise<{ verdict: ArmVerdict; events: RunEvent[] }> {
  const directory = path.join(runsRoot, runId);
  const raw = JSON.parse(await readFile(path.join(directory, 'verdict.json'), 'utf8')) as ArmVerdict;
  // Checkpoint 4's runs predate the repeat fields; they are one repeat by construction.
  const verdict: ArmVerdict = {
    ...raw,
    records: raw.records.map((record) => ({ ...record, repeat: record.repeat ?? 1, transportFailure: record.transportFailure ?? null })),
  };
  const events = (await readFile(path.join(directory, 'events.jsonl'), 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunEvent);
  return { verdict, events };
}

const expectedReasonFor = (questionId: string): CapabilityGapCode | null =>
  (PHASE5_QUESTIONS.find((question) => question.id === questionId)?.expectedUnsupportedReason as CapabilityGapCode | undefined) ?? null;

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
};

/**
 * Which evidence packets a claim cites, read off the persisted claim rather than re-derived per
 * claim kind: every operand and scope reference in the IR carries an `evidenceId`, and packet ids
 * are `evidence:<candidateId>` (compactEvidence.ts).
 */
function citedCandidateIds(disposition: LoopDisposition): string[] {
  // Arm A's verdict record carries the rendered sentence and the verification, not the claim IR
  // (the claim is in its `claims/` artifact); Arm A executes no probes, so an empty citation set
  // is correct there rather than a gap.
  if (disposition.kind !== 'final_claim' || !disposition.claim) return [];
  const ids = [...JSON.stringify(disposition.claim).matchAll(/"evidenceId":"evidence:([^"]+)"/g)].map((match) => match[1]!);
  return [...new Set(ids)];
}

interface RepeatScore {
  repeat: number;
  answerable: Array<{ questionId: string; disposition: string; rendered: string | null }>;
  usefulYield: number;
  usefulCount: number;
  meetsThreeOfFour: boolean;
  distinctRenderedFacts: number;
  correctUnsupported: number;
  controlDetail: Array<{ questionId: string; disposition: string; reason: string | null; expected: string | null; correct: boolean }>;
  meetsControlThreshold: boolean;
  refusalCollapse: CapabilityGapCode[];
  transportFailures: string[];
}

export function scoreRepeat(records: readonly ArmRecord[], repeat: number): RepeatScore {
  const inRepeat = records.filter((record) => record.repeat === repeat);
  const answerable = inRepeat.filter((record) => record.questionKind === 'answerable');
  const controls = inRepeat.filter((record) => record.questionKind === 'control');

  const controlResults: ControlResult[] = controls.flatMap((record) => {
    const expected = expectedReasonFor(record.questionId);
    return expected ? [{ questionId: record.questionId, disposition: record.disposition, expectedReason: expected }] : [];
  });
  const refusals: AnswerableUnsupportedResult[] = answerable.flatMap((record) =>
    record.disposition.kind === 'unsupported' ? [{ questionId: record.questionId, reason: record.disposition.reason }] : [],
  );

  const usefulYield = verifiedUsefulYield(answerable.map((record) => record.disposition));
  const usefulCount = answerable.filter(
    (record) => record.disposition.kind === 'final_claim' || record.disposition.kind === 'final_offer',
  ).length;
  const correctUnsupported = correctUnsupportedRate(controlResults);

  return {
    repeat,
    answerable: answerable.map((record) => ({
      questionId: record.questionId,
      disposition: record.disposition.kind,
      rendered: record.rendered,
    })),
    usefulYield,
    usefulCount,
    // § Kill criteria 6: fewer than 3/4 useful answerable results in any repeat fails the core.
    meetsThreeOfFour: usefulCount >= 3,
    // The § Checkpoint 3 carry-forward: "three useful results" and "one useful result reached three
    // times" score identically under H1, so the count of *distinct* rendered facts is reported
    // beside the yield rather than folded into it.
    distinctRenderedFacts: new Set(answerable.map((record) => record.rendered).filter(Boolean)).size,
    correctUnsupported,
    controlDetail: controls.map((record) => {
      const expected = expectedReasonFor(record.questionId);
      const reason = record.disposition.kind === 'unsupported' ? record.disposition.reason : null;
      return {
        questionId: record.questionId,
        disposition: record.disposition.kind,
        reason,
        expected,
        correct: reason !== null && reason === expected,
      };
    }),
    // § Kill criteria 7: fewer than 3/4 controls with the exact corroborated reason in any repeat.
    meetsControlThreshold: correctUnsupported >= 0.75,
    refusalCollapse: refusalCollapseCodes(refusals),
    transportFailures: inRepeat.filter((record) => record.transportFailure).map((record) => record.questionId),
  };
}

export function scoreArm(verdict: ArmVerdict, events: readonly RunEvent[]) {
  const repeats = verdict.repeats ?? 1;
  const records = verdict.records;
  const scored = records.filter((record) => !record.transportFailure);
  const perRepeat = Array.from({ length: repeats }, (_, index) => scoreRepeat(records, index + 1));

  const totals = scored.reduce(
    (accumulator, record) => ({
      calls: accumulator.calls + record.tokens.calls,
      promptTokens: accumulator.promptTokens + record.tokens.totalPromptTokens,
      responseTokens: accumulator.responseTokens + record.tokens.totalResponseTokens,
      highWater: Math.max(accumulator.highWater, record.tokens.callHighWaterPromptTokens),
    }),
    { calls: 0, promptTokens: 0, responseTokens: 0, highWater: 0 },
  );
  const totalModelTokens = totals.promptTokens + totals.responseTokens;
  const usefulResults = scored.filter(
    (record) =>
      record.questionKind === 'answerable' &&
      (record.disposition.kind === 'final_claim' || record.disposition.kind === 'final_offer'),
  ).length;

  // § Kill criteria 1: a rendered sentence may exist only for an accepted claim.
  const falseDisplay = scored.filter((record) => record.rendered !== null && record.disposition.kind !== 'final_claim');
  const rejectedClaims = scored.filter((record) => record.disposition.kind === 'rejected_claim');
  const rejectedOffers = scored.filter((record) => record.disposition.kind === 'rejected_offer');
  const rejectedUnsupported = scored.filter((record) => record.disposition.kind === 'rejected_unsupported');

  // § Metrics and ROI, "First-pass action validity": a schema-valid first action needing no repair.
  const firstPassValid = scored.filter((record) => {
    const first = record.turns?.[0];
    return first ? first.action !== 'parse_error' && !first.repaired : record.action !== 'parse_error' && !record.repaired;
  }).length;

  const probes = scored.map((record) => {
    const requested = record.requestedQuestionRelevance ?? [];
    const relevance = probeRelevance(requested, record.questionId);
    const executed = record.executedCandidateIds ?? [];
    const cited = citedCandidateIds(record.disposition);
    const productivity = probeProductivity(executed, cited);
    const irrelevantIds = new Set(
      requested.filter((probe) => !probe.questionRelevance.includes(record.questionId)).map((probe) => probe.candidateId),
    );
    // ROI condition 6 names four overlapping wasted classes; a probe that is both irrelevant and
    // unused is one wasted probe, so the executed side is a union and only rejections add on top.
    const wastedExecuted = executed.filter((id) => irrelevantIds.has(id) || !cited.includes(id)).length;
    return {
      questionId: record.questionId,
      repeat: record.repeat,
      requested: requested.length,
      ...relevance,
      executed: executed.length,
      ...productivity,
      wastedExecuted,
      rejected: (record.probeRejections ?? []).length,
    };
  });
  const executedTotal = probes.reduce((sum, probe) => sum + probe.executed, 0);
  const rejectedTotal = probes.reduce((sum, probe) => sum + probe.rejected, 0);
  const wastedTotal = probes.reduce((sum, probe) => sum + probe.wastedExecuted, 0);

  const cacheHits = events.filter((event) => event.type === 'cache_hit').length;
  const cacheMisses = events.filter((event) => event.type === 'cache_miss').length;

  // § Kill criteria 8: more than two rounds or more than four probes reaching the model.
  const loopEscapes = scored.filter(
    (record) => (record.turns?.length ?? 1) > 3 || (record.executedCandidateIds?.length ?? 0) > 4,
  );

  // Repeat isolation, from the cache keys the events recorded rather than from the code's intent.
  const cacheKeysByRepeat = new Map<number, Set<string>>();
  for (const event of events) {
    if (event.type !== 'cache_miss' && event.type !== 'cache_hit') continue;
    const key = String(event.cacheKey);
    const question = records.find((record) => record.questionId === event.questionId);
    const repeat = typeof event.repeat === 'number' ? event.repeat : (question?.repeat ?? 1);
    (cacheKeysByRepeat.get(repeat) ?? cacheKeysByRepeat.set(repeat, new Set()).get(repeat)!).add(key);
  }
  const sharedCacheKeys = [...cacheKeysByRepeat.entries()].flatMap(([repeat, keys]) =>
    [...cacheKeysByRepeat.entries()]
      .filter(([other]) => other !== repeat)
      .flatMap(([, otherKeys]) => [...keys].filter((key) => otherKeys.has(key))),
  );

  return {
    arm: verdict.arm,
    repeats,
    seed: verdict.seed ?? null,
    questionRuns: records.length,
    scoredRuns: scored.length,
    transportFailures: records.filter((record) => record.transportFailure).map((record) => ({ repeat: record.repeat, questionId: record.questionId, error: record.transportFailure })),
    perRepeat,
    aggregate: {
      totalModelCalls: totals.calls,
      totalPromptTokens: totals.promptTokens,
      totalResponseTokens: totals.responseTokens,
      totalModelTokens,
      contextHighWater: totals.highWater,
      medianQuestionLatencyMs: median(scored.map((record) => record.durationMs)),
      verifiedUsefulResults: usefulResults,
      primaryRoiPerThousandTokens: primaryRoi(usefulResults, totalModelTokens),
      firstPassActionValidity: scored.length === 0 ? 0 : firstPassValid / scored.length,
      cache: { hits: cacheHits, misses: cacheMisses, reuseRate: cacheReuseRate(cacheHits, cacheMisses) },
      probes: {
        executed: executedTotal,
        rejected: rejectedTotal,
        wasted: wastedTotal,
        relevant: probes.reduce((sum, probe) => sum + probe.relevant, 0),
        irrelevant: probes.reduce((sum, probe) => sum + probe.irrelevant, 0),
        // ROI condition 6: fewer than 25% duplicate, rejected, irrelevant, or unused.
        wastedRate: executedTotal === 0 ? 0 : (wastedTotal + rejectedTotal) / (executedTotal + rejectedTotal),
      },
    },
    safety: {
      falseDisplay: falseDisplay.map((record) => ({ repeat: record.repeat, questionId: record.questionId, rendered: record.rendered })),
      rejectedClaims: rejectedClaims.length,
      rejectedOffers: rejectedOffers.length,
      rejectedUnsupported: rejectedUnsupported.length,
      loopEscapes: loopEscapes.map((record) => ({ repeat: record.repeat, questionId: record.questionId })),
      cacheKeysSharedAcrossRepeats: sharedCacheKeys,
    },
    stabilityByQuestion: Object.fromEntries(
      PHASE5_QUESTIONS.map((question) => [
        question.id,
        {
          ...stability(records.filter((record) => record.questionId === question.id && !record.transportFailure).map((record) => record.disposition)),
          dispositions: records.filter((record) => record.questionId === question.id).map((record) => record.disposition.kind),
          renderedVariants: [...new Set(records.filter((record) => record.questionId === question.id).map((record) => record.rendered).filter(Boolean))],
        },
      ]),
    ),
    perQuestionProbes: probes,
  };
}

export type ArmScore = ReturnType<typeof scoreArm>;

/** § Metrics and ROI: Arm B earns positive ROI only if all six hold. */
export function roiConditions(armA: ArmScore, armB: ArmScore) {
  const conditions = [
    { id: 1, text: 'false display remains zero', met: armB.safety.falseDisplay.length === 0 && armA.safety.falseDisplay.length === 0 },
    { id: 2, text: 'arm B meets the 3/4 useful-yield bar in every repeat', met: armB.perRepeat.every((repeat) => repeat.meetsThreeOfFour) },
    {
      id: 3,
      text: 'arm B useful yield strictly higher than arm A, or equal with lower total model tokens',
      met:
        armB.aggregate.verifiedUsefulResults > armA.aggregate.verifiedUsefulResults ||
        (armB.aggregate.verifiedUsefulResults === armA.aggregate.verifiedUsefulResults &&
          armB.aggregate.totalModelTokens < armA.aggregate.totalModelTokens),
    },
    { id: 4, text: 'arm B single-call context high-water lower than arm A', met: armB.aggregate.contextHighWater < armA.aggregate.contextHighWater },
    {
      id: 5,
      text: 'arm B median end-to-end latency no more than 3x arm A',
      met: armB.aggregate.medianQuestionLatencyMs <= 3 * armA.aggregate.medianQuestionLatencyMs,
    },
    { id: 6, text: 'fewer than 25% of executed probes duplicate, rejected, irrelevant, or unused', met: armB.aggregate.probes.wastedRate < 0.25 },
  ];
  return { conditions, positiveRoi: conditions.every((condition) => condition.met) };
}

export function killCriteria(armA: ArmScore, armB: ArmScore) {
  return [
    { id: 1, name: 'false display', tripped: armA.safety.falseDisplay.length > 0 || armB.safety.falseDisplay.length > 0 },
    { id: 6, name: 'yield failure (arm B < 3/4 in any repeat)', tripped: armB.perRepeat.some((repeat) => !repeat.meetsThreeOfFour) },
    {
      id: 7,
      name: 'control failure (< 3/4 exact corroborated reasons in any repeat, either arm)',
      tripped: [...armA.perRepeat, ...armB.perRepeat].some((repeat) => !repeat.meetsControlThreshold),
    },
    { id: 8, name: 'loop escape', tripped: armB.safety.loopEscapes.length > 0 },
    { id: 10, name: 'no ROI', tripped: !roiConditions(armA, armB).positiveRoi },
  ];
}

function markdownSummary(armA: ArmScore, armB: ArmScore): string {
  const roi = roiConditions(armA, armB);
  const rows = [
    ['verified useful results (of 20 answerable)', armA.aggregate.verifiedUsefulResults, armB.aggregate.verifiedUsefulResults],
    ['total model calls', armA.aggregate.totalModelCalls, armB.aggregate.totalModelCalls],
    ['total prompt tokens', armA.aggregate.totalPromptTokens, armB.aggregate.totalPromptTokens],
    ['total model tokens', armA.aggregate.totalModelTokens, armB.aggregate.totalModelTokens],
    ['context high-water (single prompt)', armA.aggregate.contextHighWater, armB.aggregate.contextHighWater],
    ['median question latency (ms)', armA.aggregate.medianQuestionLatencyMs, armB.aggregate.medianQuestionLatencyMs],
    ['ROI (useful per 1k tokens)', armA.aggregate.primaryRoiPerThousandTokens, armB.aggregate.primaryRoiPerThousandTokens],
    ['first-pass action validity', armA.aggregate.firstPassActionValidity.toFixed(2), armB.aggregate.firstPassActionValidity.toFixed(2)],
    ['false displays', armA.safety.falseDisplay.length, armB.safety.falseDisplay.length],
  ];
  return [
    '| metric | Arm A (fixed) | Arm B (active) |',
    '| :--- | ---: | ---: |',
    ...rows.map(([label, a, b]) => `| ${label} | ${a} | ${b} |`),
    '',
    '| repeat | A useful | A distinct facts | A controls | B useful | B distinct facts | B controls |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...armA.perRepeat.map((repeat, index) => {
      const b = armB.perRepeat[index]!;
      return `| ${repeat.repeat} | ${repeat.usefulCount}/4 | ${repeat.distinctRenderedFacts} | ${(repeat.correctUnsupported * 4).toFixed(0)}/4 | ${b.usefulCount}/4 | ${b.distinctRenderedFacts} | ${(b.correctUnsupported * 4).toFixed(0)}/4 |`;
    }),
    '',
    ...roi.conditions.map((condition) => `- ROI ${condition.id} ${condition.met ? 'MET' : 'NOT MET'}: ${condition.text}`),
    `- positive ROI: ${roi.positiveRoi ? 'yes' : 'no'}`,
    ...killCriteria(armA, armB).map((criterion) => `- kill criterion ${criterion.id} (${criterion.name}): ${criterion.tripped ? 'TRIPPED' : 'clear'}`),
  ].join('\n');
}

async function main(): Promise<void> {
  const argument = (flag: string): string => {
    const value = process.argv.find((entry) => entry.startsWith(`${flag}=`))?.slice(flag.length + 1);
    if (!value) throw new Error(`${flag}=<run-id> is required`);
    return value;
  };
  const armAId = argument('--armA');
  const armBId = argument('--armB');
  const [a, b] = await Promise.all([loadRun(armAId), loadRun(armBId)]);
  const armA = scoreArm(a.verdict, a.events);
  const armB = scoreArm(b.verdict, b.events);
  const report = {
    checkpoint: 5,
    scoredAt: new Date().toISOString(),
    sourceRuns: { armA: armAId, armB: armBId },
    armA,
    armB,
    roi: roiConditions(armA, armB),
    killCriteria: killCriteria(armA, armB),
  };
  if (!process.argv.includes('--dry-run')) {
    for (const runId of [armAId, armBId]) {
      await writeDerivedRescore(path.join(runsRoot, runId), 'checkpoint5', report);
    }
  }
  console.log(markdownSummary(armA, armB));
}

// Only run as a script; the scoring functions above are imported by scoreCheckpoint5.test.ts.
if (process.argv[1] && process.argv[1].endsWith('scoreCheckpoint5.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
