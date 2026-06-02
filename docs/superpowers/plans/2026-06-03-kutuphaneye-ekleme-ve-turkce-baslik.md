# Kütüphaneye Ekleme + Türkçe Başlık Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aranıp açılan Gutenberg kitabı anında kütüphaneye eklensin ve başlığı (hem kütüphanede hem okuma ekranında) Türkçe gösterilsin.

**Architecture:** Saf fabrika `createLibraryStore` (RN importu yok → node:test) + RN'e bağlayan ince singleton (`libraryStoreInstance`, tsc ile doğrulanır) — projedeki `quotaGovernor`/`instances` kalıbının aynısı. `resolveTurkishTitle` (geminiService), `resolveEnglishTitle`'ın simetriği; Gemini → Google Translate → İngilizce graceful düşer. ReaderScreen açılışta kayıt ekler + başlığı Türkçeye çevirir; LibraryScreen listesi artık gömülü + kayıtları birleştirir.

**Tech Stack:** Expo 55 / React Native 0.83 / TypeScript, node:test + tsx, AsyncStorage, mevcut `googleTranslate`/`geminiService`.

**Spec:** `docs/superpowers/specs/2026-06-03-kutuphaneye-ekleme-ve-turkce-baslik-design.md`

## Dosya Yapısı

| Dosya | Sorumluluk | Test |
|-------|-----------|------|
| `src/store/libraryStore.ts` | Kütüphane kayıtları için saf fabrika (CRUD) | node:test |
| `src/store/libraryStoreInstance.ts` | AsyncStorage'a bağlı singleton | tsc |
| `src/utils/geminiService.ts` | `resolveTurkishTitle` eklenir | node:test (fetch mock) |
| `src/screens/ReaderScreen.tsx` | Açılışta kayıt + Türkçe başlık | tsc + cihaz |
| `src/screens/LibraryScreen.tsx` | Gömülü + kayıtları listele | tsc + cihaz |

---

## Task 1: Kütüphane deposu (`libraryStore.ts` + singleton)

**Files:**
- Create: `src/store/libraryStore.ts`
- Create: `src/store/libraryStoreInstance.ts`
- Test: `src/store/libraryStore.test.ts`
- Modify: `package.json` (test script)

- [ ] **Step 1: Testi yaz (başarısız)**

`src/store/libraryStore.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryStore } from './libraryStore';

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: async (k: string, v: string) => { m.set(k, v); },
    m,
  };
}

const entry = (id: string, title = 'Suç ve Ceza') => ({
  id, title, author: 'Dostoyevski', addedAt: '2026-06-03T00:00:00.000Z',
});

test('boş depo → []', async () => {
  const store = createLibraryStore(memStorage());
  assert.deepEqual(await store.getEntries(), []);
});

test('upsert + getEntries round-trip', async () => {
  const store = createLibraryStore(memStorage());
  await store.upsertEntry(entry('gutenberg:2554'));
  const list = await store.getEntries();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'gutenberg:2554');
  assert.equal(list[0].title, 'Suç ve Ceza');
});

test('aynı id tekrar upsert → güncellenir, çift kayıt olmaz', async () => {
  const store = createLibraryStore(memStorage());
  await store.upsertEntry(entry('gutenberg:2554', 'Eski Başlık'));
  await store.upsertEntry(entry('gutenberg:2554', 'Yeni Başlık'));
  const list = await store.getEntries();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Yeni Başlık');
});

test('hasEntry: var/yok', async () => {
  const store = createLibraryStore(memStorage());
  await store.upsertEntry(entry('gutenberg:2554'));
  assert.equal(await store.hasEntry('gutenberg:2554'), true);
  assert.equal(await store.hasEntry('gutenberg:9999'), false);
});

test('bozuk JSON → []', async () => {
  const s = memStorage();
  s.m.set('@seslikitap_library', '{bozuk');
  const store = createLibraryStore(s);
  assert.deepEqual(await store.getEntries(), []);
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx tsx src/store/libraryStore.test.ts`
Expected: FAIL — `Cannot find module './libraryStore'`.

