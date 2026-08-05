export interface EvidenceRow {
  rowId: string;
  label: string;
  value: number | null;
  /** Deterministic sort position for ordered dimensions such as time. */
  order?: number;
}

export interface EvidencePacket {
  id: string;
  metric: string;
  unit: string;
  /** Deterministic compiler-authored dimension description, when grouped. */
  dimension?: string;
  completeness: 'complete' | 'truncated';
  rows: EvidenceRow[];
}
