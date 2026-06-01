# Kütüphane TalkBack-Benzeri Keşif — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kütüphane ekranını, görme engelli kullanıcının kitapları sesle gezerek keşfettiği tek bir TalkBack-benzeri jest yüzeyine dönüştürmek.

**Architecture:** Ekranın tamamı tek `GestureDetector` yüzeyi olur: sağa/sola kaydır = odağı sonraki/önceki kitaba taşı ve adını seslendir, çift dokunma = odaktaki kitabı aç, basılı tut = konuş (sesli komut). Odak adım mantığı saf bir modüle (`libraryFocus.ts`) çıkarılır ve node:test ile test edilir; ekran bu saf mantığı çağırır. Liste dokunmayla kaydırılamaz; gezinme yalnızca odak + `scrollToIndex` ile olur.

**Tech Stack:** React Native 0.83 / Expo 55 / TypeScript, `react-native-gesture-handler` (modern Gesture API, zaten bağımlı), `expo-speech` (TTS), node:test + tsx (saf mantık testleri).

**Spec:** `docs/superpowers/specs/2026-06-01-kutuphane-talkback-design.md`

---

## Önemli Bağlam (uygulayıcı için)

- **Reanimated YOK.** Bu projede `react-native-reanimated` bağımlılığı yoktur. Bu nedenle `react-native-gesture-handler` Gesture API geri çağrıları **JS thread'inde** çalışır; `setState`/`speak` doğrudan çağrılabilir, `runOnJS` GEREKMEZ.
- **TTS:** `import { speak } from '../utils/tts'` — `speak(text: string)` daima tr-TR konuşur (asistan sesi). `await speak(...)` desteklenir.
- **Kaynaklar:** `import { listBundledBooks, bundledSource, BookSearchResult } from '../sources'`. `listBundledBooks(): BookSearchResult[]` gömülü kitapları döndürür; `bundledSource.search(q)` Türkçe-duyarlı/alias eşleşme yapar. `BookSearchResult` alanları: `id`, `title`, `author` (en az bunlar — mevcut `LibraryScreen` bunları kullanıyor).
- **Niyet:** `import { parseLocalIntent } from '../utils/localIntent'` — `GeminiResponse { action, book?, speech?, ... }` döner. İlgili action'lar: `go_home`, `go_library`, `open_book`, `unknown`.
- **Konuşma:** `import { useSpeech } from '../hooks/useSpeech'` → `{ startListening, stopListening, isListening, ... }`. `startListening` izin ister ve tr-TR dinler; sonuç `onResult` callback'ine düşer.
- **Mevcut `LibraryScreen.tsx`'in çalışan kısımları korunur:** `handleVoiceResult` (parseLocalIntent → go_home/go_library/open_book), `openBook` (Reader'a navigate), açılış anonsu, `thinking` durumu. Bu plan bunları jest tabanlı yüzeyle birleştirir ve alttaki ayrı mikrofon butonunu kaldırır.
- **Test çalıştırma:** `npm test` (tsx ile saf testler). Ekran/App için `npx tsc --noEmit`.

---

## Task 1: Saf odak adım mantığı (`libraryFocus`)

**Files:**
- Create: `src/utils/libraryFocus.ts`
- Test: `src/utils/libraryFocus.test.ts`
- Modify: `package.json` (test betiğine yeni test dosyası eklenir)

- [ ] **Step 1: Write the failing test**