- [ ] **Step 3: Saf fabrikayı yaz**

`src/store/libraryStore.ts`:
```ts
/**
 * Kütüphaneye eklenen (gömülü olmayan) kitapların kalıcı listesi. Saf fabrika —
 * depolama (getItem/setItem) enjekte edilir, RN importu yoktur → node:test ile
 * test edilebilir. AsyncStorage'a bağlı varsayılan singleton libraryStoreInstance.ts'te.
 */
export const LIBRARY_KEY = '@seslikitap_library';

export interface LibraryEntry {
  id: string; // global id, örn. "gutenberg:2554"
  title: string; // Türkçe başlık
  author: string;
  addedAt: string; // ISO tarih
}

export interface LibraryStorage {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
}

export interface LibraryStore {
  getEntries: () => Promise<LibraryEntry[]>;
  upsertEntry: (entry: LibraryEntry) => Promise<void>;
  hasEntry: (id: string) => Promise<boolean>;
}

export function createLibraryStore(storage: LibraryStorage): LibraryStore {
  async function getEntries(): Promise<LibraryEntry[]> {
    const raw = await storage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return []; // bozuk → temiz başlangıç
    }
  }

  async function upsertEntry(entry: LibraryEntry): Promise<void> {
    const entries = await getEntries();
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) entries[idx] = entry;
    else entries.push(entry);
    await storage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  }

  async function hasEntry(id: string): Promise<boolean> {
    return (await getEntries()).some((e) => e.id === id);
  }

  return { getEntries, upsertEntry, hasEntry };
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx tsx src/store/libraryStore.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Singleton'ı yaz (tsc-only)**

`src/store/libraryStoreInstance.ts`:
```ts
/**
 * libraryStore saf fabrikasını AsyncStorage'a bağlayan singleton. Ekranlar
 * (Reader/Library) bunu import eder. node:test ile test edilmez (RN importu).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLibraryStore } from './libraryStore';

export const libraryStore = createLibraryStore({
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
});
```

- [ ] **Step 6: package.json test script'ine ekle**

`package.json` içindeki `"test"` değerinin SONUNA (kapanış tırnağından önce) ekle:
```
 && tsx src/store/libraryStore.test.ts
```

- [ ] **Step 7: Tüm testler + derleme**

Run: `npm test`
Expected: Tüm dosyalar PASS (libraryStore dahil).

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 8: Commit**

```bash
git add src/store/libraryStore.ts src/store/libraryStore.test.ts src/store/libraryStoreInstance.ts package.json
git commit -m "feat(library): kütüphane kayıtları için libraryStore (saf fabrika + singleton)"
```

---

## Task 2: Türkçe başlık çözümü (`resolveTurkishTitle`)

**Files:**
- Modify: `src/utils/geminiService.ts` (yeni fonksiyon ekle)
- Test: `src/utils/geminiService.test.ts` (yeni test ekle)

**Not:** `resolveEnglishTitle` (satır ~198) zaten var ve `GEMINI_URL`, `GEMINI_API_KEY`, `fetchWithTimeout` modülde tanımlı. Yeni fonksiyon bunları kullanır ve `googleTranslate`'i import eder.

- [ ] **Step 1: Testi yaz (başarısız)**

`src/utils/geminiService.test.ts` dosyasının SONUNA ekle (mevcut testlerin/import'ların altına). Eğer dosyada `process.env.EXPO_PUBLIC_GEMINI_API_KEY` zaten ayarlı değilse, dosyanın en üstüne (ilk import'lardan sonra) ekle: `process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-key';`

```ts
import { resolveTurkishTitle } from './geminiService';

function mockGeminiTitle(text: string | null, ok = true): void {
  (globalThis as any).fetch = async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => (text == null
      ? { candidates: [] }
      : { candidates: [{ content: { parts: [{ text }] } }] }),
  });
}

test('resolveTurkishTitle: Gemini Türkçe başlık döndürür', async () => {
  mockGeminiTitle('Suç ve Ceza');
  assert.equal(await resolveTurkishTitle('Crime and Punishment'), 'Suç ve Ceza');
});

test('resolveTurkishTitle: tırnak/whitespace temizlenir', async () => {
  mockGeminiTitle('"Suç ve Ceza"\n');
  assert.equal(await resolveTurkishTitle('Crime and Punishment'), 'Suç ve Ceza');
});

test('resolveTurkishTitle: Gemini ve GT başarısız → İngilizce başlık döner', async () => {
  // fetch her zaman !ok → hem Gemini hem GT fallback başarısız.
  (globalThis as any).fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  assert.equal(await resolveTurkishTitle('Crime and Punishment'), 'Crime and Punishment');
});

test('resolveTurkishTitle: boş girdi aynen döner', async () => {
  assert.equal(await resolveTurkishTitle('   '), '   ');
});
```

> Not: `geminiService.test.ts` zaten `import { test } from 'node:test'` ve `import assert from 'node:assert/strict'` içeriyor olmalı (mevcut testler için). İçermiyorsa ekle. `resolveTurkishTitle` import'unu dosyadaki diğer `./geminiService` import satırına ekleyebilir veya ayrı satır olarak koyabilirsin.

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx tsx src/utils/geminiService.test.ts`
Expected: FAIL — `resolveTurkishTitle is not a function` / export yok.

- [ ] **Step 3: Implementasyonu yaz**

`src/utils/geminiService.ts` dosyasının sonuna ekle. En üstteki import'lara ekle:
```ts
import { googleTranslate } from '../translation/googleTranslate';
```

Dosya sonuna fonksiyon:
```ts
/**
 * Bir kitabın İNGİLİZCE başlığını yaygın TÜRKÇE başlığına çevirir (kütüphane +
 * okuma ekranında göstermek için). resolveEnglishTitle'ın simetriği. Asla
 * çökmez: Gemini başarısız/boş/kota → Google Translate fallback → o da olmazsa
 * İngilizce başlığı aynen döndürür.
 */
