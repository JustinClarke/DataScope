import { describe, it, expect, beforeEach } from 'vitest';
import { useRunGuardStore } from './runGuard';
import { classifyStatement } from '../lib/statementClass';
import { CONSOLE_SESSION } from './query';

describe('useRunGuardStore', () => {
  beforeEach(() => {
    useRunGuardStore.setState({ pending: null, pendingSession: CONSOLE_SESSION });
  });

  it('holds nothing until a statement is intercepted', () => {
    expect(useRunGuardStore.getState().pending).toBeNull();
  });

  it('round-trips one held statement', () => {
    const info = classifyStatement('DROP TABLE orders');
    useRunGuardStore.getState().hold(info, CONSOLE_SESSION);
    expect(useRunGuardStore.getState().pending).toEqual(info);

    useRunGuardStore.getState().release();
    expect(useRunGuardStore.getState().pending).toBeNull();
  });

  it('remembers which session raised it, so the resolution runs where the run came from', () => {
    useRunGuardStore.getState().hold(classifyStatement('DROP TABLE orders'), 'tab-1');
    expect(useRunGuardStore.getState().pendingSession).toBe('tab-1');
  });
});
