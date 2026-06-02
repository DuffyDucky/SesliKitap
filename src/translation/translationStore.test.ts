import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './translationStore';

function memFs() {
  const files = new Map<string, string>();
  return {
    readFile: async (n: string) => (files.has(n) ? files.get(n)! : null),
    writeFile: async (n: string, d: string) => { files.set(n, d); },
    files,
  };
}

test('saveBlock + getDone round-trip', async () => {
  const fs = memFs();
  const store = createStore(fs);
  await store.saveBlock('gutenberg:42', 0, 'Birinci', 3);
  await store.saveBlock('gutenberg:42', 1, 'İkinci', 3);
  assert.deepEqual(await store.getDone('gutenberg:42'), { 0: 'Birinci', 1: 'İkinci' });
});

test('get: totalBlocks korunur, eksik bloklar yok', async () => {
  const fs = memFs();
  const store = createStore(fs);
  await store.saveBlock('x:1', 2, 'C', 5);
  const d = await store.get('x:1');
  assert.equal(d.totalBlocks, 5);
  assert.deepEqual(d.done, { 2: 'C' });
});

test('bozuk JSON → temiz başlangıç', async () => {
  const fs = memFs();
  const store = createStore(fs);
  await fs.writeFile('gutenberg_42.json', '{bozuk');
  assert.deepEqual(await store.get('gutenberg:42'), { totalBlocks: 0, done: {} });
});
