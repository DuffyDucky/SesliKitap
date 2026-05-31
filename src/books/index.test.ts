import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS } from './index';

test('BOOKS: en az 3 gömülü kitap var', () => {
  assert.ok(BOOKS.length >= 3, `beklenen >=3, bulunan ${BOOKS.length}`);
});

test('BOOKS: her kitabın zorunlu alanları dolu', () => {
  for (const b of BOOKS) {
    assert.ok(b.id.length > 0, 'id boş olamaz');
    assert.ok(b.title.length > 0, 'title boş olamaz');
    assert.ok(b.author.length > 0, 'author boş olamaz');
    assert.ok(b.text.length > 0, 'text boş olamaz');
    assert.ok(Array.isArray(b.aliases), 'aliases dizi olmalı');
    assert.ok(b.aliases.length > 0, 'aliases boş dizi olamaz');
  }
});

test("BOOKS: id'ler benzersiz", () => {
  const ids = BOOKS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'tekrar eden id var');
});
