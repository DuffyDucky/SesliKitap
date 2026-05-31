# Gömülü Kütüphane (Kendi Çevirilerim) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sesle "kütüphaneye git" denince kullanıcının gömülü Türkçe çevirilerinin listelendiği, çevrimdışı çalışan, dosya-başına-kitap yapısıyla zamanla büyütülebilen bir kütüphane.

**Architecture:** Gömülü kitaplar `src/books/` altında kitap-başına bir `.ts` dosyasında tutulur; `src/books/index.ts` hepsini toplar. `bundled` kaynağı bu listeyi okur. Arama yalnızca Gutenberg'e gider (`SEARCH_SOURCES`), ama metin çözme tüm kaynakları kapsar (`ALL_SOURCES`) ki Okuyucu `bundled:...` metnini çevrimdışı açabilsin. Kütüphane ekranı `listBundledBooks()` ile bu kitapları listeler.

**Tech Stack:** Expo 55 / React Native 0.83 / TypeScript, expo-speech (TTS), expo-speech-recognition (STT), node:test + tsx (saf-mantık testleri).

---

## Dosya Yapısı

**Oluşturulacak:**
- `src/books/types.ts` — `BundledBook` arayüzü.
- `src/books/istiklal-marsi.ts` — İstiklâl Marşı (mevcut metin taşınır).
- `src/books/nasreddin-hoca.ts` — Nasreddin Hoca Fıkraları (mevcut metin taşınır).
- `src/books/forsa.ts` — Forsa (mevcut metin taşınır).
- `src/books/index.ts` — tüm kitapları `BOOKS: BundledBook[]` dizisinde toplar.
- `src/books/index.test.ts` — `BOOKS` için saf-mantık testleri.

**Değiştirilecek:**
- `src/sources/bundled.ts` — inline `BOOKS` dizisi + `BundledBook` arayüzü kaldırılır; metinler `../books`'tan okunur.
- `src/sources/index.ts` — `SEARCH_SOURCES` (arama) ve `ALL_SOURCES` (metin çözme) olarak ikiye ayrılır.
- `src/screens/LibraryScreen.tsx` — liste kaynağı AsyncStorage yerine `listBundledBooks()`.
- `src/screens/HomeScreen.tsx` — `seedDemoBooksOnce()` çağrısı ve import'u geri alınır.
- `package.json` — test betiğine `books/index.test.ts` eklenir, `demoBooks.test.ts` çıkarılır.

**Silinecek (bu oturumdaki yanlış demo seed):**
- `src/store/seedBooks.ts`
- `src/store/demoBooks.ts`
- `src/store/demoBooks.test.ts`

---

### Task 1: Gömülü kitap içerik yapısı (`src/books/`)

**Files:**
- Create: `src/books/types.ts`
- Create: `src/books/istiklal-marsi.ts`
- Create: `src/books/nasreddin-hoca.ts`
- Create: `src/books/forsa.ts`
- Create: `src/books/index.ts`
- Create: `src/books/index.test.ts`
- Modify: `package.json` (test betiğine yeni testi ekle)

- [ ] **Step 1: `BundledBook` arayüzünü oluştur**

`src/books/types.ts`:

```ts
/** Uygulamaya gömülü tek bir kitabın şekli. Saf veri — hiçbir react-native importu yok. */
export interface BundledBook {
  id: string;            // benzersiz slug, örn. "omer-seyfettin-forsa"
  title: string;
  author: string;
  aliases: string[];     // sesli komutla eşleşmeyi kolaylaştırmak için
  text: string;          // tam düz metin
}
```

- [ ] **Step 2: Üç kitabı kitap-başına dosyaya taşı**

Her dosya `BundledBook` tipinde tek bir nesneyi default export eder. `id`, `title`,
`author`, `aliases` ve `text` değerleri **mevcut `src/sources/bundled.ts` içindeki
`BOOKS` dizisinden birebir (verbatim) kopyalanır** — aynı `id`'li girdiden. Metni
elle yeniden yazma; var olan template-string'i olduğu gibi taşı.

`src/books/istiklal-marsi.ts` (id `istiklal-marsi` olan girdiden):

```ts
import { BundledBook } from './types';

const book: BundledBook = {
  id: 'istiklal-marsi',
  title: 'İstiklâl Marşı',
  author: 'Mehmet Akif Ersoy',
  aliases: ['istiklal marşı', 'istiklal', 'milli marş', 'türk milli marşı'],
  text: `İstiklâl Marşı

Korkma! Sönmez bu şafaklarda yüzen al sancak,
... (mevcut bundled.ts'teki istiklal-marsi.text içeriğinin tamamı) ...`,
};

