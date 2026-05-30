# İngilizce-Öncelikli Pivot Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SesliKitap'ı İngilizce-öncelikli yapmak — varsayılan okuma İngilizce (İngilizce TTS), Türkçe sesle açılan global opsiyon (Google Translate), arama Gemini ile kanonik İngilizce başlığa çözülür, archive.org tamamen kaldırılır.

**Architecture:** Tek kaynak Project Gutenberg (İngilizce). Asistan/arayüz daima Türkçe; sadece kitap içeriği dili değişir. Global `@app_language` ayarı (varsayılan `en`) sesle değişir. Arama Gemini'yi, sayfa çevirisi ücretsiz Google Translate'i, niyet yerel ayrıştırıcıyı kullanır — Gemini kotası korunur.

**Tech Stack:** Expo 55 / React Native 0.83 / TypeScript, AsyncStorage, expo-speech, node:test + tsx (saf mantık testleri), tsc --noEmit (native/RN dosyaları için tip kapısı).

---

## Test ve Doğrulama Konvansiyonu

- **Saf mantık** (`localIntent`, `geminiService.resolveEnglishTitle`): `node:test` + `tsx` ile birim testi. Tek dosya çalıştırma: `npx tsx <path>`. Tüm suite: `npm test`.
- **Native/RN dosyaları** (`bookStorage`/AsyncStorage, `tts`/expo-speech, `HomeScreen`/`ReaderScreen`): mevcut kod tabanında birim testi YOK (ör. `saveSpeed`/`loadSpeed` test edilmiyor). Bunların doğrulama kapısı `npx tsc --noEmit` (tip hatası + dangling import yakalar). Bu, kod tabanının yerleşik desenidir; bilerek bu desene uyuyoruz.

---

## Task 1: archive.org kaynağını kaldır

**Files:**
- Modify: `src/sources/index.ts`
- Delete: `src/sources/archive.ts`
- Delete: `src/sources/archive.test.ts`
- Modify: `package.json` (test script)

- [ ] **Step 1: `index.ts`'ten archive'i çıkar**

`src/sources/index.ts` içinde import satırını ve SOURCES dizisini güncelle. Şu satırı sil:

```ts
import { archiveSource } from './archive';
```

Yorum + SOURCES satırlarını şununla değiştir:

```ts
// Tek kaynak: Project Gutenberg (İngilizce tam metin).
// Türkçe okuma istenirse ReaderScreen sayfayı Google Translate ile çevirir.
const SOURCES: BookSource[] = [gutenbergSource];
```

`fetchBookText` JSDoc'undaki `"archive:identifier"` örneğini `"gutenberg:1234"` yap (satır ~59):

```ts
/**
 * "gutenberg:1234" formatındaki global ID'den temiz metin getirir.
 * Önce cache'e bakar; yoksa kaynaktan çekip cache'ler.
 */
```

- [ ] **Step 2: archive dosyalarını sil**

```bash
git rm src/sources/archive.ts src/sources/archive.test.ts
```

- [ ] **Step 3: `package.json` test script'inden archive.test'i çıkar**

`src/sources/archive.test.ts && ` parçasını kaldır. Yeni script:

```json
"test": "tsx src/utils/frontMatter.test.ts && tsx src/sources/gutenbergText.test.ts && tsx src/utils/textChunk.test.ts && tsx src/utils/localIntent.test.ts"
```

- [ ] **Step 4: Suite yeşil mi + tip kapısı**

Run: `npm test`
Expected: 4 test dosyası çalışır, hepsi PASS, archive referansı yok.

Run: `npx tsc --noEmit`
Expected: Hata yok (index.ts'te archive import'u kalmadı).

- [ ] **Step 5: Commit**

```bash
git add src/sources/index.ts package.json
git commit -m "feat: archive.org kaynağını kaldır — tek kaynak Gutenberg"
```

---

## Task 2: Gemini ile kanonik İngilizce başlık çözümü

