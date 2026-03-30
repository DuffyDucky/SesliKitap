import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSpeech } from '../hooks/useSpeech';
import { chat, clearConversation } from '../utils/geminiService';
import { speak, announce, stopSpeaking } from '../utils/tts';
import { searchBooks, getTextUrl, getAuthorName } from '../utils/gutenbergAPI';
import { searchWikisource } from '../utils/wikisourceAPI';
import { RootStackParamList } from '../../App';

const { height } = Dimensions.get('window');

type HomeNavProp = StackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavProp>();
  const [thinking, setThinking] = useState(false);
  const [lastResponse, setLastResponse] = useState('');

  useEffect(() => {
    clearConversation();
    announce.welcome();
  }, []);

  const searchAndOpenBook = useCallback(
    async (bookName: string) => {
      await speak(`${bookName} aranıyor.`);

      // 1) Önce Wikisource'da ara (hızlı ve Türkçe içerik)
      try {
        const wikiResults = await searchWikisource(bookName);
        if (wikiResults.length > 0) {
          const wikiBook = wikiResults[0];
          await speak(`${wikiBook.title} bulundu, açılıyor.`);
          navigation.navigate('Reader', {
            bookId: String(wikiBook.pageid),
            bookTitle: wikiBook.title,
            bookAuthor: 'Bilinmiyor',
            textUrl: null,
            source: 'wikisource',
            sourceId: wikiBook.pageid,
            wikisourceTitle: wikiBook.title,
          });
          return;
        }
      } catch (e) {
        console.warn('Wikisource hatası:', e);
      }

      // 2) Wikisource'da bulunamazsa Gutenberg'de ara
      try {
        const results = await searchBooks(bookName);
        for (const book of results) {
          const textUrl = getTextUrl(book);
          if (textUrl) {
            await speak(`${book.title} bulundu, açılıyor.`);
            navigation.navigate('Reader', {
              bookId: String(book.id),
              bookTitle: book.title,
              bookAuthor: getAuthorName(book),
              textUrl,
              source: 'gutenberg',
              sourceId: book.id,
            });
            return;
          }
        }
      } catch (e) {
        console.warn('Gutenberg hatası:', e);
      }

      await speak('Bu kitap bulunamadı, farklı bir isimle tekrar deneyin.');
    },
    [navigation]
  );

  const handleVoiceResult = useCallback(
    async (text: string) => {
      setThinking(true);
      try {
        const response = await chat(text, 'Kullanıcı ana ekranda. Kitap arayabilir, öneri isteyebilir veya sohbet edebilir.');

        setLastResponse(response.speech);
        await speak(response.speech);

        switch (response.action) {
          case 'open_book':
            if (response.book) {
              await searchAndOpenBook(response.book);
            }
            break;
          case 'go_library':
            announce.goingToLibrary();
            navigation.navigate('Library');
            break;
          case 'help':
            await announce.help();
            break;
          default:
            // "none" veya diğer aksiyonlar — sadece konuşma yapıldı
            break;
        }
      } catch (e: any) {
        console.warn('Hata:', e);
        if (e?.message?.includes('Network') || e?.message?.includes('fetch')) {
          await announce.noInternet();
        } else {
          await speak('Bir sorun oluştu, tekrar deneyin.');
        }
      } finally {
        setThinking(false);
      }
    },
    [navigation, searchAndOpenBook]
  );

  const { isListening, startListening, stopListening, transcript } = useSpeech(handleVoiceResult);

  return (
    <View style={styles.container}>
      <Text
        style={styles.title}
        accessibilityLabel="Voice Book uygulaması"
        accessibilityRole="header"
      >
        Voice Book
      </Text>

      <Text style={styles.subtitle} accessibilityLabel="Türkçe sesli kitap">
        Türkçe Sesli Kitap
      </Text>

      {(transcript !== '' || lastResponse !== '') && (
        <View style={styles.chatArea}>
          {transcript !== '' && (
            <Text style={styles.userText} accessibilityLiveRegion="polite">
              Sen: {transcript}
            </Text>
          )}
          {lastResponse !== '' && !thinking && (
            <Text style={styles.aiText} accessibilityLiveRegion="polite">
              Asistan: {lastResponse}
            </Text>
          )}
        </View>
      )}

      {thinking && (
        <View style={styles.thinkingContainer}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.thinkingText}>Düşünüyor...</Text>
        </View>
      )}

      <Pressable
        onPressIn={startListening}
        onPressOut={stopListening}
        style={({ pressed }) => [styles.micButton, isListening && styles.micActive]}
        accessibilityLabel="Mikrofon butonu. Basılı tutarak konuşun."
        accessibilityHint="Kitap adı söyleyin, soru sorun veya komut verin"
        accessibilityRole="button"
        disabled={thinking}
      >
        <Text style={styles.micIcon}>{isListening ? '🎙' : '🎤'}</Text>
        <Text style={styles.micText}>
          {isListening ? 'Dinleniyor...' : thinking ? 'Düşünüyor...' : 'Basılı Tut ve Konuş'}
        </Text>
      </Pressable>

      <TouchableOpacity
        style={styles.libraryButton}
        onPress={() => { announce.goingToLibrary(); navigation.navigate('Library'); }}
        accessibilityLabel="Kitaplığım"
        accessibilityHint="İndirilen kitaplarınızı görmek için dokunun"
        accessibilityRole="button"
      >
        <Text style={styles.libraryButtonText}>Kitaplığım</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: 16,
  },
  subtitle: {
    color: '#aaa',
    fontSize: 20,
  },
  chatArea: {
    width: '100%',
    paddingHorizontal: 8,
    gap: 8,
  },
  userText: {
    color: '#aaa',
    fontSize: 20,
    textAlign: 'right',
  },
  aiText: {
    color: '#4fc3f7',
    fontSize: 18,
    textAlign: 'left',
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  thinkingText: {
    color: '#aaa',
    fontSize: 20,
  },
  micButton: {
    width: '80%',
    height: height * 0.3,
    backgroundColor: '#1a1a1a',
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  micActive: {
    backgroundColor: '#2a2a2a',
    borderColor: '#f00',
  },
  micIcon: {
    fontSize: 64,
  },
  micText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  libraryButton: {
    width: '80%',
    height: 80,
    backgroundColor: '#222',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
});
