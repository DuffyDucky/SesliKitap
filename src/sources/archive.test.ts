import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanArchiveText, validCharRatio } from './archive';

test('cleanArchiveText: yalnızca sayfa numarası olan satırları siler', () => {
  const raw = 'Birinci paragraf.\n\n12\n\nİkinci paragraf.';
  const out = cleanArchiveText(raw);
  assert.ok(!/\n12\n/.test(out), 'sayfa numarası satırı kalmamalı');
  assert.ok(out.includes('Birinci paragraf.'));
  assert.ok(out.includes('İkinci paragraf.'));
});

test('cleanArchiveText: 3+ boş satırı 2ye indirir ve satır içi fazla boşluğu teke', () => {
  const raw = 'A.\n\n\n\nB.\n\nİki      boşluk.';
  const out = cleanArchiveText(raw);
  assert.ok(!/\n{3,}/.test(out), '3+ ardışık satır sonu kalmamalı');
  assert.ok(out.includes('İki boşluk.'), 'satır içi fazla boşluk teke inmeli');
});

test('validCharRatio: temiz Türkçe metin yüksek oran verir', () => {
  const clean = 'Korkma, sönmez bu şafaklarda yüzen al sancak. Güzel bir gün.';
  assert.ok(validCharRatio(clean) >= 0.95, `beklenen >=0.95, gelen ${validCharRatio(clean)}`);
});

test('validCharRatio: bozuk OCR / sembol yığını düşük oran verir', () => {
  const garbage = '~|}{#@^*¶§∆◊≈ ¬¬¬ ‹›«»‡†•~|}{#@^*¶§∆◊≈¬¬¬';
  assert.ok(validCharRatio(garbage) < 0.85, `beklenen <0.85, gelen ${validCharRatio(garbage)}`);
});
