export interface EvidenceCellRef {
  evidenceId: string;
  rowId: string;
  field: 'value';
}

export interface EvidenceRowSetRef {
  evidenceId: string;
  rowIds: string[];
}

export type ClaimIR =
  | {
      kind: 'comparison';
      left: EvidenceCellRef;
      operator: 'greater_than' | 'less_than' | 'equal';
      right: EvidenceCellRef;
    }
  | {
      kind: 'extremum';
      subject: EvidenceCellRef;
      operator: 'maximum' | 'minimum';
      scope: EvidenceRowSetRef;
    }
  | {
      kind: 'change';
      from: EvidenceCellRef;
      to: EvidenceCellRef;
      operator: 'increase' | 'decrease' | 'no_change';
    }
  | {
      kind: 'threshold';
      subject: EvidenceCellRef;
      operator: 'above' | 'below' | 'at';
      threshold: number;
    };

export type ClaimIRParseErrorCode =
  | 'INVALID_TYPE'
  | 'UNSUPPORTED_FIELDS'
  | 'MISSING_FIELDS'
  | 'INVALID_VALUE';

export class ClaimIRParseError extends Error {
  readonly code: ClaimIRParseErrorCode;

  constructor(code: ClaimIRParseErrorCode, message: string) {
    super(message);
    this.name = 'ClaimIRParseError';
    this.code = code;
  }
}

function parseError(code: ClaimIRParseErrorCode, message: string): never {
  throw new ClaimIRParseError(code, message);
}

const CELL_REF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    evidenceId: { type: 'string' },
    rowId: { type: 'string' },
    field: { const: 'value' },
  },
  required: ['evidenceId', 'rowId', 'field'],
} as const;

export const CLAIM_IR_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'comparison' },
        left: CELL_REF_SCHEMA,
        operator: { enum: ['greater_than', 'less_than', 'equal'] },
        right: CELL_REF_SCHEMA,
      },
      required: ['kind', 'left', 'operator', 'right'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'extremum' },
        subject: CELL_REF_SCHEMA,
        operator: { enum: ['maximum', 'minimum'] },
        scope: {
          type: 'object',
          additionalProperties: false,
          properties: {
            evidenceId: { type: 'string' },
            rowIds: { type: 'array', minItems: 1, items: { type: 'string' } },
          },
          required: ['evidenceId', 'rowIds'],
        },
      },
      required: ['kind', 'subject', 'operator', 'scope'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'change' },
        from: CELL_REF_SCHEMA,
        to: CELL_REF_SCHEMA,
        operator: { enum: ['increase', 'decrease', 'no_change'] },
      },
      required: ['kind', 'from', 'to', 'operator'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: 'threshold' },
        subject: CELL_REF_SCHEMA,
        operator: { enum: ['above', 'below', 'at'] },
        threshold: { type: 'number' },
      },
      required: ['kind', 'subject', 'operator', 'threshold'],
    },
  ],
} as const;

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return parseError('INVALID_TYPE', `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    parseError('UNSUPPORTED_FIELDS', `${label} contains unsupported fields: ${extras.join(', ')}`);
  }
  const missing = allowed.filter((key) => !(key in value));
  if (missing.length > 0) {
    parseError('MISSING_FIELDS', `${label} is missing required fields: ${missing.join(', ')}`);
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return parseError('INVALID_VALUE', `${label} must be a non-empty string`);
  }
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    return parseError('INVALID_VALUE', `${label} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function cellRef(value: unknown, label: string): EvidenceCellRef {
  const input = record(value, label);
  exactKeys(input, ['evidenceId', 'rowId', 'field'], label);
  return {
    evidenceId: nonEmptyString(input.evidenceId, `${label}.evidenceId`),
    rowId: nonEmptyString(input.rowId, `${label}.rowId`),
    field: oneOf(input.field, ['value'], `${label}.field`),
  };
}

function rowSetRef(value: unknown, label: string): EvidenceRowSetRef {
  const input = record(value, label);
  exactKeys(input, ['evidenceId', 'rowIds'], label);
  if (!Array.isArray(input.rowIds) || input.rowIds.length === 0) {
    return parseError('INVALID_VALUE', `${label}.rowIds must be a non-empty array`);
  }
  const rowIds = input.rowIds.map((rowId, index) => nonEmptyString(rowId, `${label}.rowIds[${index}]`));
  if (new Set(rowIds).size !== rowIds.length) {
    parseError('INVALID_VALUE', `${label}.rowIds must be unique`);
  }
  return { evidenceId: nonEmptyString(input.evidenceId, `${label}.evidenceId`), rowIds };
}

export function parseClaimIR(value: unknown): ClaimIR {
  const input = record(value, 'claim');
  const kind = oneOf(input.kind, ['comparison', 'extremum', 'change', 'threshold'], 'claim.kind');

  if (kind === 'comparison') {
    exactKeys(input, ['kind', 'left', 'operator', 'right'], 'claim');
    return {
      kind,
      left: cellRef(input.left, 'claim.left'),
      operator: oneOf(input.operator, ['greater_than', 'less_than', 'equal'], 'claim.operator'),
      right: cellRef(input.right, 'claim.right'),
    };
  }
  if (kind === 'extremum') {
    exactKeys(input, ['kind', 'subject', 'operator', 'scope'], 'claim');
    return {
      kind,
      subject: cellRef(input.subject, 'claim.subject'),
      operator: oneOf(input.operator, ['maximum', 'minimum'], 'claim.operator'),
      scope: rowSetRef(input.scope, 'claim.scope'),
    };
  }
  if (kind === 'change') {
    exactKeys(input, ['kind', 'from', 'to', 'operator'], 'claim');
    return {
      kind,
      from: cellRef(input.from, 'claim.from'),
      to: cellRef(input.to, 'claim.to'),
      operator: oneOf(input.operator, ['increase', 'decrease', 'no_change'], 'claim.operator'),
    };
  }

  exactKeys(input, ['kind', 'subject', 'operator', 'threshold'], 'claim');
  if (typeof input.threshold !== 'number' || !Number.isFinite(input.threshold)) {
    return parseError('INVALID_VALUE', 'claim.threshold must be a finite number');
  }
  return {
    kind,
    subject: cellRef(input.subject, 'claim.subject'),
    operator: oneOf(input.operator, ['above', 'below', 'at'], 'claim.operator'),
    threshold: input.threshold,
  };
}
