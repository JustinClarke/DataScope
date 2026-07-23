import { describe, it, expect } from 'vitest'
import { rankedActionValidator, narrationValidator, passesPhrasingGuard } from './producerValidators'
import type { FactRef, RankedAction } from '../types'

const fact: FactRef = {
  statement: 'Revenue spans 900 distinct values.',
  sql: 'SELECT count(distinct revenue) FROM orders',
  snapshot: '2026-07-21T00:00:00Z',
  confidence: 'high',
  provenance: 'insight-rule',
}

const action: RankedAction = {
  verb: 'Chart revenue over order_date',
  module: 'charts',
  prefill: { module: 'charts', prefilledConfig: { table: 'orders' } },
  evidence: fact,
  score: 0.8,
}

const other: RankedAction = {
  verb: 'Profile the customers table',
  module: 'profile',
  prefill: { module: 'profile', prefilledConfig: { tableName: 'customers' } },
  evidence: { ...fact, statement: '3% of customer rows are null.' },
  score: 0.5,
}

describe('rankedActionValidator', () => {
  it('accepts a re-ordered, re-phrased list (same set)', () => {
    const candidate: RankedAction[] = [
      { ...other },
      { ...action, verb: 'Plot revenue by day' },
    ]
    expect(rankedActionValidator([action, other], candidate)).toBe(true)
  })

  it('rejects a dropped action', () => {
    expect(rankedActionValidator([action, other], [action])).toBe(false)
  })

  it('rejects an added action', () => {
    expect(rankedActionValidator([action], [action, other])).toBe(false)
  })

  it('rejects a changed module (an invented route)', () => {
    expect(rankedActionValidator([action], [{ ...action, module: 'sql' }])).toBe(false)
  })

  it('rejects a changed prefill or evidence', () => {
    expect(rankedActionValidator([action], [{ ...action, evidence: { ...fact, sql: 'DROP TABLE orders' } }])).toBe(false)
    expect(rankedActionValidator([action], [{ ...action, score: 0.99 }])).toBe(false)
  })
})

describe('narrationValidator', () => {
  it('accepts a re-phrased statement with every other field intact', () => {
    expect(narrationValidator(fact, { ...fact, statement: 'There are 900 distinct revenue values.' })).toBe(true)
  })

  it('rejects a changed numeric provenance field', () => {
    expect(narrationValidator(fact, { ...fact, sql: 'SELECT 1', statement: 'reworded' })).toBe(false)
    expect(narrationValidator(fact, { ...fact, confidence: 'low', statement: 'reworded' })).toBe(false)
  })

  it('rejects over-claiming phrasing (D45 guard)', () => {
    expect(narrationValidator(fact, { ...fact, statement: 'Revenue always exceeds cost.' })).toBe(false)
    expect(narrationValidator(fact, { ...fact, statement: 'Growth is caused by price.' })).toBe(false)
    expect(narrationValidator(fact, { ...fact, statement: 'This is a verified relationship.' })).toBe(false)
  })
})

describe('passesPhrasingGuard', () => {
  it('passes a plain statistic', () => {
    expect(passesPhrasingGuard('The table has 1,200 rows across 8 columns.')).toBe(true)
  })
  it('flags permanence and causal wording', () => {
    expect(passesPhrasingGuard('Sales never dip below 100.')).toBe(false)
    expect(passesPhrasingGuard('Revenue drives churn.')).toBe(false)
  })
})