`src/utils/libraryFocus.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepFocus } from './libraryFocus';

test('ortadan sonraki → indeks artar, sınır yok', () => {
  assert.deepEqual(stepFocus(1, 1, 5), { index: 2, atBoundary: null });
});

test('ortadan önceki → indeks azalır, sınır yok', () => {
  assert.deepEqual(stepFocus(2, -1, 5), { index: 1, atBoundary: null });
});

test('sondan sonraki → aynı indeks, atBoundary=end', () => {
  assert.deepEqual(stepFocus(4, 1, 5), { index: 4, atBoundary: 'end' });
});

test('baştan önceki → aynı indeks, atBoundary=start', () => {
  assert.deepEqual(stepFocus(0, -1, 5), { index: 0, atBoundary: 'start' });
});

test('tek kitap: sonraki → end, önceki → start', () => {
  assert.deepEqual(stepFocus(0, 1, 1), { index: 0, atBoundary: 'end' });
  assert.deepEqual(stepFocus(0, -1, 1), { index: 0, atBoundary: 'start' });
});

test('boş liste: güvenli no-op', () => {
  assert.deepEqual(stepFocus(0, 1, 0), { index: 0, atBoundary: null });
  assert.deepEqual(stepFocus(0, -1, 0), { index: 0, atBoundary: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/utils/libraryFocus.test.ts`
Expected: FAIL — `Cannot find module './libraryFocus'` (veya `stepFocus is not a function`).

- [ ] **Step 3: Write minimal implementation**

`src/utils/libraryFocus.ts`:

```ts
/**
 * Kütüphane keşfinde odak adım mantığı (saf, React Native'den bağımsız).
 * Görme engelli kullanıcı kaydırarak gezerken odağı bir kitap ileri/geri taşır.
 * Liste sınırında kalır (clamp) ve sınıra çarpıldığını atBoundary ile bildirir;
 * çağıran ekran buna göre sınır uyarısı seslendirir.
 */
export type FocusStep = { index: number; atBoundary: 'start' | 'end' | null };

/**
 * @param current Mevcut odak indeksi (0 tabanlı)
 * @param dir +1 sonraki kitap, -1 önceki kitap
 * @param count Kütüphanedeki kitap sayısı
 */
export function stepFocus(current: number, dir: 1 | -1, count: number): FocusStep {
  if (count <= 0) return { index: 0, atBoundary: null };
  if (dir === 1) {
    if (current >= count - 1) return { index: current, atBoundary: 'end' };
    return { index: current + 1, atBoundary: null };
  }
  if (current <= 0) return { index: current, atBoundary: 'start' };
  return { index: current - 1, atBoundary: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/utils/libraryFocus.test.ts`
Expected: PASS — 6 test geçer.

- [ ] **Step 5: Add test to package.json test script**

`package.json` içindeki `"test"` betiğinin sonuna ` && tsx src/utils/libraryFocus.test.ts` ekle. Yeni hali:

```json
    "test": "tsx src/utils/frontMatter.test.ts && tsx src/sources/gutenbergText.test.ts && tsx src/utils/textChunk.test.ts && tsx src/utils/localIntent.test.ts && tsx src/utils/geminiService.test.ts && tsx src/books/index.test.ts && tsx src/utils/libraryFocus.test.ts"
```

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: Tüm testler geçer (libraryFocus dahil).

- [ ] **Step 7: Commit**

```bash
git add src/utils/libraryFocus.ts src/utils/libraryFocus.test.ts package.json
git commit -m "feat: kütüphane odak adım mantığı (saf, test edilir)"
```

---

## Task 2: Çıkış niyeti düzeltmesi (`localIntent`)

**Sorun:** `parseLocalIntent` şu an `(kitapli|kutuphane)` kuralını ana-ekran kuralından önce kontrol ediyor. "kütüphaneden çık" ifadesi "kütüphane" kelimesini içerdiği için yanlışlıkla `go_library` (kütüphane ekranında "zaten buradasınız") dönüyor. Düzeltme: çıkış ifadelerini kütüphane kuralından **önce** yakala.

**Files:**
- Modify: `src/utils/localIntent.ts:131-137`
- Test: `src/utils/localIntent.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/utils/localIntent.test.ts` dosyasının sonuna ekle:

