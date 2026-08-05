import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunDirectory, writeJsonExclusive } from './artifacts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('minimal run artifacts', () => {
  it('refuses to reuse a run directory or replace an existing response', async () => {
    const root = await mkdtemp(join(tmpdir(), 'verified-claims-'));
    temporaryDirectories.push(root);
    const run = await createRunDirectory(root, 'fixed-run');
    await expect(createRunDirectory(root, 'fixed-run')).rejects.toMatchObject({ code: 'EEXIST' });

    await writeJsonExclusive(join(run, 'response-01.json'), { raw: 'first' });
    await expect(writeJsonExclusive(join(run, 'response-01.json'), { raw: 'replacement' }))
      .rejects.toMatchObject({ code: 'EEXIST' });
    expect(JSON.parse(await readFile(join(run, 'response-01.json'), 'utf8'))).toEqual({ raw: 'first' });
  });
});