export async function resolveTurkishTitle(englishTitle: string): Promise<string> {
  const t = englishTitle.trim();
  if (!t) return englishTitle;

  const clean = (s: string): string =>
    s.replace(/^["'`]+|["'`]+$/g, '').split('\n')[0].trim();

  if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    const prompt =
      'Aşağıdaki kitap adının yaygın TÜRKÇE başlığını ver. ' +
      'Sadece başlığı yaz, başka hiçbir şey ekleme. ' +
      'Zaten Türkçeyse veya emin değilsen olduğu gibi tekrarla.\n\n' +
      `Kitap: ${t}`;
    try {
      const res = await fetchWithTimeout(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 80 },
        }),
      }, 15000);
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          const title = clean(text);
          if (title.length > 0 && title.length < 120) return title;
        }
      }
    } catch {
      // Gemini başarısız → GT fallback
    }
  }

  // Google Translate fallback (keysiz).
  try {
    const gt = (await googleTranslate(t)).trim();
    if (gt) return gt;
  } catch {
    // GT de başarısız → İngilizce
  }
  return t;
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx tsx src/utils/geminiService.test.ts`
Expected: PASS (mevcut testler + 4 yeni).

> Not: "Gemini ve GT başarısız → İngilizce" testinde `googleTranslate` da `fetchWithTimeout` kullanır; global fetch `!ok` döndürdüğü için GT de hata atar ve İngilizce başlık döner.

- [ ] **Step 5: Commit**

```bash
git add src/utils/geminiService.ts src/utils/geminiService.test.ts
git commit -m "feat(library): İngilizce başlığı Türkçeye çeviren resolveTurkishTitle (Gemini→GT→EN)"
```

---

## Task 3: Okuyucu — kütüphaneye ekle + Türkçe başlık (`ReaderScreen.tsx`)

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

Açılan Gutenberg kitabı kütüphaneye eklenir; başlık çubuğu İngilizce yerine Türkçe (`displayTitle`) gösterir. Başlık bir kez çevrilip kaydedilir; sonraki açılışlarda kayıttan gelir. RN — `npx tsc --noEmit` + cihaz.

- [ ] **Step 1: Import'ları ekle**

`src/screens/ReaderScreen.tsx`'te diğer import'ların yanına ekle:
```ts
import { libraryStore } from '../store/libraryStoreInstance';
import { resolveTurkishTitle } from '../utils/geminiService';
```

- [ ] **Step 2: route.params'tan bookAuthor'ı al**

Satır 34'ü:
```ts
  const { bookId, bookTitle } = route.params;
