import { useMemo } from 'react';
import type { DataCapabilities } from '../types';
import { useDatasetsStore } from '../stores/datasets';
import { evaluateCapabilities } from '../lib/capabilities';

/**
 * Reads the registered tables from the store and derives the current analysis
 * capabilities, mirroring `useSchemaClassifier`'s thin store-wrapping shape.
 * Capabilities are pure derived state, so any store change that swaps the
 * `tables` array — ingest, table drop, or a manual re-classification — flows
 * through here on its own; there is no separate re-evaluate trigger. The memo
 * keeps the verdict object stable while `tables` is unchanged.
 */
export function useCapabilities(): DataCapabilities {
  const tables = useDatasetsStore((state) => state.tables);
  return useMemo(() => evaluateCapabilities(tables), [tables]);
}
