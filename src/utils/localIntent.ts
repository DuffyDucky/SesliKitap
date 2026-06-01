/**
 * Yerel (offline) niyet ayrıştırıcı — sesli komutları Gemini kullanmadan tanır.
 * Gemini'nin günlük kotası (20 istek/gün) çok düşük olduğundan, çekirdek komutlar
 * (kitap aç, duraklat, sayfaya git, hız, yer imi, ön bilgi atla...) burada
 * deterministik olarak çözülür. Sınıflandıramazsa action='unknown' döner; çağıran
 * ekran ya kitap araması yapar ya da Gemini'ye sohbet için düşer.
 */
import { GeminiResponse } from './geminiService';

/** Türkçe harfleri ASCII'ye indirir, noktalama temizler, boşlukları sadeleştirir. */
function norm(s: string): string {
  return s
    // Türkçe büyük harfleri toLowerCase'den ÖNCE ASCII'ye indir. Aksi halde
    // "İ".toLowerCase() => 'i' + U+0307 (birleşik nokta) üretir; bu nokta sonra
    // boşluğa dönüp "İngilizce" → "i ngilizce" gibi kelimeyi BÖLER (komut kaçar).
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/̇/g, '') // kalan birleşik nokta varsa temizle
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUM_WORDS: Record<string, number> = {
  bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9,
  on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70,
  seksen: 80, doksan: 90, yuz: 100,
};

function extractNumber(t: string): number | null {
  const d = t.match(/\d{1,4}/);
  if (d) return parseInt(d[0], 10);
  for (const w of Object.keys(NUM_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) return NUM_WORDS[w];
  }
  return null;
}

