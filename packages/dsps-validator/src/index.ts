// Validator/parser for DSPS — the DataScope Profile Spec (D31/D37/D64). Zero
// runtime dependencies and no import from DataScope's own app source: this
// package is the independent reference implementation `dsps.schema.json`
// (shipped alongside it in this package) describes, not a re-export of it.
// DataScope's own app (src/lib/dsps.ts) has its own, separately-maintained
// copy of the same contract — intentional duplication, not drift, since the
// whole point of an open format is that a consumer never has to read
// DataScope's source to use it.

export const DSPS_VERSION = '1.0.0';

export type DspsProvenance = 'derived-this-run' | 'user-asserted' | 'carried-unverified';

export interface DspsSnapshot {
  date: string;
  fileHash: string | null;
}

export interface DspsColumn {
  name: string;
  semanticType: string;
  physicalType: string;
  nullPercentage: number | null;
  cardinality: number;
  classificationReason?: string;
}

export interface DspsTable {
  tableName: string;
  rowCount: number;
  columnCount: number;
  columns: DspsColumn[];
}

/** A DSPS fact — structural/quality only; never a metric value (D45). */
export interface DspsFact {
  tableName: string;
  rule: string;
  description: string;
  provenance: DspsProvenance;
  snapshot: DspsSnapshot;
}

export interface DspsRelationship {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
  confidence: 'confident' | 'candidate';
  containment: number;
  evidence: string;
}

export interface DspsDocument {
  dspsVersion: string;
  generatedAt: string;
  tables: DspsTable[];
  insights: DspsFact[];
  /** Absent when the Join Graph is cut (D24/D20) — the document is still valid, schema-only. */
  relationships?: DspsRelationship[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateColumn(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof value.name !== 'string') errors.push(`${path}.name must be a string`);
  if (typeof value.semanticType !== 'string') errors.push(`${path}.semanticType must be a string`);
  if (typeof value.physicalType !== 'string') errors.push(`${path}.physicalType must be a string`);
  if (value.nullPercentage !== null && typeof value.nullPercentage !== 'number') {
    errors.push(`${path}.nullPercentage must be a number or null`);
  }
  if (typeof value.cardinality !== 'number') errors.push(`${path}.cardinality must be a number`);
}

function validateTable(value: unknown, index: number, errors: string[]): void {
  const path = `tables[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof value.tableName !== 'string') errors.push(`${path}.tableName must be a string`);
  if (typeof value.rowCount !== 'number') errors.push(`${path}.rowCount must be a number`);
  if (typeof value.columnCount !== 'number') errors.push(`${path}.columnCount must be a number`);
  if (!Array.isArray(value.columns)) {
    errors.push(`${path}.columns must be an array`);
  } else {
    value.columns.forEach((c, i) => validateColumn(c, `${path}.columns[${i}]`, errors));
  }
}

const PROVENANCE_VALUES: DspsProvenance[] = ['derived-this-run', 'user-asserted', 'carried-unverified'];

function validateFact(value: unknown, index: number, errors: string[]): void {
  const path = `insights[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof value.tableName !== 'string') errors.push(`${path}.tableName must be a string`);
  if (typeof value.rule !== 'string') errors.push(`${path}.rule must be a string`);
  if (typeof value.description !== 'string') errors.push(`${path}.description must be a string`);
  if (!PROVENANCE_VALUES.includes(value.provenance as DspsProvenance)) {
    errors.push(`${path}.provenance must be one of ${PROVENANCE_VALUES.join(', ')}`);
  }
  if (!isRecord(value.snapshot)) {
    errors.push(`${path}.snapshot must be an object`);
  } else {
    if (typeof value.snapshot.date !== 'string') errors.push(`${path}.snapshot.date must be a string`);
    if (value.snapshot.fileHash !== null && typeof value.snapshot.fileHash !== 'string') {
      errors.push(`${path}.snapshot.fileHash must be a string or null`);
    }
  }
}

function validateRelationship(value: unknown, index: number, errors: string[]): void {
  const path = `relationships[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const key of ['childTable', 'childColumn', 'parentTable', 'parentColumn', 'evidence'] as const) {
    if (typeof value[key] !== 'string') errors.push(`${path}.${key} must be a string`);
  }
  if (value.confidence !== 'confident' && value.confidence !== 'candidate') {
    errors.push(`${path}.confidence must be "confident" or "candidate"`);
  }
  if (typeof value.containment !== 'number') errors.push(`${path}.containment must be a number`);
}

/** Structural validation against the same contract `dsps.schema.json` declares. */
export function validateDsps(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { valid: false, errors: ['document must be a JSON object'] };
  }

  if (typeof input.dspsVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(input.dspsVersion)) {
    errors.push('dspsVersion must be a semver string (e.g. "1.0.0")');
  }
  if (typeof input.generatedAt !== 'string') {
    errors.push('generatedAt must be a string');
  }
  if (!Array.isArray(input.tables)) {
    errors.push('tables must be an array');
  } else {
    input.tables.forEach((table, i) => validateTable(table, i, errors));
  }
  if (!Array.isArray(input.insights)) {
    errors.push('insights must be an array');
  } else {
    input.insights.forEach((fact, i) => validateFact(fact, i, errors));
  }
  if (input.relationships !== undefined) {
    if (!Array.isArray(input.relationships)) {
      errors.push('relationships, when present, must be an array');
    } else {
      input.relationships.forEach((rel, i) => validateRelationship(rel, i, errors));
    }
  }

  return { valid: errors.length === 0, errors };
}

export type ParseResult = { ok: true; doc: DspsDocument } | { ok: false; seenVersion: string; errors: string[] };

function majorOf(version: string): string {
  return version.split('.')[0];
}

/**
 * Validates, then checks the major version against this library's own
 * `DSPS_VERSION` — a newer major is reported by version rather than force-cast
 * (D37: "surfaces, never fails opaquely"). A document within the current major
 * parses even when it carries fields this library has never seen (forward
 * compatibility — `validateDsps` never rejects on unknown keys).
 */
export function parseDsps(input: unknown): ParseResult {
  const result = validateDsps(input);
  const seenVersion =
    isRecord(input) && typeof input.dspsVersion === 'string' ? input.dspsVersion : 'unversioned';

  if (!result.valid) {
    return { ok: false, seenVersion, errors: result.errors };
  }
  const doc = input as DspsDocument;
  if (majorOf(doc.dspsVersion) !== majorOf(DSPS_VERSION)) {
    return {
      ok: false,
      seenVersion: doc.dspsVersion,
      errors: [`unsupported major version: saw ${doc.dspsVersion}, this library reads ${DSPS_VERSION}`],
    };
  }
  return { ok: true, doc };
}
