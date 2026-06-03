import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapLines } from './unwrapLines';

test('paragraf içi tek satır kırılması boşluğa dönüşür', () => {
  assert.equal(unwrapLines('Dostoyevski bir doktorun\noğluydu.'), 'Dostoyevski bir doktorun oğluydu.');
});

test('paragraf araları (\\n\\n) korunur', () => {
  assert.equal(unwrapLines('Birinci satır.\n\nİkinci paragraf.'), 'Birinci satır.\n\nİkinci paragraf.');
});

test('üç+ satır boşluğu da paragraf sınırı sayılır', () => {
  assert.equal(unwrapLines('A\n\n\n\nB'), 'A\n\nB');
});

test('satır sonu tirelemesi birleştirilir', () => {
  assert.equal(unwrapLines('char-\nacter'), 'character');
});

test('girinti/fazla boşluk sadeleşir', () => {
  assert.equal(unwrapLines('line1\n   line2'), 'line1 line2');
});