export default book;
```

`src/books/nasreddin-hoca.ts` (id `nasreddin-hoca` olan girdiden):

```ts
import { BundledBook } from './types';

const book: BundledBook = {
  id: 'nasreddin-hoca',
  title: 'Nasreddin Hoca Fıkraları',
  author: 'Halk Edebiyatı',
  aliases: ['nasreddin hoca', 'nasrettin hoca', 'hoca', 'fıkralar', 'nasreddin'],
  text: `Nasreddin Hoca Fıkraları
... (mevcut bundled.ts'teki nasreddin-hoca.text içeriğinin tamamı) ...`,
};

export default book;
```

`src/books/forsa.ts` (id `omer-seyfettin-forsa` olan girdiden):

```ts
import { BundledBook } from './types';

const book: BundledBook = {
  id: 'omer-seyfettin-forsa',
  title: 'Forsa',
  author: 'Ömer Seyfettin',
  aliases: ['forsa', 'ömer seyfettin forsa', 'omer seyfettin forsa'],
  text: `Forsa
Ömer Seyfettin
... (mevcut bundled.ts'teki omer-seyfettin-forsa.text içeriğinin tamamı) ...`,
};

export default book;
```

- [ ] **Step 3: Toplayıcı index'i oluştur**

`src/books/index.ts`:

```ts
import { BundledBook } from './types';
import istiklalMarsi from './istiklal-marsi';
import nasreddinHoca from './nasreddin-hoca';
import forsa from './forsa';

/**
 * Uygulamaya gömülü tüm kitaplar. Yeni kitap eklemek için:
 * 1) src/books/<slug>.ts dosyası oluştur (default export BundledBook),
 * 2) buraya import et ve aşağıdaki diziye ekle.
 */
export const BOOKS: BundledBook[] = [istiklalMarsi, nasreddinHoca, forsa];

export type { BundledBook };
```

- [ ] **Step 4: Başarısız testi yaz**

`src/books/index.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS } from './index';

test('BOOKS: en az 3 gömülü kitap var', () => {
  assert.ok(BOOKS.length >= 3, `beklenen >=3, bulunan ${BOOKS.length}`);
});

test('BOOKS: her kitabın zorunlu alanları dolu', () => {
  for (const b of BOOKS) {
    assert.ok(b.id.length > 0, 'id boş olamaz');
    assert.ok(b.title.length > 0, 'title boş olamaz');
    assert.ok(b.author.length > 0, 'author boş olamaz');
    assert.ok(b.text.length > 0, 'text boş olamaz');
    assert.ok(Array.isArray(b.aliases), 'aliases dizi olmalı');
  }
});

test("BOOKS: id'ler benzersiz", () => {
  const ids = BOOKS.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'tekrar eden id var');
});
```

- [ ] **Step 5: Testi `package.json`'a ekle**

`package.json` `test` betiğinin sonuna `&& tsx src/books/index.test.ts` ekle. Yeni betik:

```json
"test": "tsx src/utils/frontMatter.test.ts && tsx src/sources/gutenbergText.test.ts && tsx src/utils/textChunk.test.ts && tsx src/utils/localIntent.test.ts && tsx src/utils/geminiService.test.ts && tsx src/store/demoBooks.test.ts && tsx src/books/index.test.ts"
```

(Not: `demoBooks.test.ts` Task 5'te çıkarılacak; şimdilik kalsın ki ara adımda test kırılmasın.)

- [ ] **Step 6: Testi çalıştır, geçtiğini gör**

Run: `cd "C:\Claude Deneme\SesliKitap" && npx tsx src/books/index.test.ts`
Expected: PASS — 3 test geçer (`pass 3, fail 0`).

- [ ] **Step 7: tsc temiz mi**

Run: `cd "C:\Claude Deneme\SesliKitap" && npx tsc --noEmit`
Expected: Hata yok (exit 0).

- [ ] **Step 8: Commit**

```bash
git add src/books package.json
git commit -m "feat: gömülü kitaplar için dosya-başına yapı (src/books)"
```

---

### Task 2: `bundled.ts`'i yeni içerik yapısına bağla

**Files:**
- Modify: `src/sources/bundled.ts`

- [ ] **Step 1: `bundled.ts`'i metinleri `../books`'tan okuyacak şekilde yeniden yaz**

Inline `BOOKS` dizisini ve dosya-içi `BundledBook` arayüzünü kaldır; `BOOKS`'u
`../books`'tan import et. `normalize`, `bundledSource` (search + fetchText) ve
`listBundledBooks` aynı davranışı korur. Yeni `src/sources/bundled.ts` tamamı:

```ts
/**
 * Dahili (gömülü) Türkçe metinler — çevrimdışı, ağ gerektirmez.
 * Metin içeriği src/books/ altında dosya-başına tutulur; burada yalnızca
 * arama/eşleştirme ve metin getirme mantığı bulunur.
 */
