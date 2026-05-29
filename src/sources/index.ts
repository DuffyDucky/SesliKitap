/**
 * Birleşik kitap kaynağı API'si.
 * searchBook() → kaynaklarda sırayla ara, ilk eşleşmeyi döndür.
 * fetchBookText() → global ID'nin kaynak prefix'ine göre uygun kaynağı çağır.
 *   Sonuç kısa süreli cache'lenir; HomeScreen kalite kapısı için çağırınca
 *   ReaderScreen tekrar indirmeden aynı metni kullanır.
 */
import { BookSource, BookSearchResult } from './types';
import { listBundledBooks } from './bundled';
import { archiveSource } from './archive';
import { gutenbergSource } from './gutenberg';

// Kaynak sırası: önce archive.org (Türkçe tam metin), sonra Gutenberg
// (İngilizce + ReaderScreen'de sayfa sayfa Türkçe çeviri).
const SOURCES: BookSource[] = [archiveSource, gutenbergSource];

function sourceByName(name: string): BookSource | undefined {
  return SOURCES.find((s) => s.name === name);
}

export async function searchBook(query: string): Promise<BookSearchResult[]> {
  console.log(`[searchBook] sorgu: "${query}"`);
  // Tüm kaynaklardan sonuç topla (kaynak sırasına göre: archive önce).
  // Böylece archive'da bulunmayan kitaplar Gutenberg adaylarına düşebilir.
  const all: BookSearchResult[] = [];
  for (const source of SOURCES) {
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
 * "archive:identifier" formatındaki global ID'den temiz metin getirir.
 * Önce cache'e bakar; yoksa kaynaktan çekip cache'ler.
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

export { listBundledBooks };
export type { BookSearchResult, BookSource };
