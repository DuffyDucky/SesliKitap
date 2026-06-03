import * as Speech from 'expo-speech';
import { saveSpeed, loadSpeed } from '../store/bookStorage';

const ASSISTANT_LANGUAGE = 'tr-TR'; // asistan anonsları DAİMA Türkçe
let currentRate = 1.0;
let contentLanguage: 'en' | 'tr' = 'en'; // okunan kitap içeriğinin dili
let loadPromise: Promise<void> | null = null;

// Dil başına seçili ses kimliği.
const selectedVoice: Record<'tr' | 'en', string | undefined> = {
  tr: undefined,
  en: undefined,
};

/** Bir dil önekine (tr/en) uyan en iyi sesi seçer: Samsung > Google > ilk. */
function pickVoice(
  voices: Speech.Voice[],
  prefix: 'tr' | 'en'
): string | undefined {
  const matches = voices.filter((v) => v.language?.startsWith(prefix));
  if (matches.length === 0) return undefined;
  const samsung = matches.find((v) => v.identifier?.toLowerCase().includes('samsung'));
  const google = matches.find((v) => v.identifier?.toLowerCase().includes('google'));
  return (samsung || google || matches[0]).identifier;
}

/** Cihazdaki Türkçe ve İngilizce en iyi sesleri tek seferde tarar ve cache'ler. */
function loadBestVoices(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      selectedVoice.tr = pickVoice(voices, 'tr');
      selectedVoice.en = pickVoice(voices, 'en');
      console.log('Seçilen sesler:', selectedVoice);
    } catch (e) {
      console.warn('Ses listesi alınamadı:', e);
    }
  })();
  return loadPromise;
}

/** Okunan kitap içeriğinin dilini belirler (speakBook bunu kullanır). */
export function setContentLanguage(lang: 'en' | 'tr'): void {
  contentLanguage = lang;
}

// Uygulama başladığında sesleri ve hız ayarını yükle
loadBestVoices();
loadSpeed().then((saved) => {
  if (saved !== null) currentRate = saved;
});

export async function speak(text: string, rate?: number): Promise<void> {
  await loadBestVoices();
  await Speech.stop();
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: ASSISTANT_LANGUAGE,
      voice: selectedVoice.tr,
      rate: rate ?? currentRate,
      pitch: 1.0,
      onDone: resolve,
      onError: (error) => {
        console.warn('TTS speak hatası:', error);
        reject(error);
      },
    });
  });
}

export async function speakBook(text: string, rate?: number): Promise<void> {
  await loadBestVoices();
  await Speech.stop();
  const language = contentLanguage === 'tr' ? 'tr-TR' : 'en-US';
  return new Promise((resolve) => {
    Speech.speak(text, {
      language,
      voice: selectedVoice[contentLanguage],
      rate: rate ?? currentRate,
      pitch: 1.0,
      onDone: resolve,
      onError: (error) => {
        console.warn('TTS speakBook hatası:', error);
        resolve();
      },
    });
  });
}

export async function stopSpeaking(): Promise<void> {
  await Speech.stop();
}

export function setRate(rate: number): void {
  currentRate = Math.max(0.25, Math.min(2.0, rate));
  saveSpeed(currentRate);
}

export function getRate(): number {
  return currentRate;
}

export function adjustRate(delta: number): number {
  setRate(currentRate + delta);
  return currentRate;
}

export const announce = {
  welcome: () => speak('Merhaba, ben Voice Book asistanınızım. Ne dinlemek istersiniz?'),
  bookOpened: (title: string, chapter?: string) =>
    speak(`${title} açıldı${chapter ? ', ' + chapter : ''}.`),
  downloading: (title: string) => speak(`${title} indiriliyor.`),
  downloadComplete: () => speak('İndirme tamamlandı, çevrimdışı kullanılabilir.'),
  pageChanged: (page: number) => speak(`${page}. sayfa.`),
  notFound: () => speak('Bu kitap bulunamadı, farklı bir isimle tekrar deneyin.'),
  noInternet: () =>
    speak('İnternet bağlantısı yok, sadece indirilen kitaplar kullanılabilir.'),
  commandNotUnderstood: () => speak('Anlamadım, lütfen tekrar söyleyin.'),
  apiError: () => speak('Şu an bağlanamıyorum, biraz sonra tekrar deneyin.'),
  paused: () => speak('Duraklatıldı.'),
  resumed: () => speak('Devam ediliyor.'),
  goingToLibrary: () => speak('Kitaplık açılıyor.'),
  bookDeleted: (title: string) => speak(`${title} silindi.`),
  bookLoading: () => speak('Kitap yükleniyor.'),
  bookEnded: () => speak('Kitap sona erdi.'),
  translating: () =>
    speak('Çeviri yapılıyor. Tamamlandığında okuma kendiliğinden başlayacak.'),
  progress: (current: number, total: number) => {
    const percent = Math.round((current / total) * 100);
    return speak(`Sayfa ${current}, toplam ${total}, yüzde ${percent}.`);
  },
  speedChanged: (rate: number) => speak(`Okuma hızı ${rate.toFixed(2)} olarak ayarlandı.`),
  help: () => speak(
    'Kullanabileceğiniz komutlar: ' +
    'Dur veya durdur, okumayı duraklatır. ' +
    'Devam, okumaya devam eder. ' +
    'Daha hızlı veya daha yavaş, okuma hızını ayarlar. ' +
    'Sonraki bölüm veya önceki bölüm, sayfa değiştirir. ' +
    'Başa dön, kitabın başına döner. ' +
    'Kitap adı söyleyerek yeni kitap açabilirsiniz.'
  ),
};