import { BookSource, BookSearchResult } from './types';
import { BOOKS } from '../books';

/** Türkçe harfleri sade ASCII'ye indir + küçült: "İstiklâl" → "istiklal" */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/i̇/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const bundledSource: BookSource = {
  name: 'bundled',

  async search(query: string): Promise<BookSearchResult[]> {
    const q = normalize(query);
    if (!q) return [];

    const matches = BOOKS.filter((b) => {
      const nTitle = normalize(b.title);
      const nAuthor = normalize(b.author);
      if (nTitle.includes(q) || q.includes(nTitle)) return true;
      if (nAuthor.includes(q)) return true;
      return b.aliases.some((a) => {
        const na = normalize(a);
        return na.includes(q) || q.includes(na);
      });
    });

    return matches.map((b) => ({
      id: `bundled:${b.id}`,
      title: b.title,
      author: b.author,
      source: 'bundled',
      sourceId: b.id,
    }));
  },

  async fetchText(sourceId: string): Promise<string> {
    const book = BOOKS.find((b) => b.id === sourceId);
    if (!book) throw new Error(`Bundled kitap bulunamadı: ${sourceId}`);
    return book.text;
  },
};

export function listBundledBooks(): BookSearchResult[] {
  return BOOKS.map((b) => ({
    id: `bundled:${b.id}`,
    title: b.title,
    author: b.author,
    source: 'bundled',
    sourceId: b.id,
  }));
}
```

- [ ] **Step 2: tsc temiz mi**

Run: `cd "C:\Claude Deneme\SesliKitap" && npx tsc --noEmit`
Expected: Hata yok (exit 0).

- [ ] **Step 3: Testler hâlâ geçiyor mu**

Run: `cd "C:\Claude Deneme\SesliKitap" && npm test`
Expected: Tüm testler geçer (`fail 0`).

- [ ] **Step 4: Commit**

```bash
git add src/sources/bundled.ts
git commit -m "refactor: bundled kaynağı metinleri src/books'tan okur"
```

---

### Task 3: Aramayı Gutenberg-only tut, metin çözmeyi tüm kaynaklara aç

**Files:**
- Modify: `src/sources/index.ts`

- [ ] **Step 1: `SOURCES`'u `SEARCH_SOURCES` + `ALL_SOURCES` olarak ayır**

`src/sources/index.ts` içinde import satırını ve kaynak listelerini güncelle.

Mevcut:

```ts
import { listBundledBooks } from './bundled';
import { gutenbergSource } from './gutenberg';

// Tek kaynak: Project Gutenberg (İngilizce tam metin).
// Türkçe okuma istenirse ReaderScreen sayfayı Google Translate ile çevirir.
const SOURCES: BookSource[] = [gutenbergSource];

function sourceByName(name: string): BookSource | undefined {
  return SOURCES.find((s) => s.name === name);
}
```

Yeni:

```ts
import { bundledSource, listBundledBooks } from './bundled';
import { gutenbergSource } from './gutenberg';

// Arama YALNIZCA Gutenberg'e gider; gömülü kitaplar şimdilik aramaya karışmaz.
const SEARCH_SOURCES: BookSource[] = [gutenbergSource];
// Metin çözme tüm kaynakları kapsar: Okuyucu kütüphaneden seçilen "bundled:..."
// metnini çevrimdışı açabilsin diye.
const ALL_SOURCES: BookSource[] = [gutenbergSource, bundledSource];

