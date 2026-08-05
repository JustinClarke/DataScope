import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function createRunDirectory(root: string, runId: string): Promise<string> {
  await mkdir(root, { recursive: true });
  const directory = join(root, runId);
  await mkdir(directory);
  return directory;
}

export async function writeJsonExclusive(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}
