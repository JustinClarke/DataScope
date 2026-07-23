// Generate a synthetic CSV fixture with a mix of typed columns
// (int, float, string, date) to stand in for a large reference file.
//
// Usage: node scripts/gen-csv.mjs <outFile> <targetMB>
//   node scripts/gen-csv.mjs fixtures/large.csv 50
//   node scripts/gen-csv.mjs fixtures/small.csv 0.2
//
// These fixtures are local test data only; nothing here is meant to be kept.

import fs from 'node:fs';
import path from 'node:path';

const outFile = process.argv[2] || 'fixtures/large.csv';
const targetBytes = Math.round(parseFloat(process.argv[3] || '50') * 1024 * 1024);

fs.mkdirSync(path.dirname(outFile), { recursive: true });

const CATEGORIES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
const NAMES = [
  'ada', 'grace', 'linus', 'dennis', 'ken', 'margaret',
  'barbara', 'donald', 'edsger', 'john', 'katherine', 'alan',
];

function randDate() {
  // random day in 2020-2025
  const start = Date.UTC(2020, 0, 1);
  const end = Date.UTC(2025, 11, 31);
  const t = start + Math.random() * (end - start);
  return new Date(t).toISOString().slice(0, 10);
}

const ws = fs.createWriteStream(outFile);
const header = 'id,created,category,price,qty,name\n';
ws.write(header);

let bytes = Buffer.byteLength(header);
let id = 0;
const CHUNK = 20000;

function writeChunk() {
  let ok = true;
  while (ok && bytes < targetBytes) {
    let buf = '';
    for (let i = 0; i < CHUNK && bytes < targetBytes; i++) {
      id++;
      const created = randDate();
      const category = CATEGORIES[(Math.random() * CATEGORIES.length) | 0];
      const price = (Math.random() * 10000).toFixed(2);
      const qty = (Math.random() * 1000) | 0;
      const name = NAMES[(Math.random() * NAMES.length) | 0];
      const line = `${id},${created},${category},${price},${qty},${name}\n`;
      buf += line;
    }
    bytes += Buffer.byteLength(buf);
    ok = ws.write(buf);
  }
  if (bytes < targetBytes) {
    ws.once('drain', writeChunk);
  } else {
    ws.end(() => {
      const mb = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
      console.log(`wrote ${outFile}: ${id.toLocaleString()} rows, ${mb} MB`);
    });
  }
}

writeChunk();
