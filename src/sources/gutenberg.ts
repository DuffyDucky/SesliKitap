/**
 * Project Gutenberg kaynağı (İngilizce tam metin).
 * Arama: Türkçe başlığı İngilizceye çevirip gutenberg.org HTML arama sayfasını
 * parse eder. fetchText: İngilizce .txt indirir, boilerplate'i temizler.
 * Çeviri ReaderScreen'de sayfa sayfa yapılır (bu kaynak İngilizce döndürür).
 */
import { BookSource, BookSearchResult } from './types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { stripGutenbergBoilerplate } from './gutenbergText';
import { resolveEnglishTitle } from '../utils/geminiService';

const SEARCH = 'https://www.gutenberg.org/ebooks/search/';
const EPUB = 'https://www.gutenberg.org/cache/epub';
const FILES = 'https://www.gutenberg.org/files';
const MIN_LEN = 1000;

export const gutenbergSource: BookSource = {
  name: 'gutenberg',

  async search(query: string): Promise<BookSearchResult[]> {
    let q = query;
    try {
      q = await resolveEnglishTitle(query);
    } catch {
      q = query;
    }

    const url = `${SEARCH}?query=${encodeURIComponent(q)}&submit_search=Go%21`;
    try {
      const res = await fetchWithTimeout(url, {}, 15000);
      if (!res.ok) return [];
      const html = await res.text();

      const results: BookSearchResult[] = [];
      const blocks = html.split('class="booklink"');
      for (let i = 1; i < blocks.length && results.length < 10; i++) {
        const b = blocks[i];
        const idM = b.match(/href="\/ebooks\/(\d+)"/);
        const tM = b.match(/<span class="title">([^<]+)<\/span>/);
        const aM = b.match(/<span class="subtitle">([^<]+)<\/span>/);
        if (!idM || !tM) continue;
        const id = idM[1];
        results.push({
          id: `gutenberg:${id}`,
          title: tM[1].trim(),
          author: aM ? aM[1].trim() : 'Bilinmiyor',
          source: 'gutenberg',
          sourceId: id,
        });
      }
      return results;
    } catch (e) {
      console.warn('[gutenberg] arama hatası:', e);
      return [];
    }
  },

  async fetchText(sourceId: string): Promise<string> {
    const candidates = [
      `${EPUB}/${sourceId}/pg${sourceId}.txt`,
      `${FILES}/${sourceId}/${sourceId}-0.txt`,
      `${FILES}/${sourceId}/${sourceId}.txt`,
    ];

    let raw = '';
    for (const u of candidates) {
      try {
        const r = await fetchWithTimeout(u, {}, 20000);
        if (r.ok) {
          raw = await r.text();
          if (raw && raw.length > 0) break;
        }
      } catch {
        // sıradaki URL'i dene
      }
    }
    if (!raw) throw new Error('Gutenberg metni indirilemedi');

    const text = stripGutenbergBoilerplate(raw);
    if (text.length < MIN_LEN) throw new Error('Gutenberg metni çok kısa');
    return text;
  },
};
