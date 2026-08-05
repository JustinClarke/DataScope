import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createEvalEngine } from '../../duckdb/duckdb';
import { ArtifactWriter, sha256, type RunManifest } from './artifactWriter';
import { CLAIM_IR_SCHEMA, type ClaimIR } from './claimIr';
import { executeEcommercePlan } from './ecommercePipeline';
import type { EvidencePacket } from './evidence';
import { phase3Plans } from './phase3Plans';
import { renderVerifiedFact } from './renderer';
import { verifyClaim } from './verifier';

const executeFile = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../..');
const runsRoot = path.join(here, 'runs');
const ecommerceFixtures = [
  path.join(repository, 'public/samples/ecommerce/orders.csv'),
  path.join(repository, 'public/samples/ecommerce/order_items.csv'),
];
const deterministicSources = [
  'artifactWriter.ts',
  'claimIr.ts',
  'ecommercePipeline.ts',
  'evidence.ts',
  'metrics.ts',
  'renderer.ts',
  'verifier.ts',
];

function runId(startedAt: string): string {
  const timestamp = startedAt.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `${timestamp}-${randomBytes(3).toString('hex')}`;
}

async function git(command: string[]): Promise<string> {
  const result = await executeFile('git', command, { cwd: repository });
  return result.stdout.trimEnd();
}

async function manifest(startedAt: string): Promise<RunManifest> {
  const fixtures = await Promise.all(ecommerceFixtures.map(async (absolutePath) => {
    const [bytes, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
    return { id: path.basename(absolutePath, '.csv'), absolutePath, byteSize: metadata.size, sha256: sha256(bytes) };
  }));
  const sourceHashes = Object.fromEntries(await Promise.all(deterministicSources.map(async (filename) => [
    filename,
    sha256(await readFile(path.join(here, filename))),
  ])));
  return {
    runId: runId(startedAt),
    startedAt,
    command: process.argv,
    workingDirectory: process.cwd(),
    experimentVersion: '12.3',
    schemaVersions: { manifest: 1, events: 1, calls: 1 },
    git: { commit: await git(['rev-parse', 'HEAD']), statusShort: await git(['status', '--short']) },
    runtime: { node: process.version, duckdbWasm: '1.32.0', harness: '12.3' },
    fixtures,
    provider: { name: 'none', endpointHost: '', modelTag: '', modelDigest: null },
    options: { temperature: 0, numCtx: 0, keepAlive: 'none', timeoutMs: 0, retryCap: 0, repairCap: 0 },
    selection: { questions: ['phase3-hand-authored-ecommerce'], repeats: 1, filters: ['orders.status=completed'] },
    hashes: {
      systemPrompts: {},
      schemas: { claimIr: sha256(JSON.stringify(CLAIM_IR_SCHEMA)) },
      deterministicSources: sourceHashes,
    },
    privacy: { classification: 'bundled-public-fixtures-only', bundledPublicFixturesOnly: true },
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const writer = await ArtifactWriter.start(runsRoot, await manifest(startedAt));
  const engine = await createEvalEngine();
  try {
    await engine.loadCsv('orders', ecommerceFixtures[0]!);
    await engine.loadCsv('order_items', ecommerceFixtures[1]!);
    await writer.appendEvent('fixture_loaded', { fixtureIds: ['orders', 'order_items'] });
    await writer.writeJsonArtifact('plans', 'question-01-hand-authored.json', {
      provenance: 'hand-authored-phase-3',
      plans: phase3Plans,
    });
    await writer.appendEvent('typed_plan_accepted', { questionId: 'question-01', probeCount: phase3Plans.length });

    const evidence: EvidencePacket[] = [];
    for (const [index, plan] of phase3Plans.entries()) {
      const executed = await executeEcommercePlan(engine, plan);
      const probeId = String(index + 1).padStart(2, '0');
      await writer.writeSqlArtifact(`question-01-probe-${probeId}.sql`, executed.sql);
      await writer.appendEvent('sql_compiled', { questionId: 'question-01', probeId: plan.id });
      await writer.writeJsonArtifact('evidence', `question-01-probe-${probeId}.json`, executed.evidence);
      await writer.appendEvent('sql_completed', {
        questionId: 'question-01', probeId: plan.id, rowCount: executed.evidence.rows.length,
      });
      evidence.push(executed.evidence);
    }

    const claims: ClaimIR[] = [
      {
        kind: 'threshold',
        subject: { evidenceId: 'evidence:completed-aov', rowId: 'r1', field: 'value' },
        operator: 'above',
        threshold: 0,
      },
      {
        kind: 'change',
        from: { evidenceId: 'evidence:monthly-revenue', rowId: 'r1', field: 'value' },
        to: { evidenceId: 'evidence:monthly-revenue', rowId: 'r2', field: 'value' },
        operator: 'increase',
      },
    ];
    await writer.writeJsonArtifact('claims', 'question-01-draft.json', {
      provenance: 'hand-authored-phase-3', claims,
    });

    const validations = claims.map((claim) => {
      const result = verifyClaim(claim, evidence);
      const renderedSentence = result.accepted ? renderVerifiedFact(result.fact) : null;
      return { claim, result, renderedSentence };
    });
    await writer.writeJsonArtifact('claims', 'question-01-validation.json', validations);
    await writer.writeJsonArtifact('claims', 'question-01-rendered.json', {
      sentences: validations.flatMap((validation) => validation.renderedSentence ? [validation.renderedSentence] : []),
    });
    for (const validation of validations) {
      await writer.appendEvent(validation.result.accepted ? 'claim_accepted' : 'claim_rejected', {
        questionId: 'question-01',
        disposition: validation.result.accepted ? 'verified' : validation.result.reason,
      });
    }

    const passed = validations.every((validation) => validation.result.accepted && validation.renderedSentence !== null);
    const verdict = {
      phase: 3,
      modelCalls: 0,
      plansPersisted: 1,
      sqlArtifactsPersisted: phase3Plans.length,
      evidenceArtifactsPersisted: evidence.length,
      claimsPersisted: claims.length,
      verifiedFacts: validations.filter((validation) => validation.result.accepted).length,
      renderedSentences: validations.filter((validation) => validation.renderedSentence !== null).length,
      modelAuthoredLabels: 0,
      passed,
    };
    await writer.complete(verdict);
    console.log(JSON.stringify({ runId: writer.runId, directory: writer.directory, verdict, validations }, null, 2));
    if (!passed) process.exitCode = 1;
  } catch (error) {
    await writer.interrupt(error).catch(() => undefined);
    throw error;
  } finally {
    await engine.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
