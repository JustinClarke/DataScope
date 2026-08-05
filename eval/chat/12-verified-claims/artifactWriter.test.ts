import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ArtifactWriter,
  inspectRun,
  redactSecrets,
  sha256,
  writeDerivedRescore,
  type RunManifest,
} from './artifactWriter';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'verified-claims-writer-'));
  temporaryDirectories.push(root);
  return root;
}

function manifest(runId = '20260731T190000Z-abcdef'): RunManifest {
  return {
    runId,
    startedAt: '2026-07-31T19:00:00.000Z',
    command: ['node', 'run.ts'],
    workingDirectory: '/workspace',
    experimentVersion: '12.1',
    schemaVersions: { manifest: 1, events: 1, calls: 1 },
    git: { commit: 'abc123', statusShort: ' M experiment.md' },
    runtime: { node: 'v24.0.0', duckdbWasm: '1.32.0', harness: '12.1' },
    fixtures: [],
    provider: {
      name: 'ollama',
      endpointHost: 'http://example.test:11434',
      modelTag: 'qwen2.5-coder:7b',
      modelDigest: 'sha256:model',
    },
    options: { temperature: 0, numCtx: 8192, keepAlive: '30m', timeoutMs: 1_000, retryCap: 0, repairCap: 0 },
    selection: { questions: ['question-01'], repeats: 1, filters: [] },
    hashes: { systemPrompts: {}, schemas: {}, deterministicSources: {} },
    privacy: { classification: 'bundled-public-fixtures-only', bundledPublicFixturesOnly: true },
  };
}