function sourceByName(name: string): BookSource | undefined {
  return ALL_SOURCES.find((s) => s.name === name);
}
```

- [ ] **Step 2: `searchBook`'u `SEARCH_SOURCES` üzerinde döndür**

`searchBook` içindeki `for (const source of SOURCES)` satırını
`for (const source of SEARCH_SOURCES)` yap. Fonksiyonun geri kalanı değişmez.

- [ ] **Step 3: tsc temiz mi**

Run: `cd "C:\Claude Deneme\SesliKitap" && npx tsc --noEmit`
Expected: Hata yok (exit 0). (`SOURCES` artık tanımlı değil; başka referans kalmamalı.)

- [ ] **Step 4: Testler geçiyor mu**

Run: `cd "C:\Claude Deneme\SesliKitap" && npm test`
Expected: Tüm testler geçer (`fail 0`).

- [ ] **Step 5: Commit**

```bash
git add src/sources/index.ts
git commit -m "feat: arama Gutenberg-only, metin çözme tüm kaynaklarda (bundled dahil)"
```

---

### Task 4: Kütüphane ekranını gömülü kitapları listeleyecek şekilde yaz

**Files:**
- Modify: `src/screens/LibraryScreen.tsx` (tüm dosya yeniden yazılır)

- [ ] **Step 1: `LibraryScreen.tsx`'i `listBundledBooks()` kaynağıyla yeniden yaz**

AsyncStorage tabanlı liste (`useOfflineBooks`), silme butonu, çevrimdışı rozeti ve
Gemini bağlam ayarı kaldırılır. Liste `listBundledBooks()`'tan gelir; seçilen kitap
`bundled:<id>` ile Okuyucu'ya gönderilir. Tüm dosya:

```tsx
import React, { useEffect, useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSpeech } from '../hooks/useSpeech';
import { parseLocalIntent } from '../utils/localIntent';
import { speak } from '../utils/tts';
import { listBundledBooks, BookSearchResult } from '../sources';
import { RootStackParamList } from '../../App';

type LibraryNavProp = StackNavigationProp<RootStackParamList, 'Library'>;

