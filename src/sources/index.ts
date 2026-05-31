/**
 * Birleşik kitap kaynağı API'si.
 * searchBook() → SEARCH_SOURCES üzerinden sonuç toplar (şu an: yalnızca Gutenberg).
 * fetchBookText() → ALL_SOURCES üzerinden kaynak bulur (Gutenberg + gömülü).
 *   Sonuç kısa süreli cache'lenir; HomeScreen kalite kapısı için çağırınca
 *   ReaderScreen tekrar indirmeden aynı metni kullanır.
 */
import { BookSource, BookSearchResult } from './types';
import { bundledSource, listBundledBooks } from './bundled';
import { gutenbergSource } from './gutenberg';

// Arama YALNIZCA Gutenberg'e gider; gömülü kitaplar şimdilik aramaya karışmaz.
const SEARCH_SOURCES: BookSource[] = [gutenbergSource];
// Metin çözme tüm kaynakları kapsar: Okuyucu kütüphaneden seçilen "bundled:..."
// metnini çevrimdışı açabilsin diye.
const ALL_SOURCES: BookSource[] = [gutenbergSource, bundledSource];

function sourceByName(name: string): BookSource | undefined {
  return ALL_SOURCES.find((s) => s.name === name);
}

export async function searchBook(query: string): Promise<BookSearchResult[]> {
  console.log(`[searchBook] sorgu: "${query}"`);
  // Yalnızca SEARCH_SOURCES üzerinde döner — gömülü kitaplar aramaya dahil değil.
  const all: BookSearchResult[] = [];
  for (const source of SEARCH_SOURCES) {
    try {
      const hits = await source.search(query);
      console.log(`[searchBook] ${source.name}: ${hits.length} sonuç`);
      all.push(...hits);
    } catch (e) {
      console.warn(`[${source.name}] arama başarısız:`, e);
    }
  }
  return all;
}

const MAX_TEXT_CACHE = 3;
const textCache = new Map<string, string>();

function cacheGet(id: string): string | undefined {
  if (!textCache.has(id)) return undefined;
  const t = textCache.get(id)!;
  textCache.delete(id);
  textCache.set(id, t); // LRU: sona taşı
  return t;
}

function cacheSet(id: string, text: string): void {
  if (textCache.size >= MAX_TEXT_CACHE && !textCache.has(id)) {
    const oldest = textCache.keys().next().value;
    if (oldest !== undefined) textCache.delete(oldest);
  }
  textCache.delete(id);
  textCache.set(id, text);
}

/**
 * "kaynak:id" formatındaki global ID'den temiz metin getirir
 * (örn. "gutenberg:1234" veya "bundled:omer-seyfettin-forsa").
 * Önce cache'e bakar; yoksa ilgili kaynaktan çekip cache'ler.
 */
export async function fetchBookText(globalId: string): Promise<string> {
  const cached = cacheGet(globalId);
  if (cached !== undefined) return cached;

  const idx = globalId.indexOf(':');
  if (idx < 0) throw new Error(`Geçersiz kitap ID: ${globalId}`);
  const sourceName = globalId.slice(0, idx);
  const sourceId = globalId.slice(idx + 1);
  const source = sourceByName(sourceName);
  if (!source) throw new Error(`Bilinmeyen kaynak: ${sourceName}`);

  const text = await source.fetchText(sourceId);
  cacheSet(globalId, text);
  return text;
}

export { listBundledBooks, bundledSource };
export type { BookSearchResult, BookSource };