describe('immutable artifact writer lifecycle', () => {
  it('allocates a complete run tree, refuses collisions, and writes the manifest before work', async () => {
    const root = await temporaryRoot();
    const first = await ArtifactWriter.start(root, manifest());

    await expect(ArtifactWriter.start(root, manifest())).rejects.toMatchObject({ code: 'EEXIST' });
    expect(JSON.parse(await readFile(join(first.directory, 'manifest.json'), 'utf8'))).toEqual(manifest());
    expect((await readdir(first.directory)).sort()).toEqual([
      'calls', 'claims', 'events.jsonl', 'evidence', 'manifest.json', 'plans', 'sql',
    ]);

    const events = (await readFile(join(first.directory, 'events.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(events).toMatchObject([{ sequence: 1, type: 'run_started', runId: manifest().runId }]);
  });

  it('preserves retries and raw parse failures as separately numbered calls', async () => {
    const root = await temporaryRoot();
    const writer = await ArtifactWriter.start(root, manifest());

    const first = await writer.writeCall({
      questionId: 'question-01', role: 'planner', attempt: 1,
      messages: [{ role: 'user', content: 'return json' }], schema: { type: 'object' },
      requestOptions: { headers: { authorization: 'Bearer secret-token' } },
      http: { status: 200, headers: { 'x-request-id': 'one' }, rawResponseBody: '{not json' },
      parsedValue: null, parseError: { name: 'SyntaxError', message: 'bad json' },
      tokenCounts: null, startedAt: '2026-07-31T19:00:01.000Z', endedAt: '2026-07-31T19:00:02.000Z', durationMs: 1_000,
    });
    const second = await writer.writeCall({
      questionId: 'question-01', role: 'repair', attempt: 1,
      messages: [{ role: 'user', content: 'repair' }], schema: { type: 'object' }, requestOptions: {},
      http: { status: 200, headers: {}, rawResponseBody: '{"kind":"comparison"}' },
      parsedValue: { kind: 'comparison' }, tokenCounts: { prompt: 10, response: 5 },
      startedAt: '2026-07-31T19:00:03.000Z', endedAt: '2026-07-31T19:00:04.000Z', durationMs: 1_000,
    });

    expect(first).toMatch(/0001-planner-attempt-1\.json$/);
    expect(second).toMatch(/0002-repair-attempt-1\.json$/);
    const saved = JSON.parse(await readFile(first, 'utf8'));
    expect(saved.http.rawResponseBody).toBe('{not json');
    expect(JSON.stringify(saved)).not.toContain('secret-token');
    await expect(writeFile(first, 'replacement', { flag: 'wx' })).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('counts transport failures and identifies a simulated crash as incomplete', async () => {
    const root = await temporaryRoot();
    const writer = await ArtifactWriter.start(root, manifest());
    await writer.writeCall({
      questionId: 'question-01', role: 'planner', attempt: 1, messages: [], schema: {}, requestOptions: {},
      tokenCounts: null, startedAt: '2026-07-31T19:00:01.000Z', endedAt: '2026-07-31T19:00:02.000Z',
      durationMs: 1_000, error: new Error('timeout', { cause: new Error('socket closed') }),
    });
    await writer.appendEvent('model_request_failed', {
      questionId: 'question-01', disposition: 'transport_failed', error: { message: 'timeout' },
    });
    await writeFile(join(writer.directory, '.claims.json.tmp-interrupted'), '{');

    const state = await inspectRun(writer.directory);
    expect(state).toEqual({
      runId: manifest().runId,
      status: 'incomplete',
      terminalEvent: null,
      dispositions: { transport_failed: 1 },
      incompleteTemporaryFiles: ['.claims.json.tmp-interrupted'],
    });
    expect(await readdir(join(writer.directory, 'calls'))).toEqual(['0001-planner-attempt-1.json']);
  });

  it('records a terminal event and refuses to append after completion', async () => {
    const root = await temporaryRoot();
    const writer = await ArtifactWriter.start(root, manifest());
    await writer.complete({ verdict: 'failed', counts: { transport_failed: 1 } });

    expect(await inspectRun(writer.directory)).toMatchObject({ status: 'completed', terminalEvent: 'run_completed' });
    await expect(writer.appendEvent('fixture_loaded', {})).rejects.toThrow('run is terminal');
    await expect(access(join(writer.directory, 'verdict.json'))).resolves.toBeUndefined();
  });

  it('persists deterministic stage artifacts exclusively and blocks path traversal', async () => {
    const root = await temporaryRoot();
    const writer = await ArtifactWriter.start(root, manifest());
    const planPath = await writer.writeJsonArtifact('plans', 'question-01.json', { id: 'average-order-value' });
    const sqlPath = await writer.writeSqlArtifact('question-01-probe-01.sql', 'SELECT 1');

    expect(JSON.parse(await readFile(planPath, 'utf8'))).toEqual({ id: 'average-order-value' });
    expect(await readFile(sqlPath, 'utf8')).toBe('SELECT 1\n');
    await expect(writer.writeJsonArtifact('plans', 'question-01.json', {})).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(writer.writeJsonArtifact('claims', '../escape.json', {})).rejects.toThrow('invalid JSON artifact filename');
    await expect(writer.writeSqlArtifact('../escape.sql', 'SELECT 1')).rejects.toThrow('invalid SQL artifact filename');
  });

  it('records an explicit interruption as a terminal disposition', async () => {
    const root = await temporaryRoot();
    const writer = await ArtifactWriter.start(root, manifest());
    await writer.interrupt({ signal: 'SIGTERM' });

    expect(await inspectRun(writer.directory)).toMatchObject({
      status: 'interrupted', terminalEvent: 'run_interrupted',
    });
    await expect(writer.writeCall({
      questionId: 'question-01', role: 'planner', attempt: 1, messages: [], schema: {}, requestOptions: {},
      tokenCounts: null, startedAt: '', endedAt: '', durationMs: 0,
    })).rejects.toThrow('run is terminal');
  });
});

describe('artifact integrity helpers', () => {
  it('redacts secret keys, bearer values, and URL credentials before serialization', () => {
    expect(redactSecrets({
      apiKey: 'top-secret',
      nested: { Authorization: 'Bearer abc123', endpoint: 'https://user:pass@example.test/path' },
      ordinary: 'keep me',
    })).toEqual({
      apiKey: '[REDACTED]',
      nested: { Authorization: '[REDACTED]', endpoint: 'https://example.test/path' },
      ordinary: 'keep me',
    });
  });

  it('serializes complete nested error causes instead of losing Error fields', () => {
    const cause = new Error('socket closed');
    const error = new Error('request failed', { cause });
    expect(redactSecrets(error)).toMatchObject({
      name: 'Error', message: 'request failed', cause: { name: 'Error', message: 'socket closed' },
    });
  });

  it('produces stable hashes for identical fixture, prompt, schema, and source bytes', () => {
    expect(sha256('same bytes')).toBe('58100dc8fc06562ce3e578231dc948e083520ee49c4b4ee5a5a28bb4b4003feb');
    expect(sha256('same bytes')).not.toBe(sha256('different bytes'));
  });

  it('writes additive re-scores without permitting mutation of raw artifacts', async () => {
    const root = await temporaryRoot();
    const writer = await ArtifactWriter.start(root, manifest());
    const rawPath = await writer.writeCall({
      questionId: 'question-01', role: 'claim', attempt: 1, messages: [], schema: {}, requestOptions: {},
      http: { status: 200, headers: {}, rawResponseBody: '{}' }, parsedValue: {}, tokenCounts: null,
      startedAt: '2026-07-31T19:00:01.000Z', endedAt: '2026-07-31T19:00:02.000Z', durationMs: 1_000,
    });
    const before = await readFile(rawPath, 'utf8');
    const rescore = await writeDerivedRescore(writer.directory, 'verifier-v2', { accepted: false });

    expect(await readFile(rawPath, 'utf8')).toBe(before);
    await expect(writeDerivedRescore(writer.directory, 'verifier-v2', { accepted: true }))
      .rejects.toMatchObject({ code: 'EEXIST' });
    expect(rescore).toMatch(/derived\/rescore-verifier-v2\.json$/);
  });
});