export default function LibraryScreen() {
  const navigation = useNavigation<LibraryNavProp>();
  const books = useMemo(() => listBundledBooks(), []);
  const [thinking, setThinking] = useState(false);

  // Kütüphane açılışında kitap sayısını bir kez sesli bildir.
  const announcedRef = React.useRef(false);
  useEffect(() => {
    if (announcedRef.current) return;
    announcedRef.current = true;
    if (books.length === 0) {
      speak('Kütüphane şu an boş.');
    } else {
      speak(`Kütüphanede ${books.length} kitap var. Kitap adı veya numarası söyleyerek açabilirsiniz.`);
    }
  }, [books]);

  const openBook = useCallback(
    (book: BookSearchResult) => {
      navigation.navigate('Reader', {
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
      });
    },
    [navigation]
  );

  const handleVoiceResult = useCallback(
    async (text: string) => {
      setThinking(true);
      try {
        // Niyet yerel olarak çözülür (Gemini kotası gerekmez).
        let response = parseLocalIntent(text);
        if (response.action === 'unknown') {
          response = { action: 'open_book', book: text.trim(), speech: '' };
        }

        if (response.action === 'go_home') {
          navigation.goBack();
          return;
        }

        if (response.action === 'open_book' && response.book) {
          // İsimle eşleştir
          const lower = response.book.toLowerCase();
          const found = books.find((b) => b.title.toLowerCase().includes(lower));
          if (found) {
            await speak(`${found.title} açılıyor.`);
            openBook(found);
            return;
          }
          // Numarayla eşleştir
          const num = parseInt(response.book, 10);
          if (!isNaN(num) && num >= 1 && num <= books.length) {
            await speak(`${books[num - 1].title} açılıyor.`);
            openBook(books[num - 1]);
            return;
          }
          await speak('Bu isimde bir kitap bulamadım.');
          return;
        }

        if (response.speech) await speak(response.speech);
      } catch (e) {
        console.warn('Hata:', e);
        await speak('Bir sorun oluştu.');
      } finally {
        setThinking(false);
      }
    },
    [books, openBook, navigation]
  );

  const { isListening, startListening, stopListening } = useSpeech(handleVoiceResult);

  const renderItem = ({ item, index }: { item: BookSearchResult; index: number }) => (
    <TouchableOpacity
      style={styles.bookItem}
      onPress={() => openBook(item)}
      accessibilityLabel={`${index + 1}. kitap: ${item.title}, ${item.author}`}
      accessibilityHint="Açmak için dokunun"
      accessibilityRole="button"
    >
      <Text style={styles.bookNumber}>{index + 1}.</Text>
      <View style={styles.bookDetails}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.bookAuthor}>{item.author}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Geri dön"
          accessibilityRole="button"
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Kütüphane
        </Text>
      </View>

      {books.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Kütüphane şu an boş.</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          accessibilityLabel="Kütüphanedeki kitaplar listesi"
        />
      )}

      {thinking && (
        <View style={styles.thinkingBar}>
          <ActivityIndicator size="small" color="#4fc3f7" />
          <Text style={styles.thinkingText}>Düşünüyor...</Text>
        </View>
      )}

      <Pressable
        onPressIn={startListening}
        onPressOut={stopListening}
        style={[styles.micButton, isListening && styles.micActive]}
        accessibilityLabel="Sesli komut. Kitap adı veya numarası söyleyin."
        accessibilityRole="button"
        disabled={thinking}
      >
        <Text style={styles.micText}>
          {isListening ? '🎙 Dinleniyor...' : thinking ? '🤔 Düşünüyor...' : '🎤 Sesle Kitap Seç'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    color: '#fff',
    fontSize: 36,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#333',
    minHeight: 80,
    padding: 16,
    gap: 12,
  },
  bookNumber: {
    color: '#888',
    fontSize: 22,
    fontWeight: 'bold',
    minWidth: 32,
  },
  bookDetails: {
    flex: 1,
    gap: 4,
  },
  bookTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  bookAuthor: {
    color: '#aaa',
    fontSize: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#aaa',
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 32,
  },
  thinkingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    backgroundColor: '#111',
  },
  thinkingText: {
    color: '#4fc3f7',
    fontSize: 20,
  },
  micButton: {
    margin: 16,
    height: 80,
    backgroundColor: '#111',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: {
    borderColor: '#f00',
    backgroundColor: '#1a0000',
  },
  micText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: tsc temiz mi**

Run: `cd "C:\Claude Deneme\SesliKitap" && npx tsc --noEmit`
Expected: Hata yok (exit 0). (`useOfflineBooks`, `setConversationContext`, `BookMetadata`, `Alert`, `announce` artık import edilmiyor — kullanılmayan import kalmamalı.)

- [ ] **Step 3: Commit**

```bash
git add src/screens/LibraryScreen.tsx
git commit -m "feat: kütüphane ekranı gömülü çevirileri listeler (bundled kaynağı)"
```

---

### Task 5: Yanlış Gutenberg demo seed'ini geri al

**Files:**
- Delete: `src/store/seedBooks.ts`
- Delete: `src/store/demoBooks.ts`
- Delete: `src/store/demoBooks.test.ts`
- Modify: `src/screens/HomeScreen.tsx`
- Modify: `package.json`

- [ ] **Step 1: Demo seed dosyalarını sil**

```bash
git rm src/store/seedBooks.ts src/store/demoBooks.ts src/store/demoBooks.test.ts
```

- [ ] **Step 2: `HomeScreen.tsx`'ten seed import'unu kaldır**

Şu satırı sil:

```ts
import { seedDemoBooksOnce } from '../store/seedBooks';
```

- [ ] **Step 3: `HomeScreen.tsx`'ten seed çağrısını kaldır**

`useEffect` içindeki bloğu eski haline döndür. Mevcut:

```ts
  useEffect(() => {
    clearConversation();
    seedDemoBooksOnce(); // ilk açılışta deneme kitaplarını kitaplığa ekle
    announce.welcome();
  }, []);
```

Yeni:

```ts
  useEffect(() => {
    clearConversation();
    announce.welcome();
  }, []);
```

- [ ] **Step 4: `package.json` test betiğinden `demoBooks.test.ts`'i çıkar**

`&& tsx src/store/demoBooks.test.ts` parçasını sil. Nihai betik:

```json
"test": "tsx src/utils/frontMatter.test.ts && tsx src/sources/gutenbergText.test.ts && tsx src/utils/textChunk.test.ts && tsx src/utils/localIntent.test.ts && tsx src/utils/geminiService.test.ts && tsx src/books/index.test.ts"
```

- [ ] **Step 5: tsc temiz + tüm testler geçiyor mu**

Run: `cd "C:\Claude Deneme\SesliKitap" && npx tsc --noEmit && npm test`
Expected: tsc hata yok; tüm testler geçer (`fail 0`). `seedBooks`/`demoBooks` referansı kalmamalı.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "revert: İngilizce Gutenberg demo seed'i kaldırıldı (gömülü kütüphane lehine)"
```

---

## Doğrulama (tüm tasklar sonrası)

- [ ] **Telefonda elle doğrula:** Ana ekranı basılı tutup **"kütüphaneye git"** de →
  Kütüphane açılır, 3 gömülü kitap (İstiklâl Marşı, Nasreddin Hoca Fıkraları, Forsa)
  alt alta listelenir. Bir kitabın adını veya numarasını söyle → Okuyucu açılır ve
  metin çevrimdışı (internet kapalıyken bile) gelir.
- [ ] **Arama bağımsız çalışıyor:** Ana ekranda bir İngilizce kitap adı söyle →
  Gutenberg araması eskisi gibi çalışır (gömülü kitaplar aramaya karışmaz).