```ts
test('"kütüphaneden çık" → go_home (go_library DEĞİL)', () => {
  assert.equal(parseLocalIntent('kütüphaneden çık').action, 'go_home');
});

test('"çıkış" → go_home', () => {
  assert.equal(parseLocalIntent('çıkış').action, 'go_home');
});

test('"ana sayfaya dön" → go_home', () => {
  assert.equal(parseLocalIntent('ana sayfaya dön').action, 'go_home');
});

test('regresyon: "kütüphaneye git" → hâlâ go_library', () => {
  assert.equal(parseLocalIntent('kütüphaneye git').action, 'go_library');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/utils/localIntent.test.ts`
Expected: FAIL — "kütüphaneden çık" testi `go_library` döndüğü için kırmızı.

- [ ] **Step 3: Implement the fix**

`src/utils/localIntent.ts` içinde mevcut blok (yaklaşık 131-137):

```ts
  // 12) Kitaplık / ana ekran
  if (/(kitapli|kutuphane)/.test(t)) {
    return { action: 'go_library', speech: 'Kitaplığa gidiyorum.' };
  }
  if (/\b(ana ekran|ana sayfa|cikis|kapat)\b/.test(t)) {
    return { action: 'go_home', speech: 'Ana ekrana dönüyorum.' };
  }
```

şununla değiştir:

```ts
  // 12) Ana ekrana dönüş — çıkış ifadeleri ("kütüphaneden çık") "kütüphane"
  //     kelimesi içerse bile go_library DEĞİL go_home olmalı; bu yüzden kontrol
  //     kütüphane kuralından ÖNCE gelir. "kütüphaneye git" ise cik/cikis içermez.
  if (/\b(cik|cikis|ana ekran|ana sayfa|kapat)\b/.test(t)) {
    return { action: 'go_home', speech: 'Ana ekrana dönüyorum.' };
  }
  // 13) Kitaplığa git
  if (/(kitapli|kutuphane)/.test(t)) {
    return { action: 'go_library', speech: 'Kitaplığa gidiyorum.' };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/utils/localIntent.test.ts`
Expected: PASS — yeni 4 test dahil tümü geçer.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: Tüm testler geçer.

- [ ] **Step 6: Commit**

```bash
git add src/utils/localIntent.ts src/utils/localIntent.test.ts
git commit -m "fix: 'kütüphaneden çık' artık go_home (kütüphane kuralından önce)"
```

---

## Task 3: `GestureHandlerRootView` kökü (`App.tsx`)

Modern Gesture API'nin çalışması için ağacın kökü `GestureHandlerRootView` ile sarılmalıdır; bu olmadan jestler sessizce tetiklenmez.

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Add the import**

`App.tsx` ilk import bloğunun başına ekle:

```ts
import { GestureHandlerRootView } from 'react-native-gesture-handler';
```

- [ ] **Step 2: Wrap the tree**

`App()` fonksiyonunun `return (...)` içeriğini en dışta `GestureHandlerRootView` ile sar. Yeni gövde:

```tsx
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <NavigationContainer>
          <StatusBar style="light" backgroundColor="#000" />
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              headerShown: false,
              cardStyle: { backgroundColor: '#000' },
            }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Reader" component={ReaderScreen} />
            <Stack.Screen name="Library" component={LibraryScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 4: Commit**

```bash
git add App.tsx
git commit -m "feat: GestureHandlerRootView ile kökü sar (jest yüzeyi için)"
```

---

## Task 4: Kütüphane ekranını jest yüzeyine dönüştür (`LibraryScreen`)

Tüm ekranı tek `GestureDetector` yüzeyi yapar: kaydır-gez, çift-dokun-aç, basılı-tut-konuş. Odak vurgusu + `scrollToIndex`. Alttaki ayrı mikrofon butonu kaldırılır.

**Files:**
- Modify (yeniden yaz): `src/screens/LibraryScreen.tsx`

- [ ] **Step 1: Replace the file with the gesture-based screen**

`src/screens/LibraryScreen.tsx` içeriğini tamamen aşağıdakiyle değiştir:

```tsx
import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSpeech } from '../hooks/useSpeech';
import { parseLocalIntent } from '../utils/localIntent';
import { speak } from '../utils/tts';
import { stepFocus } from '../utils/libraryFocus';
import { listBundledBooks, bundledSource, BookSearchResult } from '../sources';
import { RootStackParamList } from '../../App';