export function parseLocalIntent(input: string): GeminiResponse {
  const raw = input.trim();
  const t = norm(raw);
  if (!t) return { action: 'unknown', speech: '' };

  // 0) Okuma dili değiştirme (kitap-açma kuralından ÖNCE — "...oku" çakışmasın).
  // Kalıplar dar tutulur: bare "cevir" ("sayfayı çevir") veya "orijinal dil"
  // ("orijinal dil nedir") gibi ifadeleri yanlış yakalamamak için.
  if (/\b(turkce oku|dili turkce|turkceye cevir|turkce dinle)\b/.test(t)) {
    return { action: 'set_language', lang: 'tr', speech: 'Okuma dili Türkçe olarak ayarlandı.' };
  }
  if (/\b(ingilizce oku|dili ingilizce|ingilizce dinle|orijinal dile|orijinalinden)\b/.test(t)) {
    return { action: 'set_language', lang: 'en', speech: 'Okuma dili İngilizce olarak ayarlandı.' };
  }

  // 1) Ön bilgi / önsöz komutları (kitap açmadan ÖNCE — "baştan oku" çakışmasın)
  if (/\b(onsoz|on bilgi|on bilgileri|kapaktan|en bastan|bastan oku|en bastan oku)\b/.test(t)) {
    return { action: 'read_full', speech: 'Ön bilgiler dahil en baştan başlıyorum.' };
  }
  if (/\b(onsozu atla|on bilgileri atla|asil metin|asil metne|hikayeye gec|hikayeye)\b/.test(t)) {
    return { action: 'skip_intro', speech: 'Asıl metne geçiyorum.' };
  }

  // 2) Başa dön
  if (/\b(basa don|en basa)\b/.test(t)) {
    return { action: 'go_to_start', speech: 'Başa dönüyorum.' };
  }

  // 3) Uyku zamanlayıcı ("X dakika sonra dur/uyku/kapat")
  if (/\bdakika\b/.test(t) && /\b(sonra|uyku|dur|kapat|kapan)\b/.test(t)) {
    const m = extractNumber(t) ?? 10;
    return { action: 'set_timer', page: m, speech: `${m} dakikalık uyku zamanlayıcı kuruldu.` };
  }

  // 4) Belirli sayfaya git ("sayfa", "sayfaya" vb.)
  if (/sayfa/.test(t)) {
    const n = extractNumber(t);
    if (n != null) return { action: 'go_to_page', page: n, speech: `${n}. sayfaya gidiyorum.` };
  }

  // 5) Okuma hızı
  if (/\b(hizli|hizlan|daha hizli)\b/.test(t)) {
    return { action: 'set_speed_up', speech: 'Hızlandırıyorum.' };
  }
  if (/\b(yavas|yavasla|daha yavas)\b/.test(t)) {
    return { action: 'set_speed_down', speech: 'Yavaşlatıyorum.' };
  }

  // 6) Sonraki / önceki
  if (/\b(sonraki|ileri|sonra)\b/.test(t)) {
    return { action: 'next_chapter', speech: 'Sonraki sayfaya geçiyorum.' };
  }
  if (/\b(onceki|geri don|geriye)\b/.test(t)) {
    return { action: 'prev_chapter', speech: 'Önceki sayfaya geçiyorum.' };
  }

  // 7) Yer imleri
  if (/\byer imi\b/.test(t) || /\bisaretle\b/.test(t)) {
    const n = extractNumber(t);
    if (/\b(ekle|koy|isaretle)\b/.test(t)) {
      return { action: 'add_bookmark', speech: 'Yer imi ekliyorum.' };
    }
    if (/\b(listele|imlerim|imleri|neler)\b/.test(t)) {
      return { action: 'list_bookmarks', speech: 'Yer imlerini okuyorum.' };
    }
    if (n != null) return { action: 'go_bookmark', page: n, speech: `${n}. yer imine gidiyorum.` };
    return { action: 'list_bookmarks', speech: 'Yer imlerini okuyorum.' };
  }

  // 8) Neredeyim / ilerleme
  if (/\b(neredeyim|kacinci sayfa|ne kadar|ilerleme|hangi sayfa)\b/.test(t)) {
    return { action: 'progress', speech: 'Bilgi veriyorum.' };
  }

  // 9) Duraklat
  if (/^(dur|durdur|duraklat|bekle|sus)\b/.test(t)) {
    return { action: 'pause', speech: 'Duraklatıyorum.' };
  }

  // 10) Devam / oynat
  if (/\b(devam|devam et|oynat|cal|play|basla)\b/.test(t) && !/\bkitab/.test(t)) {
    return { action: 'resume', speech: 'Devam ediyorum.' };
  }

  // 11) Yardım
  if (/\b(yardim|komutlar|ne yapabilir)\b/.test(t)) {
    return { action: 'help', speech: 'Komutları okuyorum.' };
  }

  // 12) Ana ekrana dönüş — çıkış ifadeleri ("kütüphaneden çık") "kütüphane"
  //     kelimesi içerse bile go_library DEĞİL go_home olmalı; bu yüzden kontrol
  //     kütüphane kuralından ÖNCE gelir. "kütüphaneye git" ise cik/cikis içermez.
  if (/\b(cik|cikis|kapat)\b/.test(t) || /\bana (sayfa|ekran)/.test(t)) {
    return { action: 'go_home', speech: 'Ana ekrana dönüyorum.' };
  }
  // 13) Kitaplığa git
  if (/(kitapli|kutuphane)/.test(t)) {
    return { action: 'go_library', speech: 'Kitaplığa gidiyorum.' };
  }

  // 13) Kitap açma — "X aç/oku/dinle/bul" veya "aç/oku X"
  const trailing = raw.match(/^(.*?)(?:\s+(?:kitabını|kitabini|adlı|adli))?\s+(oku|aç|ac|dinle|bul|getir|aratır|arat)\s*$/i);
  if (trailing && trailing[1].trim().length > 0) {
    const title = trailing[1].trim();
    return { action: 'open_book', book: title, speech: `${title} aranıyor.` };
  }
  const leading = raw.match(/^(?:oku|aç|ac|dinle|bul|getir|arat)\s+(.+)$/i);
  if (leading && leading[1].trim().length > 0) {
    const title = leading[1].trim();
    return { action: 'open_book', book: title, speech: `${title} aranıyor.` };
  }

  // 14) Sınıflandırılamadı
  return { action: 'unknown', speech: '' };
}
