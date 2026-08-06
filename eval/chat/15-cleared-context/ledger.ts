// Checkpoint 3 — the five-relation ledger, persisted in DuckDB (§ Minimum
// ledger required for 15A). "Do not build the complete product-wide
// reasoning ledger first" — this is exactly Requirements, Attempts,
// Artifacts, Checkpoint state and Round accounting, nothing from the
// deferred `analysis.claims`/`analysis.reasoning_notes` design.
//
// Structured fields (parameters, outcomes, rows, schemas, claims, work
// items) are stored as VARCHAR containing `JSON.stringify` output, not
// DuckDB's JSON type — every read/write goes through this file, so nothing
// depends on a JSON extension being loaded on either engine (native or Wasm).
// Timestamps are ISO-8601 VARCHAR for the same portability reason, matching
// `contracts.ts`'s `createdAt: string`.
//
// This file is pure persistence. It does not decide whether an attempt is a
// duplicate or which requirement an artifact satisfies — those are harness
// policy (Checkpoint 6) built on top of `findAttemptsByRequestHash` and
// `computeRequestHash`/`computeResultHash` (`duplicateIdentity.ts`). "The
// host may validate identities... it must not relabel a model interpretation
// as deterministic evidence or infer that an artifact satisfies a
// requirement merely because the model linked it" (§ Minimum ledger) is a
// harness-level rule, not something a persistence layer can enforce.
import { quoteIdentifier, quoteLiteral } from '../../../src/services/ingestion';
import type { OpOutcome, OpSchemaField } from '../../../src/lib/analyst/types';
import type { EvalEngine } from '../../duckdb/duckdb';
import type {
  ArmTag,
  Artifact,
  Attempt,
  AttemptDisposition,
  CandidateClaim,
  Checkpoint,
  PhaseNumber,
  Requirement,
  RoundAccounting,
  TerminalReason,
  WorkItem,
} from './contracts';

const DDL = [
  'CREATE SCHEMA IF NOT EXISTS analysis',
  `CREATE TABLE IF NOT EXISTS analysis.requirements (
    requirement_id VARCHAR PRIMARY KEY,
    description VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    satisfied_by_artifact_id VARCHAR
  )`,
  `CREATE TABLE IF NOT EXISTS analysis.attempts (
    attempt_id VARCHAR PRIMARY KEY,
    phase INTEGER NOT NULL,
    arm VARCHAR NOT NULL,
    operation VARCHAR NOT NULL,
    parameters_json VARCHAR NOT NULL,
    disposition VARCHAR NOT NULL,
    outcome_json VARCHAR NOT NULL,
    raw_prompt_tokens BIGINT NOT NULL,
    raw_output_tokens BIGINT NOT NULL,
    billable_prompt_tokens BIGINT NOT NULL,
    billable_output_tokens BIGINT NOT NULL,
    request_hash VARCHAR NOT NULL,
    duplicate_of_attempt_id VARCHAR,
    created_at VARCHAR NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS analysis.artifacts (
    artifact_id VARCHAR PRIMARY KEY,
    attempt_id VARCHAR NOT NULL,
    arm VARCHAR NOT NULL,
    operation VARCHAR NOT NULL,
    sql_text VARCHAR,
    dataset_revision VARCHAR NOT NULL,
    schema_json VARCHAR NOT NULL,
    row_count BIGINT NOT NULL,
    rows_json VARCHAR NOT NULL,
    complete BOOLEAN NOT NULL,
    warnings_json VARCHAR NOT NULL,
    request_hash VARCHAR NOT NULL,
    result_hash VARCHAR NOT NULL,
    created_at VARCHAR NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS analysis.checkpoints (
    phase INTEGER NOT NULL,
    arm VARCHAR NOT NULL,
    candidate_claims_json VARCHAR NOT NULL,
    caveats_json VARCHAR NOT NULL,
    open_work_json VARCHAR NOT NULL,
    recommended_next_action VARCHAR NOT NULL,
    created_at VARCHAR NOT NULL,
    PRIMARY KEY (phase, arm)
  )`,
  `CREATE TABLE IF NOT EXISTS analysis.round_accounting (
    phase INTEGER NOT NULL,
    arm VARCHAR NOT NULL,
    max_provider_calls INTEGER NOT NULL,
    max_operations INTEGER NOT NULL,
    actual_provider_calls INTEGER NOT NULL,
    actual_operations INTEGER NOT NULL,
    usage_calls INTEGER NOT NULL,
    raw_prompt_tokens BIGINT NOT NULL,
    raw_output_tokens BIGINT NOT NULL,
    billable_prompt_tokens BIGINT NOT NULL,
    billable_output_tokens BIGINT NOT NULL,
    high_water_raw_prompt_tokens BIGINT NOT NULL,
    ended_early VARCHAR,
    PRIMARY KEY (phase, arm)
  )`,
];

