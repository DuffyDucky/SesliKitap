import { fetchWithTimeout } from './fetchWithTimeout';

export type IntentAction =
  | 'pause'
  | 'resume'
  | 'go_to_page'
  | 'go_to_start'
  | 'set_speed_up'
  | 'set_speed_down'
  | 'next_chapter'
  | 'prev_chapter'
  | 'open_book'
  | 'play'
  | 'help'
  | 'progress'
  | 'set_timer'
  | 'add_bookmark'
  | 'list_bookmarks'
  | 'go_bookmark';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

let conversationHistory: Message[] = [];

const BASE_SYSTEM = `Sen "Voice Book" adlı Türkçe sesli kitap uygulamasının yapay zeka asistanısın.
Kullanıcılar görme engelli bireyler — her yanıtın sesli okunacak, bu yüzden kısa ve net konuş.

GÖREVLERIN:
1. Kullanıcının sesli komutlarını anla ve uygula
2. Kitap öner, kitap hakkında bilgi ver
3. Doğal ve samimi bir şekilde Türkçe sohbet et
4. Her zaman yardımcı ve sabırlı ol

HER YANITINDA mutlaka şu JSON formatını kullan (başka bir şey yazma):
{
  "action": "aksiyon_adı",
  "book": "kitap adı veya null",
  "page": sayı veya null,
  "speech": "kullanıcıya sesli söylenecek Türkçe yanıt"
}

AKSIYONLAR:
- "none" — sadece konuş, bir şey yapma (sohbet, bilgi verme, öneri)
- "pause" — okumayı duraklat
- "resume" — okumaya devam et
- "go_to_page" — belirli sayfaya git (page alanını doldur)
- "go_to_start" — başa dön
- "set_speed_up" — okuma hızını artır
- "set_speed_down" — okuma hızını azalt
- "next_chapter" — sonraki bölüm/sayfa
- "prev_chapter" — önceki bölüm/sayfa
- "open_book" — kitap ara ve aç (book alanını doldur)
- "go_home" — ana ekrana dön
- "go_library" — kitaplığa git
- "help" — kullanıcı yardım istedi, komut listesini oku
- "progress" — kullanıcı neredeyim/kaçıncı sayfa diye sordu
- "set_timer" — uyku zamanlayıcı (page alanına dakika sayısı yaz)
- "add_bookmark" — yer imi ekle
- "list_bookmarks" — yer imlerini listele
- "go_bookmark" — yer imine git (page alanına yer imi indeksi yaz)

ÖRNEKLER:
"merhaba" → {"action":"none","book":null,"page":null,"speech":"Merhaba! Ne yapmak istersiniz?"}
"dur" → {"action":"pause","book":null,"page":null,"speech":"Duraklatıyorum."}
"Kürk Mantolu Madonna aç" → {"action":"open_book","book":"Kürk Mantolu Madonna","page":null,"speech":"Aranıyor."}
"neredeyim" → {"action":"progress","book":null,"page":null,"speech":"Bilgi veriyorum."}

Komut hiçbir aksiyona uymuyorsa, metni kitap adı kabul et ve open_book döndür.
"yardım/komutlar" → help aksiyonu döndür.`;

export interface GeminiResponse {
  action: IntentAction | 'none' | 'go_home' | 'go_library';
  book?: string | null;
  page?: number | null;
  speech: string;
}

export function clearConversation(): void {
  conversationHistory = [];
}

let currentContext = '';

export function setConversationContext(context: string): void {
  currentContext = context;
}

export async function chat(
  userMessage: string,
  appContext?: string
): Promise<GeminiResponse> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    return { action: 'none', speech: 'Yapay zeka bağlantısı kurulamadı.' };
  }

  if (conversationHistory.length > 20) {
    conversationHistory = conversationHistory.slice(-20);
  }

  const ctx = appContext || currentContext;
  const userText = ctx
    ? `[DURUM: ${ctx}]\n${userMessage}`
    : userMessage;

  conversationHistory.push({
    role: 'user',
    parts: [{ text: userText }],
  });

  try {
    const res = await fetchWithTimeout(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: BASE_SYSTEM }] },
        contents: conversationHistory,
        generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
      }),
    }, 15000);

    if (!res.ok) {
      conversationHistory.pop();
      return { action: 'none', speech: 'Şu an bağlanamıyorum, biraz sonra tekrar deneyin.' };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      conversationHistory.pop();
      return { action: 'none', speech: 'Anlayamadım, tekrar söyler misiniz?' };
    }

    conversationHistory.push({ role: 'model', parts: [{ text }] });

    const jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // JSON parse başarısız — regex ile speech alanını çıkarmayı dene
      const speechMatch = jsonStr.match(/"speech"\s*:\s*"([^"]+)"/);
      const actionMatch = jsonStr.match(/"action"\s*:\s*"([^"]+)"/);
      const bookMatch = jsonStr.match(/"book"\s*:\s*"([^"]+)"/);
      const pageMatch = jsonStr.match(/"page"\s*:\s*(\d+)/);

      if (speechMatch) {
        return {
          action: (actionMatch?.[1] as GeminiResponse['action']) || 'none',
          book: bookMatch?.[1] || undefined,
          page: pageMatch ? parseInt(pageMatch[1], 10) : undefined,
          speech: speechMatch[1],
        };
      }

      // Hiçbir şey bulunamadı — ham metni oku
      return { action: 'none', speech: text.slice(0, 200) };
    }

    return {
      action: parsed.action || 'none',
      book: parsed.book || undefined,
      page: parsed.page || undefined,
      speech: parsed.speech || 'İşlem gerçekleştirildi.',
    };
  } catch (error) {
    console.warn('Gemini hatası:', error);
    conversationHistory.pop();
    return { action: 'none', speech: 'Bir sorun oluştu, tekrar deneyin.' };
  }
}
