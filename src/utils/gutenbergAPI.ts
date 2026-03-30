import { fetchWithTimeout } from './fetchWithTimeout';

const GUTENBERG_SEARCH = 'https://www.gutenberg.org/ebooks/search/';
const GUTENBERG_TEXT = 'https://www.gutenberg.org/cache/epub';

const MAX_CACHE = 20;
const CACHE_TTL = 5 * 60 * 1000; // 5 dakika
const searchCache = new Map<string, { data: GutenbergBook[]; ts: number }>();

export interface GutenbergBook {
  id: number;
  title: string;
  authors: { name: string; birth_year: number | null; death_year: number | null }[];
  languages: string[];
  download_count: number;
  formats: Record<string, string>;
}

/**
 * gutenberg.org HTML arama sayfasını parse ederek kitap listesi döndürür.
 * gutendex.com çöktüğü için doğrudan gutenberg.org kullanılıyor.
 */
export async function searchBooks(query: string, _language?: string): Promise<GutenbergBook[]> {
  const cacheKey = `${query}|${_language ?? ''}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const url = `${GUTENBERG_SEARCH}?query=${encodeURIComponent(query)}&submit_search=Go%21`;
  const response = await fetchWithTimeout(url, {}, 30000);
  if (!response.ok) throw new Error(`Gutenberg arama hatası: ${response.status}`);
  const html = await response.text();

  // HTML'yi booklink bloklarına böl, her bloktan ID/title/author çıkar
  const results: GutenbergBook[] = [];
  const blocks = html.split('class="booklink"');

  for (let i = 1; i < blocks.length && results.length < 10; i++) {
    const block = blocks[i];
    const idMatch = block.match(/href="\/ebooks\/(\d+)"/);
    const titleMatch = block.match(/<span class="title">([^<]+)<\/span>/);
    const authorMatch = block.match(/<span class="subtitle">([^<]+)<\/span>/);

    if (!idMatch || !titleMatch) continue;

    const id = parseInt(idMatch[1], 10);
    const title = titleMatch[1].trim();
    const authorName = authorMatch ? authorMatch[1].trim() : 'Bilinmiyor';

    results.push({
      id,
      title,
      authors: [{ name: authorName, birth_year: null, death_year: null }],
      languages: [],
      download_count: 0,
      formats: {
        'text/plain; charset=utf-8': `${GUTENBERG_TEXT}/${id}/pg${id}.txt`,
      },
    });
  }

  if (searchCache.size >= MAX_CACHE) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(cacheKey, { data: results, ts: Date.now() });

  return results;
}

export async function getBook(id: number): Promise<GutenbergBook> {
  // Basit metadata döndür — metin URL'i zaten biliniyor
  return {
    id,
    title: `Kitap #${id}`,
    authors: [{ name: 'Bilinmiyor', birth_year: null, death_year: null }],
    languages: [],
    download_count: 0,
    formats: {
      'text/plain; charset=utf-8': `${GUTENBERG_TEXT}/${id}/pg${id}.txt`,
    },
  };
}

export function getTextUrl(book: GutenbergBook): string | null {
  const f = book.formats;
  return (
    f['text/plain; charset=utf-8'] ??
    f['text/plain; charset=us-ascii'] ??
    f['text/plain'] ??
    null
  );
}

export function getAuthorName(book: GutenbergBook): string {
  return book.authors.map((a) => a.name).join(', ') || 'Bilinmiyor';
}
