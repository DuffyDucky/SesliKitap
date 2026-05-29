# Ön Bilgileri Atlama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kitap açılınca asıl metnin başını otomatik tespit edip oradan başlamak; `read_full` / `skip_intro` sesli komutlarıyla ön bilgiler arasında geçiş.

**Architecture:** Saf `findMainTextStart(text)` fonksiyonu (offset döndürür). ReaderScreen ham metni + offset'i saklar, `includeFrontMatter` durumuna göre sayfaları türetir. Gemini intent katmanına iki yeni aksiyon eklenir.

**Tech Stack:** Expo 55 / RN 0.83 / TypeScript. Saf fonksiyon testleri `tsx` + `node:test`.

---

## Dosya Yapısı

- **Create:** `src/utils/frontMatter.ts` — `findMainTextStart` (saf)
- **Create:** `src/utils/frontMatter.test.ts` — birim testler
- **Modify:** `package.json` — test script'i her iki test dosyasını çalıştırsın
- **Modify:** `src/utils/geminiService.ts` — `read_full` + `skip_intro` aksiyonları
- **Modify:** `src/screens/ReaderScreen.tsx` — ham metin + offset durumu, sayfa türetimi, komut işleme

---

## Task 1: findMainTextStart (TDD)

**Files:**
- Modify: `package.json`
- Create: `src/utils/frontMatter.test.ts`
- Create: `src/utils/frontMatter.ts`

- [ ] **Step 1: test script'i iki dosyayı çalıştıracak şekilde güncelle**

`package.json` içindeki `"test"` satırını değiştir:

```json
    "test": "tsx src/sources/archive.test.ts && tsx src/utils/frontMatter.test.ts"
```

- [ ] **Step 2: Failing test yaz**

`src/utils/frontMatter.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMainTextStart } from './frontMatter';

test('bölüm işaretli metin: işaretin konumunu döndürür', () => {
  const text =
    'KAPAK BİLGİSİ\nYazar Adı\nYayınevi 1990\n\n' +
    'BİRİNCİ BÖLÜM\n\n' +
    'Ben o zaman küçük bir kızdım. Babam askerdi ve sık sık yer değiştirirdik. ' +
    'Annemi pek hatırlamıyorum. Çocukluğum hep yollarda, han odalarında ve ' +
    'yabancı şehirlerde geçti. Her yeni yerde her şeye yeniden alışmak gerekirdi.';
  const idx = findMainTextStart(text);
  assert.equal(text.slice(idx).startsWith('BİRİNCİ BÖLÜM'), true);
});

test('işaretsiz + önsözlü metin: ilk uzun düzyazı paragrafını döndürür', () => {
  const front = 'ÇALIKUŞU\nReşat Nuri Güntekin\n1 — Çalıkuşu\n2 — Damga\nMatbaa 1990\n\n';
  const prose =
    'Ben o zaman pek küçük bir kızdım. Babamın memuriyeti yüzünden şehir şehir dolaşırdık ve ' +
    'her gittiğimiz yerde yeni bir okula başlardım. Bu yüzden hiçbir yere tam olarak ısınamadım, ' +
    'arkadaşlıklarım hep yarım kaldı.';
  const text = front + prose;
  const idx = findMainTextStart(text);
  assert.equal(text.slice(idx).startsWith('Ben o zaman pek küçük'), true);
});

test('güvenlik freni: asıl metin %50''den ötedeyse 0 döner', () => {
  const filler = 'x'.repeat(2000); // uzun ön bilgi bloğu (tek paragraf, cümlesiz)
  const text = filler + '\n\nBİRİNCİ BÖLÜM\n\nKısa.';
  assert.equal(findMainTextStart(text), 0);
});

test('boş/kısa metin: 0 döner', () => {
  assert.equal(findMainTextStart(''), 0);
  assert.equal(findMainTextStart('kısa metin'), 0);
});
```

- [ ] **Step 3: Test'in başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module './frontMatter'`.

- [ ] **Step 4: Implementasyonu yaz**

`src/utils/frontMatter.ts`:

```ts
/**
 * Kitap metninde "asıl metnin" (kapak/önsöz/eser listesi sonrası) başladığı
 * karakter konumunu tahmin eder. OCR metni için sezgiseldir; bulamazsa 0 döner.
 */

/** Satırı sade ASCII'ye indirir (bölüm işareti eşleştirmesi için). */
function normLine(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/i̇/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .trim();
}

// "birinci bolum/kisim", "1. bolum", "i. kisim", "bolum 1", "kisim bir" vb.
const MARKER_RE =
  /^(birinci\s+(bolum|kisim)|(1|i)\s*[.\-—]?\s*(bolum|kisim)|(bolum|kisim)\s+(1|i|bir))\b/;

export function findMainTextStart(text: string): number {
  if (!text || text.length < 200) return 0;
  const limit = text.length * 0.5;

  // 1) Bölüm işareti araması (satır bazlı, orijinal offset korunur).
  {
    const lines = text.split('\n');
    let offset = 0;
    for (const line of lines) {
      if (offset > 30 && offset <= limit && MARKER_RE.test(normLine(line))) {
        return offset;
      }
      offset += line.length + 1; // +1: '\n'
    }
  }

  // 2) Fallback: ilk "asıl düzyazı paragrafı".
  {
    let cursor = 0;
    for (const para of text.split(/\n\s*\n/)) {
      const start = text.indexOf(para, cursor);
      if (start < 0) break;
      cursor = start + para.length;
      const sentences = (para.match(/[.!?]/g) || []).length;
      const hasLower = /[a-zçğıöşü]/.test(para);
      if (para.trim().length > 250 && sentences >= 2 && hasLower) {
        return start > limit ? 0 : start;
      }
    }
  }

  return 0;
}
```

