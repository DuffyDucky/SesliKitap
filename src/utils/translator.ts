/**
 * Gemini ile çeviri yardımcıları.
 * - translateToTurkish: okunan SAYFAYI İngilizceden Türkçeye çevirir (lazy,
 *   bellek + AsyncStorage önbellekli). Tüm kitap bir anda çevrilmez → API
 *   limitine takılmaz.
 * - translateTitleToEnglish: Gutenberg araması için Türkçe başlığı İngilizceye
 *   çevirir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout } from './fetchWithTimeout';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/** Önbellek anahtarı için kısa, çakışması düşük hash (djb2). */
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

const memCache = new Map<string, string>();

async function geminiText(prompt: string, maxTokens: number): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('Gemini API anahtarı yok');
  }
  const res = await fetchWithTimeout(
    GEMINI_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
      }),
    },
    20000
  );
  if (!res.ok) throw new Error(`Gemini hata: ${res.status}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!out) throw new Error('Gemini boş yanıt');
  return out;
}

/** Bir sayfa İngilizce metni Türkçeye çevirir (önbellekli). */
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
    // AsyncStorage okunamadı — devam et, çevirip yeniden dene
  }

  const prompt =
    'Aşağıdaki İngilizce kitap metnini akıcı ve edebi bir Türkçeye çevir. ' +
    'SADECE çeviriyi yaz; açıklama, başlık, dipnot veya "İşte çeviri" gibi bir ifade ekleme.\n\n' +
    trimmed;
  const tr = await geminiText(prompt, 2048);

  memCache.set(key, tr);
  try {
    await AsyncStorage.setItem(`@tr:${key}`, tr);
  } catch {
    // önbelleğe yazılamadı — sorun değil
  }
  return tr;
}

/** Türkçe kitap adını Gutenberg araması için İngilizceye çevirir. */
export async function translateTitleToEnglish(turkishTitle: string): Promise<string> {
  const t = turkishTitle.trim();
  if (!t) return t;
  try {
    const out = await geminiText(
      'Bu kitap adını İngilizceye çevir. SADECE İngilizce adı yaz, başka hiçbir şey yazma:\n' + t,
      60
    );
    const clean = out.replace(/^["']+|["']+$/g, '').split('\n')[0].trim();
    return clean.length > 0 && clean.length < 120 ? clean : t;
  } catch {
    return t;
  }
}
