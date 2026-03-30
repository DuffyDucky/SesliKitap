import { fetchWithTimeout } from './fetchWithTimeout';

const WIKISOURCE_API = 'https://tr.wikisource.org/w/api.php';

const MAX_CACHE = 20;
const CACHE_TTL = 5 * 60 * 1000;
const wikiSearchCache = new Map<string, { data: WikisourceBook[]; ts: number }>();

export interface WikisourceBook {
  pageid: number;
  title: string;
  snippet?: string;
}

export async function searchWikisource(query: string): Promise<WikisourceBook[]> {
  const cached = wikiSearchCache.get(query);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '0',
    srlimit: '10',
    format: 'json',
    origin: '*',
  });

  const response = await fetchWithTimeout(`${WIKISOURCE_API}?${params.toString()}`, {}, 10000);
  if (!response.ok) throw new Error(`Wikisource API hatası: ${response.status}`);
  const data = await response.json();
  const results: WikisourceBook[] = data.query?.search ?? [];

  if (wikiSearchCache.size >= MAX_CACHE) {
    const oldest = wikiSearchCache.keys().next().value;
    if (oldest !== undefined) wikiSearchCache.delete(oldest);
  }
  wikiSearchCache.set(query, { data: results, ts: Date.now() });

  return results;
}

export async function fetchWikisourceText(title: string): Promise<string> {
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'revisions',
    rvprop: 'content',
    rvslots: 'main',
    format: 'json',
    origin: '*',
  });

  const response = await fetchWithTimeout(`${WIKISOURCE_API}?${params.toString()}`, {}, 10000);
  if (!response.ok) throw new Error('Wikisource içeriği alınamadı.');
  const data = await response.json();
  const pages = data.query?.pages ?? {};
  const page = Object.values(pages)[0] as any;
  const content: string = page?.revisions?.[0]?.slots?.main?.['*'] ?? '';

  let cleaned = content;

  // İç içe {{}} şablonlarını iteratif temizle (en içtekinden dışa)
  let prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(/\{\{[^{}]*\}\}/g, '');
  }

  // İç içe [[]] bağlantılarını iteratif temizle
  prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(/\[\[(?:[^|\[\]]*\|)?([^\[\]]*)\]\]/g, '$1');
  }

  return cleaned
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<ref[^/]*\/>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[Kategori:[^\]]*\]\]/g, '')
    .replace(/__TOC__|__NOTOC__/g, '')
    .replace(/={2,}[^=]+=+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