export async function createLedgerSchema(engine: EvalEngine): Promise<void> {
  for (const statement of DDL) await engine.execute(statement);
}

function lit(value: string): string {
  return quoteLiteral(value);
}
function nullableLit(value: string | undefined): string {
  return value === undefined ? 'NULL' : quoteLiteral(value);
}
function bool(value: boolean): string {
  return value ? 'TRUE' : 'FALSE';
}
function json(value: unknown): string {
  return quoteLiteral(JSON.stringify(value));
}
function table(name: string): string {
  return `analysis.${quoteIdentifier(name)}`;
}

// ── Requirements ────────────────────────────────────────────────────────

export async function insertRequirement(engine: EvalEngine, requirement: Requirement): Promise<void> {
  await engine.execute(
    `INSERT INTO ${table('requirements')} (requirement_id, description, status, satisfied_by_artifact_id)
     VALUES (${lit(requirement.requirementId)}, ${lit(requirement.description)}, ${lit(requirement.status)}, ${nullableLit(requirement.satisfiedByArtifactId)})`,
  );
}

export async function updateRequirementStatus(
  engine: EvalEngine,
  requirementId: string,
  status: Requirement['status'],
  satisfiedByArtifactId?: string,
): Promise<void> {
  await engine.execute(
    `UPDATE ${table('requirements')}
     SET status = ${lit(status)}, satisfied_by_artifact_id = ${nullableLit(satisfiedByArtifactId)}
     WHERE requirement_id = ${lit(requirementId)}`,
  );
}

export async function listRequirements(engine: EvalEngine): Promise<Requirement[]> {
  const result = await engine.execute(`SELECT requirement_id, description, status, satisfied_by_artifact_id FROM ${table('requirements')} ORDER BY requirement_id`);
  return result.rows.map((row) => ({
    requirementId: row[0] as string,
    description: row[1] as string,
    status: row[2] as Requirement['status'],
    ...(row[3] !== null ? { satisfiedByArtifactId: row[3] as string } : {}),
  }));
}

// ── Attempts ────────────────────────────────────────────────────────────

export async function insertAttempt(engine: EvalEngine, attempt: Attempt): Promise<void> {
  await engine.execute(
    `INSERT INTO ${table('attempts')} (
       attempt_id, phase, arm, operation, parameters_json, disposition, outcome_json,
       raw_prompt_tokens, raw_output_tokens, billable_prompt_tokens, billable_output_tokens,
       request_hash, duplicate_of_attempt_id, created_at
     ) VALUES (
       ${lit(attempt.attemptId)}, ${attempt.phase}, ${lit(attempt.arm)}, ${lit(attempt.operation)},
       ${json(attempt.parameters)}, ${lit(attempt.disposition)}, ${json(attempt.outcome)},
       ${attempt.usage.rawPromptTokens}, ${attempt.usage.rawOutputTokens},
       ${attempt.usage.billablePromptTokens}, ${attempt.usage.billableOutputTokens},
       ${lit(attempt.requestHash)}, ${nullableLit(attempt.duplicateOfAttemptId)}, ${lit(attempt.createdAt)}
     )`,
  );
}

function attemptFromRow(row: readonly unknown[]): Attempt {
  const outcome = JSON.parse(row[6] as string) as OpOutcome;
  return {
    attemptId: row[0] as string,
    phase: row[1] as PhaseNumber,
    arm: row[2] as ArmTag,
    operation: row[3] as string,
    parameters: JSON.parse(row[4] as string),
    disposition: row[5] as AttemptDisposition,
    outcome,
    usage: {
      rawPromptTokens: row[7] as number,
      rawOutputTokens: row[8] as number,
      billablePromptTokens: row[9] as number,
      billableOutputTokens: row[10] as number,
    },
    requestHash: row[11] as string,
    ...(row[12] !== null ? { duplicateOfAttemptId: row[12] as string } : {}),
    createdAt: row[13] as string,
  };
}

