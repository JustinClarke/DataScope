import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

async function listFiles(root: string, extensions: readonly string[]): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full, extensions)));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(full);
  }
  return files;
}

describe('no product module imports the experiment', () => {
  it('finds no reference to eval/chat/13-active-analysis anywhere under src/ or edge/', async () => {
    const files = [
      ...(await listFiles(join(process.cwd(), 'src'), ['.ts', '.tsx'])),
      ...(await listFiles(join(process.cwd(), 'edge'), ['.ts', '.tsx'])),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const contents = await readFile(file, 'utf8');
      if (contents.includes('13-active-analysis')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * README's "What is deliberately not here yet": qwen3Rig.ts, runPreflight.ts, runFixed.ts, and
 * runActive.ts are Checkpoint 2+ (platform preflight and live model calls) and are the only
 * files in this directory permitted to reference the provider or the network.
 */
const CHECKPOINT_2_PLUS_FILES = ['qwen3Rig.ts', 'runPreflight.ts', 'runFixed.ts', 'runActive.ts'];

describe('Checkpoint 1 makes no model call', () => {
  it('finds no network or provider client reference in the deterministic-core source files', async () => {
    const sourceFiles = (await listFiles(join(process.cwd(), 'eval', 'chat', '13-active-analysis'), ['.ts'])).filter(
      (file) => !file.endsWith('.test.ts') && !CHECKPOINT_2_PLUS_FILES.includes(file.split('/').pop()!),
    );
    const forbidden = [/\bollama\b/i, /\bfetch\(/, /node-fetch/, /http:\/\/localhost:11434/];
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const contents = await readFile(file, 'utf8');
      if (forbidden.some((pattern) => pattern.test(contents))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