**Files:**
- Modify: `src/utils/fetchWithTimeout.ts` (sızan timer'ı temizle)
- Modify: `src/utils/geminiService.ts` (yeni `resolveEnglishTitle`)
- Create: `src/utils/geminiService.test.ts`
- Modify: `src/sources/gutenberg.ts` (yeni çözücüyü kullan)
- Modify: `src/utils/translator.ts` (`translateTitleToEnglish` kaldır)
- Modify: `package.json` (yeni test dosyası)

- [ ] **Step 1: `fetchWithTimeout` zaman aşımı timer'ını temizle**

`resolveEnglishTitle` testi gerçek `fetchWithTimeout`'u çağırır; mevcut hali fetch çözülse bile 15sn'lik timer'ı bırakır → node process geç çıkar (test görünüşte asılır). `Promise.race` sonrası timer'ı temizle. `src/utils/fetchWithTimeout.ts` içeriğini şununla değiştir:

```ts
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 10000
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Bağlantı zaman aşımına uğradı (${timeoutMs / 1000}s)`)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([fetch(url, options), timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
```

- [ ] **Step 2: Failing test yaz**

`src/utils/geminiService.test.ts` oluştur:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

// resolveEnglishTitle gerçek bir Gemini anahtarı görmeli; modül yüklenmeden ÖNCE ayarla.
process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-key';

function mockFetch(payload: unknown, ok = true, status = 200): void {
  (globalThis as any).fetch = async () => ({
    ok,
    status,
    json: async () => payload,
  });
}

test('resolveEnglishTitle: Türkçe başlık → kanonik İngilizce', async () => {
  mockFetch({ candidates: [{ content: { parts: [{ text: 'Crime and Punishment' }] } }] });
  const { resolveEnglishTitle } = await import('./geminiService');
  assert.equal(await resolveEnglishTitle('suç ve ceza'), 'Crime and Punishment');
});

test('resolveEnglishTitle: tırnakları temizler', async () => {
  mockFetch({ candidates: [{ content: { parts: [{ text: '"Les Misérables"' }] } }] });
  const { resolveEnglishTitle } = await import('./geminiService');
  assert.equal(await resolveEnglishTitle('sefiller'), 'Les Misérables');
});

test('resolveEnglishTitle: 429 → girdi sorgusu fallback', async () => {
  mockFetch({}, false, 429);
  const { resolveEnglishTitle } = await import('./geminiService');
  assert.equal(await resolveEnglishTitle('suç ve ceza'), 'suç ve ceza');
});

test('resolveEnglishTitle: boş yanıt → fallback', async () => {
  mockFetch({ candidates: [] });
  const { resolveEnglishTitle } = await import('./geminiService');
  assert.equal(await resolveEnglishTitle('beyaz diş'), 'beyaz diş');
});
```

- [ ] **Step 3: Test fail mı**

Run: `npx tsx src/utils/geminiService.test.ts`
Expected: FAIL — `resolveEnglishTitle` export'u yok ("does not provide an export named 'resolveEnglishTitle'").

- [ ] **Step 4: `resolveEnglishTitle` implement et**

`src/utils/geminiService.ts` sonuna (son `}` öncesi, `chat` fonksiyonundan sonra) ekle:

```ts
/**
 * Türkçe (veya herhangi bir dildeki) kitap adını kanonik İNGİLİZCE eser
 * başlığına çevirir — Gutenberg araması için. Intent JSON akışından ve
 * conversationHistory'den bağımsız tek-atış istek. Hata/kota/boş yanıtta
 * girdi sorgusunu olduğu gibi döndürür (çökme yok).
 */
export async function resolveEnglishTitle(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return query;
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') return q;

  const prompt =
    'Aşağıdaki kitap adının KANONİK İNGİLİZCE başlığını ver. ' +
    'Sadece başlığı yaz, başka hiçbir şey ekleme. ' +
    'Zaten İngilizceyse veya emin değilsen olduğu gibi tekrarla.\n\n' +
    `Kitap: ${q}`;

  try {
    const res = await fetchWithTimeout(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 40 },
      }),
    }, 15000);

    if (!res.ok) return q;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return q;

    const title = text.replace(/^["'`]+|["'`]+$/g, '').split('\n')[0].trim();
    return title.length > 0 && title.length < 120 ? title : q;
  } catch {
    return q;
  }
}
```

- [ ] **Step 5: Test pass mı**

Run: `npx tsx src/utils/geminiService.test.ts`
Expected: 4 test PASS.

- [ ] **Step 6: `gutenberg.ts`'i yeni çözücüye bağla**

`src/sources/gutenberg.ts` import satırını değiştir:

```ts
import { resolveEnglishTitle } from '../utils/geminiService';
```

`search` içindeki çağrıyı değiştir (satır ~22):

```ts
    let q = query;
    try {
      q = await resolveEnglishTitle(query);
    } catch {
      q = query;
    }
