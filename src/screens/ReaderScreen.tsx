import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSpeech } from '../hooks/useSpeech';
import { useOfflineBooks, splitIntoPages } from '../hooks/useOfflineBooks';
import { chat, setConversationContext } from '../utils/geminiService';
import { speak, speakBook, stopSpeaking, adjustRate, getRate, announce } from '../utils/tts';
import { fetchWikisourceText } from '../utils/wikisourceAPI';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { getBook, updateLastPage, addBookmark, getBookmarks } from '../store/bookStorage';
import { readAsStringAsync } from 'expo-file-system';
import { RootStackParamList } from '../../App';

type ReaderRouteProp = RouteProp<RootStackParamList, 'Reader'>;
type ReaderNavProp = StackNavigationProp<RootStackParamList, 'Reader'>;

function splitIntoWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

function splitIntoSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…;:\n])\s+/);
  return parts.filter((s) => s.trim().length > 0);
}

export default function ReaderScreen() {
  const route = useRoute<ReaderRouteProp>();
  const navigation = useNavigation<ReaderNavProp>();
  const { bookId, bookTitle, bookAuthor, textUrl, source, wikisourceTitle } = route.params;

  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(route.params.startPage ?? 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [thinking, setThinking] = useState(false);
  const lastTap = useRef(0);
  const isPlayingRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { downloadBook } = useOfflineBooks();

  // Gemini'ye kitap context'i ver
  useEffect(() => {
    setConversationContext(
      `Kullanıcı "${bookTitle}" (${bookAuthor}) kitabını okuyor. Kaynak: ${source}.`
    );
  }, [bookTitle, bookAuthor, source]);

  // Load book text
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      announce.bookLoading();
      try {
        let text = '';

        // Önce yerel dosyadan okumayı dene (çevrimdışı destek)
        const savedBook = await getBook(bookId);
        if (savedBook?.localPath) {
          try {
            text = await readAsStringAsync(savedBook.localPath);
          } catch {
            text = '';
          }
        }

        // Yerel dosya yoksa internetten çek
        if (!text) {
          if (textUrl) {
            const res = await fetchWithTimeout(textUrl, {}, 15000);
            text = await res.text();
          } else if (source === 'wikisource' && wikisourceTitle) {
            text = await fetchWikisourceText(wikisourceTitle);
          }
        }

        if (!cancelled) {
          setPages(splitIntoPages(text));
          await announce.bookOpened(bookTitle, 'birinci bölüm');
        }
      } catch {
        if (!cancelled) await announce.apiError();
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [bookId, textUrl, source, wikisourceTitle, bookTitle]);

  const currentText = pages[currentPage - 1] ?? '';
  const totalPages = pages.length;
  const words = splitIntoWords(currentText);

  const goToPage = useCallback(
    async (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      await stopSpeaking();
      isPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentPage(clamped);
      setCurrentWordIndex(0);
      await updateLastPage(bookId, clamped);
      await announce.pageChanged(clamped);
    },
    [totalPages, bookId]
  );

  const highlightTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearHighlightTimers = useCallback(() => {
    highlightTimers.current.forEach(clearTimeout);
    highlightTimers.current = [];
  }, []);

  // Unmount: timer ve TTS temizliği
  useEffect(() => {
    return () => {
      clearHighlightTimers();
      isPlayingRef.current = false;
      stopSpeaking();
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [clearHighlightTimers]);

  const readFromWord = useCallback(
    async (startWordIndex: number) => {
      isPlayingRef.current = true;
      setIsPlaying(true);

      const sentences = splitIntoSentences(currentText);

      let globalWordIdx = 0;
      let startSentenceIdx = 0;
      let startWordInSentence = 0;

      for (let s = 0; s < sentences.length; s++) {
        const sentenceWords = sentences[s].split(/\s+/).filter((w) => w.length > 0);
        if (globalWordIdx + sentenceWords.length > startWordIndex) {
          startSentenceIdx = s;
          startWordInSentence = startWordIndex - globalWordIdx;
          break;
        }
        globalWordIdx += sentenceWords.length;
      }

      let currentGlobalWord = startWordIndex;
      for (let s = startSentenceIdx; s < sentences.length; s++) {
        if (!isPlayingRef.current) break;

        const sentence = sentences[s];
        const sentenceWords = sentence.split(/\s+/).filter((w) => w.length > 0);
        const wordStartInSentence = s === startSentenceIdx ? startWordInSentence : 0;

        const textToSpeak = s === startSentenceIdx && startWordInSentence > 0
          ? sentenceWords.slice(startWordInSentence).join(' ')
          : sentence;

        const rate = getRate();
        const wordsToRead = sentenceWords.length - wordStartInSentence;
        const duration = (wordsToRead * 350) / rate;
        const perWord = duration / wordsToRead;

        clearHighlightTimers();
        for (let w = 0; w < wordsToRead; w++) {
          const wordGlobalIdx = currentGlobalWord + w;
          const timer = setTimeout(() => {
            if (isPlayingRef.current) {
              setCurrentWordIndex(wordGlobalIdx);
            }
          }, w * perWord);
          highlightTimers.current.push(timer);
        }

        setCurrentWordIndex(currentGlobalWord);
        await speakBook(textToSpeak, rate);
        clearHighlightTimers();

        if (!isPlayingRef.current) break;
        currentGlobalWord += wordsToRead;
      }

      if (isPlayingRef.current) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        if (currentPage < totalPages) {
          const nextPage = currentPage + 1;
          setCurrentPage(nextPage);
          setCurrentWordIndex(0);
          updateLastPage(bookId, nextPage);
          await announce.pageChanged(nextPage);
        } else {
          await announce.bookEnded();
        }
      }
    },
    [currentText, currentPage, totalPages, clearHighlightTimers, bookId]
  );

  const pauseReading = useCallback(async () => {
    isPlayingRef.current = false;
    clearHighlightTimers();
    await stopSpeaking();
    setIsPlaying(false);
  }, [clearHighlightTimers]);

  const resumeReading = useCallback(async () => {
    readFromWord(currentWordIndex);
  }, [currentWordIndex, readFromWord]);

  const handleVoiceResult = useCallback(
    async (text: string) => {
      setThinking(true);

      // Okuma sırasında önce duraklat
      const wasPlaying = isPlayingRef.current;
      if (wasPlaying) {
        await pauseReading();
      }

      try {
        const appContext = `Kullanıcı "${bookTitle}" kitabını okuyor. Sayfa ${currentPage}/${totalPages}. ${isPlaying ? 'Şu an okunuyor.' : 'Duraklatılmış.'} Yazar: ${bookAuthor}.`;

        const response = await chat(text, appContext);

        // Önce Gemini'nin yanıtını sesli söyle
        await speak(response.speech);

        // Sonra aksiyonu uygula
        switch (response.action) {
          case 'pause':
            // Zaten duraklattık
            break;
          case 'resume':
          case 'play':
            resumeReading();
            break;
          case 'go_to_page':
            if (response.page) await goToPage(response.page);
            break;
          case 'go_to_start':
            await goToPage(1);
            break;
          case 'set_speed_up': {
            const newRate = adjustRate(0.25);
            await announce.speedChanged(newRate);
            break;
          }
          case 'set_speed_down': {
            const newRate = adjustRate(-0.25);
            await announce.speedChanged(newRate);
            break;
          }
          case 'next_chapter':
            await goToPage(currentPage + 1);
            break;
          case 'prev_chapter':
            await goToPage(currentPage - 1);
            break;
          case 'help':
            await announce.help();
            break;
          case 'progress':
            await announce.progress(currentPage, totalPages);
            break;
          case 'set_timer': {
            const minutes = response.page ?? 10;
            if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
            sleepTimerRef.current = setTimeout(async () => {
              await pauseReading();
              await speak(`${minutes} dakika doldu, okuma duraklatıldı.`);
              sleepTimerRef.current = null;
            }, minutes * 60 * 1000);
            break;
          }
          case 'add_bookmark': {
            const marks = await addBookmark(bookId, currentPage);
            await speak(`Sayfa ${currentPage} yer imlerine eklendi. Toplam ${marks.length} yer imi.`);
            break;
          }
          case 'list_bookmarks': {
            const bookmarks = await getBookmarks(bookId);
            if (bookmarks.length === 0) {
              await speak('Henüz yer imi eklenmemiş.');
            } else {
              const list = bookmarks.map((p, i) => `${i + 1}. sayfa ${p}`).join(', ');
              await speak(`Yer imleriniz: ${list}.`);
            }
            break;
          }
          case 'go_bookmark': {
            const bmarks = await getBookmarks(bookId);
            const idx = (response.page ?? 1) - 1;
            if (bmarks.length === 0) {
              await speak('Yer imi bulunamadı.');
            } else if (idx >= 0 && idx < bmarks.length) {
              await goToPage(bmarks[idx]);
            } else {
              await speak('Geçersiz yer imi numarası.');
            }
            break;
          }
          case 'go_home':
            await stopSpeaking();
            navigation.goBack();
            break;
          case 'none':
            // Sadece konuşma — okuma duraklatılmış halde kalsın,
            // kullanıcı "devam" diyene kadar
            break;
          default:
            break;
        }
      } catch (e) {
        console.warn('Hata:', e);
        await speak('Bir sorun oluştu.');
      } finally {
        setThinking(false);
      }
    },
    [bookTitle, bookAuthor, currentPage, totalPages, isPlaying, goToPage, pauseReading, resumeReading, navigation]
  );

  const { isListening, startListening, stopListening } = useSpeech(handleVoiceResult);

  // Double-tap to toggle play/pause
  const handleDoubleTap = useCallback(async () => {
    const now = Date.now();
    if (now - lastTap.current < 400) {
      if (isPlaying) {
        await pauseReading();
        await announce.paused();
      } else {
        resumeReading();
      }
    }
    lastTap.current = now;
  }, [isPlaying, pauseReading, resumeReading]);

  // Swipe gesture
  const swipeHandler = useCallback((dx: number) => {
    if (dx < -50 && currentPage < totalPages) {
      const newPage = currentPage + 1;
      setCurrentPage(newPage);
      setCurrentWordIndex(0);
      updateLastPage(bookId, newPage);
      announce.pageChanged(newPage);
    } else if (dx > 50 && currentPage > 1) {
      const newPage = currentPage - 1;
      setCurrentPage(newPage);
      setCurrentWordIndex(0);
      updateLastPage(bookId, newPage);
      announce.pageChanged(newPage);
    }
  }, [currentPage, totalPages, bookId]);

  const swipeHandlerRef = useRef(swipeHandler);
  swipeHandlerRef.current = swipeHandler;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 30,
      onPanResponderRelease: (_, g) => {
        swipeHandlerRef.current(g.dx);
      },
    })
  ).current;

  useEffect(() => {
    setCurrentWordIndex(0);
  }, [currentPage]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Kitap yükleniyor...</Text>
      </View>
    );
  }

  const renderHighlightedText = () => {
    if (words.length === 0) {
      return <Text style={styles.bookText}>{currentText}</Text>;
    }

    return words.map((word, index) => {
      const isActive = isPlaying && index === currentWordIndex;
      return (
        <Text
          key={index}
          style={[
            styles.bookText,
            isActive && styles.highlightedText,
          ]}
        >
          {word}{index < words.length - 1 ? ' ' : ''}
        </Text>
      );
    });
  };

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { stopSpeaking(); navigation.goBack(); }}
          style={styles.backButton}
          accessibilityLabel="Geri dön"
          accessibilityRole="button"
        >
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => announce.progress(currentPage, totalPages)}
          accessibilityLabel={`Sayfa ${currentPage}, toplam ${totalPages}`}
          accessibilityHint="İlerleme bilgisi için dokunun"
        >
          <Text style={styles.bookTitle} numberOfLines={1} accessibilityRole="header">
            {bookTitle}
          </Text>
          <Text style={styles.pageInfo} accessibilityLiveRegion="polite">
            {currentPage} / {totalPages}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Book content */}
      <Pressable style={styles.contentArea} onPress={handleDoubleTap} accessible={false}>
        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.scrollContent}>
          <Text>
            {renderHighlightedText()}
          </Text>
        </ScrollView>
      </Pressable>

      {/* Thinking indicator */}
      {thinking && (
        <View style={styles.thinkingBar}>
          <ActivityIndicator size="small" color="#4fc3f7" />
          <Text style={styles.thinkingText}>Gemini düşünüyor...</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => goToPage(currentPage - 1)}
          accessibilityLabel="Önceki sayfa"
          accessibilityRole="button"
        >
          <Text style={styles.controlText}>‹</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playButton, isPlaying && styles.playingButton]}
          onPress={isPlaying ? pauseReading : resumeReading}
          accessibilityLabel={isPlaying ? 'Durdur' : 'Oku'}
          accessibilityRole="button"
        >
          <Text style={styles.playButtonText}>{isPlaying ? '⏸' : '▶'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => goToPage(currentPage + 1)}
          accessibilityLabel="Sonraki sayfa"
          accessibilityRole="button"
        >
          <Text style={styles.controlText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Mic button */}
      <Pressable
        onPressIn={startListening}
        onPressOut={stopListening}
        style={[styles.micButton, isListening && styles.micActive]}
        accessibilityLabel="Sesli komut. Basılı tutarak konuşun."
        accessibilityRole="button"
        disabled={thinking}
      >
        <Text style={styles.micText}>
          {isListening ? '🎙 Dinleniyor...' : thinking ? '🤔 Düşünüyor...' : '🎤 Komut'}
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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#fff',
    fontSize: 20,
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
  headerInfo: {
    flex: 1,
    paddingLeft: 8,
  },
  bookTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  pageInfo: {
    color: '#aaa',
    fontSize: 20,
    marginTop: 4,
  },
  contentArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  bookText: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 34,
  },
  highlightedText: {
    backgroundColor: '#FFD700',
    color: '#000',
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  controlButton: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#555',
  },
  controlText: {
    color: '#fff',
    fontSize: 40,
  },
  playButton: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#fff',
  },
  playingButton: {
    borderColor: '#f00',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 40,
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
