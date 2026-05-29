import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMainTextStart } from './frontMatter';

test('bölüm işaretli metin: işaretin konumunu döndürür', () => {
  const text =
    'KAPAK BİLGİSİ\nYazar Adı\nYayınevi 1990\n\n' +
    'BİRİNCİ BÖLÜM\n\n' +
    'Ben o zaman küçük bir kızdım. Babam askerdi ve sık sık yer değiştirirdik. ' +
    'Annemi pek hatırlamıyorum. Çocukluğum hep yollarda, han odalarında ve ' +
    'yabancı şehirlerde geçti. Her yeni yerde her şeye yeniden alışmak gerekirdi.';
  const idx = findMainTextStart(text);
  assert.equal(text.slice(idx).startsWith('BİRİNCİ BÖLÜM'), true);
});

test('işaretsiz + önsözlü metin: ilk uzun düzyazı paragrafını döndürür', () => {
  const front = 'ÇALIKUŞU\nReşat Nuri Güntekin\n1 — Çalıkuşu\n2 — Damga\nMatbaa 1990\n\n';
  const prose =
    'Ben o zaman pek küçük bir kızdım. Babamın memuriyeti yüzünden şehir şehir dolaşırdık ve ' +
    'her gittiğimiz yerde yeni bir okula başlardım. Bu yüzden hiçbir yere tam olarak ısınamadım, ' +
    'arkadaşlıklarım hep yarım kaldı. Annemi pek hatırlamıyorum; çok küçükken kaybetmişim onu. ' +
    'Beni büyüten dadım, geceleri yatağımın başında masallar anlatır, ben de o masalların ' +
    'içinde uyuyakalırdım.';
  const text = front + prose;
  const idx = findMainTextStart(text);
  assert.equal(text.slice(idx).startsWith('Ben o zaman pek küçük'), true);
});

test('güvenlik freni: asıl metin %50\'den ötedeyse 0 döner', () => {
  const filler = 'x'.repeat(2000); // uzun ön bilgi bloğu (tek paragraf, cümlesiz)
  const text = filler + '\n\nBİRİNCİ BÖLÜM\n\nKısa.';
  assert.equal(findMainTextStart(text), 0);
});

test('boş/kısa metin: 0 döner', () => {
  assert.equal(findMainTextStart(''), 0);
  assert.equal(findMainTextStart('kısa metin'), 0);
});
