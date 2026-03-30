import * as Speech from 'expo-speech';
import { saveSpeed, loadSpeed } from '../store/bookStorage';

const DEFAULT_LANGUAGE = 'tr-TR';
let currentRate = 1.0;
let selectedVoice: string | undefined;
let loadPromise: Promise<void> | null = null;

/**
 * Cihazda mevcut Türkçe sesleri tarar ve en iyi olanı seçer.
 * Samsung cihazlarda Samsung TTS, diğerlerinde Google TTS tercih edilir.
 */
function loadBestVoice(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const turkishVoices = voices.filter(
        (v) => v.language === 'tr-TR' || v.language?.startsWith('tr')
      );

      if (turkishVoices.length > 0) {
        // Öncelik sırası: Samsung > Google > diğer
        const samsung = turkishVoices.find((v) => v.identifier?.toLowerCase().includes('samsung'));
        const google = turkishVoices.find((v) => v.identifier?.toLowerCase().includes('google'));
        const best = samsung || google || turkishVoices[0];
        selectedVoice = best.identifier;
        console.log('Seçilen ses:', best.identifier, best.name);
      }
    } catch (e) {
      console.warn('Ses listesi alınamadı:', e);
    }
  })();
  return loadPromise;
}

// Uygulama başladığında sesleri ve hız ayarını yükle
loadBestVoice();
loadSpeed().then((saved) => {
  if (saved !== null) currentRate = saved;
});

export async function speak(text: string, rate?: number): Promise<void> {
  await loadBestVoice();
  await Speech.stop();
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: DEFAULT_LANGUAGE,
      voice: selectedVoice,
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
  await Speech.stop();
  return new Promise((resolve) => {
    Speech.speak(text, {
      language: DEFAULT_LANGUAGE,
      voice: selectedVoice,
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
