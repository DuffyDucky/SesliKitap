/**
 * Project Gutenberg düz metin dosyalarındaki başlık/lisans (boilerplate)
 * bloklarını temizleyen saf fonksiyon. Birim testlenebilir, RN bağımlılığı yok.
 */

const START_RE = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
const END_RE = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;

export function stripGutenbergBoilerplate(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n');

  const startMatch = text.match(START_RE);
  if (startMatch && startMatch.index !== undefined) {
    text = text.slice(startMatch.index + startMatch[0].length);
  }

  const endMatch = text.match(END_RE);
  if (endMatch && endMatch.index !== undefined) {
    text = text.slice(0, endMatch.index);
  }

  // "Produced by ..." üretim satırı bazen START'tan sonra kalır.
  text = text.replace(/^\s*Produced by[^\n]*\n/i, '');

  return text.replace(/\n{3,}/g, '\n\n').trim();
}
