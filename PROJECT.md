# SesliKitap — Voice Book

Görme engelli kullanıcılar için sesli komutla yönetilen sesli kitap uygulaması. Varsayılan okuma dili İngilizce (Project Gutenberg); istenirse sesli komutla Türkçe çeviriye geçilir.

## Stack
- **Expo 55 / React Native 0.83 / TypeScript**
- **Gemini 2.5 Flash Lite** — yalnız aramada: Türkçe başlık → kanonik İngilizce (niyet/komut yereldir, sayfa çevirisi Google Translate'tir)
- **expo-speech** (TTS, en-US varsayılan / tr-TR opsiyonel) + **expo-speech-recognition** (STT)
- **AsyncStorage** — kitap metadata + çeviri cache
- **EAS Build** (cloud) — APK üretimi
- **Project Gutenberg** — İngilizce tam metin, HTML arama scraping
- **Arama:** Türkçe başlık → Gemini ile kanonik İngilizce başlık
- **Türkçe okuma (opsiyonel):** sayfa sayfa ücretsiz Google Translate

## Konum & Build
- **Proje:** `C:\SesliKitap` (OneDrive lock sorunu nedeniyle taşındı, orijinal `OneDrive\...` artık kullanılmıyor)
- **EAS account:** `duffy_duck` / project `seslikitap` (id: `cb65edd8-5019-488f-affd-6d8665f25607`)
- **Paket:** `com.duffy_duck.seslikitap`
- **Telefon:** USB üzerinden ADB, device id `R5CX92GHD4B`
- **ADB:** `C:\Users\Victus\AppData\Local\Android\Sdk\platform-tools\adb.exe`

### Build & install (tek komut)
```bash
cd /c/SesliKitap && eas build --platform android --profile production --non-interactive
# → APK URL döner, sonra:
curl -L -o /c/SesliKitap/SesliKitap.apk "<APK_URL>"
/c/Users/Victus/AppData/Local/Android/Sdk/platform-tools/adb.exe install -r /c/SesliKitap/SesliKitap.apk
```

Build ~5-10 dk (free tier kuyruğu). `eas.json` production = `apk` (aab değil).

## Env (EAS production environment)
- `EXPO_PUBLIC_GEMINI_API_KEY` — Gemini API key
- `EXPO_PUBLIC_GEMINI_MODEL` = `gemini-2.5-flash-lite` (1000 req/gün free)
  - **Not:** `gemini-2.5-flash` free tier sadece 20/gün — kullanma

`.env` dosyasında HIPERKITAP credentials da var ama EAS'a eklenmedi (henüz gerek olmadı).

## Mimari (önemli dosyalar)

```
src/
├── screens/
│   ├── HomeScreen.tsx       # Kitap arama (Wikisource → Gutenberg)
│   ├── ReaderScreen.tsx     # Okuma + TTS + auto-scroll + çeviri
│   └── LibraryScreen.tsx    # İndirilen kitaplar
├── hooks/
│   ├── useSpeech.ts         # STT (tr-TR), basılı tutma ile çalışır
│   └── useOfflineBooks.ts   # İndirme + sayfa bölme
├── utils/
│   ├── geminiService.ts     # chat() — niyet JSON döndürür
│   ├── translator.ts        # translateText (sayfa) + translateBookTitle (TR→EN)
│   ├── tts.ts               # speak/speakBook + Türkçe ses seçimi (Samsung > Google)
│   ├── gutenbergAPI.ts      # HTML scraping (gutendex çöktüğü için)
│   └── wikisourceAPI.ts
└── store/bookStorage.ts     # AsyncStorage CRUD
```

## Eklenen ana özellikler (bugüne kadar)
1. **Otomatik İngilizce → Türkçe çeviri** (`translator.ts`)
   - Dil tespiti: Türkçe karakter oranı + İngilizce stopword sayımı
   - Sayfa bazlı, AsyncStorage cache (`@translation_v2_${bookId}_${page}`)
   - Aktif sayfa + sonraki sayfayı önden çevirir
   - "Türkçeye çevriliyor..." göstergesi, çeviri hazır olmadan okuma başlamaz
2. **Türkçe başlık → orijinal/İngilizce başlık** (`translateBookTitle`)
   - "Suç ve Ceza" → "Crime and Punishment" → Gutenberg'de bulur
   - Önce orijinal isimle, sonra çevrilmişle dener
3. **Gutenberg boilerplate temizliği** (`stripGutenbergBoilerplate` — ReaderScreen)
   - `*** START/END OF ... ***` markerları + fallback (boş satıra kadar atlama)
4. **Auto-scroll** — okunan kelimeye göre ScrollView kayar (kelime/toplam oranıyla)
5. **Sarı highlight zamanlaması** — kelime başına 480ms (önceden 350ms TTS'i geçiyordu)

## Sesli komut akışı
1. Kullanıcı mikrofona basılı tutar → STT (tr-TR)
2. Transcript Gemini'ye gider, system prompt strict JSON ister:
   ```json
   {"action":"...", "book":"...", "page":N, "speech":"..."}
   ```
3. ReaderScreen `response.action`'ı switch ile handle eder (pause/resume/go_to_page/next_chapter/bookmark/timer vs.)

## Bilinen / dikkat edilecek
- **Free tier Gemini kotası**: 1000 req/gün. Bir kitap çevirisi 30+ sayfa = 30+ req. Kota dolarsa 429 → "şu an bağlanamıyorum"
- **Highlight ↔ TTS senkronu**: tahminî zamanlama (gerçek `onBoundary` event yok), 480ms iyi tutuyor ama mükemmel değil
- **Çeviri kalitesi**: edebi metinde iyi, teknik/şiirde orta



## Sıradaki muhtemel işler

- `onBoundary` callback ile gerçek kelime senkronizasyonu denemesi
- Tüm sayfaları arka planda batch çevirme (kullanıcı ayarına bağlı)
