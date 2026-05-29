# archive.org Türkçe Kaynak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çeviri akışını kaldırıp archive.org'u tek Türkçe tam-metin kaynağı yapmak; OCR temizliği + kalite kapısıyla "abuk subuk" sonuçları elemek.

**Architecture:** `src/sources/archive.ts` içinde `BookSource` arayüzünü uygulayan yeni bir kaynak (arama + metadata'dan `.txt` bulma + temizlik + kalite kapısı). Ekranlar `src/sources/index.ts`'in `searchBook()`/`fetchBookText()` birleşik API'sine bağlanır. İngilizce/Gutenberg yolu silinir. Gemini yalnızca komut anlama için kalır.

**Tech Stack:** Expo 55 / React Native 0.83 / TypeScript. Saf fonksiyon birim testleri `tsx` + Node `node:test` ile. Ağ kodu cihazda elle doğrulanır.

---

## Dosya Yapısı

- **Create:** `src/sources/archive.ts` — `archiveSource` + saf fonksiyonlar `cleanArchiveText`, `validCharRatio`
- **Create:** `src/sources/archive.test.ts` — saf fonksiyonların birim testleri
- **Modify:** `src/sources/index.ts` — `SOURCES = [archiveSource]` + `fetchBookText` metin cache'i
- **Modify:** `App.tsx` — `RootStackParamList.Reader` parametre sadeleştirme
- **Modify:** `src/store/bookStorage.ts` — `BookMetadata.source` tipi `string`
- **Modify:** `src/hooks/useOfflineBooks.ts` — `source` tipleri `string`
- **Modify:** `src/screens/HomeScreen.tsx` — `searchBook` + aday iterasyonu
- **Modify:** `src/screens/ReaderScreen.tsx` — `fetchBookText` + offline
- **Modify:** `src/screens/LibraryScreen.tsx` — `openBook` navigasyon parametreleri
- **Delete:** `src/utils/gutenbergAPI.ts`, `src/utils/wikisourceAPI.ts`

**Kapsam dışı:** Çevrimdışı indirme (`downloadBook`) archive akışına bağlanmaz; yalnızca tip uyumu için `source: string` yapılır. `src/sources/bundled.ts` ve `src/sources/wikisource.ts` silinmez ama `SOURCES`'a dahil edilmez.

---

## Task 1: Test araçlarını kur

**Files:**
- Modify: `package.json`

- [ ] **Step 1: tsx'i devDependency olarak kur**

Run: `npm install --save-dev tsx`
Expected: `added ... packages`, `package.json` devDependencies'e `tsx` eklenir.

- [ ] **Step 2: test script'i ekle**

`package.json` içindeki `"scripts"` bloğuna `"test"` satırını ekle:

```json
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "test": "tsx src/sources/archive.test.ts"
  },
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tsx for pure-function unit tests"
```

---

## Task 2: archive.ts saf fonksiyonları (TDD)

**Files:**
- Create: `src/sources/archive.test.ts`
- Create: `src/sources/archive.ts`

- [ ] **Step 1: Failing test yaz**

`src/sources/archive.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanArchiveText, validCharRatio } from './archive';

test('cleanArchiveText: yalnızca sayfa numarası olan satırları siler', () => {
  const raw = 'Birinci paragraf.\n\n12\n\nİkinci paragraf.';
  const out = cleanArchiveText(raw);
  assert.ok(!/\n12\n/.test(out), 'sayfa numarası satırı kalmamalı');
  assert.ok(out.includes('Birinci paragraf.'));
  assert.ok(out.includes('İkinci paragraf.'));
});

test('cleanArchiveText: 3+ boş satırı 2ye indirir ve satır içi fazla boşluğu teke', () => {
  const raw = 'A.\n\n\n\nB.\n\nİki      boşluk.';
  const out = cleanArchiveText(raw);
  assert.ok(!/\n{3,}/.test(out), '3+ ardışık satır sonu kalmamalı');
  assert.ok(out.includes('İki boşluk.'), 'satır içi fazla boşluk teke inmeli');
});

test('validCharRatio: temiz Türkçe metin yüksek oran verir', () => {
  const clean = 'Korkma, sönmez bu şafaklarda yüzen al sancak. Güzel bir gün.';
  assert.ok(validCharRatio(clean) >= 0.95, `beklenen >=0.95, gelen ${validCharRatio(clean)}`);
});

test('validCharRatio: bozuk OCR / sembol yığını düşük oran verir', () => {
  const garbage = '~|}{#@^*¶§∆◊≈ ¬¬¬ ‹›«»‡†•~|}{#@^*¶§∆◊≈¬¬¬';
  assert.ok(validCharRatio(garbage) < 0.85, `beklenen <0.85, gelen ${validCharRatio(garbage)}`);
});
```

- [ ] **Step 2: Test'in başarısız olduğunu doğrula**

Run: `npm test`
Expected: FAIL — `Cannot find module './archive'` veya export bulunamadı hatası.

- [ ] **Step 3: Saf fonksiyonları implemente et**

`src/sources/archive.ts` (sadece saf fonksiyonlar; kaynak nesnesi Task 3'te eklenecek):

```ts
/**
 * Internet Archive (archive.org) Türkçe kaynağı.
 * advancedsearch API ile arama, metadata'dan .txt dosyasını bulup indirir.
 * OCR metnini temizler ve kalite kapısından geçirir.
 */

/** OCR metnini okumadan önce sadeleştirir: sayfa no satırları, fazla boşluk vb. */
export function cleanArchiveText(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .filter((line) => {
      const t = line.trim();
      if (/^\d{1,4}$/.test(t)) return false;            // yalnızca sayfa numarası
      if (/^[IVXLCDM]{2,7}$/i.test(t)) return false;    // yalnızca Romen rakamı
      return true;
    })
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')   // satır içi fazla boşluk
    .replace(/\n{3,}/g, '\n\n')   // 3+ boş satır → 2
    .trim();
}

/** Metindeki 'geçerli' karakter oranı (Türkçe harf, rakam, boşluk, temel noktalama). */
export function validCharRatio(text: string): number {
  if (!text) return 0;
  const valid = (text.match(/[a-zA-ZçğıöşüÇĞİÖŞÜâîûÂÎÛ0-9\s.,;:!?'"()\-–—…\n]/g) || []).length;
  return valid / text.length;
}
```

- [ ] **Step 4: Test'in geçtiğini doğrula**

Run: `npm test`
Expected: PASS — 4 test geçer.

- [ ] **Step 5: Commit**

```bash
git add src/sources/archive.ts src/sources/archive.test.ts
git commit -m "feat: archive.ts saf temizlik + kalite fonksiyonları (TDD)"
```

---

## Task 3: archiveSource (arama + metin getirme)

**Files:**
- Modify: `src/sources/archive.ts`

- [ ] **Step 1: BookSource implementasyonunu ekle**

`src/sources/archive.ts` dosyasının BAŞINA importları, SONUNA `archiveSource`'u ekle.

Dosyanın en üstüne (mevcut açıklama yorumunun hemen altına):

```ts
import { BookSource, BookSearchResult } from './types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const ADV = 'https://archive.org/advancedsearch.php';
const META = 'https://archive.org/metadata';
const DL = 'https://archive.org/download';
const MIN_TEXT_LENGTH = 1000;
const VALID_RATIO_THRESHOLD = 0.85;
```

Dosyanın SONUNA (saf fonksiyonlardan sonra):

```ts
function pickField(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return fallback;
}

export const archiveSource: BookSource = {
  name: 'archive',

  async search(query: string): Promise<BookSearchResult[]> {
    const q = `(${query}) AND mediatype:texts AND language:(Turkish OR turkish OR Türkçe)`;
    const url =
      `${ADV}?q=${encodeURIComponent(q)}` +
      `&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=format` +
      `&rows=15&output=json`;
    try {
      const res = await fetchWithTimeout(url, {}, 12000);
      if (!res.ok) return [];
      const data = await res.json();
      const docs: any[] = data?.response?.docs ?? [];
      return docs
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hata yok (exit 0).

- [ ] **Step 3: Saf fonksiyon testleri hâlâ geçiyor mu**

Run: `npm test`
Expected: PASS — 4 test geçer.

- [ ] **Step 4: Commit**

```bash
git add src/sources/archive.ts
git commit -m "feat: archiveSource arama + metin getirme (metadata + kalite kapısı)"
```

---

## Task 4: index.ts — tek kaynak + metin cache

**Files:**
- Modify: `src/sources/index.ts`

- [ ] **Step 1: SOURCES'u archive yap, fetchBookText'e cache ekle**

`src/sources/index.ts` tam içeriğini şununla değiştir:

```ts
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

// Tek aktif kaynak: archive.org (Türkçe tam metin).
const SOURCES: BookSource[] = [archiveSource];

function sourceByName(name: string): BookSource | undefined {
  return SOURCES.find((s) => s.name === name);
}

export async function searchBook(query: string): Promise<BookSearchResult[]> {
  console.log(`[searchBook] sorgu: "${query}"`);
  for (const source of SOURCES) {
    try {
      const hits = await source.search(query);
      console.log(`[searchBook] ${source.name}: ${hits.length} sonuç`);
      if (hits.length > 0) return hits;
    } catch (e) {
      console.warn(`[${source.name}] arama başarısız:`, e);
    }
  }
  return [];
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hata yok (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/sources/index.ts
git commit -m "feat: SOURCES tek archive kaynağı + fetchBookText metin cache"
```

---

## Task 5: Tip sadeleştirme (App, bookStorage, useOfflineBooks)

**Files:**
- Modify: `App.tsx:12-21`
- Modify: `src/store/bookStorage.ts:6-17`
- Modify: `src/hooks/useOfflineBooks.ts`

- [ ] **Step 1: RootStackParamList.Reader sadeleştir**

`App.tsx` içindeki `Reader` tanımını şununla değiştir:

```ts
  Reader: {
    bookId: string;
    bookTitle: string;
    bookAuthor: string;
    startPage?: number;
  };
```

- [ ] **Step 2: BookMetadata.source tipini string yap**

`src/store/bookStorage.ts` içindeki `source` satırını değiştir:

```ts
  source: string;
```

(`sourceId` ve diğer alanlar aynı kalır.)

- [ ] **Step 3: useOfflineBooks source tiplerini string yap**

`src/hooks/useOfflineBooks.ts` içinde iki yerde geçen `source: 'gutenberg' | 'wikisource'` ifadesinin İKİSİNİ de `source: string` yap:
- `UseOfflineBooksResult` arayüzündeki `downloadBook` parametre tipi içinde
- `downloadBook` callback'inin parametre destructure tip anotasyonunda

- [ ] **Step 4: Typecheck (Home/Reader/Library hataları beklenir)**

Run: `npx tsc --noEmit`
Expected: `App.tsx`/`bookStorage`/`useOfflineBooks` temiz; ama `HomeScreen`, `ReaderScreen`, `LibraryScreen` hâlâ eski parametreleri kullandığı için hata verir. Bu hatalar Task 6-8'de giderilecek.

- [ ] **Step 5: Commit**

```bash
git add App.tsx src/store/bookStorage.ts src/hooks/useOfflineBooks.ts
git commit -m "refactor: Reader navigasyon parametrelerini ve source tipini sadeleştir"
```

---

## Task 6: HomeScreen — searchBook + aday iterasyonu

**Files:**
- Modify: `src/screens/HomeScreen.tsx`

- [ ] **Step 1: Import'ları güncelle**

`src/screens/HomeScreen.tsx` içindeki şu iki satırı:

```ts
import { searchBooks, getTextUrl, getAuthorName } from '../utils/gutenbergAPI';
import { searchWikisource } from '../utils/wikisourceAPI';
```

şununla değiştir:

```ts
import { searchBook, fetchBookText } from '../sources';
```

- [ ] **Step 2: searchAndOpenBook'u yeniden yaz**

`searchAndOpenBook` callback'inin tamamını (gövdesini) şununla değiştir:

```ts
  const searchAndOpenBook = useCallback(
    async (bookName: string) => {
      await speak(`${bookName} aranıyor.`);

      let results;
      try {
        results = await searchBook(bookName);
      } catch (e) {
        console.warn('Arama hatası:', e);
        await announce.apiError();
        return;
      }

      if (!results || results.length === 0) {
        await speak('Bu kitap bulunamadı, farklı bir isimle tekrar deneyin.');
        return;
      }

      // Kalite kapısından geçen ilk adayı bul (fetchBookText cache'i de doldurur).
      for (const hit of results) {
        try {
          await fetchBookText(hit.id);
          await speak(`${hit.title} bulundu, açılıyor.`);
          navigation.navigate('Reader', {
            bookId: hit.id,
            bookTitle: hit.title,
            bookAuthor: hit.author,
          });
          return;
        } catch (e) {
          console.warn(`[${hit.id}] atlandı:`, e);
        }
      }

      await speak('Uygun metin bulunamadı, farklı bir isimle tekrar deneyin.');
    },
    [navigation]
  );
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: `HomeScreen` hatası kalmaz (Reader/Library hâlâ hata verebilir).

- [ ] **Step 4: Commit**

```bash
git add src/screens/HomeScreen.tsx
git commit -m "feat: HomeScreen birleşik searchBook + kalite kapılı aday seçimi"
```

---

## Task 7: ReaderScreen — fetchBookText + offline

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: Import'ları güncelle**

`src/screens/ReaderScreen.tsx` içindeki şu satırları kaldır:

```ts
import { fetchWikisourceText } from '../utils/wikisourceAPI';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
```

ve `geminiService` import satırının hemen altına ekle:

```ts
import { fetchBookText } from '../sources';
```

- [ ] **Step 2: route.params destructure'ını sadeleştir**

Şu satırı:

```ts
  const { bookId, bookTitle, bookAuthor, textUrl, source, wikisourceTitle } = route.params;
```

şununla değiştir:

```ts
  const { bookId, bookTitle, bookAuthor } = route.params;
```

- [ ] **Step 3: conversation context effect'ini sadeleştir**

`setConversationContext` çağrısını içeren useEffect'i şununla değiştir:

```ts
  // Gemini'ye kitap context'i ver
  useEffect(() => {
    setConversationContext(
      `Kullanıcı "${bookTitle}" (${bookAuthor}) kitabını okuyor.`
    );
  }, [bookTitle, bookAuthor]);
```

- [ ] **Step 4: Metin yükleme effect'ini sadeleştir**

`load` fonksiyonu içindeki metin getirme bloğunu — yani yerel dosya denemesinden sonra gelen `if (!text) { ... }` bloğunu — şununla değiştir:

```ts
        // Yerel dosya yoksa archive.org'dan çek (HomeScreen cache'lediyse anında gelir)
        if (!text) {
          text = await fetchBookText(bookId);
        }
```

Ve `load` effect'inin dependency dizisinden `textUrl, source, wikisourceTitle` kaldırılır; yeni dizi:

```ts
  }, [bookId, bookTitle]);
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: `ReaderScreen` hatası kalmaz (Library hâlâ hata verebilir).

- [ ] **Step 6: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: ReaderScreen fetchBookText ile metin yükleme + offline"
```

---

## Task 8: LibraryScreen — navigasyon parametreleri

**Files:**
- Modify: `src/screens/LibraryScreen.tsx:54-68`

- [ ] **Step 1: openBook navigasyonunu sadeleştir**

`openBook` callback'ini şununla değiştir:

```ts
  const openBook = useCallback(
    (book: BookMetadata) => {
      navigation.navigate('Reader', {
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        startPage: book.lastPage,
      });
    },
    [navigation]
  );
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Hata yok (exit 0) — tüm ekranlar yeni parametrelerle uyumlu.

- [ ] **Step 3: Commit**

```bash
git add src/screens/LibraryScreen.tsx
git commit -m "feat: LibraryScreen sadeleştirilmiş Reader navigasyonu"
```

---

## Task 9: İngilizce/Gutenberg yolunu sil + final doğrulama

**Files:**
- Delete: `src/utils/gutenbergAPI.ts`
- Delete: `src/utils/wikisourceAPI.ts`

- [ ] **Step 1: Eski util dosyalarını sil**

```bash
git rm src/utils/gutenbergAPI.ts src/utils/wikisourceAPI.ts
```

- [ ] **Step 2: Dangling import kalmadığını doğrula**

Run: `grep -rn "gutenbergAPI\|wikisourceAPI" src App.tsx`
Expected: Sonuç yok (boş çıktı). Çıkarsa ilgili import'u kaldır.

- [ ] **Step 3: Final typecheck**

Run: `npx tsc --noEmit`
Expected: Hata yok (exit 0).

- [ ] **Step 4: Saf fonksiyon testleri**

Run: `npm test`
Expected: PASS — 4 test geçer.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: İngilizce/Gutenberg kaynak yolunu kaldır"
```

---

## Manuel Doğrulama (cihazda)

Bu adımlar otomatik test edilemez; cihazda (`R5CX92GHD4B`) Metro çalışırken elle yapılır:

- [ ] Uygulamayı yeniden yükle (Metro reload yeterli; native değişiklik yok).
- [ ] Ana ekranda mikrofona basıp tanınmış bir Türkçe kamu malı eser söyle (ör. "Çalıkuşu", "Mai ve Siyah", "Eylül").
- [ ] Kitabın bulunup açıldığını ve metnin **Türkçe ve okunabilir** geldiğini doğrula (abuk subuk OCR değil).
- [ ] Okuma başlat → TTS düzgün okuyor mu, kelime highlight ilerliyor mu.
- [ ] Bulunamayan/uygun olmayan bir sorgu söyle → "uygun metin bulunamadı" anonsu geliyor mu.
- [ ] Gerekirse `archive.ts` içindeki `VALID_RATIO_THRESHOLD` ve `MIN_TEXT_LENGTH` değerlerini gerçek sonuçlara göre kalibre et, commit'le.
