import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { expandZipFile, isZipFile } from './zip';

function zipFile(entries: Record<string, string>): File {
  const zippable: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(entries)) zippable[name] = strToU8(content);
  return new File([zipSync(zippable)], 'archive.zip');
}

describe('isZipFile', () => {
  it('matches on extension, case-insensitively', () => {
    expect(isZipFile(new File([], 'export.zip'))).toBe(true);
    expect(isZipFile(new File([], 'EXPORT.ZIP'))).toBe(true);
    expect(isZipFile(new File([], 'data.csv'))).toBe(false);
  });
});

describe('expandZipFile', () => {
  it('extracts contained files with their content intact', async () => {
    const file = zipFile({ 'customers.csv': 'id,name\n1,a\n', 'orders.csv': 'id\n1\n' });
    const extracted = await expandZipFile(file);

    expect(extracted.map((f) => f.name).sort()).toEqual(['customers.csv', 'orders.csv']);
    const customers = extracted.find((f) => f.name === 'customers.csv')!;
    expect(await customers.text()).toBe('id,name\n1,a\n');
  });

  it('flattens folder structure inside the archive to basenames', async () => {
    const file = zipFile({ 'ecommerce/customers.csv': 'id\n1\n' });
    const extracted = await expandZipFile(file);
    expect(extracted.map((f) => f.name)).toEqual(['customers.csv']);
  });

  it('drops directory entries, __MACOSX metadata, and .DS_Store noise', async () => {
    const zippable: Record<string, Uint8Array> = {
      'data.csv': strToU8('id\n1\n'),
      'folder/': new Uint8Array(0),
      '__MACOSX/data.csv': strToU8('resource fork junk'),
      '.DS_Store': new Uint8Array(0),
    };
    const file = new File([zipSync(zippable)], 'archive.zip');
    const extracted = await expandZipFile(file);
    expect(extracted.map((f) => f.name)).toEqual(['data.csv']);
  });
});