- [ ] **Step 5: Test'in geçtiğini doğrula**

Run: `npm test`
Expected: PASS — archive testleri (4) + frontMatter testleri (4) geçer.

- [ ] **Step 6: Commit**

```bash
git add package.json src/utils/frontMatter.ts src/utils/frontMatter.test.ts
git commit -m "feat: findMainTextStart — asıl metin başını tespit (TDD)"
```

---

## Task 2: Gemini intent — read_full + skip_intro

**Files:**
- Modify: `src/utils/geminiService.ts`

- [ ] **Step 1: IntentAction tipine ekle**

`src/utils/geminiService.ts` içindeki `IntentAction` union'ına iki satır ekle
(`| 'go_bookmark';` satırından önce):

```ts
  | 'read_full'
  | 'skip_intro'
```

- [ ] **Step 2: BASE_SYSTEM aksiyon listesine ve örneklere ekle**

`AKSIYONLAR:` listesinde `- "go_bookmark" ...` satırının altına ekle:

```
- "read_full" — kullanıcı ön bilgileri/önsözü de okumak veya en baştan başlamak istiyor
- "skip_intro" — kullanıcı ön bilgileri/önsözü atlayıp asıl metne/hikâyeye geçmek istiyor
```

`ÖRNEKLER:` bloğuna iki örnek ekle:

```
"en baştan oku" → {"action":"read_full","book":null,"page":null,"speech":"Ön bilgiler dahil en baştan başlıyorum."}
"önsözü atla" → {"action":"skip_intro","book":null,"page":null,"speech":"Asıl metne geçiyorum."}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hata yok (exit 0). (`GeminiResponse.action` zaten `IntentAction | ...`
olduğu için yeni aksiyonlar otomatik kapsanır.)

- [ ] **Step 4: Commit**

```bash
git add src/utils/geminiService.ts
git commit -m "feat: read_full + skip_intro sesli komut aksiyonları"
```

---

## Task 3: ReaderScreen — ham metin + offset durumu, sayfa türetimi

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: import ekle**

`import { fetchBookText } from '../sources';` satırının altına ekle:

```ts
import { findMainTextStart } from '../utils/frontMatter';
```

- [ ] **Step 2: yeni durum değişkenleri ekle**

`const [pages, setPages] = useState<string[]>([]);` satırının altına ekle:

```ts
  const [fullText, setFullText] = useState('');
  const [mainStart, setMainStart] = useState(0);
  const [includeFrontMatter, setIncludeFrontMatter] = useState(false);
```

- [ ] **Step 3: load içinde setPages yerine ham metni sakla**

`load` fonksiyonundaki şu bloğu:

```ts
        if (!cancelled) {
          setPages(splitIntoPages(text));
          await announce.bookOpened(bookTitle, 'birinci bölüm');
        }
```

şununla değiştir:

```ts
        if (!cancelled) {
          setIncludeFrontMatter(false);
          setMainStart(findMainTextStart(text));
          setFullText(text);
          await announce.bookOpened(bookTitle, 'birinci bölüm');
        }
```

- [ ] **Step 4: sayfaları türeten effect ekle**

`const currentText = pages[currentPage - 1] ?? '';` satırının HEMEN ÜSTÜNE ekle:

```ts
  // Ham metin / ön bilgi tercihine göre sayfaları türet.
  useEffect(() => {
    if (!fullText) return;
    const body = includeFrontMatter ? fullText : fullText.slice(mainStart);
    setPages(splitIntoPages(body));
  }, [fullText, mainStart, includeFrontMatter]);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hata yok (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: ReaderScreen asıl metinden başlama (offset + sayfa türetimi)"
```

---

## Task 4: ReaderScreen — sesli komut işleme

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: handleVoiceResult switch'ine iki case ekle**

`handleVoiceResult` içindeki `switch (response.action) { ... }` bloğunda,
`case 'go_home':` satırının ÜSTÜNE ekle:

```ts
          case 'read_full':
            setIncludeFrontMatter(true);
            setCurrentPage(1);
            setCurrentWordIndex(0);
            break;
          case 'skip_intro':
            setIncludeFrontMatter(false);
            setCurrentPage(1);
            setCurrentWordIndex(0);
            break;
```

(Gemini yanıtı `response.speech` zaten switch'ten önce sesli okunuyor; ek anons
gerekmez.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hata yok (exit 0).

- [ ] **Step 3: Tüm testler hâlâ geçiyor**

Run: `npm test`
Expected: PASS — 8 test (4 archive + 4 frontMatter).

- [ ] **Step 4: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: read_full/skip_intro komutlarını ReaderScreen'de işle"
```

---

## Manuel Doğrulama (cihazda)

Metro çalışırken, native değişiklik yok — uygulamayı yeniden başlat (force-stop + start).

- [ ] "Çalıkuşu" aç → okuma **kapak/eser listesi/yayın bilgisi olmadan**, asıl
  metne yakın bir yerden başlamalı.
- [ ] Okut → metin hikâyeden geliyor mu.
- [ ] "en baştan oku" de → ön bilgiler dahil sayfa 1'e dönmeli (kapak/liste görünür).
- [ ] "asıl metne geç" / "önsözü atla" de → tekrar kırpılmış metne (sayfa 1) dönmeli.
- [ ] Bölüm işareti olmayan başka bir kitapta da makul bir yerden başladığını gör;
  gerekirse `frontMatter.ts` eşiklerini (250 karakter, %50 fren) kalibre et.
