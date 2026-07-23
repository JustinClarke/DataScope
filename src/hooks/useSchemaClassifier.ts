import { useCallback } from 'react';
import type { ClassifiedColumn, SemanticType } from '../types';
import { useDatasetsStore } from '../stores/datasets';

export interface UseSchemaClassifier {
  /** Classified columns for the table, or `undefined` until classification has run. */
  columns: ClassifiedColumn[] | undefined;
  /**
   * Manually re-classify one column (§17 misclassification mitigation). Records
   * a "Set manually" reason and persists for the session; a no-op when no
   * `tableId` is bound or the table has no classified columns yet.
   */
  reclassify: (columnName: string, semanticType: SemanticType) => void;
}

/**
 * Reads a table's classified columns from the registry and exposes the manual
 * override action, mirroring `useDuckDB`'s thin store-wrapping shape.
 * Classification itself runs at ingest (services/ingestion.ts), so this hook is
 * a read + override surface for the profile UI, not a trigger for classifying.
 */
export function useSchemaClassifier(tableId?: string): UseSchemaClassifier {
  const columns = useDatasetsStore((state) =>
    tableId ? state.tables.find((t) => t.id === tableId)?.columns : undefined,
  );

  const reclassify = useCallback(
    (columnName: string, semanticType: SemanticType) => {
      if (!tableId) return;
      useDatasetsStore.getState().reclassifyColumn(tableId, columnName, semanticType);
    },
    [tableId],
  );

  return { columns, reclassify };
}