```
şununla değiştir:
```ts
  const { bookId, bookTitle, bookAuthor } = route.params;
```

- [ ] **Step 3: displayTitle state'i ekle**

Satır 34'ün hemen altına (diğer `useState`'lerin yanına) ekle:
```ts
  const [displayTitle, setDisplayTitle] = useState(bookTitle);
```

- [ ] **Step 4: Başlık çubuğunu displayTitle'a çevir**

Satır 448-449:
```tsx
        <Text style={styles.bookTitle} numberOfLines={1} accessibilityRole="header">
          {bookTitle}
```
şununla değiştir:
```tsx
        <Text style={styles.bookTitle} numberOfLines={1} accessibilityRole="header">
          {displayTitle}
```

- [ ] **Step 5: Kütüphaneye ekleme + başlık çözme effect'i ekle**

Satır 44'teki `currentPage` useState'inden sonra bir yere (diğer effect'lerin yanına, örn. dil/needsTranslation effect'inin hemen altına) ekle:
```ts
  // Gutenberg kitabı açıldığında: kütüphaneye ekle + başlığı Türkçeye çevir.
  // Başlık bir kez çevrilir; sonraki açılışlarda kayıttan gelir (ekstra istek yok).
  useEffect(() => {
    if (!needsTranslation) return;
    let cancelled = false;
    (async () => {
      const entries = await libraryStore.getEntries();
      const existing = entries.find((e) => e.id === bookId);
      if (existing) {
        if (!cancelled) setDisplayTitle(existing.title);
        return;
      }
      const tr = await resolveTurkishTitle(bookTitle);
      if (cancelled) return;
      setDisplayTitle(tr);
      await libraryStore.upsertEntry({
        id: bookId,
        title: tr,
        author: bookAuthor,
        addedAt: new Date().toISOString(),
      });
    })();
    return () => { cancelled = true; };
  }, [needsTranslation, bookId, bookTitle, bookAuthor]);
```

> Not: `needsTranslation` state'i bu dosyada zaten tanımlı (global dil 'tr' + kitap gömülü değilse true). Effect yalnızca Gutenberg kitaplarında çalışır; gömülü kitaplar (`needsTranslation=false`) kütüphanede zaten Türkçe başlıkla bulunur.

- [ ] **Step 6: Derlemeyi doğrula**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 7: Cihazda doğrula**

Telefonda (global dil 'tr'): bir Gutenberg kitabı aç → başlık çubuğu birkaç saniye içinde Türkçe olur (örn. "Suç ve Ceza"). Kütüphane ekranına git → kitap Türkçe adıyla listede görünür.

- [ ] **Step 8: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): Gutenberg kitabını açılışta kütüphaneye ekle + Türkçe başlık göster"
```

---

## Task 4: Kütüphane ekranı — gömülü + kayıtları birleştir (`LibraryScreen.tsx`)

**Files:**
- Modify: `src/screens/LibraryScreen.tsx`

Liste artık `[...kütüphane kayıtları (yeni→eski), ...gömülü]`. Açılış anonsu kayıtlar yüklendikten sonra yapılır. Sesle isimle açma gömülü aramaya ek olarak kayıtlarda da eşleşir.

- [ ] **Step 1: Import'ları ekle**

`src/screens/LibraryScreen.tsx`'te import'lara ekle:
```ts
import { libraryStore } from '../store/libraryStoreInstance';
```
Ve mevcut `import { listBundledBooks, bundledSource, BookSearchResult } from '../sources';` satırı zaten var — değişmez.

- [ ] **Step 2: books'u async state'e çevir**

