/**
 * Keysiz Google Translate (translate_a/single) ile EN→TR çeviri. Gemini bir
 * bloğu reddettiğinde (PROHIBITED_CONTENT) veya boş/zaman aşımı döndüğünde
 * fallback olarak kullanılır. Uzun metni ~1500 karakterlik parçalara böler
 * (parça birleşimi orijinale eşittir → kayıp yok). Hata durumunda fırlatır.
 */
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const GT_URL = 'https://translate.googleapis.com/translate_a/single';

/** Metni ~maxLen'lik parçalara böler; mümkünse boşluk sınırından, kayıpsız. */
export function chunkForTranslate(text: string, maxLen = 1500): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxLen, text.length);
    if (end < text.length) {
      // Son boşluğa geri çekil (kelime ortasından bölme). end-1'den ara ki
      // boşluk tam sınırda olsa bile parça maxLen'i aşmasın.
      const lastSpace = text.lastIndexOf(' ', end - 1);
      if (lastSpace > i) end = lastSpace + 1; // boşluğu önceki parçada bırak
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

async function translateChunk(chunk: string): Promise<string> {
  const url = `${GT_URL}?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(chunk)}`;
  const res = await fetchWithTimeout(url, {}, 15000);
  if (!res.ok) throw new Error(`Google Translate hatası: ${res.status}`);
  const data = await res.json();
  const segments = data?.[0];
  if (!Array.isArray(segments)) throw new Error('Google Translate boş yanıt');
  return segments.map((s: any) => s?.[0] ?? '').join('');
}

export async function googleTranslate(english: string): Promise<string> {
  if (!english.trim()) return english;
  const chunks = chunkForTranslate(english);
  let out = '';
  for (const c of chunks) {
    out += await translateChunk(c);
  }
  return out;
}
