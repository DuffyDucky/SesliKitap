# İngilizce-Öncelikli Pivot — Tasarım

**Tarih:** 2026-05-31
**Durum:** Onaylandı (uygulama planı bekliyor)

## Hedef

SesliKitap'ın ana odağını Türkçe'den İngilizce'ye kaydırmak. Varsayılan okuma dili İngilizce (çevirisiz, İngilizce TTS sesiyle). Türkçe, sesle açılan global ve kalıcı bir opsiyon olur (ücretsiz Google Translate ile, "kötü de olsa bir çeviri"). Arama girişi Türkçe kalır ama kanonik İngilizce esere Gemini ile çevrilir. archive.org kaynağı tamamen kaldırılır — tek kaynak Project Gutenberg.

## Neden

Mevcut Türkçe-öncelikli yaklaşım iki çıkmaza girdi:
1. **Kısıtlı API** — Gemini anahtarının gerçek kotası 20/gün; sayfa sayfa çeviri bunu anında patlatırdı.
2. **Türkçe kaynak yokluğu** — archive.org Türkçe kataloğu zayıftı (10 kitaptan ~7'si çıkmıyordu).

Kaynakların hepsi zaten İngilizce (Gutenberg). İngilizce'yi varsayılan yapmak projeyi bitirilebilir kılar; kota baskısını kaldırır.

## Kilit Ayrım: Asistan Dili ≠ Kitap Dili

- **Asistan / arayüz dili = HER ZAMAN Türkçe.** Anonslar ("Duraklatıyorum", "Sayfa 5"), komutlar, hata mesajları. Kullanıcı Türkçe konuşan görme engelli birey; bu hiç değişmez.
- **Kitap içeriği dili = İngilizce (varsayılan) veya Türkçe (opsiyon).** Pivot yalnızca bunu etkiler.

## İş Bölümü (Hangi motor neyi yapar)

| İş | Motor | Gerekçe |
|---|---|---|
| Arama: Türkçe başlık → kanonik İngilizce eser | **Gemini** | Tek istek/arama; kanonik eşleştirme kalitesi ("sefiller" → "Les Misérables"). Kota nadiren dolar. |
| Sayfa çevirisi: EN → TR (yalnız Türkçe modda) | **Google Translate (ücretsiz)** | Kitap başına 30+ sayfa = 30+ istek; Gemini 20/gün kotasını patlatırdı. Ücretsiz/kotasız endpoint, AsyncStorage cache. |
| Sesli komut / niyet | **Yerel (localIntent)** | Bugünkü gibi; Gemini kotası gerektirmez. |

İngilizce varsayılan olduğundan çoğu kullanım sayfa çevirisini hiç tetiklemez → hem Google Translate yükü düşer hem Gemini'ye yalnız aramada dokunulur.

## Bileşen Değişiklikleri

### 1. Kaynaklar — archive.org kaldır
- `src/sources/index.ts`: `SOURCES = [gutenbergSource]` (archive import'u çıkar).
- Sil: `src/sources/archive.ts`, `src/sources/archive.test.ts`.
- `searchBook` imzası ve döngüsü aynı kalır (ileride kaynak eklenebilir diye).

### 2. Arama — Gemini ile kanonik başlık çözümü
- `src/utils/geminiService.ts`'e yeni fonksiyon: `resolveEnglishTitle(query: string): Promise<string>`.
  - Ayrı, sade bir prompt: "Verilen (muhtemelen Türkçe) kitap adının KANONİK İNGİLİZCE başlığını yalnızca düz metin olarak döndür. Zaten İngilizce veya bilinmiyorsa olduğu gibi döndür." Intent JSON akışından bağımsız; `conversationHistory` kullanmaz.
  - `maxOutputTokens` düşük; yanıt tek satır düz metin.
  - Hata / 429 / boş yanıt → girdi sorgusunu olduğu gibi döndür (fallback).
- `src/sources/gutenberg.ts`: `translateTitleToEnglish` yerine `resolveEnglishTitle` çağırır.
- `src/utils/translator.ts`: `translateTitleToEnglish` fonksiyonu kaldırılır (artık kullanılmıyor). `translateToTurkish` AYNEN kalır.

### 3. Dil ayarı — global, kalıcı, sesli
- `src/store/bookStorage.ts`: `getLanguage(): Promise<'en'|'tr'>` ve `setLanguage(lang: 'en'|'tr'): Promise<void>`. AsyncStorage key `@app_language`. Varsayılan `'en'`.
- `src/utils/geminiService.ts`: `IntentAction` tipine `'set_language'` eklenir; `GeminiResponse`'a opsiyonel `lang?: 'en'|'tr'` alanı eklenir.
- `src/utils/localIntent.ts`: yeni komut tanıma.
  - "türkçe oku", "dili türkçe yap", "türkçeye çevir" → `{ action:'set_language', lang:'tr', speech:'Okuma dili Türkçe olarak ayarlandı.' }`
  - "ingilizce oku", "dili ingilizce yap" → `{ action:'set_language', lang:'en', speech:'Okuma dili İngilizce olarak ayarlandı.' }`
  - Bu kurallar kitap-açma kuralından (madde 13) ÖNCE değerlendirilmeli ki "...oku" yakalanmasın.
- `src/screens/HomeScreen.tsx`: `handleVoiceResult` switch'ine `case 'set_language'`: `setLanguage(response.lang)` + `speak(response.speech)`.

### 4. TTS — içerik diline göre ses
- `src/utils/tts.ts`:
  - En iyi sesi DİL BAŞINA seç (şu an yalnız Türkçe). İngilizce için `en-US`/`en` sesleri arasından (Samsung > Google > ilk) seç. Hem `tr` hem `en` seçili sesi cache'le (lazy).
  - `speak(text, rate?)` (asistan) → DAİMA `tr-TR` + Türkçe ses.
  - `setContentLanguage(lang: 'en'|'tr')` modül durumunu belirler.
  - `speakBook(text, rate?)` → içerik diline göre dil kodu + ses kullanır.
  - `announce.*` fonksiyonları değişmez (hepsi `speak`, yani Türkçe).

### 5. Okuma ekranı — çeviri opsiyonel
- `src/screens/ReaderScreen.tsx`:
  - Sabit `needsTranslation = bookId.startsWith('gutenberg:')` yerine: mount'ta `getLanguage()` oku; `needsTranslation = (language === 'tr')`. (Tüm kitaplar Gutenberg=İngilizce olduğundan dil ayarı belirleyici.)
  - Mount'ta `setContentLanguage(language === 'tr' ? 'tr' : 'en')` çağır.
  - İngilizce mod: `currentText = rawPage` (ham İngilizce), İngilizce sesle okunur, "Çevriliyor" göstergesi görünmez (`translating` hiç set edilmez).
  - Türkçe mod: bugünkü davranış — `translateToTurkish` + cache + gösterge.

## Test Stratejisi

- **`resolveEnglishTitle`** (yeni test dosyası): mock `fetchWithTimeout` —
  - "suç ve ceza" → "Crime and Punishment" döndürür (mock Gemini yanıtı).
  - 429 / hata / boş yanıt → girdi sorgusu fallback olarak döner.
- **`localIntent`** (mevcut `localIntent.test.ts`'e ekle):
  - "türkçe oku" → `action:'set_language', lang:'tr'`.
  - "dili ingilizce yap" → `action:'set_language', lang:'en'`.
  - Regresyon: "Suç ve Ceza oku" → hâlâ `open_book` (dil komutu yanlış yakalamaz).
- **`getLanguage`/`setLanguage`**: round-trip (`setLanguage('tr')` sonrası `getLanguage()==='tr'`); ilk okumada varsayılan `'en'`.
- **archive testlerinin silinmesi**: test suite yeşil kalmalı (kalan referans olmamalı).

## Kapsam Dışı (YAGNI)

- Kitap bazında dil override (yalnız global ayar).
- Türkçe kaynak / archive.org / Türk edebiyatı kapsamı.
- İlk açılış dil seçim sihirbazı.
- Sayfa çevirisini Gemini'ye taşımak (kota koruması için reddedildi).
