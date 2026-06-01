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
