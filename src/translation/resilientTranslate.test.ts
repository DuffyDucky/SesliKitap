import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResilientTranslate, PLACEHOLDER, QuotaError } from './resilientTranslate';

test('Gemini başarılıysa onun sonucunu döner, GT çağrılmaz', async () => {
  let gtCalled = false;
  const t = createResilientTranslate({
    gemini: async (s) => 'GEM:' + s,
    google: async () => { gtCalled = true; return 'GT'; },
  });
  assert.equal(await t('Hello'), 'GEM:Hello');
  assert.equal(gtCalled, false);
});

test('Gemini kota (QuotaError) atarsa yeniden fırlatır, GT çağrılmaz', async () => {
  let gtCalled = false;
  const t = createResilientTranslate({
    gemini: async () => { throw new QuotaError(); },
    google: async () => { gtCalled = true; return 'GT'; },
  });
  await assert.rejects(() => t('Hello'), (e: any) => e instanceof QuotaError);
  assert.equal(gtCalled, false);
});

test('Gemini içerik reddi (başka hata) atarsa GT fallback döner', async () => {
  const t = createResilientTranslate({
    gemini: async () => { throw new Error('Çeviri boş döndü'); },
    google: async (s) => 'GT:' + s,
  });
  assert.equal(await t('Hello'), 'GT:Hello');
});

test('Hem Gemini hem GT patlarsa yer tutucu döner', async () => {
  const t = createResilientTranslate({
    gemini: async () => { throw new Error('PROHIBITED'); },
    google: async () => { throw new Error('GT down'); },
  });
  assert.equal(await t('Hello'), PLACEHOLDER);
});
