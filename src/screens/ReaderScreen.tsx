import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useOfflineBooks, splitIntoPages } from '../hooks/useOfflineBooks';
import { fetchBookText } from '../sources';
import { findMainTextStart } from '../utils/frontMatter';
import { translationJob, translationStore, quotaGovernor } from '../translation/instances';
import { speakBook, stopSpeaking, getRate, adjustRate, speak, announce, setContentLanguage } from '../utils/tts';
import { getBook, getProgress, saveProgress, getLanguage, setLanguage, addBookmark, getBookmarks } from '../store/bookStorage';
import { readAsStringAsync } from 'expo-file-system';
import { useSpeech } from '../hooks/useSpeech';
import { parseLocalIntent } from '../utils/localIntent';
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
  const [includeFrontMatter, setIncludeFrontMatter] = useState(false);
  const [translatedText, setTranslatedText] = useState('');
  const [translating, setTranslating] = useState(false);
  // Global okuma dili: 'tr' ise sayfa Google Translate ile çevrilir, 'en' ise ham okunur.
  const [needsTranslation, setNeedsTranslation] = useState(false);
  const [currentPage, setCurrentPage] = useState(route.params.startPage ?? 1);
  const [currentSentence, setCurrentSentence] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const lastTap = useRef(0);
  const isPlayingRef = useRef(false);
  const pagesRef = useRef<string[]>([]);
  const awaitingTranslationRef = useRef(false);
  const readFromCurrentRef = useRef<() => void>(() => {});
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global dil ayarını yükle; TTS içerik dilini ve çeviri ihtiyacını belirle.
  // Gömülü kitaplar (bundled:) zaten Türkçe: asla çevirme, daima Türkçe sesle oku —
  // global dil 'tr' olsa bile Türkçe→Türkçe çeviri (ağ isteği) yapılmaz.
  useEffect(() => {
    let cancelled = false;
    const bundled = bookId.startsWith('bundled:');
    getLanguage().then((lang) => {
      if (cancelled) return;
      setNeedsTranslation(!bundled && lang === 'tr');
      setContentLanguage(bundled || lang === 'tr' ? 'tr' : 'en');
    });
    return () => { cancelled = true; };
  }, [bookId]);

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
          // Gömülü kitapların metni zaten doğru yerden (Giriş) kırpılmış —
          // findMainTextStart (Gutenberg/OCR sezgiseli) açılışı atlamasın.
          setMainStart(bookId.startsWith('bundled:') ? 0 : findMainTextStart(text));
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

  // needsTranslation: sayfalar diskteki çevrilmiş metinden türetilir (büyüyen,
  // kararlı liste). Aksi halde ham İngilizce/gömülü gövdeden.
  useEffect(() => {
    if (needsTranslation) {
      setPages(translatedText ? splitIntoPages(translatedText) : []);
      return;
    }
    if (!fullText) return;
    const body = includeFrontMatter ? fullText : fullText.slice(mainStart);
    setPages(splitIntoPages(body));
  }, [fullText, mainStart, includeFrontMatter, needsTranslation, translatedText]);

  // pages'i ref'te tut (okuma döngüsü closure tazeliği için).
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  const currentText = pages[currentPage - 1] ?? '';
  const totalPages = pages.length;

  // Sayfanın cümleleri — hem okuma döngüsü hem ekran aynı diziyi kullanır ki
  // vurgulanan cümle (currentSentence) okunanla birebir aynı olsun.
  const sentences = useMemo(() => splitIntoSentences(currentText), [currentText]);

  // Kayan metin: ScrollView ref + her cümlenin dikey konumu (otomatik kaydırma için).
  const scrollRef = useRef<ScrollView>(null);
  const offsetsRef = useRef<number[]>([]);

  // Sayfa/cümle dizisi değişince ölçülen konumlar geçersiz olur — sıfırla.
  useEffect(() => {
    offsetsRef.current = [];
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [sentences]);

  // Okunan cümleyi görünür alanın üst kısmına kaydır (telepromptör akışı).
  useEffect(() => {
    const y = offsetsRef.current[currentSentence];
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
    }
  }, [currentSentence]);

  // Çeviri işi: Gutenberg kitabı için arka planda blok blok Türkçeye çevir.
  // Okuma diskteki bitmiş bloklardan gelir; canlı çeviri YOK.
  useEffect(() => {
    if (!needsTranslation || !fullText) return;
    const english = includeFrontMatter ? fullText : fullText.slice(mainStart);

    const refresh = async () => {
      const done = await translationStore.getDone(bookId);
      let t = '';
      let i = 0;
      while (done[i] != null) { t += done[i]; i++; } // bitmiş-önek (contiguous)
      const st = translationJob.getState();
      setTranslatedText(t);
      setTranslating(st.status === 'running' && i < st.totalBlocks);
    };

    translationJob.start(bookId, english);
    const unsub = translationJob.subscribe(() => { refresh(); });
    refresh(); // ilk açılışta diskte hazır çeviri varsa hemen göster
    return () => { unsub(); };
  }, [needsTranslation, fullText, mainStart, includeFrontMatter, bookId]);

  // Güncel konumu ref'te tut (duraklatma/çıkış anında kaydetmek için).
  const currentPageRef = useRef(currentPage);
  const currentSentenceRef = useRef(currentSentence);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  useEffect(() => { currentSentenceRef.current = currentSentence; }, [currentSentence]);

  // Kaldığı yerden devam: sayfalar hazır olunca kayıtlı ilerlemeyi yükle.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || totalPages === 0) return;
    resumedRef.current = true;
    getProgress(bookId).then((p) => {
      if (!p) return;
      const pg = Math.min(Math.max(1, p.page), totalPages);
      setCurrentPage(pg);
      setCurrentSentence(Math.max(0, p.sentence));
    });
  }, [bookId, totalPages]);

  // Unmount: TTS/zamanlayıcı temizliği + son konumu kaydet.
  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      stopSpeaking();
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
      saveProgress(bookId, currentPageRef.current, currentSentenceRef.current);
    };
  }, [bookId]);

  const pauseReading = useCallback(async () => {
    isPlayingRef.current = false;
    await stopSpeaking();
    setIsPlaying(false);
    saveProgress(bookId, currentPageRef.current, currentSentenceRef.current);
  }, [bookId]);

  // Sürekli okuma: hazır Türkçe sayfalardan okur (canlı çeviri yok).
  // Başlangıç konumunu ref'lerden alır → pages/translatedText büyüse de stabil kalır.
  const readFromCurrent = useCallback(async () => {
    if (pagesRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsPlaying(true);

    let page = currentPageRef.current;
    let startSentence = currentSentenceRef.current;

    while (isPlayingRef.current && page <= pagesRef.current.length) {
      const sents = splitIntoSentences(pagesRef.current[page - 1] ?? '');
      for (let s = startSentence; s < sents.length; s++) {
        if (!isPlayingRef.current) break;
        setCurrentSentence(s);
        currentSentenceRef.current = s;
        saveProgress(bookId, page, s);
        await speakBook(sents[s], getRate());
      }
      if (!isPlayingRef.current) break;

      if (page < pagesRef.current.length) {
        page += 1;
        setCurrentPage(page);
        currentPageRef.current = page;
        setCurrentSentence(0);
        currentSentenceRef.current = 0;
        startSentence = 0;
        saveProgress(bookId, page, 0);
      } else {
        // Çevrilmiş sayfaların sonu.
        const st = translationJob.getState();
        const moreBlocks = needsTranslation && st.bookId === bookId && st.doneBlocks < st.totalBlocks;
        if (!moreBlocks) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          await announce.bookEnded();
          return;
        }
        if (await quotaGovernor.isExhaustedToday()) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          await speak('Günlük çeviri sınırına ulaşıldı. Yarın kaldığım yerden devam ederim.');
          return;
        }
        // Kota var: sıradaki blok birazdan gelecek. Duraklat, yeni sayfa çıkınca
        // otomatik devam et (aşağıdaki effect tetikler).
        await speak('Çevriliyor, bir saniye.');
        awaitingTranslationRef.current = true;
        isPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }
    }
  }, [bookId, needsTranslation]);

  useEffect(() => { readFromCurrentRef.current = readFromCurrent; }, [readFromCurrent]);

  // Çeviri ilerleyip yeni sayfa çıkınca, kotadan ötürü beklerken bırakıldıysa
  // sonraki sayfadan otomatik devam et.
  useEffect(() => {
    if (awaitingTranslationRef.current && totalPages > currentPageRef.current) {
      awaitingTranslationRef.current = false;
      const next = currentPageRef.current + 1;
      setCurrentPage(next);
      currentPageRef.current = next;
      setCurrentSentence(0);
      currentSentenceRef.current = 0;
      readFromCurrentRef.current();
    }
  }, [totalPages]);

  const goToPage = useCallback(
    async (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      await stopSpeaking();
      isPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentPage(clamped);
      setCurrentSentence(0);
      await saveProgress(bookId, clamped, 0);
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

  // Sesli komut işleyici — ekranı basılı tutunca dinler, bırakınca buraya düşer.
  // Düz fonksiyon: her render'da yeniden oluşur, böylece güncel sayfa/duruma erişir
  // (useSpeech callback'i onResultRef ile daima en günceli kullanır).
  const handleVoiceResult = async (text: string) => {
    const r = parseLocalIntent(text);
    switch (r.action) {
      case 'pause':
        await pauseReading();
        await announce.paused();
        break;
      case 'resume':
      case 'play':
        readFromCurrent();
        break;
      case 'next_chapter':
        await goToPage(currentPage + 1);
        break;
      case 'prev_chapter':
        await goToPage(currentPage - 1);
        break;
      case 'go_to_page':
        if (r.page != null) await goToPage(r.page);
        break;
      case 'go_to_start':
        await goToPage(1);
        break;
      case 'set_speed_up':
        await announce.speedChanged(adjustRate(0.1));
        break;
      case 'set_speed_down':
        await announce.speedChanged(adjustRate(-0.1));
        break;
      case 'progress':
        await announce.progress(currentPage, totalPages);
        break;
      case 'read_full':
        setIncludeFrontMatter(true);
        await goToPage(1);
        await speak('Ön bilgiler dahil en baştan başlıyorum.');
        break;
      case 'skip_intro':
        setIncludeFrontMatter(false);
        await goToPage(1);
        await speak('Asıl metne geçiyorum.');
        break;
      case 'add_bookmark':
        await addBookmark(bookId, currentPage);
        await speak(`${currentPage}. sayfa yer imlerine eklendi.`);
        break;
      case 'list_bookmarks': {
        const marks = await getBookmarks(bookId);
        await speak(marks.length ? `Yer imleri: ${marks.join(', ')}. sayfalar.` : 'Henüz yer imi yok.');
        break;
      }
      case 'go_bookmark': {
        const marks = await getBookmarks(bookId);
        const target = marks[(r.page ?? 1) - 1];
        if (target != null) await goToPage(target);
        else await speak('O numarada yer imi yok.');
        break;
      }
      case 'set_timer': {
        const mins = r.page ?? 10;
        if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
        sleepTimerRef.current = setTimeout(() => { pauseReading(); }, mins * 60000);
        await speak(`${mins} dakika sonra okuma duracak.`);
        break;
      }
      case 'help':
        await announce.help();
        break;
      case 'go_home':
        isPlayingRef.current = false;
        await stopSpeaking();
        navigation.navigate('Home');
        break;
      case 'go_library':
        isPlayingRef.current = false;
        await stopSpeaking();
        navigation.navigate('Library');
        break;
      case 'set_language':
        if (r.lang) {
          await setLanguage(r.lang);
          await speak(r.speech);
        }
        break;
      default:
        await speak('Anlamadım, tekrar söyleyin.');
    }
  };

  const { isListening, startListening, stopListening } = useSpeech(handleVoiceResult);
  const voiceActiveRef = useRef(false);

  // Basılı tut: sesli komutu başlat. Bırak: dinlemeyi durdur (komut işlenir).
  const onVoiceStart = useCallback(() => {
    voiceActiveRef.current = true;
    startListening();
  }, [startListening]);

  const onVoiceEnd = useCallback(() => {
    if (voiceActiveRef.current) {
      voiceActiveRef.current = false;
      stopListening();
    }
  }, [stopListening]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Kitap yükleniyor...</Text>
      </View>
    );
  }

  // Tüm ekran tek yüzey: çift dokun = oynat/duraklat, basılı tut = sesli komut.
  return (
    <Pressable
      style={[styles.container, isListening && styles.containerListening]}
      onPress={handleDoubleTap}
      onLongPress={onVoiceStart}
      onPressOut={onVoiceEnd}
      delayLongPress={250}
      accessibilityLabel={
        isListening
          ? 'Dinleniyor. Komutunuzu söyleyin, sonra bırakın.'
          : (isPlaying ? 'Okunuyor. Duraklatmak için çift dokunun. Komut için basılı tutun.'
                       : 'Duraklatıldı. Okumak için çift dokunun. Komut için basılı tutun.')
      }
      accessibilityRole="button"
    >
      {/* Üst bilgi: başlık + sayfa + küçük durum (yalnızca görsel) */}
      <View style={styles.header} pointerEvents="none">
        <Text style={styles.bookTitle} numberOfLines={1} accessibilityRole="header">
          {bookTitle}
        </Text>
        <Text style={styles.pageInfo} accessibilityLiveRegion="polite">
          {isListening ? '🎙 Dinleniyor' : (isPlaying ? '⏸ Okunuyor' : '▶ Duraklatıldı')} · {currentPage} / {totalPages}
        </Text>
      </View>

      {/* Orta alan: kayan metin — okunan cümle vurgulanır, otomatik kaydırılır */}
      <ScrollView
        ref={scrollRef}
        style={styles.contentArea}
        contentContainerStyle={styles.contentInner}
        pointerEvents="none"
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      >
        {sentences.length === 0 ? (
          <Text style={styles.sentenceIdle}>
            {translating ? 'Sayfa çevriliyor...' : 'Okumak için çift dokunun.'}
          </Text>
        ) : (
          sentences.map((s, i) => (
            <Text
              key={i}
              onLayout={(e) => {
                const y = e.nativeEvent.layout.y;
                offsetsRef.current[i] = y;
                // Aktif cümle ölçülünce ona kaydır (devam etme / sayfa geçişi sonrası
                // okunan yerin ekran dışında kalmasını önler).
                if (i === currentSentence) {
                  scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: false });
                }
              }}
              style={[styles.sentence, i === currentSentence && styles.sentenceActive]}
            >
              {s}
            </Text>
          ))
        )}
      </ScrollView>

      {/* Çeviri göstergesi */}
      {translating && (
        <View style={styles.thinkingBar} pointerEvents="none">
          <ActivityIndicator size="small" color="#4fc3f7" />
          <Text style={styles.thinkingText}>Çevriliyor...</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  containerListening: {
    backgroundColor: '#10243a',
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
  contentInner: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 320, // son cümle de üst bölgeye kaydırılabilsin
  },
  sentence: {
    color: '#5a5a5a',
    fontSize: 24,
    lineHeight: 40,
    marginBottom: 6,
  },
  sentenceActive: {
    color: '#fff',
    fontWeight: '700',
    backgroundColor: '#13334d',
  },
  sentenceIdle: {
    color: '#888',
    fontSize: 22,
    textAlign: 'center',
    marginTop: 60,
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