```

- [ ] **Step 7: `translator.ts`'ten `translateTitleToEnglish`'i kaldır**

`src/utils/translator.ts` sonundaki şu fonksiyonu (satır ~73-83) tamamen sil:

```ts
/** Türkçe kitap adını Gutenberg araması için İngilizceye çevirir. */
export async function translateTitleToEnglish(turkishTitle: string): Promise<string> {
  ...
}
```

Dosya başındaki JSDoc'tan `translateTitleToEnglish` maddesini (satır ~7-9) çıkar; `translateToTurkish` açıklaması kalsın:

```ts
/**
 * Çeviri yardımcısı — ÜCRETSİZ/keysiz Google Translate web uç noktasını
 * kullanır (Gemini DEĞİL). Gemini'nin günlük kotası (20 istek/gün) sesli
 * komut/arama anlamaya kalsın diye sayfa çevirisi ayrı servise taşındı.
 *
 * - translateToTurkish: okunan SAYFAYI İngilizceden Türkçeye çevirir (parçalı,
 *   bellek + AsyncStorage önbellekli).
 */
```

- [ ] **Step 8: `package.json` test script'ine yeni test dosyasını ekle**

```json
"test": "tsx src/utils/frontMatter.test.ts && tsx src/sources/gutenbergText.test.ts && tsx src/utils/textChunk.test.ts && tsx src/utils/localIntent.test.ts && tsx src/utils/geminiService.test.ts"
```

- [ ] **Step 9: Suite + tip kapısı**

Run: `npm test`
Expected: 5 test dosyası PASS.

Run: `npx tsc --noEmit`
Expected: Hata yok (gutenberg.ts yeni import'u çözüyor, translator.ts'te dangling referans yok).

- [ ] **Step 10: Commit**

```bash
git add src/utils/fetchWithTimeout.ts src/utils/geminiService.ts src/utils/geminiService.test.ts src/sources/gutenberg.ts src/utils/translator.ts package.json
git commit -m "feat: arama başlığını Gemini ile kanonik İngilizceye çevir"
```

---

## Task 3: Global dil ayarı deposu

**Files:**
- Modify: `src/store/bookStorage.ts`

- [ ] **Step 1: `getLanguage`/`setLanguage` ekle**

`src/store/bookStorage.ts` üstündeki anahtar sabitlerinin yanına ekle (satır ~4):

```ts
const LANGUAGE_KEY = '@app_language';
```

Dosya sonuna (loadSpeed'den sonra) ekle:

```ts
export type AppLanguage = 'en' | 'tr';

/** Global okuma dili. Kayıtlı değer yoksa varsayılan 'en' (İngilizce). */
export async function getLanguage(): Promise<AppLanguage> {
  const val = await AsyncStorage.getItem(LANGUAGE_KEY);
  return val === 'tr' ? 'tr' : 'en';
}

/** Global okuma dilini kalıcı olarak ayarlar. */
export async function setLanguage(lang: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}
```

- [ ] **Step 2: Tip kapısı**

Run: `npx tsc --noEmit`
Expected: Hata yok.

(Birim testi yok — `saveSpeed`/`loadSpeed` ile aynı AsyncStorage sarmalayıcı deseni; kod tabanı bunları test etmiyor.)

- [ ] **Step 3: Commit**

```bash
git add src/store/bookStorage.ts
git commit -m "feat: global okuma dili ayarı (getLanguage/setLanguage, varsayılan en)"
```

---

## Task 4: `set_language` sesli komutu

**Files:**
- Modify: `src/utils/geminiService.ts` (`IntentAction` + `GeminiResponse.lang`)
- Modify: `src/utils/localIntent.ts` (komut kuralları)
- Modify: `src/utils/localIntent.test.ts` (testler)
- Modify: `src/screens/HomeScreen.tsx` (dispatch)

- [ ] **Step 1: Failing testler yaz**

`src/utils/localIntent.test.ts` sonuna ekle:

```ts
test('"dili türkçe yap" → set_language tr', () => {
  const r = parseLocalIntent('dili türkçe yap');
  assert.equal(r.action, 'set_language');
  assert.equal(r.lang, 'tr');
});

