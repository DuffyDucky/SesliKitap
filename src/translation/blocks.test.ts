import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoBlocks } from './blocks';

test('boş metin → boş dizi', () => {
  assert.deepEqual(splitIntoBlocks(''), []);
});

test('kısa tek paragraf → tek blok, kaynak korunur', () => {
  const b = splitIntoBlocks('abc');
  assert.equal(b.length, 1);
  assert.equal(b[0].source, 'abc');
});

test('blokların birleşimi orijinale eşittir (kayıp yok)', () => {
  const text = 'Para bir.\n\nPara iki.\n\nPara üç.\n\nPara dört.';
  const blocks = splitIntoBlocks(text, 12);
  assert.equal(blocks.map((b) => b.source).join(''), text);
});

test('paragraf ortasından kesmez — bloklar \\n\\n sınırında biter', () => {
  const text = 'Para bir.\n\nPara iki.\n\nPara üç.';
  const blocks = splitIntoBlocks(text, 12);
  for (let i = 0; i < blocks.length - 1; i++) {
    assert.match(blocks[i].source, /\n\n$/);
  }
});

test('hedeften küçük paragraflarda her blok hedef sınırında kalır', () => {
  const text = 'aaa\n\nbbb\n\nccc\n\nddd';
  const blocks = splitIntoBlocks(text, 6);
  for (const b of blocks) assert.ok(b.source.length <= 6 + 2);
});

test('tek paragraf hedeften büyükse zorla bölmez → tek blok', () => {
  const big = 'x'.repeat(100);
  const blocks = splitIntoBlocks(big, 10);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].source, big);
});

test('index ardışık ve start/end bitişik', () => {
  const text = 'aaa\n\nbbb\n\nccc';
  const blocks = splitIntoBlocks(text, 4);
  blocks.forEach((b, i) => assert.equal(b.index, i));
  for (let i = 1; i < blocks.length; i++) assert.equal(blocks[i].start, blocks[i - 1].end);
});