const ATTEMPT_COLUMNS =
  'attempt_id, phase, arm, operation, parameters_json, disposition, outcome_json, raw_prompt_tokens, raw_output_tokens, billable_prompt_tokens, billable_output_tokens, request_hash, duplicate_of_attempt_id, created_at';

export async function listAttempts(engine: EvalEngine, filter: { arms?: readonly ArmTag[] } = {}): Promise<Attempt[]> {
  const where = filter.arms ? ` WHERE arm IN (${filter.arms.map(lit).join(', ')})` : '';
  const result = await engine.execute(`SELECT ${ATTEMPT_COLUMNS} FROM ${table('attempts')}${where} ORDER BY created_at`);
  return result.rows.map(attemptFromRow);
}

/**
 * The exact-duplicate lookup a harness calls *before* deciding whether to
 * execute an operation — `arms` should be the set visible to the caller
 * (e.g. `['shared', 'treatment']` from inside the treatment branch), never
 * both phase-two arms at once: "isolated so neither arm can warm or mutate
 * the other's state" (§ Frozen comparison arms).
 */
export async function findAttemptsByRequestHash(
  engine: EvalEngine,
  requestHash: string,
  arms: readonly ArmTag[],
): Promise<Attempt[]> {
  const result = await engine.execute(
    `SELECT ${ATTEMPT_COLUMNS} FROM ${table('attempts')}
     WHERE request_hash = ${lit(requestHash)} AND arm IN (${arms.map(lit).join(', ')}) AND disposition = 'ok'
     ORDER BY created_at`,
  );
  return result.rows.map(attemptFromRow);
}

// ── Artifacts ───────────────────────────────────────────────────────────

export async function insertArtifact(engine: EvalEngine, artifact: Artifact): Promise<void> {
  await engine.execute(
    `INSERT INTO ${table('artifacts')} (
       artifact_id, attempt_id, arm, operation, sql_text, dataset_revision, schema_json,
       row_count, rows_json, complete, warnings_json, request_hash, result_hash, created_at
     ) VALUES (
       ${lit(artifact.artifactId)}, ${lit(artifact.attemptId)}, ${lit(artifact.arm)}, ${lit(artifact.operation)},
       ${artifact.sql === null ? 'NULL' : lit(artifact.sql)}, ${lit(artifact.datasetRevision)},
       ${json(artifact.schema)}, ${artifact.rowCount}, ${json(artifact.rows)}, ${bool(artifact.complete)},
       ${json(artifact.warnings)}, ${lit(artifact.requestHash)}, ${lit(artifact.resultHash)}, ${lit(artifact.createdAt)}
     )`,
  );
}

const ARTIFACT_COLUMNS =
  'artifact_id, attempt_id, arm, operation, sql_text, dataset_revision, schema_json, row_count, rows_json, complete, warnings_json, request_hash, result_hash, created_at';

function artifactFromRow(row: readonly unknown[]): Artifact {
  return {
    artifactId: row[0] as string,
    attemptId: row[1] as string,
    arm: row[2] as ArmTag,
    operation: row[3] as string,
    sql: row[4] as string | null,
    datasetRevision: row[5] as string,
    schema: JSON.parse(row[6] as string) as OpSchemaField[],
    rowCount: row[7] as number,
    rows: JSON.parse(row[8] as string) as unknown[][],
    complete: row[9] as boolean,
    warnings: JSON.parse(row[10] as string) as string[],
    requestHash: row[11] as string,
    resultHash: row[12] as string,
    createdAt: row[13] as string,
  };
}

/** `arms` scopes visibility the same way `findAttemptsByRequestHash` does for attempts — a caller inside one phase-two branch passes its own `visibleArms` (e.g. `['shared', 'treatment']`) so the other branch's artifacts can never be read back as its own evidence. Omit to read every artifact regardless of arm (host-side reporting, not grading). */
export async function listArtifacts(engine: EvalEngine, filter: { arms?: readonly ArmTag[] } = {}): Promise<Artifact[]> {
  const where = filter.arms ? ` WHERE arm IN (${filter.arms.map(lit).join(', ')})` : '';
  const result = await engine.execute(`SELECT ${ARTIFACT_COLUMNS} FROM ${table('artifacts')}${where} ORDER BY created_at`);
  return result.rows.map(artifactFromRow);
}

export async function getArtifact(engine: EvalEngine, artifactId: string): Promise<Artifact | null> {
  const result = await engine.execute(`SELECT ${ARTIFACT_COLUMNS} FROM ${table('artifacts')} WHERE artifact_id = ${lit(artifactId)}`);
  return result.rows.length > 0 ? artifactFromRow(result.rows[0]) : null;
}