test('"türkçe oku" → set_language tr (kitap açma değil)', () => {
  const r = parseLocalIntent('türkçe oku');
  assert.equal(r.action, 'set_language');
  assert.equal(r.lang, 'tr');
});

test('"dili ingilizce yap" → set_language en', () => {
  const r = parseLocalIntent('dili ingilizce yap');
  assert.equal(r.action, 'set_language');
  assert.equal(r.lang, 'en');
});

test('"ingilizce oku" → set_language en', () => {
  const r = parseLocalIntent('ingilizce oku');
  assert.equal(r.action, 'set_language');
  assert.equal(r.lang, 'en');
});

test('regresyon: "Sefiller oku" → hâlâ open_book', () => {
  const r = parseLocalIntent('Sefiller oku');
  assert.equal(r.action, 'open_book');
  assert.equal(r.book, 'Sefiller');
});
```

- [ ] **Step 2: Test fail mı**

Run: `npx tsx src/utils/localIntent.test.ts`
Expected: FAIL — yeni dil testleri `set_language` yerine `open_book`/`unknown` alır; `lang` undefined.

- [ ] **Step 3: Tip birliğini ekle (`geminiService.ts`)**

`IntentAction` union'ına `'set_language'` ekle (satır ~3-21 arası, listenin sonuna):

```ts
  | 'go_bookmark'
  | 'set_language';
```

`GeminiResponse` arayüzüne `lang` alanı ekle (satır ~84-89):

```ts
export interface GeminiResponse {
  action: IntentAction | 'none' | 'go_home' | 'go_library' | 'unknown';
  book?: string | null;
  page?: number | null;
  lang?: 'en' | 'tr';
  speech: string;
}
```

- [ ] **Step 4: `localIntent.ts`'e dil kurallarını ekle**

`parseLocalIntent` içinde, boş kontrolünden HEMEN SONRA (satır ~41, `if (!t) return ...` ardından), kitap-açma kurallarından ÖNCE ekle. norm() Türkçe karakterleri sadeleştirir ("türkçe"→"turkce"); bu yüzden ASCII kalıplar kullan:

```ts
  // 0) Okuma dili değiştirme (kitap-açma kuralından ÖNCE — "...oku" çakışmasın).
  // Kalıplar DAR tutulur: bare "cevir" ("sayfayı çevir") veya "orijinal dil"
  // ("orijinal dil nedir") gibi yaygın ifadeleri yanlış yakalamamak için.
  if (/\b(turkce oku|dili turkce|turkceye cevir|turkce dinle)\b/.test(t)) {
    return { action: 'set_language', lang: 'tr', speech: 'Okuma dili Türkçe olarak ayarlandı.' };
  }
  if (/\b(ingilizce oku|dili ingilizce|ingilizce dinle|orijinal dile|orijinalinden)\b/.test(t)) {
    return { action: 'set_language', lang: 'en', speech: 'Okuma dili İngilizce olarak ayarlandı.' };
  }
```

- [ ] **Step 5: Testler pass mı (yeni + regresyon)**

Run: `npx tsx src/utils/localIntent.test.ts`
Expected: Tüm testler PASS (yeni 5 dil testi + mevcut 14 test; "Sefiller oku" hâlâ open_book).

- [ ] **Step 6: `HomeScreen.tsx`'te `set_language`'i dispatch et**

`src/screens/HomeScreen.tsx` import satırına `setLanguage` ekle (satır ~16-17 civarı, mevcut import'lara):

```ts
import { setLanguage } from '../store/bookStorage';
```

`handleVoiceResult` switch'ine, `case 'go_library':`'den önce yeni case ekle (satır ~91):

```ts
          case 'set_language':
            if (response.lang) {
              await setLanguage(response.lang);
              setLastResponse(response.speech);
              await speak(response.speech);
            }
            break;
