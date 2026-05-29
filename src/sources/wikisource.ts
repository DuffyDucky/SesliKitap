/**
 * Türkçe Wikisource kaynağı.
 * MediaWiki API ile arama yapar, sayfanın düz metnini extract olarak çeker.
 * Not: Wikisource'ta bazı sayfalar indeks/dizin olup boş extract döner —
 * bu durumda bu kaynak eşleşme vermez, bir sonraki kaynağa geçilir.
 */
import { BookSource, BookSearchResult } from './types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const API = 'https://tr.wikisource.org/w/api.php';
const MIN_TEXT_LENGTH = 500; // bundan kısa içerik "gerçek metin" sayılmaz

interface SearchHit {
  title: string;
  pageid: number;
  size: number;
  wordcount: number;
}

export const wikisourceSource: BookSource = {
  name: 'wikisource',

  async search(query: string): Promise<BookSearchResult[]> {
    const url =
      `${API}?action=query&list=search&format=json&origin=*` +
      `&srlimit=5&srsearch=${encodeURIComponent(query)}`;
    try {
      const res = await fetchWithTimeout(url, {}, 10000);
      if (!res.ok) return [];
      const data = await res.json();
      const hits: SearchHit[] = data?.query?.search ?? [];
      return hits
        .filter((h) => h.wordcount >= 100) // çok kısa sayfaları ele
        .map((h) => ({
          id: `wikisource:${h.title}`,
          title: h.title,
          author: 'Wikisource',
          source: 'wikisource',
          sourceId: h.title,
        }));
    } catch (e) {
      console.warn('[wikisource] arama hatası:', e);
      return [];
    }
  },

  async fetchText(sourceId: string): Promise<string> {
    const url =
      `${API}?action=query&prop=extracts&explaintext=1&format=json&origin=*` +
      `&titles=${encodeURIComponent(sourceId)}`;
    const res = await fetchWithTimeout(url, {}, 15000);
    if (!res.ok) throw new Error('Wikisource yanıt vermedi');
    const data = await res.json();
    const pages = data?.query?.pages ?? {};
    const firstPageId = Object.keys(pages)[0];
    const extract: string = pages[firstPageId]?.extract ?? '';
    if (!extract || extract.length < MIN_TEXT_LENGTH) {
      throw new Error('Wikisource sayfasında okunacak metin bulunamadı');
    }
    return extract.trim();
  },
};
