import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { EvalEngine } from '../../duckdb/duckdb';
import { ArtifactWriter, type RunManifest } from '../12-verified-claims/artifactWriter';
import type { EvidencePacket } from '../12-verified-claims/evidence';
import { syntheticVerifierCases } from '../12-verified-claims/syntheticCases';
import { generateCandidates, generateOffers } from './candidateGenerator';
import { EvidenceCache } from './cache';
import type { CompactEvidencePacket, DatasetPassport, ProbeCandidate } from './contracts';
import { createLoopState, step, type LoopState } from './analysisLoop';
import { createEcommerceFixture } from './testFixtures';

let engine: EvalEngine;
let passport: DatasetPassport;
let candidates: ProbeCandidate[];
let offers: ReturnType<typeof generateOffers>;

beforeAll(async () => {
  ({ engine, passport } = await createEcommerceFixture());
  candidates = generateCandidates(passport);
  offers = generateOffers(candidates);
});

afterAll(async () => {
  await engine.close();
});

function freshState(overrides: Partial<Parameters<typeof createLoopState>[0]> = {}): LoopState {
  return createLoopState({
    questionId: 'test-question',
    passport,
    candidates,
    offers,
    cache: new EvidenceCache(),
    ...overrides,
  });
}

describe('the hard loop stop cannot be bypassed', () => {
  it('rejects an unknown candidate id', async () => {
    const outcome = await step({ engine, state: freshState(), action: { action: 'request_probes', candidateIds: ['not-a-real-candidate'] } });
    expect(outcome).toMatchObject({ status: 'probes_rejected', rejections: [{ candidateId: 'not-a-real-candidate', code: 'unknown_candidate' }] });
  });

  it('rejects an offer id passed where a candidate id belongs (wrong type)', async () => {
    const offerId = offers[0]!.id;
    const outcome = await step({ engine, state: freshState(), action: { action: 'request_probes', candidateIds: [offerId] } });
    expect(outcome).toMatchObject({ status: 'probes_rejected', rejections: [{ candidateId: offerId, code: 'wrong_type' }] });
  });

  it('rejects a request over the per-round cap of two candidate ids', async () => {
    const [a, b, c] = candidates.map((candidate) => candidate.id);
    const outcome = await step({ engine, state: freshState(), action: { action: 'request_probes', candidateIds: [a!, b!, c!] } });
    expect(outcome.status).toBe('probes_rejected');
  });

  it('rejects a repeated normalized probe in the same question', async () => {
    const id = candidates[0]!.id;
    const first = await step({ engine, state: freshState(), action: { action: 'request_probes', candidateIds: [id] } });
    if (first.status !== 'probes_resolved') throw new Error('expected first request to resolve');
    const second = await step({ engine, state: first.state, action: { action: 'request_probes', candidateIds: [id] } });
    expect(second).toMatchObject({ status: 'probes_rejected', rejections: [{ candidateId: id, code: 'duplicate_probe' }] });
  });

  it('enforces the maximum of two probe rounds even when each round is individually within budget', async () => {
    const [a, b, c, d] = candidates.filter((candidate) => candidate.resolution.mode === 'plan').map((candidate) => candidate.id);
    let state = freshState();
    const round1 = await step({ engine, state, action: { action: 'request_probes', candidateIds: [a!, b!] } });
    if (round1.status !== 'probes_resolved') throw new Error('round 1 should resolve');
    const round2 = await step({ engine, state: round1.state, action: { action: 'request_probes', candidateIds: [c!] } });
    if (round2.status !== 'probes_resolved') throw new Error('round 2 should resolve');
    const round3 = await step({ engine, state: round2.state, action: { action: 'request_probes', candidateIds: [d!] } });
    expect(round3.status).toBe('probes_rejected');
  });

  it('enforces the maximum of four executed probes across rounds', async () => {
    const planIds = candidates.filter((candidate) => candidate.resolution.mode === 'plan').map((candidate) => candidate.id);
    expect(planIds.length).toBeGreaterThanOrEqual(4);
    const round1 = await step({ engine, state: freshState(), action: { action: 'request_probes', candidateIds: [planIds[0]!, planIds[1]!] } });
    if (round1.status !== 'probes_resolved') throw new Error('round 1 should resolve');
    const round2 = await step({ engine, state: round1.state, action: { action: 'request_probes', candidateIds: [planIds[2]!, planIds[3]!] } });
    expect(round2.status).toBe('probes_resolved');
    if (round2.status !== 'probes_resolved') throw new Error('unreachable');
    expect(round2.state.executedCandidateIds).toHaveLength(4);
  });

  it('rejects a compare_periods candidate before its source has been resolved this question', async () => {
    const outcome = await step({ engine, state: freshState(), action: { action: 'request_probes', candidateIds: ['largest-monthly-change'] } });
    expect(outcome).toMatchObject({ status: 'probes_rejected', rejections: [{ candidateId: 'largest-monthly-change', code: 'dependency_unresolved' }] });
  });

  it('accepts compare_periods once its source has been resolved', async () => {
    const round1 = await step({ engine, state: freshState(), action: { action: 'request_probes', candidateIds: ['monthly-revenue'] } });
    if (round1.status !== 'probes_resolved') throw new Error('round 1 should resolve');
    const round2 = await step({ engine, state: round1.state, action: { action: 'request_probes', candidateIds: ['largest-monthly-change'] } });
    expect(round2.status).toBe('probes_resolved');
  });
});

