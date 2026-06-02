import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryStore } from './libraryStore';

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: async (k: string, v: string) => { m.set(k, v); },
    m,
  };
}

const entry = (id: string, title = 'Suç ve Ceza') => ({
  id, title, author: 'Dostoyevski', addedAt: '2026-06-03T00:00:00.000Z',
});

test('boş depo → []', async () => {
  const store = createLibraryStore(memStorage());
  assert.deepEqual(await store.getEntries(), []);
});

test('upsert + getEntries round-trip', async () => {
  const store = createLibraryStore(memStorage());
  await store.upsertEntry(entry('gutenberg:2554'));
  const list = await store.getEntries();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'gutenberg:2554');
  assert.equal(list[0].title, 'Suç ve Ceza');
});

test('aynı id tekrar upsert → güncellenir, çift kayıt olmaz', async () => {
  const store = createLibraryStore(memStorage());
  await store.upsertEntry(entry('gutenberg:2554', 'Eski Başlık'));
  await store.upsertEntry(entry('gutenberg:2554', 'Yeni Başlık'));
  const list = await store.getEntries();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Yeni Başlık');
});

test('hasEntry: var/yok', async () => {
  const store = createLibraryStore(memStorage());
  await store.upsertEntry(entry('gutenberg:2554'));
  assert.equal(await store.hasEntry('gutenberg:2554'), true);
  assert.equal(await store.hasEntry('gutenberg:9999'), false);
});

test('bozuk JSON → []', async () => {
  const s = memStorage();
  s.m.set('@seslikitap_library', '{bozuk');
  const store = createLibraryStore(s);
  assert.deepEqual(await store.getEntries(), []);
});
