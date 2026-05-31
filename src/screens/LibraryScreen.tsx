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
import { listBundledBooks, bundledSource, BookSearchResult } from '../sources';
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

        if (response.action === 'go_library') {
          await speak('Zaten kütüphane ekranındasınız.');
          return;
        }

        if (response.action === 'open_book' && response.book) {
          // İsim/takma ad ile eşleştir (Türkçe-duyarlı normalize, bundled kaynağı).
          // STT "istiklal marsi" dese bile "İstiklâl Marşı" eşleşir.
          const matches = await bundledSource.search(response.book);
          if (matches.length > 0) {
            await speak(`${matches[0].title} açılıyor.`);
            openBook(matches[0]);
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

  const renderItem = useCallback(
    ({ item, index }: { item: BookSearchResult; index: number }) => (
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
    ),
    [openBook]
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
