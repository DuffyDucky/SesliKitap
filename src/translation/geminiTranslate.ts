/**
 * Tek bir metin bloğunu Gemini 3.1 Flash Lite ile İngilizceden Türkçeye çevirir.
 * geminiService.ts'ten ayrıdır (o niyet/sohbet için). Sadece çeviri yapar.
 * 429 alırsa bir kez (5 sn sonra) yeniden dener — emniyet kemeri.
 */
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-flash-lite-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/** PC pipeline (Python) ile BİREBİR aynı tutulmalı. */
export const TRANSLATE_PROMPT =
  'Bu İngilizce metni edebî, akıcı Türkçeye çevir. Paragraf yapısını ' +
  '(boş satırları) koru. Sadece çeviriyi yaz; açıklama, başlık veya not ekleme.';

export async function translateBlock(english: string, retryOn429 = true): Promise<string> {
  if (!english.trim()) return english;
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('Gemini anahtarı ayarlı değil');
  }

  const res = await fetchWithTimeout(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: TRANSLATE_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: english }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    }),
  }, 30000);

  if (!res.ok) {
    if (res.status === 429 && retryOn429) {
      await new Promise((r) => setTimeout(r, 5000));
      return translateBlock(english, false);
    }
    throw new Error(`Çeviri hatası: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Çeviri boş döndü');
  return String(text).trim();
}
