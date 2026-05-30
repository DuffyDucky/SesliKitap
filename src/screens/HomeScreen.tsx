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
import { clearConversation } from '../utils/geminiService';
import { parseLocalIntent } from '../utils/localIntent';
import { speak, announce, stopSpeaking } from '../utils/tts';
import { searchBook, fetchBookText } from '../sources';
import { setLanguage } from '../store/bookStorage';
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

      let results;
      try {
        results = await searchBook(bookName);
      } catch (e) {
        console.warn('Arama hatası:', e);
        await announce.apiError();
        return;
      }

      if (!results || results.length === 0) {
        await speak('Bu kitap bulunamadı, farklı bir isimle tekrar deneyin.');
        return;
      }

      // Kalite kapısından geçen ilk adayı bul (fetchBookText cache'i de doldurur).
      for (const hit of results) {
        try {
          await fetchBookText(hit.id);
          await speak(`${hit.title} bulundu, açılıyor.`);
          navigation.navigate('Reader', {
            bookId: hit.id,
            bookTitle: hit.title,
            bookAuthor: hit.author,
          });
          return;
        } catch (e) {
          console.warn(`[${hit.id}] atlandı:`, e);
        }
      }

      await speak('Uygun metin bulunamadı, farklı bir isimle tekrar deneyin.');
    },
    [navigation]
  );

  const handleVoiceResult = useCallback(
    async (text: string) => {
      setThinking(true);
      try {
        // Niyet yerel olarak çözülür (Gemini kotası gerekmez).
        // Tanınmayan ifadeleri doğrudan kitap adı kabul et.
        let response = parseLocalIntent(text);
        if (response.action === 'unknown') {
          response = { action: 'open_book', book: text.trim(), speech: '' };
        }

        switch (response.action) {
          case 'open_book':
            if (response.book) {
              setLastResponse(`${response.book} aranıyor.`);
              await searchAndOpenBook(response.book);
            }
            break;
          case 'set_language':
            if (response.lang) {
              await setLanguage(response.lang);
              setLastResponse(response.speech);
              await speak(response.speech);
            }
            break;
          case 'go_library':
            setLastResponse(response.speech);
            await speak(response.speech);
            announce.goingToLibrary();
            navigation.navigate('Library');
            break;
          case 'help':
            await announce.help();
            break;
          default:
            if (response.speech) {
              setLastResponse(response.speech);
              await speak(response.speech);
            }
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