```

- [ ] **Step 7: Tip kapısı + suite**

Run: `npx tsc --noEmit`
Expected: Hata yok (set_language tipi tanınıyor, HomeScreen lang'i kullanıyor).

Run: `npm test`
Expected: 5 dosya PASS.

- [ ] **Step 8: Commit**

```bash
git add src/utils/geminiService.ts src/utils/localIntent.ts src/utils/localIntent.test.ts src/screens/HomeScreen.tsx
git commit -m "feat: sesli dil değiştirme komutu (türkçe/ingilizce oku)"
```

---

## Task 5: TTS — içerik diline göre ses

**Files:**
- Modify: `src/utils/tts.ts`

- [ ] **Step 1: Dil-başına ses seçimi + `setContentLanguage`**

`src/utils/tts.ts` başındaki sabitleri ve ses yükleyiciyi değiştir. Satır 4-41 arasını şununla değiştir:

```ts
const ASSISTANT_LANGUAGE = 'tr-TR'; // asistan anonsları DAİMA Türkçe
let currentRate = 1.0;
let contentLanguage: 'en' | 'tr' = 'en'; // okunan kitap içeriğinin dili
let loadPromise: Promise<void> | null = null;

// Dil başına seçili ses kimliği.
const selectedVoice: Record<'tr' | 'en', string | undefined> = {
  tr: undefined,
  en: undefined,
};

/** Bir dil önekine (tr/en) uyan en iyi sesi seçer: Samsung > Google > ilk. */
function pickVoice(
  voices: Speech.Voice[],
  prefix: 'tr' | 'en'
): string | undefined {
  const matches = voices.filter((v) => v.language?.startsWith(prefix));
  if (matches.length === 0) return undefined;
  const samsung = matches.find((v) => v.identifier?.toLowerCase().includes('samsung'));
  const google = matches.find((v) => v.identifier?.toLowerCase().includes('google'));
  return (samsung || google || matches[0]).identifier;
}

/** Cihazdaki Türkçe ve İngilizce en iyi sesleri tek seferde tarar ve cache'ler. */
function loadBestVoices(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      selectedVoice.tr = pickVoice(voices, 'tr');
      selectedVoice.en = pickVoice(voices, 'en');
      console.log('Seçilen sesler:', selectedVoice);
    } catch (e) {
      console.warn('Ses listesi alınamadı:', e);
    }
  })();
  return loadPromise;
}

/** Okunan kitap içeriğinin dilini belirler (speakBook bunu kullanır). */
export function setContentLanguage(lang: 'en' | 'tr'): void {
  contentLanguage = lang;
}

// Uygulama başladığında sesleri ve hız ayarını yükle
loadBestVoices();
loadSpeed().then((saved) => {
  if (saved !== null) currentRate = saved;
});
```

- [ ] **Step 2: `speak` (asistan) — daima Türkçe**

`speak` fonksiyonunu güncelle (eski `loadBestVoice()` → `loadBestVoices()`, dil/ses sabitle):

```ts
export async function speak(text: string, rate?: number): Promise<void> {
  await loadBestVoices();
  await Speech.stop();
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: ASSISTANT_LANGUAGE,
      voice: selectedVoice.tr,
      rate: rate ?? currentRate,
      pitch: 1.0,
      onDone: resolve,
      onError: (error) => {
        console.warn('TTS speak hatası:', error);
        reject(error);
      },
    });
  });
}
```

- [ ] **Step 3: `speakBook` (kitap) — içerik dili**

`speakBook` fonksiyonunu güncelle:

```ts
export async function speakBook(text: string, rate?: number): Promise<void> {
  await loadBestVoices();
  await Speech.stop();
  const language = contentLanguage === 'tr' ? 'tr-TR' : 'en-US';
  return new Promise((resolve) => {
    Speech.speak(text, {
      language,
      voice: selectedVoice[contentLanguage],
      rate: rate ?? currentRate,
      pitch: 1.0,
      onDone: resolve,
      onError: (error) => {
        console.warn('TTS speakBook hatası:', error);
        resolve();
      },
    });
  });
}
```

- [ ] **Step 4: Tip kapısı**

Run: `npx tsc --noEmit`
Expected: Hata yok. (`Speech.Voice` tipi expo-speech'ten gelir; `DEFAULT_LANGUAGE` referansı kalmadı.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/tts.ts
git commit -m "feat: TTS içerik diline göre ses (en/tr); asistan daima Türkçe"
```

