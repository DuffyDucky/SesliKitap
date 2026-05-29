import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalIntent } from './localIntent';

test('düz kitap adı → unknown (ekran kitap aramasına düşürür)', () => {
  assert.equal(parseLocalIntent('Suç ve Ceza Dostoyevski').action, 'unknown');
});

test('"X aç" → open_book, başlık ayıklanır', () => {
  const r = parseLocalIntent('Kürk Mantolu Madonna aç');
  assert.equal(r.action, 'open_book');
  assert.equal(r.book, 'Kürk Mantolu Madonna');
});

test('"X kitabını oku" → open_book', () => {
  const r = parseLocalIntent('Çalıkuşu kitabını oku');
  assert.equal(r.action, 'open_book');
  assert.equal(r.book, 'Çalıkuşu');
});

test('"oku X" → open_book', () => {
  const r = parseLocalIntent('dinle Sefiller');
  assert.equal(r.action, 'open_book');
  assert.equal(r.book, 'Sefiller');
});

test('"dur" → pause', () => {
  assert.equal(parseLocalIntent('dur').action, 'pause');
});

test('"devam et" → resume', () => {
  assert.equal(parseLocalIntent('devam et').action, 'resume');
});

test('"5. sayfaya git" → go_to_page 5', () => {
  const r = parseLocalIntent('5. sayfaya git');
  assert.equal(r.action, 'go_to_page');
  assert.equal(r.page, 5);
});

test('"daha hızlı oku" → set_speed_up', () => {
  assert.equal(parseLocalIntent('daha hızlı oku').action, 'set_speed_up');
});

test('"sonraki sayfa" → next_chapter', () => {
  assert.equal(parseLocalIntent('sonraki sayfa').action, 'next_chapter');
});

test('"kitaplığa git" → go_library', () => {
  assert.equal(parseLocalIntent('kitaplığa git').action, 'go_library');
});

test('"önsözü atla" → skip_intro', () => {
  assert.equal(parseLocalIntent('önsözü atla').action, 'skip_intro');
});

test('"en baştan oku" → read_full', () => {
  assert.equal(parseLocalIntent('en baştan oku').action, 'read_full');
});

test('"neredeyim" → progress', () => {
  assert.equal(parseLocalIntent('neredeyim').action, 'progress');
});

test('"yer imi ekle" → add_bookmark', () => {
  assert.equal(parseLocalIntent('yer imi ekle').action, 'add_bookmark');
});

test('"10 dakika sonra dur" → set_timer 10', () => {
  const r = parseLocalIntent('10 dakika sonra dur');
  assert.equal(r.action, 'set_timer');
  assert.equal(r.page, 10);
});
