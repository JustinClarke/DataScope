import { beforeEach, describe, expect, it } from 'vitest';
import { RELATIONSHIPS_STORAGE_KEY, useRelationshipsStore } from './relationships';

function reset() {
  localStorage.clear();
  useRelationshipsStore.getState().clearOverrides();
}

describe('useRelationshipsStore', () => {
  beforeEach(reset);

  it('records and restores a removed edge by its child-side key', () => {
    useRelationshipsStore.getState().removeEdge('orders', 'customer_id');
    expect(useRelationshipsStore.getState().removed).toEqual(['orders.customer_id']);
    useRelationshipsStore.getState().restoreEdge('orders', 'customer_id');
    expect(useRelationshipsStore.getState().removed).toEqual([]);
  });

  it('does not double-record a removal', () => {
    useRelationshipsStore.getState().removeEdge('orders', 'customer_id');
    useRelationshipsStore.getState().removeEdge('orders', 'customer_id');
    expect(useRelationshipsStore.getState().removed).toHaveLength(1);
  });

  it('re-points an edge and un-removes it (a re-point is an assertion, not a hide)', () => {
    useRelationshipsStore.getState().removeEdge('orders', 'customer_id');
    useRelationshipsStore.getState().repointEdge('orders', 'customer_id', 'sessions', 'id');
    expect(useRelationshipsStore.getState().removed).toEqual([]);
    expect(useRelationshipsStore.getState().repointed['orders.customer_id']).toEqual({
      parentTable: 'sessions',
      parentColumn: 'id',
    });
  });

  it('removing supersedes a prior re-point on the same column', () => {
    useRelationshipsStore.getState().repointEdge('orders', 'customer_id', 'sessions', 'id');
    useRelationshipsStore.getState().removeEdge('orders', 'customer_id');
    expect(useRelationshipsStore.getState().repointed['orders.customer_id']).toBeUndefined();
    expect(useRelationshipsStore.getState().removed).toEqual(['orders.customer_id']);
  });

  it('adds and removes a manual edge without duplicating', () => {
    useRelationshipsStore.getState().addEdge('orders', 'sku', 'products', 'sku');
    useRelationshipsStore.getState().addEdge('orders', 'sku', 'products', 'sku');
    expect(useRelationshipsStore.getState().added).toHaveLength(1);
    useRelationshipsStore.getState().removeManualEdge('orders', 'sku', 'products', 'sku');
    expect(useRelationshipsStore.getState().added).toHaveLength(0);
  });

  describe('persistence (07c)', () => {
    it('persists exactly removed/repointed/added — the user overrides, never the recomputed inference', () => {
      useRelationshipsStore.getState().removeEdge('orders', 'customer_id');
      useRelationshipsStore.getState().addEdge('orders', 'sku', 'products', 'sku');

      const raw = localStorage.getItem(RELATIONSHIPS_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.state).toEqual({
        removed: ['orders.customer_id'],
        repointed: {},
        added: [{ childTable: 'orders', childColumn: 'sku', parentTable: 'products', parentColumn: 'sku' }],
      });
    });

    it('a persisted payload from an old schema version rehydrates to safe, empty defaults rather than crashing', async () => {
      localStorage.setItem(
        RELATIONSHIPS_STORAGE_KEY,
        JSON.stringify({ state: { removed: 'not-an-array', repointed: null, added: 123 }, version: 0 }),
      );

      await useRelationshipsStore.persist.rehydrate();

      const state = useRelationshipsStore.getState();
      expect(state.removed).toEqual([]);
      expect(state.repointed).toEqual({});
      expect(state.added).toEqual([]);
    });
  });
});