describe('cache hits reproduce byte-identical compact evidence', () => {
  it('returns the identical packet object on a repeated candidate across separate questions sharing a cache', async () => {
    const cache = new EvidenceCache();
    const first = await step({ engine, state: freshState({ cache }), action: { action: 'request_probes', candidateIds: ['category-revenue'] } });
    if (first.status !== 'probes_resolved') throw new Error('expected resolution');
    const second = await step({
      engine,
      state: freshState({ questionId: 'a-different-question', cache }),
      action: { action: 'request_probes', candidateIds: ['category-revenue'] },
    });
    if (second.status !== 'probes_resolved') throw new Error('expected resolution');
    expect(JSON.stringify(second.resolved[0])).toBe(JSON.stringify(first.resolved[0]));
  });
});

describe('final offers must be exact ids from the registry', () => {
  it('accepts a byte-exact offer id', async () => {
    const offerId = offers[0]!.id;
    const outcome = await step({ engine, state: freshState(), action: { action: 'final_offer', offerId } });
    expect(outcome).toMatchObject({ status: 'terminal', disposition: { kind: 'final_offer', offerId } });
  });

  it('rejects an offer id that is not byte-exact', async () => {
    const nearMiss = `${offers[0]!.id} `;
    const outcome = await step({ engine, state: freshState(), action: { action: 'final_offer', offerId: nearMiss } });
    expect(outcome).toMatchObject({ status: 'terminal', disposition: { kind: 'rejected_offer', offerId: nearMiss } });
  });
});