// ── Checkpoint state (model-authored lane) ─────────────────────────────

/** One checkpoint per (phase, arm) — a later call with the same key replaces it (§ Checkpoint 5's bounded repair attempt needs this). */
export async function upsertCheckpoint(engine: EvalEngine, checkpoint: Checkpoint): Promise<void> {
  await engine.execute(`DELETE FROM ${table('checkpoints')} WHERE phase = ${checkpoint.phase} AND arm = ${lit(checkpoint.arm)}`);
  await engine.execute(
    `INSERT INTO ${table('checkpoints')} (phase, arm, candidate_claims_json, caveats_json, open_work_json, recommended_next_action, created_at)
     VALUES (${checkpoint.phase}, ${lit(checkpoint.arm)}, ${json(checkpoint.candidateClaims)}, ${json(checkpoint.caveats)}, ${json(checkpoint.openWork)}, ${lit(checkpoint.recommendedNextAction)}, ${lit(checkpoint.createdAt)})`,
  );
}

export async function getCheckpoint(engine: EvalEngine, phase: PhaseNumber, arm: ArmTag): Promise<Checkpoint | null> {
  const result = await engine.execute(
    `SELECT phase, arm, candidate_claims_json, caveats_json, open_work_json, recommended_next_action, created_at
     FROM ${table('checkpoints')} WHERE phase = ${phase} AND arm = ${lit(arm)}`,
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    phase: row[0] as PhaseNumber,
    arm: row[1] as ArmTag,
    candidateClaims: JSON.parse(row[2] as string) as CandidateClaim[],
    caveats: JSON.parse(row[3] as string) as string[],
    openWork: JSON.parse(row[4] as string) as WorkItem[],
    recommendedNextAction: row[5] as string,
    createdAt: row[6] as string,
  };
}

// ── Round accounting ────────────────────────────────────────────────────

export async function upsertRoundAccounting(engine: EvalEngine, round: RoundAccounting): Promise<void> {
  await engine.execute(`DELETE FROM ${table('round_accounting')} WHERE phase = ${round.phase} AND arm = ${lit(round.arm)}`);
  await engine.execute(
    `INSERT INTO ${table('round_accounting')} (
       phase, arm, max_provider_calls, max_operations, actual_provider_calls, actual_operations,
       usage_calls, raw_prompt_tokens, raw_output_tokens, billable_prompt_tokens, billable_output_tokens,
       high_water_raw_prompt_tokens, ended_early
     ) VALUES (
       ${round.phase}, ${lit(round.arm)}, ${round.enforcedCeilings.maxProviderCalls}, ${round.enforcedCeilings.maxOperations},
       ${round.actualProviderCalls}, ${round.actualOperations},
       ${round.usage.calls}, ${round.usage.rawPromptTokens}, ${round.usage.rawOutputTokens},
       ${round.usage.billablePromptTokens}, ${round.usage.billableOutputTokens}, ${round.usage.highWaterRawPromptTokens},
       ${nullableLit(round.endedEarly)}
     )`,
  );
}

export async function getRoundAccounting(engine: EvalEngine, phase: PhaseNumber, arm: ArmTag): Promise<RoundAccounting | null> {
  const result = await engine.execute(
    `SELECT phase, arm, max_provider_calls, max_operations, actual_provider_calls, actual_operations,
            usage_calls, raw_prompt_tokens, raw_output_tokens, billable_prompt_tokens, billable_output_tokens,
            high_water_raw_prompt_tokens, ended_early
     FROM ${table('round_accounting')} WHERE phase = ${phase} AND arm = ${lit(arm)}`,
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    phase: row[0] as PhaseNumber,
    arm: row[1] as ArmTag,
    enforcedCeilings: { maxProviderCalls: row[2] as number, maxOperations: row[3] as number },
    actualProviderCalls: row[4] as number,
    actualOperations: row[5] as number,
    usage: {
      calls: row[6] as number,
      rawPromptTokens: row[7] as number,
      rawOutputTokens: row[8] as number,
      billablePromptTokens: row[9] as number,
      billableOutputTokens: row[10] as number,
      highWaterRawPromptTokens: row[11] as number,
    },
    ...(row[12] !== null ? { endedEarly: row[12] as Extract<TerminalReason, 'blocked'> } : {}),
  };
}