Satır 19'u:
```ts
  const books = useMemo(() => listBundledBooks(), []);
```
şununla değiştir:
```ts
  const [books, setBooks] = useState<BookSearchResult[]>([]);
  const [loaded, setLoaded] = useState(false);
```
(`useState` zaten import edili; `useMemo` başka yerde kullanılmıyorsa import'tan çıkarmana gerek yok — kullanılmıyorsa tsc uyarı vermez.)

- [ ] **Step 3: Yükleme effect'i ekle (kayıtlar + gömülü)**

Satır 19'daki (eski `books`) tanımın hemen altına ekle:
```ts
  // Kütüphane: kullanıcının açtığı (çevrilen) kitaplar yeni→eski, ardından gömülü.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await libraryStore.getEntries();
      const entryResults: BookSearchResult[] = entries
        .slice()
        .reverse()
        .map((e) => {
          const idx = e.id.indexOf(':');
          return {
            id: e.id,
            title: e.title,
            author: e.author,
            source: idx >= 0 ? e.id.slice(0, idx) : 'gutenberg',
            sourceId: idx >= 0 ? e.id.slice(idx + 1) : e.id,
          };
        });
      if (cancelled) return;
      setBooks([...entryResults, ...listBundledBooks()]);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);
```

- [ ] **Step 4: Açılış anonsunu yükleme sonrasına bağla**

Mevcut açılış anonsu effect'i (satır ~40, `announcedRef` kullanan) şu an `[books]` üzerine çalışıyor. Koşulunu yükleme tamamlanana kadar beklemek için güncelle. Effect'in başına ekle:
```ts
    if (!loaded) return;
```
ve bağımlılık dizisini `}, [books]);` → `}, [books, loaded]);` yap. (announcedRef guard'ı sayesinde yalnızca bir kez konuşur; artık `books` dolu olduğunda konuşur, boşken "boş" demez — gerçekten boşsa `loaded && books.length===0` ile "boş" der.)

- [ ] **Step 5: Sesle isimle açmada kayıtları da eşleştir**

`handleVoiceResult` içindeki `open_book` dalında, `bundledSource.search` denemesinden SONRA, sayısal denemeden ÖNCE ekle (gömülü eşleşme yoksa kütüphane kayıtlarında ara):
```ts
          // Gömülüde yoksa kütüphane kayıtlarında (açılmış kitaplar) eşleştir.
          const q = response.book.toLowerCase().trim();
          const libHit = books.find(
            (b) => b.title.toLowerCase().includes(q) || q.includes(b.title.toLowerCase())
          );
          if (libHit) {
            await speak(`${libHit.title} açılıyor.`);
            openBook(libHit);
            return;
          }
```

> Not: `books` artık `handleVoiceResult`'ın bağımlılığında olmalı — zaten `[books, openBook, navigation]` ise değişmez; değilse `books` ekle.

- [ ] **Step 6: Derlemeyi doğrula**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 7: Cihazda doğrula**

Telefonda: bir Gutenberg kitabı aç (Task 3 ile kütüphaneye eklenmiş olur) → kütüphane ekranına git → kitap Türkçe adıyla, gömülü kitapların üstünde listede görünür. Çift dokun → açılır, kaldığı yerden Türkçe okur. "[kitap adı] aç" de → açılır.

- [ ] **Step 8: Commit**

```bash
git add src/screens/LibraryScreen.tsx
git commit -m "feat(library): açılan kitapları kütüphane listesinde göster (gömülü + kayıtlar)"
```

---

## Plan Tamamlanma Kriteri

- `npm test` → tüm testler geçer (yeni `libraryStore` + `resolveTurkishTitle` dahil).
- `npx tsc --noEmit` → hata yok.
- Cihazda: Gutenberg kitabı açılınca kütüphanede **Türkçe adıyla** belirir; okuma ekranı başlığı Türkçe; çıkıp kütüphaneden tekrar açınca kaldığı yerden Türkçe okur (ağ ile).
- Gömülü kitaplar ve İngilizce okuma modu etkilenmez.
