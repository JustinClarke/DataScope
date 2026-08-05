import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EvalEngine } from '../../duckdb/duckdb';
import { PHASE5_QUESTIONS } from '../12-verified-claims/phase5Protocol';
import type { DatasetPassport } from './contracts';
import { candidateCard, generateCandidates, generateOffers, offerCard } from './candidateGenerator';
import { createEcommerceFixture } from './testFixtures';

let engine: EvalEngine;
let passport: DatasetPassport;

beforeAll(async () => {
  ({ engine, passport } = await createEcommerceFixture());
});

afterAll(async () => {
  await engine.close();
});

describe('deterministic candidate generation', () => {
  it('is byte-for-byte stable across repeated builds from the same passport', () => {
    const first = generateCandidates(passport);
    const second = generateCandidates(passport);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('includes every candidate the design doc requires the ecommerce schema to support', () => {
    const ids = generateCandidates(passport).map((candidate) => candidate.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'monthly-revenue',
        'average-order-value',
        'category-revenue',
        'category-quantity',
        'status-revenue',
        'country-orders',
        'table-missingness',
        'join-coverage',
        'largest-monthly-change',
      ]),
    );
  });

  it('omits a candidate whose required column the schema does not support', () => {
    const withoutCountry: DatasetPassport = {
      ...passport,
      tables: passport.tables.map((table) =>
        table.name === 'customers' ? { ...table, columns: table.columns.filter((column) => column.column !== 'country') } : table,
      ),
    };
    const ids = generateCandidates(withoutCountry).map((candidate) => candidate.id);
    expect(ids).not.toContain('country-orders');
  });

  it('omits missingness/join-coverage/compare_periods when their passport inputs are empty', () => {
    const empty: DatasetPassport = { ...passport, tables: [], relationships: [] };
    expect(generateCandidates(empty)).toEqual([]);
  });

  it('exposes only id, description, cost class, and semantic topic tags to the model-facing card', () => {
    const [candidate] = generateCandidates(passport);
    if (!candidate) throw new Error('expected at least one candidate');
    const card = candidateCard(candidate);
    expect(Object.keys(card).sort()).toEqual(['description', 'estimatedCostClass', 'id', 'topicTags']);
    expect(card.description.length).toBeGreaterThan(0);
  });

  it('derives question relevance for plan-backed candidates from the reused Phase 5 question set', () => {
    const candidates = generateCandidates(passport);
    const monthly = candidates.find((candidate) => candidate.id === 'monthly-revenue');
    expect(monthly?.questionRelevance).toEqual(
      expect.arrayContaining(['understand-ecommerce', 'odd-sales-investigation', 'further-transforms']),
    );
    const categoryRevenue = candidates.find((candidate) => candidate.id === 'category-revenue');
    expect(categoryRevenue?.questionRelevance).toEqual(['sales-presentation']);
  });

  /**
   * The answer key must not travel in the prompt. Question ids in a card's tags would let the
   * model match the asking question's id against a tag string instead of reasoning about the
   * data, making § Metrics and ROI's probe-relevance metric circular.
   */
  it('keeps every question id out of the model-facing cards and offers', () => {
    const questionIds = PHASE5_QUESTIONS.map((question) => question.id);
    const candidates = generateCandidates(passport);
    const exposed = JSON.stringify([candidates.map(candidateCard), generateOffers(candidates).map(offerCard)]);
    for (const questionId of questionIds) expect(exposed).not.toContain(questionId);
    expect(candidates.every((candidate) => candidate.topicTags.length > 0)).toBe(true);
  });

  it('generates one deterministic executable offer per candidate operation', () => {
    const candidates = generateCandidates(passport);
    const offers = generateOffers(candidates);
    expect(offers).toHaveLength(candidates.length);
    expect(offers.map((offer) => offer.id).sort()).toEqual(candidates.map((candidate) => `offer:${candidate.id}`).sort());
    expect(offers.every((offer) => offer.description.length > 0)).toBe(true);
    expect(Object.keys(offerCard(offers[0]!)).sort()).toEqual(['description', 'id', 'topicTags']);
  });
});
