import { test } from 'node:test';
import assert from 'node:assert/strict';

// Modül yüklenmeden ÖNCE anahtarı ayarla (geminiService.test.ts kalıbı).
process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-key';

function mockFetch(payload: unknown, ok = true, status = 200): void {
  (globalThis as any).fetch = async () => ({ ok, status, json: async () => payload });
}

test('translateBlock: çeviriyi döndürür', async () => {
  mockFetch({ candidates: [{ content: { parts: [{ text: 'Merhaba dünya' }] } }] });
  const { translateBlock } = await import('./geminiTranslate');
  assert.equal(await translateBlock('Hello world'), 'Merhaba dünya');
});

test('translateBlock: boş girdi → aynen döner (istek atmaz)', async () => {
  const { translateBlock } = await import('./geminiTranslate');
  assert.equal(await translateBlock('   '), '   ');
});

test('translateBlock: boş yanıt → hata fırlatır', async () => {
  mockFetch({ candidates: [] });
  const { translateBlock } = await import('./geminiTranslate');
  await assert.rejects(() => translateBlock('Hello'));
});

test('translateBlock: 429 (retry kapalı) → hata fırlatır', async () => {
  mockFetch({}, false, 429);
  const { translateBlock } = await import('./geminiTranslate');
  await assert.rejects(() => translateBlock('Hello', false));
});