type LibraryNavProp = StackNavigationProp<RootStackParamList, 'Library'>;

const SWIPE_THRESHOLD = 20; // px — bu kadar yatay kayma "kaydırma" sayılır

export default function LibraryScreen() {
  const navigation = useNavigation<LibraryNavProp>();
  const books = useMemo(() => listBundledBooks(), []);
  const [thinking, setThinking] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const focusIndexRef = useRef(0); // jest closure'ları güncel değeri okusun
  const listRef = useRef<FlatList<BookSearchResult>>(null);
  const talkingRef = useRef(false); // basılı-tut dinleme başladı mı

  // Odağı ayarla: ref + state güncelle, öğeyi görünür alana kaydır.
  const setFocus = useCallback(
    (i: number) => {
      focusIndexRef.current = i;
      setFocusIndex(i);
      if (books.length > 0) {
        listRef.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
      }
    },
    [books.length]
  );

  // Açılış anonsu (bir kez): kitap sayısı + kullanım + ilk kitap.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (announcedRef.current) return;
    announcedRef.current = true;
    if (books.length === 0) {
      speak('Kütüphane şu an boş.');
      return;
    }
    const first = books[0];
    speak(
      `Kütüphanede ${books.length} kitap var. Kaydırarak gezebilir, çift dokunarak açabilirsiniz. İlk kitap: ${first.title}, ${first.author}.`
    );
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

  // Odaktaki kitabın adını seslendir.
  const announceFocused = useCallback(
    (i: number) => {
      const b = books[i];
      if (b) speak(`${i + 1}. ${b.title}, ${b.author}`);
    },
    [books]
  );

  // Kaydırma: odağı bir adım taşı; sınırdaysa uyar.
  const moveFocus = useCallback(
    (dir: 1 | -1) => {
      const res = stepFocus(focusIndexRef.current, dir, books.length);
      if (res.atBoundary === 'start') {
        speak('Listenin başındasınız.');
        return;
      }
      if (res.atBoundary === 'end') {
        speak('Listenin sonundasınız.');
        return;
      }
      setFocus(res.index);
      announceFocused(res.index);
    },
    [books.length, setFocus, announceFocused]
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

        if (response.action === 'go_library') {
          await speak('Zaten kütüphane ekranındasınız.');
          return;
        }

        if (response.action === 'open_book' && response.book) {
          // İsim/takma ad ile Türkçe-duyarlı eşleşme.
          const matches = await bundledSource.search(response.book);
          if (matches.length > 0) {
            await speak(`${matches[0].title} açılıyor.`);
            openBook(matches[0]);
            return;
          }
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

  const { startListening, stopListening } = useSpeech(handleVoiceResult);

  // Tüm ekranı kaplayan birleşik jest: kaydırma / çift dokunma / basılı tut.
  // Reanimated kurulu olmadığından bu geri çağrılar JS thread'inde çalışır;
  // setState/speak doğrudan çağrılabilir.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
      .onEnd((e) => {
        if (e.translationX >= SWIPE_THRESHOLD) moveFocus(1); // sağa → sonraki
        else if (e.translationX <= -SWIPE_THRESHOLD) moveFocus(-1); // sola → önceki
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd(() => {
        const b = books[focusIndexRef.current];
        if (b) openBook(b);
      });

    const longPress = Gesture.LongPress()
      .minDuration(400)
      .onStart(() => {
        talkingRef.current = true;
        startListening();
      })
      .onFinalize(() => {
        if (talkingRef.current) {
          talkingRef.current = false;
          stopListening();
        }
      });

    return Gesture.Race(pan, doubleTap, longPress);
  }, [moveFocus, openBook, books, startListening, stopListening]);

  const renderItem = useCallback(
    ({ item, index }: { item: BookSearchResult; index: number }) => {
      const focused = index === focusIndex;
      return (
        <View
          style={[styles.bookItem, focused && styles.bookItemFocused]}
          accessibilityLabel={`${index + 1}. kitap: ${item.title}, ${item.author}`}
          accessibilityRole="text"
        >
          <Text style={styles.bookNumber}>{index + 1}.</Text>
          <View style={styles.bookDetails}>
            <Text style={styles.bookTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.bookAuthor}>{item.author}</Text>
          </View>
        </View>
      );
    },
    [focusIndex]
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.container}>
        <View style={styles.header}>
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
            ref={listRef}
            data={books}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            scrollEnabled={false}
            contentContainerStyle={styles.listContent}
            accessibilityLabel="Kütüphanedeki kitaplar listesi"
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                listRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.5,
                });
              }, 300);
            }}
          />
        )}

        {thinking && (
          <View style={styles.thinkingBar}>
            <ActivityIndicator size="small" color="#4fc3f7" />
            <Text style={styles.thinkingText}>Düşünüyor...</Text>
          </View>
        )}

        <View style={styles.hintBar}>
          <Text style={styles.hintText}>
            Kaydır: gez · Çift dokun: aç · Basılı tut: konuş
          </Text>
        </View>
      </View>
    </GestureDetector>
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
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
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
  bookItemFocused: {
    borderColor: '#4fc3f7',
    backgroundColor: '#0a2230',
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
  hintBar: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center',
  },
  hintText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: Hata yok. (Kullanılmayan import kalmadığından emin ol: `TouchableOpacity`, `Pressable`, `isListening` artık yok.)

