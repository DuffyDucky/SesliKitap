/**
 * Dahili (gömülü) Türkçe metinler — çevrimdışı, ağ gerektirmez.
 * Metin içeriği src/books/ altında dosya-başına tutulur; burada yalnızca
 * arama/eşleştirme ve metin getirme mantığı bulunur.
 */
import { BookSource, BookSearchResult } from './types';
import { BOOKS } from '../books';

/** Türkçe harfleri sade ASCII'ye indir + küçült: "İstiklâl" → "istiklal" */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/i̇/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const bundledSource: BookSource = {
  name: 'bundled',

  async search(query: string): Promise<BookSearchResult[]> {
    const q = normalize(query);
    if (!q) return [];

    const matches = BOOKS.filter((b) => {
      const nTitle = normalize(b.title);
      const nAuthor = normalize(b.author);
      if (nTitle.includes(q) || q.includes(nTitle)) return true;
      if (nAuthor.includes(q)) return true;
      return b.aliases.some((a) => {
        const na = normalize(a);
        return na.includes(q) || q.includes(na);
      });
    });

    return matches.map((b) => ({
      id: `bundled:${b.id}`,
      title: b.title,
      author: b.author,
      source: 'bundled',
      sourceId: b.id,
    }));
  },

  async fetchText(sourceId: string): Promise<string> {
    const book = BOOKS.find((b) => b.id === sourceId);
    if (!book) throw new Error(`Bundled kitap bulunamadı: ${sourceId}`);
    return book.text;
  },
};

export function listBundledBooks(): BookSearchResult[] {
  return BOOKS.map((b) => ({
    id: `bundled:${b.id}`,
    title: b.title,
    author: b.author,
    source: 'bundled',
    sourceId: b.id,
  }));
}
