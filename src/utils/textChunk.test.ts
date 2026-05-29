import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText } from './textChunk';

test('kısa metin tek parça döner', () => {
  assert.deepEqual(chunkText('merhaba dünya', 1500), ['merhaba dünya']);
});

test('uzun metin parçalanır ve her parça sınırın altında', () => {
  const sentence = 'Bu bir cümledir. ';
  const text = sentence.repeat(300); // ~5100 karakter
  const chunks = chunkText(text, 1500);
  assert.ok(chunks.length > 1, 'birden fazla parça olmalı');
  for (const c of chunks) assert.ok(c.length <= 1500, `parça ${c.length} > 1500`);
});

test('parçalar birleştirilince orijinale birebir eşit (karakter kaybı yok)', () => {
  const text = ('Lorem ipsum dolor sit amet. ').repeat(200);
  const chunks = chunkText(text, 1000);
  assert.equal(chunks.join(''), text);
});

test('boşluksuz çok uzun metin de zorla kesilir', () => {
  const text = 'x'.repeat(5000);
  const chunks = chunkText(text, 1500);
  for (const c of chunks) assert.ok(c.length <= 1500);
  assert.equal(chunks.join(''), text);
});