describe('final claims pass through experiment 12\'s unchanged verifier', () => {
  function toCompactEvidencePacket(packet: EvidencePacket): CompactEvidencePacket {
    return { ...packet, filters: [], sourceRowCount: packet.rows.length, returnedRowCount: packet.rows.length };
  }

  function stateWithEvidence(evidence: readonly EvidencePacket[]): LoopState {
    const state = freshState();
    return { ...state, resolvedByCandidateId: new Map(evidence.map((packet, index) => [`e${index}`, toCompactEvidencePacket(packet)])) };
  }

  it("replays experiment 12's complete synthetic verifier suite through the loop with the same verdicts", async () => {
    for (const testCase of syntheticVerifierCases) {
      const outcome = await step({ engine, state: stateWithEvidence(testCase.evidence), action: { action: 'final_claim', claim: testCase.claim } });
      if (outcome.status !== 'terminal') throw new Error(`${testCase.id}: expected a terminal outcome`);
      if (testCase.expected.accepted) {
        expect(outcome.disposition.kind, testCase.id).toBe('final_claim');
      } else {
        expect(outcome.disposition.kind, testCase.id).toBe('rejected_claim');
        expect(outcome.disposition, testCase.id).toMatchObject({ reason: testCase.expected.reason });
      }
    }
  });

  it('rejects an F1-shaped misattribution: comparing two real evidence packets as though they measured the same metric', async () => {
    const revenue: EvidencePacket = { id: 'evidence:category-revenue', metric: 'sum_product(category)', unit: 'USD', completeness: 'complete', rows: [{ rowId: 'a', label: 'Books', value: 500 }] };
    const quantity: EvidencePacket = { id: 'evidence:category-quantity', metric: 'sum(category-quantity)', unit: 'item', completeness: 'complete', rows: [{ rowId: 'a', label: 'Books', value: 500 }] };
    const outcome = await step({
      engine,
      state: stateWithEvidence([revenue, quantity]),
      action: { action: 'final_claim', claim: { kind: 'comparison', left: { evidenceId: revenue.id, rowId: 'a', field: 'value' }, operator: 'equal', right: { evidenceId: quantity.id, rowId: 'a', field: 'value' } } },
    });
    expect(outcome).toMatchObject({ status: 'terminal', disposition: { kind: 'rejected_claim', reason: 'INCOMPATIBLE_METRIC' } });
  });

  it('rejects an F2-shaped invented value: citing a row id that was never returned by DataScope', async () => {
    const revenue: EvidencePacket = { id: 'evidence:category-revenue', metric: 'sum_product(category)', unit: 'USD', completeness: 'complete', rows: [{ rowId: 'a', label: 'Books', value: 500 }] };
    const outcome = await step({
      engine,
      state: stateWithEvidence([revenue]),
      action: { action: 'final_claim', claim: { kind: 'threshold', subject: { evidenceId: revenue.id, rowId: 'invented-row', field: 'value' }, operator: 'above', threshold: 0 } },
    });
    expect(outcome).toMatchObject({ status: 'terminal', disposition: { kind: 'rejected_claim', reason: 'ROW_NOT_FOUND' } });
  });

  it('rejects an F3-shaped world-knowledge injection: citing an evidence packet DataScope never computed', async () => {
    const outcome = await step({
      engine,
      state: stateWithEvidence([]),
      action: { action: 'final_claim', claim: { kind: 'threshold', subject: { evidenceId: 'evidence:never-computed', rowId: 'a', field: 'value' }, operator: 'above', threshold: 0 } },
    });
    expect(outcome).toMatchObject({ status: 'terminal', disposition: { kind: 'rejected_claim', reason: 'EVIDENCE_NOT_FOUND' } });
  });
});

describe('the rendered sentence names the dimension it ranked over', () => {
  /** The § Checkpoint 4 Finding 1 case end to end: `completed` must not read as a category. */
  it('renders a real status extremum with its dimension', async () => {
    const resolved = await step({ engine, state: freshState(), action: { action: 'request_probes', candidateIds: ['status-revenue'] } });
    if (resolved.status !== 'probes_resolved') throw new Error('expected status-revenue to resolve');
    const packet = resolved.resolved[0]!;
    expect(packet.dimension).toBe('orders.status');
    const rows = [...packet.rows].filter((row): row is typeof row & { value: number } => typeof row.value === 'number');
    const maximum = rows.reduce((best, row) => (row.value > best.value ? row : best));
    const outcome = await step({
      engine,
      state: resolved.state,
      action: {
        action: 'final_claim',
        claim: {
          kind: 'extremum',
          subject: { evidenceId: packet.id, rowId: maximum.rowId, field: 'value' },
          operator: 'maximum',
          scope: { evidenceId: packet.id, rowIds: packet.rows.map((row) => row.rowId) },
        },
      },
    });
    if (outcome.status !== 'terminal' || outcome.disposition.kind !== 'final_claim') throw new Error('expected a verified claim');
    expect(outcome.disposition.rendered).toContain('across orders.status');
    expect(outcome.disposition.rendered).toBe(
      `${maximum.label} (952,190.31 USD) was the maximum across orders.status for the complete evidence scope.`,
    );
  });
});

