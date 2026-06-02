import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor } from './quotaGovernor';

function fakeStore() {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: async (k: string, v: string) => { m.set(k, v); },
  };
}

test('acquire: ilk istek beklemez, ikinci RPM aralığı kadar uyur', async () => {
  let t = 0;
  const slept: number[] = [];
  const s = fakeStore();
  const g = createGovernor({
    now: () => t,
    sleep: async (ms) => { slept.push(ms); t += ms; },
    getItem: s.getItem, setItem: s.setItem,
    rpdBudget: 500, rpmSpacingMs: 4500,
  });
  assert.equal(await g.acquire(), 'ok');
  assert.equal(await g.acquire(), 'ok');
  assert.deepEqual(slept, [4500]);
});

test('isExhaustedToday: bütçe dolunca true, acquire exhausted döner', async () => {
  let t = 0;
  const s = fakeStore();
  const g = createGovernor({
    now: () => t, sleep: async () => {},
    getItem: s.getItem, setItem: s.setItem,
    rpdBudget: 2, rpmSpacingMs: 0,
  });
  assert.equal(await g.isExhaustedToday(), false);
  await g.record();
  await g.record();
  assert.equal(await g.isExhaustedToday(), true);
  assert.equal(await g.acquire(), 'exhausted');
});

test('record: yeni günde sayaç sıfırlanır', async () => {
  let t = 0;
  const s = fakeStore();
  const g = createGovernor({
    now: () => t, sleep: async () => {},
    getItem: s.getItem, setItem: s.setItem,
    rpdBudget: 2, rpmSpacingMs: 0,
  });
  await g.record();
  await g.record();
  assert.equal(await g.isExhaustedToday(), true);
  t += 24 * 60 * 60 * 1000; // ertesi gün
  assert.equal(await g.isExhaustedToday(), false);
});
