import { test } from 'node:test';
import assert from 'node:assert/strict';

// resolveEnglishTitle gerçek bir Gemini anahtarı görmeli; modül yüklenmeden ÖNCE ayarla.
process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-key';

function mockFetch(payload: unknown, ok = true, status = 200): void {
  (globalThis as any).fetch = async () => ({
    ok,
    status,
    json: async () => payload,
  });
}

test('resolveEnglishTitle: Türkçe başlık → kanonik İngilizce', async () => {
  mockFetch({ candidates: [{ content: { parts: [{ text: 'Crime and Punishment' }] } }] });
  const { resolveEnglishTitle } = await import('./geminiService');
  assert.equal(await resolveEnglishTitle('suç ve ceza'), 'Crime and Punishment');
});

test('resolveEnglishTitle: tırnakları temizler', async () => {
  mockFetch({ candidates: [{ content: { parts: [{ text: '"Les Misérables"' }] } }] });
  const { resolveEnglishTitle } = await import('./geminiService');
  assert.equal(await resolveEnglishTitle('sefiller'), 'Les Misérables');
});

test('resolveEnglishTitle: 429 → girdi sorgusu fallback', async () => {
  mockFetch({}, false, 429);
  const { resolveEnglishTitle } = await import('./geminiService');
  assert.equal(await resolveEnglishTitle('suç ve ceza'), 'suç ve ceza');
});

test('resolveEnglishTitle: boş yanıt → fallback', async () => {
  mockFetch({ candidates: [] });
  const { resolveEnglishTitle } = await import('./geminiService');
  assert.equal(await resolveEnglishTitle('beyaz diş'), 'beyaz diş');
});

function mockGeminiTitle(text: string | null, ok = true): void {
  (globalThis as any).fetch = async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => (text == null
      ? { candidates: [] }
      : { candidates: [{ content: { parts: [{ text }] } }] }),
  });
}

test('resolveTurkishTitle: Gemini Türkçe başlık döndürür', async () => {
  mockGeminiTitle('Suç ve Ceza');
  const { resolveTurkishTitle } = await import('./geminiService');
  assert.equal(await resolveTurkishTitle('Crime and Punishment'), 'Suç ve Ceza');
});

test('resolveTurkishTitle: tırnak/whitespace temizlenir', async () => {
  mockGeminiTitle('"Suç ve Ceza"\n');
  const { resolveTurkishTitle } = await import('./geminiService');
  assert.equal(await resolveTurkishTitle('Crime and Punishment'), 'Suç ve Ceza');
});

test('resolveTurkishTitle: Gemini ve GT başarısız → İngilizce başlık döner', async () => {
  (globalThis as any).fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const { resolveTurkishTitle } = await import('./geminiService');
  assert.equal(await resolveTurkishTitle('Crime and Punishment'), 'Crime and Punishment');
});

test('resolveTurkishTitle: boş girdi aynen döner', async () => {
  const { resolveTurkishTitle } = await import('./geminiService');
  assert.equal(await resolveTurkishTitle('   '), '   ');
});
