/**
 * Internet Archive (archive.org) Türkçe kaynağı.
 * advancedsearch API ile arama, metadata'dan .txt dosyasını bulup indirir.
 * OCR metnini temizler ve kalite kapısından geçirir.
 */
import { BookSource, BookSearchResult } from './types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const ADV = 'https://archive.org/advancedsearch.php';
const META = 'https://archive.org/metadata';
const DL = 'https://archive.org/download';
const MIN_TEXT_LENGTH = 1000;
const VALID_RATIO_THRESHOLD = 0.85;

/** OCR metnini okumadan önce sadeleştirir: sayfa no satırları, fazla boşluk vb. */
export function cleanArchiveText(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => {
      const t = line.trim();
      if (/^\d{1,4}$/.test(t)) return false; // yalnızca sayfa numarası
      if (/^[IVXLCDM]{2,7}$/i.test(t)) return false; // yalnızca Romen rakamı
      return true;
    })
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ') // satır içi fazla boşluk
    .replace(/\n{3,}/g, '\n\n') // 3+ boş satır → 2
    .trim();
}

/** Metindeki 'geçerli' karakter oranı (Türkçe harf, rakam, boşluk, temel noktalama). */
export function validCharRatio(text: string): number {
  if (!text) return 0;
  const valid = (text.match(/[a-zA-ZçğıöşüÇĞİÖŞÜâîûÂÎÛ0-9\s.,;:!?'"()\-–—…\n]/g) || []).length;
  return valid / text.length;
}

function pickField(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return fallback;
}

/** Türkçe harfleri sade ASCII'ye indir + küçült (alaka sıralaması için). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Başlıkta geçen sorgu kelimesi sayısı — yüksek skor = daha alakalı. */
function titleScore(title: string, qTokens: string[]): number {
  const nt = norm(title);
  return qTokens.reduce((acc, t) => acc + (nt.includes(t) ? 1 : 0), 0);
}

export const archiveSource: BookSource = {
  name: 'archive',

  async search(query: string): Promise<BookSearchResult[]> {
    // archive.org dil kodunu çoğunlukla "tur" (ISO 639-2) olarak saklar; bazıları "Turkish".
    const q = `(${query}) AND mediatype:texts AND language:(tur OR Turkish OR Turkce)`;
    const url =
      `${ADV}?q=${encodeURIComponent(q)}` +
      `&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=format` +
      `&rows=15&output=json`;
    try {
      const res = await fetchWithTimeout(url, {}, 12000);
      if (!res.ok) return [];
      const data = await res.json();
      const docs: any[] = data?.response?.docs ?? [];
      const qTokens = norm(query).split(' ').filter((t) => t.length >= 2);
      const results = docs
        .filter((d) => {
          const fmt = Array.isArray(d.format) ? d.format : d.format ? [d.format] : [];
          return fmt.some((f: string) => /djvutxt|^text$/i.test(String(f)));
        })
        .map((d) => ({
          id: `archive:${d.identifier}`,
          title: pickField(d.title, String(d.identifier)),
          author: pickField(d.creator, 'Bilinmiyor'),
          source: 'archive',
          sourceId: String(d.identifier),
        }));
      // Başlığı sorguya en çok uyan sonuçları öne al (alaka sıralaması).
      results.sort((a, b) => titleScore(b.title, qTokens) - titleScore(a.title, qTokens));
      return results;
    } catch (e) {
      console.warn('[archive] arama hatası:', e);
      return [];
    }
  },

  async fetchText(sourceId: string): Promise<string> {
    const metaRes = await fetchWithTimeout(`${META}/${encodeURIComponent(sourceId)}`, {}, 12000);
    if (!metaRes.ok) throw new Error('Archive metadata alınamadı');
    const meta = await metaRes.json();
    const files: any[] = meta?.files ?? [];

    const txtFile =
      files.find((f) => /_djvu\.txt$/i.test(String(f.name))) ||
      files.find((f) => /\.txt$/i.test(String(f.name)) && f.format !== 'Metadata');
    if (!txtFile) throw new Error('Archive metin dosyası bulunamadı');

    const dlUrl = `${DL}/${encodeURIComponent(sourceId)}/${encodeURIComponent(txtFile.name)}`;
    const dlRes = await fetchWithTimeout(dlUrl, {}, 20000);
    if (!dlRes.ok) throw new Error('Archive metni indirilemedi');
    const raw = await dlRes.text();

    const cleaned = cleanArchiveText(raw);
    if (cleaned.length < MIN_TEXT_LENGTH || validCharRatio(cleaned) < VALID_RATIO_THRESHOLD) {
      throw new Error('Archive metni kalite kapısından geçemedi');
    }
    return cleaned;
  },
};
