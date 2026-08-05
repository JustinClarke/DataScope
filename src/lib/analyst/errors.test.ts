import { describe, expect, it } from 'vitest';
import { engineError, hintFromEngineMessage, invalidEnum, opError } from './errors';

// Verbatim DuckDB 1.4 output, captured from both engines — a paraphrase would
// make these tests agree with a message DuckDB does not emit.
const UNKNOWN_TABLE =
  'Catalog Error: Table with name nope does not exist!\nDid you mean "orders"?\n\nLINE 1: SELECT * FROM nope\n                      ^';
const UNKNOWN_COLUMN =
  'Binder Error: Referenced column "nope" not found in FROM clause!\nCandidate bindings: "note"\n\nLINE 1: SELECT nope FROM orders\n               ^';
const SYNTAX = 'Parser Error: syntax error at or near "SELEC"\n\nLINE 1: SELEC 1\n        ^';

describe('mechanical hints', () => {
  it('lifts the nearest catalog match DuckDB already suggested', () => {
    expect(hintFromEngineMessage(UNKNOWN_TABLE)).toContain('Did you mean "orders"?');
  });

  it('lifts candidate column bindings', () => {
    expect(hintFromEngineMessage(UNKNOWN_COLUMN)).toContain('Candidate bindings: "note"');
  });

  it('keeps an error position together with its caret line', () => {
    const hint = hintFromEngineMessage(SYNTAX)!;
    expect(hint).toContain('LINE 1: SELEC 1');
    expect(hint).toContain('^');
  });

  it('returns nothing when DuckDB offered nothing mechanical', () => {
    expect(hintFromEngineMessage('Out of Memory Error: failed to allocate')).toBeUndefined();
  });

  it('lists the valid values for an enum parameter, and nothing else', () => {
    const error = invalidEnum('grain', 'fortnight', ['day', 'week', 'month']);
    expect(error.code).toBe('invalid_argument');
    expect(error.hint).toBe('day, week, month');
  });
});

describe('engine failures', () => {
  it('separates a missing object from a broken statement', () => {
    expect(engineError(new Error(UNKNOWN_TABLE)).code).toBe('unknown_object');
    expect(engineError(new Error(SYNTAX)).code).toBe('sql_error');
    expect(engineError(new Error(UNKNOWN_COLUMN)).code).toBe('sql_error');
  });

  it('keeps the hint out of the message', () => {
    const error = engineError(new Error(UNKNOWN_TABLE));
    expect(error.message).toBe('Catalog Error: Table with name nope does not exist!');
    expect(error.message).not.toContain('Did you mean');
  });

  it('drops the position excerpt when the statement ran inside a wrapper', () => {
    // The store materializes a caller's SQL inside `SELECT ... FROM (...)`, so
    // a `LINE 1:` excerpt would quote SQL the caller never wrote.
    const error = engineError(new Error(UNKNOWN_TABLE), undefined, { wrapped: true });
    expect(error.hint).toBe('Did you mean "orders"?');
    expect(error.hint).not.toContain('LINE');
  });

  it('reports a cancellation as cancelled, whichever side noticed first', () => {
    const controller = new AbortController();
    controller.abort();
    expect(engineError(new Error('anything'), controller.signal).code).toBe('cancelled');
    expect(engineError(new DOMException('x', 'AbortError')).code).toBe('cancelled');
    expect(engineError(new Error('INTERRUPT Error: Interrupted!')).code).toBe('cancelled');
  });
});

describe('opError', () => {
  it('omits the hint key entirely when there is no hint', () => {
    expect(opError('sql_error', 'boom')).toEqual({ ok: false, code: 'sql_error', message: 'boom' });
  });
});