---

## Task 6: Okuma ekranı — dile bağlı çeviri

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: İçe aktarmaları güncelle**

`src/screens/ReaderScreen.tsx` import'larına ekle/güncelle:

```ts
import { getLanguage } from '../store/bookStorage';
import { speakBook, stopSpeaking, getRate, speak, announce, setContentLanguage } from '../utils/tts';
```

(`getBook, updateLastPage` zaten `../store/bookStorage`'dan geliyor — `getLanguage`'i o satıra ekle.)

- [ ] **Step 2: Sabit `needsTranslation` yerine dil state'i**

Satır 42'deki şu satırı sil:

```ts
  const needsTranslation = bookId.startsWith('gutenberg:');
```

Yerine state ekle (diğer `useState`'lerin yanına, satır ~40):

```ts
  // Global okuma dili: 'tr' ise sayfa Google Translate ile çevrilir, 'en' ise ham okunur.
  const [needsTranslation, setNeedsTranslation] = useState(false);
```

- [ ] **Step 3: Mount'ta dili oku, TTS içerik dilini ayarla**

Kitap yükleme `useEffect`'inden ÖNCE yeni bir `useEffect` ekle (satır ~51, ilk effect'in hemen üstüne):

```ts
  // Global dil ayarını yükle; TTS içerik dilini ve çeviri ihtiyacını belirle.
  useEffect(() => {
    let cancelled = false;
    getLanguage().then((lang) => {
      if (cancelled) return;
      setNeedsTranslation(lang === 'tr');
      setContentLanguage(lang === 'tr' ? 'tr' : 'en');
    });
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 4: Tip kapısı**

Run: `npx tsc --noEmit`
Expected: Hata yok. `needsTranslation` artık state; mevcut kullanım yerleri (`currentText`, çeviri effect'i, `readFromCurrent` guard'ı, dependency array'ler) değişmeden çalışır — değer `true` iken bugünkü Türkçe davranışı, `false` iken ham İngilizce sayfa + İngilizce ses.

- [ ] **Step 5: Manuel doğrulama notu (opsiyonel, cihazda)**

Varsayılan (`en`): kitap açıldığında sayfa ham İngilizce görünür, "Çevriliyor" göstergesi çıkmaz, İngilizce sesle okunur.
Ana ekranda "dili türkçe yap" dedikten sonra açılan kitap: sayfa Türkçeye çevrilir (gösterge görünür), Türkçe sesle okunur.

- [ ] **Step 6: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: okuma dili ayarına göre çeviri (en ham, tr çevrili)"
```

---

## Task 7: Dokümantasyon güncellemesi

**Files:**
- Modify: `PROJECT.md`

- [ ] **Step 1: `PROJECT.md` başlık ve kaynak bölümlerini güncelle**

Satır 3'teki açıklamayı güncelle:

```md
Görme engelli kullanıcılar için sesli komutla yönetilen sesli kitap uygulaması. Varsayılan okuma dili İngilizce (Project Gutenberg); istenirse sesli komutla Türkçe çeviriye geçilir.
```

`## Kitap Kaynakları` / mimari bölümünde archive.org satırlarını kaldır, tek kaynağı belirt:

```md
## Kitap Kaynakları
- Project Gutenberg (İngilizce tam metin, HTML arama scraping)
- Arama: Türkçe başlık → Gemini ile kanonik İngilizce başlık
- Türkçe okuma (opsiyonel): sayfa sayfa ücretsiz Google Translate
```

- [ ] **Step 2: Commit**

```bash
git add PROJECT.md
git commit -m "docs: PROJECT.md İngilizce-öncelikli mimariye güncellendi"
```

---

## Tamamlanma Kontrolü

Tüm task'lar bittiğinde:

- [ ] `npm test` → 5 dosya PASS (frontMatter, gutenbergText, textChunk, localIntent, geminiService)
- [ ] `npx tsc --noEmit` → hata yok
- [ ] `git grep -n archive src/` → sonuç yok (silindi)
- [ ] `git grep -n translateTitleToEnglish src/` → sonuç yok (kaldırıldı)
