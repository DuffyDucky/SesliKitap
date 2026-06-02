import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJob } from './translationJob';
import { splitIntoBlocks } from './blocks';

// Her paragrafı ayrı blok yapan bölücü (target=1).
const split = (t: string) => splitIntoBlocks(t, 1);
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function memStore() {
  const done: Record<string, Record<number, string>> = {};
  return {
    get: async (id: string) => ({ totalBlocks: 0, done: done[id] ?? {} }),
    saveBlock: async (id: string, i: number, tr: string) => { (done[id] ??= {})[i] = tr; },
    getDone: async (id: string) => done[id] ?? {},
  };
}

function governor(okCount: number) {
  let n = 0;
  return {
    acquire: async () => (n++ < okCount ? 'ok' : 'exhausted') as 'ok' | 'exhausted',
    record: async () => {},
    isExhaustedToday: async () => n >= okCount,
  };
}

async function settle(job: { getState: () => { status: string } }) {
  for (let i = 0; i < 30 && job.getState().status === 'running'; i++) await flush();
}

test('blokları sırayla çevirir ve kaydeder → done', async () => {
  const store = memStore();
  const job = createJob({ translateBlock: async (s) => 'TR:' + s, governor: governor(99), store, splitIntoBlocks: split });
  job.start('b:1', 'A\n\nB\n\nC');
  await settle(job);
  assert.deepEqual(await store.getDone('b:1'), { 0: 'TR:A\n\n', 1: 'TR:B\n\n', 2: 'TR:C' });
  assert.equal(job.getState().status, 'done');
});

test('kota bitince paused-quota ve durur', async () => {
  const store = memStore();
  const job = createJob({ translateBlock: async (s) => 'TR:' + s, governor: governor(2), store, splitIntoBlocks: split });
  job.start('b:2', 'A\n\nB\n\nC');
  await settle(job);
  assert.equal(job.getState().status, 'paused-quota');
  assert.equal(Object.keys(await store.getDone('b:2')).length, 2);
});

test('yeniden başlatınca yalnız bitmemiş blokları çevirir', async () => {
  const store = memStore();
  let calls = 0;
  const mk = (ok: number) => createJob({
    translateBlock: async (s) => { calls++; return 'TR:' + s; },
    governor: governor(ok), store, splitIntoBlocks: split,
  });
  const j1 = mk(2);
  j1.start('b:3', 'A\n\nB\n\nC');
  await settle(j1);
  assert.equal(calls, 2);
  const j2 = mk(99);
  j2.start('b:3', 'A\n\nB\n\nC');
  await settle(j2);
  assert.equal(calls, 3); // yalnız kalan 1 blok
  assert.equal(Object.keys(await store.getDone('b:3')).length, 3);
});

test('translateBlock kota (quota) hatası atarsa → paused-quota, error DEĞİL', async () => {
  const store = memStore();
  const job = createJob({
    translateBlock: async () => { throw Object.assign(new Error('429'), { quota: true }); },
    governor: governor(99), store, splitIntoBlocks: split,
  });
  job.start('q:1', 'A\n\nB');
  await settle(job);
  assert.equal(job.getState().status, 'paused-quota');
});

test('translateBlock kota-DIŞI hata atarsa → error', async () => {
  const store = memStore();
  const job = createJob({
    translateBlock: async () => { throw new Error('beklenmedik'); },
    governor: governor(99), store, splitIntoBlocks: split,
  });
  job.start('e:1', 'A\n\nB');
  await settle(job);
  assert.equal(job.getState().status, 'error');
});

test('subscribe her blokta tetiklenir', async () => {
  const store = memStore();
  let n = 0;
  const job = createJob({ translateBlock: async (s) => 'TR:' + s, governor: governor(99), store, splitIntoBlocks: split });
  const unsub = job.subscribe(() => { n++; });
  job.start('b:4', 'A\n\nB\n\nC');
  await settle(job);
  unsub();
  assert.ok(n >= 3);
});
