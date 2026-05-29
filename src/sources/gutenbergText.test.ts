import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripGutenbergBoilerplate } from './gutenbergText';

test('START ve END işaretleri arasındaki metni çıkarır', () => {
  const raw =
    'The Project Gutenberg eBook of Foo\nLicense junk here\n' +
    '*** START OF THE PROJECT GUTENBERG EBOOK FOO ***\n\n' +
    'Chapter One. It was a bright cold day in April.\n\n' +
    '*** END OF THE PROJECT GUTENBERG EBOOK FOO ***\n' +
    'More license junk, donations, etc.';
  const out = stripGutenbergBoilerplate(raw);
  assert.equal(out, 'Chapter One. It was a bright cold day in April.');
});

test('"THIS" varyantını da tanır', () => {
  const raw =
    'header\n*** START OF THIS PROJECT GUTENBERG EBOOK BAR ***\nReal text body.\n*** END OF THIS PROJECT GUTENBERG EBOOK BAR ***\nfooter';
  const out = stripGutenbergBoilerplate(raw);
  assert.equal(out, 'Real text body.');
});

test('işaret yoksa metni (CRLF normalize + trim) aynen döndürür', () => {
  const raw = 'no markers here\r\njust text';
  const out = stripGutenbergBoilerplate(raw);
  assert.equal(out, 'no markers here\njust text');
});
