/**
 * Çeviri yardımcısı — ÜCRETSİZ/keysiz Google Translate web uç noktasını
 * kullanır (Gemini DEĞİL). Gemini'nin günlük kotası (20 istek/gün) sesli
 * komut/arama anlamaya kalsın diye sayfa çevirisi ayrı servise taşındı.
 *
 * - translateToTurkish: okunan SAYFAYI İngilizceden Türkçeye çevirir (parçalı,
 *   bellek + AsyncStorage önbellekli).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from './fetchWithTimeout';
import { chunkText } from './textChunk';

const GT_URL = 'https://translate.googleapis.com/translate_a/single';

/** Önbellek anahtarı için kısa, çakışması düşük hash (djb2). */
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

const memCache = new Map<string, string>();

/** Tek bir metin parçasını çevirir (parça URL sınırının altında olmalı). */
async function gtranslate(text: string, sl: string, tl: string): Promise<string> {
  const url = `${GT_URL}?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetchWithTimeout(url, {}, 15000);
  if (!res.ok) throw new Error(`Çeviri servisi hatası: ${res.status}`);
  const data = await res.json();
  // data[0] = [[çevrilmiş, orijinal, ...], ...]
  const segs: any[] = Array.isArray(data?.[0]) ? data[0] : [];
  return segs.map((seg) => (seg && seg[0]) ? seg[0] : '').join('');
}

/** Bir sayfa İngilizce metni Türkçeye çevirir (parçalı + önbellekli). */
export async function translateToTurkish(englishText: string): Promise<string> {
  const trimmed = englishText.trim();
  if (!trimmed) return englishText;

  const key = hashKey(trimmed);
  if (memCache.has(key)) return memCache.get(key)!;

  try {
    const stored = await AsyncStorage.getItem(`@tr:${key}`);
    if (stored) {
      memCache.set(key, stored);
      return stored;
    }
  } catch {
    // AsyncStorage okunamadı — çevirip devam et
  }

  const chunks = chunkText(trimmed, 1500);
  const parts: string[] = [];
  for (const c of chunks) {
    parts.push(await gtranslate(c, 'en', 'tr'));
  }
  const tr = parts.join('');

  memCache.set(key, tr);
  try {
    await AsyncStorage.setItem(`@tr:${key}`, tr);
  } catch {
    // önbelleğe yazılamadı — sorun değil
  }
  return tr;
}

