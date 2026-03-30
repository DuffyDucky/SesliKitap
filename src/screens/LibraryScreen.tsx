import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useOfflineBooks } from '../hooks/useOfflineBooks';
import { useSpeech } from '../hooks/useSpeech';
import { chat, setConversationContext } from '../utils/geminiService';
import { speak, announce } from '../utils/tts';
import { BookMetadata } from '../store/bookStorage';
import { RootStackParamList } from '../../App';

type LibraryNavProp = StackNavigationProp<RootStackParamList, 'Library'>;

export default function LibraryScreen() {
  const navigation = useNavigation<LibraryNavProp>();
  const { books, loadBooks, deleteBook } = useOfflineBooks();
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    loadBooks().then(() => {
      // Kitaplık açılışında kitap sayısını sesli bildir
    });
  }, [loadBooks]);

  // Kitaplık açılışında kitap sayısını bildir
  const announcedRef = React.useRef(false);
  useEffect(() => {
    if (!announcedRef.current && books.length >= 0) {
      announcedRef.current = true;
      if (books.length === 0) {
        speak('Kitaplığınız boş. Ana ekrandan kitap adı söyleyerek kitap indirebilirsiniz.');
      } else {
        speak(`Kitaplığınızda ${books.length} kitap var. Kitap adı veya numarası söyleyerek açabilirsiniz.`);
      }
    }
  }, [books]);

  useEffect(() => {
    if (books.length > 0) {
      const bookList = books.map((b, i) => `${i + 1}. ${b.title} (${b.author})`).join(', ');
      setConversationContext(`Kullanıcı kitaplık ekranında. İndirilen kitaplar: ${bookList}`);
    }
  }, [books]);

  const openBook = useCallback(
    (book: BookMetadata) => {
      navigation.navigate('Reader', {
        bookId: book.id,
        bookTitle: book.title,
        bookAuthor: book.author,
        textUrl: null,
        source: book.source,
        sourceId: book.sourceId,
        wikisourceTitle: book.source === 'wikisource' ? book.title : undefined,
        startPage: book.lastPage,
      });
    },
    [navigation]
  );

  const handleVoiceResult = useCallback(
    async (text: string) => {
      setThinking(true);
      try {
        const bookList = books.map((b, i) => `${i + 1}. ${b.title}`).join(', ');
        const appContext = `Kullanıcı kitaplık ekranında. İndirilen kitaplar: ${bookList}. Kullanıcı sıra numarası veya kitap adı söyleyerek kitap açabilir.`;

        const response = await chat(text, appContext);
        await speak(response.speech);

        if (response.action === 'open_book' && response.book) {
          // Kitaplıkta eşleşen kitabı bul
          const lower = response.book.toLowerCase();
          const found = books.find((b) => b.title.toLowerCase().includes(lower));
          if (found) {
            openBook(found);
            return;
          }

          // Numara ile eşleştir
          const num = parseInt(response.book, 10);
          if (!isNaN(num) && num >= 1 && num <= books.length) {
            openBook(books[num - 1]);
            return;
          }
        }

        if (response.action === 'go_home') {
          navigation.goBack();
        }
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

  const renderItem = ({ item, index }: { item: BookMetadata; index: number }) => (
    <TouchableOpacity
      style={styles.bookItem}
      onPress={() => openBook(item)}
      accessibilityLabel={`${index + 1}. kitap: ${item.title}, ${item.author}`}
      accessibilityHint="Açmak için dokunun"
      accessibilityRole="button"
    >
      <View style={styles.bookInfo}>
        <Text style={styles.bookNumber}>{index + 1}.</Text>
        <View style={styles.bookDetails}>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.bookAuthor}>{item.author}</Text>
          <View style={styles.bookMeta}>
            <Text style={styles.offlineBadge}>✓ Çevrimdışı</Text>
            <Text style={styles.bookDate}>
              {new Date(item.downloadedAt).toLocaleDateString('tr-TR')}
            </Text>
          </View>
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => {
          speak(`${item.title} silinecek, emin misiniz?`).then(() => {
            Alert.alert(
              'Kitabı Sil',
              `${item.title} silinecek, emin misiniz?`,
              [
                { text: 'İptal', style: 'cancel', onPress: () => speak('İptal edildi.') },
                {
                  text: 'Sil',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteBook(item.id);
                    announce.bookDeleted(item.title);
                  },
                },
              ]
            );
          });
        }}
        accessibilityLabel={`${item.title} kitabını sil`}
        accessibilityRole="button"
      >
        <Text style={styles.deleteText}>🗑</Text>
      </TouchableOpacity>
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
          Kitaplığım
        </Text>
      </View>

      {books.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Henüz indirilmiş kitap yok.{'\n'}Ana ekrandan kitap adı söyleyin.
          </Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          accessibilityLabel="İndirilen kitaplar listesi"
        />
      )}

      {thinking && (
        <View style={styles.thinkingBar}>
          <ActivityIndicator size="small" color="#4fc3f7" />
          <Text style={styles.thinkingText}>Gemini düşünüyor...</Text>
        </View>
      )}

      <Pressable
        onPressIn={startListening}
        onPressOut={stopListening}
        style={[styles.micButton, isListening && styles.micActive]}
        accessibilityLabel="Sesli komut. Kitap numarası söyleyin."
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
  },
  bookInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  bookMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  offlineBadge: {
    color: '#4caf50',
    fontSize: 20,
    fontWeight: '600',
  },
  bookDate: {
    color: '#666',
    fontSize: 20,
  },
  deleteButton: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  deleteText: {
    fontSize: 32,
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