- [ ] **Step 3: Run full suite (regresyon)**

Run: `npm test`
Expected: Tüm saf testler geçer (bu ekran testte koşmaz ama mevcut testler kırılmamalı).

- [ ] **Step 4: Commit**

```bash
git add src/screens/LibraryScreen.tsx
git commit -m "feat: kütüphane TalkBack-benzeri jest yüzeyi (kaydır-gez, çift-dokun-aç, basılı-tut-konuş)"
```

---

## Manuel Doğrulama (cihazda, tüm task'lar sonrası)

Metro yeniden yükle, ana ekranda basılı tutup "kütüphaneye git" de. Sonra kütüphanede:

- [ ] Açılışta "Kütüphanede 3 kitap var... İlk kitap: İstiklâl Marşı..." duyulur; ilk kitap vurgulu.
- [ ] **Sağa kaydır** → "2. Nasreddin Hoca, ..." duyulur, vurgu o kitaba geçer.
- [ ] **Sola kaydır** → önceki kitaba döner.
- [ ] Sonda **sağa kaydır** → "Listenin sonundasınız."; başta **sola kaydır** → "Listenin başındasınız."
- [ ] **Çift dokunma** → odaktaki kitap Reader'da açılır.
- [ ] **Basılı tut** + "kütüphaneden çık" → ana ekrana döner (go_library DEĞİL).
- [ ] **Basılı tut** + "İstiklâl Marşı'nı aç" → kitap açılır.

---

## Notlar

- Bu plan, daha önce uncommitted bekleyen UI işlerine (HomeScreen, ReaderScreen offline-fix, unwrapLines) **dokunmaz**; yalnızca `App.tsx`, `LibraryScreen.tsx`, `localIntent.ts`/test, yeni `libraryFocus.ts`/test ve `package.json` değişir. Her task kendi dosyalarını commit eder (`git add -A` KULLANMA — kullanıcının bekleyen işleri karışmasın).
- Reanimated kurulu olmadığı için jest callback'lerinde `runOnJS` gerekmez; kurulursa bu varsayım gözden geçirilmeli.