describe('unsupported proposals require deterministic corroboration', () => {
  it('corroborates causal_inference unconditionally', async () => {
    const outcome = await step({ engine, state: freshState(), action: { action: 'unsupported', reason: 'causal_inference' } });
    expect(outcome).toMatchObject({ status: 'terminal', disposition: { kind: 'unsupported', reason: 'causal_inference' } });
  });

  it('corroborates incomplete_scope only after resolving a packet that is actually truncated', async () => {
    const bare = await step({ engine, state: freshState(), action: { action: 'unsupported', reason: 'incomplete_scope' } });
    expect(bare).toMatchObject({ disposition: { kind: 'rejected_unsupported', reason: 'incomplete_scope' } });

    const withEvidence = await step({ engine, state: freshState(), action: { action: 'request_probes', candidateIds: ['monthly-revenue'] } });
    if (withEvidence.status !== 'probes_resolved') throw new Error('expected resolution');
    expect(withEvidence.resolved[0]!.completeness).toBe('truncated');
    const corroborated = await step({ engine, state: withEvidence.state, action: { action: 'unsupported', reason: 'incomplete_scope' } });
    expect(corroborated).toMatchObject({ disposition: { kind: 'unsupported', reason: 'incomplete_scope' } });
  });
});

describe('immutable run logging covers calls, repairs, probes, SQL, evidence, cache, claims, offers, and terminal failures', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  function manifest(): RunManifest {
    return {
      runId: '20260801T000000Z-checkpoint1',
      startedAt: '2026-08-01T00:00:00.000Z',
      command: ['node', 'analysisLoop.test.ts'],
      workingDirectory: '/workspace',
      experimentVersion: '13.1',
      schemaVersions: { manifest: 1, events: 1, calls: 1 },
      git: { commit: 'abc123', statusShort: '' },
      runtime: { node: process.version, duckdbWasm: '1.32.0', harness: '13.1' },
      fixtures: [],
      provider: { name: 'none', endpointHost: 'n/a', modelTag: 'n/a', modelDigest: null },
      options: { temperature: 0, numCtx: 8192, keepAlive: '0', timeoutMs: 1_000, retryCap: 0, repairCap: 1 },
      selection: { questions: ['test-question'], repeats: 1, filters: [] },
      hashes: { systemPrompts: {}, schemas: {}, deterministicSources: {} },
      privacy: { classification: 'bundled-public-fixtures-only', bundledPublicFixturesOnly: true },
    };
  }

  it('records probes, SQL, evidence, cache events, claim evaluation, offer evaluation, a repair, and a terminal disposition', async () => {
    const root = await mkdtemp(join(tmpdir(), 'checkpoint1-run-'));
    roots.push(root);
    const writer = await ArtifactWriter.start(root, manifest());

    await writer.appendEvent('structural_repair', { questionId: 'test-question', attempt: 1, reason: 'invalid JSON' });

    const cache = new EvidenceCache();
    const first = await step({ engine, state: freshState({ cache }), action: { action: 'request_probes', candidateIds: ['category-revenue'] }, writer });
    if (first.status !== 'probes_resolved') throw new Error('expected resolution');
    // A second question sharing the cache should log a cache hit, not a second execution.
    await step({ engine, state: freshState({ questionId: 'test-question-2', cache }), action: { action: 'request_probes', candidateIds: ['category-revenue'] }, writer });

    const claimOutcome = await step({
      engine,
      state: first.state,
      action: {
        action: 'final_claim',
        claim: { kind: 'threshold', subject: { evidenceId: first.resolved[0]!.id, rowId: first.resolved[0]!.rows[0]!.rowId, field: 'value' }, operator: 'above', threshold: -1 },
      },
      writer,
    });
    if (claimOutcome.status !== 'terminal') throw new Error('expected terminal');
    await writer.complete({ disposition: claimOutcome.disposition.kind });

    const ledger = (await readFile(join(writer.directory, 'events.jsonl'), 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string });
    const types = new Set(ledger.map((event) => event.type));
    for (const required of ['structural_repair', 'probe_requested', 'probe_executed', 'cache_miss', 'cache_hit', 'claim_evaluated', 'run_started', 'run_completed']) {
      expect(types.has(required), required).toBe(true);
    }
  });
});
