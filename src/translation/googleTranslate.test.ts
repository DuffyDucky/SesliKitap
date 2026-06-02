import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleTranslate, chunkForTranslate } from './googleTranslate';

function mockFetch(seg: string[], ok = true, status = 200): void {
  // GT yanıt biçimi: data[0] = segment dizisi, her seg[0] çeviri parçası.
  const payload = [seg.map((s) => [s, '', null, null]), null, 'en'];
  (globalThis as any).fetch = async () => ({ ok, status, json: async () => payload });
}

test('chunkForTranslate: kısa metin tek parça', () => {
  assert.deepEqual(chunkForTranslate('merhaba', 100), ['merhaba']);
});

test('chunkForTranslate: parçalar maxLen sınırında, birleşim = orijinal', () => {
  const text = 'Cümle bir. Cümle iki. Cümle üç. Cümle dört.';
  const chunks = chunkForTranslate(text, 15);
  for (const c of chunks) assert.ok(c.length <= 15 || !c.includes(' '));
  assert.equal(chunks.join(''), text);
});

test('googleTranslate: boş girdi aynen döner (istek atmaz)', async () => {
  (globalThis as any).fetch = async () => { throw new Error('istek atılmamalı'); };
  assert.equal(await googleTranslate('   '), '   ');
});

test('googleTranslate: segmentleri birleştirip döndürür', async () => {
  mockFetch(['Merhaba ', 'dünya.']);
  assert.equal(await googleTranslate('Hello world.'), 'Merhaba dünya.');
});

test('googleTranslate: !ok → hata fırlatır', async () => {
  mockFetch([], false, 429);
  await assert.rejects(() => googleTranslate('Hello'));
});
