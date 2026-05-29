import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useOfflineBooks, splitIntoPages } from '../hooks/useOfflineBooks';
import { fetchBookText } from '../sources';
import { findMainTextStart } from '../utils/frontMatter';
import { translateToTurkish } from '../utils/translator';
import { speakBook, stopSpeaking, getRate, speak, announce } from '../utils/tts';
import { getBook, updateLastPage } from '../store/bookStorage';
import { readAsStringAsync } from 'expo-file-system';
import { RootStackParamList } from '../../App';

type ReaderRouteProp = RouteProp<RootStackParamList, 'Reader'>;
type ReaderNavProp = StackNavigationProp<RootStackParamList, 'Reader'>;

function splitIntoSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…;:\n])\s+/);
  return parts.filter((s) => s.trim().length > 0);
}

export default function ReaderScreen() {
  const route = useRoute<ReaderRouteProp>();
  const navigation = useNavigation<ReaderNavProp>();
  const { bookId, bookTitle } = route.params;

  const [pages, setPages] = useState<string[]>([]);
  const [fullText, setFullText] = useState('');
  const [mainStart, setMainStart] = useState(0);
  const [includeFrontMatter] = useState(false);
  const [pageText, setPageText] = useState('');
  const [translating, setTranslating] = useState(false);
  // Gutenberg kaynağı İngilizce metin döndürür → sayfa sayfa Türkçeye çevrilir.
  const needsTranslation = bookId.startsWith('gutenberg:');
  const [currentPage, setCurrentPage] = useState(route.params.startPage ?? 1);
  const [currentSentence, setCurrentSentence] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const lastTap = useRef(0);
  const isPlayingRef = useRef(false);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Kitap metnini yükle
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

        // Yerel dosya yoksa kaynaktan çek (HomeScreen cache'lediyse anında gelir)
        if (!text) {
          text = await fetchBookText(bookId);
        }

        if (!cancelled) {
          setMainStart(findMainTextStart(text));
          setFullText(text);
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
  }, [bookId, bookTitle]);

  // Ham metin / ön bilgi tercihine göre sayfaları türet (varsayılan: asıl metinden).
  useEffect(() => {
    if (!fullText) return;
    const body = includeFrontMatter ? fullText : fullText.slice(mainStart);
    setPages(splitIntoPages(body));
  }, [fullText, mainStart, includeFrontMatter]);

  const rawPage = pages[currentPage - 1] ?? '';
  const currentText = needsTranslation ? pageText : rawPage;
  const totalPages = pages.length;

  // Gutenberg sayfası okunurken İngilizceden Türkçeye çevir (önbellekli, lazy).
  useEffect(() => {
    if (!needsTranslation) return;
    let cancelled = false;
    if (!rawPage) {
      setPageText('');
      return;
    }
    setTranslating(true);
    translateToTurkish(rawPage)
      .then((tr) => { if (!cancelled) setPageText(tr); })
      .catch(() => { if (!cancelled) setPageText(rawPage); })
      .finally(() => { if (!cancelled) setTranslating(false); });
    return () => { cancelled = true; };
  }, [rawPage, needsTranslation]);

  // Sayfa değişince cümle imlecini sıfırla
  useEffect(() => {
    setCurrentSentence(0);
  }, [currentPage]);

  // Unmount: TTS ve zamanlayıcı temizliği
  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      stopSpeaking();
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, []);

  const pauseReading = useCallback(async () => {
    isPlayingRef.current = false;
    await stopSpeaking();
    setIsPlaying(false);
  }, []);

  const readFromCurrent = useCallback(async () => {
    if (needsTranslation && (translating || !pageText)) {
      await speak('Sayfa çevriliyor, lütfen bekleyin.');
      return;
    }
    if (!currentText) return;

    isPlayingRef.current = true;
    setIsPlaying(true);

    const sentences = splitIntoSentences(currentText);
    for (let s = currentSentence; s < sentences.length; s++) {
      if (!isPlayingRef.current) break;
      setCurrentSentence(s);
      await speakBook(sentences[s], getRate());
      if (!isPlayingRef.current) break;
    }

    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      if (currentPage < totalPages) {
        const next = currentPage + 1;
        setCurrentPage(next);
        setCurrentSentence(0);
        updateLastPage(bookId, next);
        await announce.pageChanged(next);
      } else {
        await announce.bookEnded();
      }
    }
  }, [currentText, currentSentence, currentPage, totalPages, bookId, needsTranslation, translating, pageText]);

  const goToPage = useCallback(
    async (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      await stopSpeaking();
      isPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentPage(clamped);
      setCurrentSentence(0);
      await updateLastPage(bookId, clamped);
      await announce.pageChanged(clamped);
    },
    [totalPages, bookId]
  );

  // Çift dokunma: oynat/duraklat
  const handleDoubleTap = useCallback(async () => {
    const now = Date.now();
    if (now - lastTap.current < 400) {
      if (isPlaying) {
        await pauseReading();
        await announce.paused();
      } else {
        readFromCurrent();
      }
    }
    lastTap.current = now;
  }, [isPlaying, pauseReading, readFromCurrent]);

  // Kaydırma ile sayfa geçişi
  const swipeHandler = useCallback((dx: number) => {
    if (dx < -50 && currentPage < totalPages) {
      goToPage(currentPage + 1);
    } else if (dx > 50 && currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, totalPages, goToPage]);

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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Kitap yükleniyor...</Text>
      </View>
    );
  }

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

      {/* Orta alan: oynat/duraklat durumu (çift dokunma ile değişir) */}
      <Pressable
        style={styles.contentArea}
        onPress={handleDoubleTap}
        accessibilityLabel={isPlaying ? 'Okunuyor. Duraklatmak için çift dokunun.' : 'Duraklatıldı. Okumak için çift dokunun.'}
        accessibilityRole="button"
      >
        <Text style={styles.stateGlyph}>{isPlaying ? '⏸' : '▶'}</Text>
      </Pressable>

      {/* Çeviri göstergesi */}
      {translating && (
        <View style={styles.thinkingBar}>
          <ActivityIndicator size="small" color="#4fc3f7" />
          <Text style={styles.thinkingText}>Çevriliyor...</Text>
        </View>
      )}

      {/* Kontroller: önceki sayfa — oynat/duraklat — sonraki sayfa */}
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
          onPress={isPlaying ? pauseReading : readFromCurrent}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateGlyph: {
    color: '#222',
    fontSize: 120,
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
    paddingVertical: 24,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  controlButton: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#555',
  },
  controlText: {
    color: '#fff',
    fontSize: 48,
  },
  playButton: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#fff',
  },
  playingButton: {
    borderColor: '#f00',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 48,
  },
});
