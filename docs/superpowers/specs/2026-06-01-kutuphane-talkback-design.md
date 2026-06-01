# Kütüphane TalkBack-Benzeri Keşif — Tasarım

> Tarih: 2026-06-01 · Branch: feature/archive-turkce-kaynak (master akışı) · Durum: onaylandı

## Amaç

Görme engelli kullanıcı, kütüphanedeki kitapları **sesle gezerek keşfedebilsin**. Ekranın
tamamı tek bir jest yüzeyine dönüşür; Android TalkBack'in "kaydır-gez, çift-dokun-aç"
hissini taklit eder. Kullanıcı kitabın adını bilmek zorunda kalmadan, ileri/geri kaydırarak
hangi kitapların olduğunu duyar.

## Etkileşim Modeli

Ekranın **tamamı** tek jest yüzeyidir. Alttaki ayrı mikrofon butonu kaldırılır. Her an bir
kitap **"odakta"** olur (açılışta indeks 0 = ilk kitap).

| Jest | Davranış |
|---|---|
| **Sağa kaydır** | Odağı sonraki kitaba taşı, adını seslendir: *"2. Nasreddin Hoca, Anonim"* |
| **Sola kaydır** | Odağı önceki kitaba taşı, adını seslendir |
| **Çift dokunma** (ekranın herhangi yeri) | Odaktaki kitabı aç (Reader'a git) |
| **Basılı tut** (sabit) | Dinlemeye başla; bırakınca komutu işle |

**Sesli komutlar** (basılı tutarken konuşma):
- Basit gezinme: *"kütüphaneden çık"*, *"ana sayfaya dön"* → ana ekrana döner.
- İsimle açma: *"İstiklâl Marşı'nı aç"* → bilinen kitabı doğrudan açar (`bundledSource.search`,
  Türkçe-duyarlı/alias eşleşme — mevcut davranış korunur).

**Liste sınırları:** Başta sola / sonda sağa kaydırınca *"Listenin başındasınız."* /
*"Listenin sonundasınız."* denir; odak başa-sona **sarmaz** (clamp).

**Açılış anonsu:** *"Kütüphanede 3 kitap var. Kaydırarak gezebilir, çift dokunarak açabilirsiniz.
İlk kitap: İstiklâl Marşı, Mehmet Akif Ersoy."* (Kütüphane boşsa: *"Kütüphane şu an boş."*)

## Odak ve Görsel Geri Bildirim

- Odaktaki kitap öğesi **belirgin vurgulanır** (kalın kenarlık + farklı arka plan) — az gören
  kullanıcılar için. Diğer öğeler normal stilde.
- Odak değişince `FlatList.scrollToIndex` ile odaktaki öğe görünür alana kaydırılır.
- **Liste dokunmayla kaydırılamaz** (`scrollEnabled={false}`). Gezinme yalnızca odak +
  otomatik kaydırma ile olur. Bu, dikey kaydırma jesti ile yatay kaydırma jestinin
  çakışmasını tamamen önler ve kütüphane büyüdükçe de tutarlı kalır.
- Erişilebilirlik: ekran yüzeyi tek `accessibilityRole="adjustable"` benzeri bir alandır;
  öğelerin `accessibilityLabel`'ları korunur (OS TalkBack açık kullanıcılar da çalışsın).

## Mimari ve Bileşenler

### 1. `src/utils/libraryFocus.ts` (YENİ) — saf odak mantığı
React Native'den bağımsız, node:test ile test edilebilir saf fonksiyon:

```ts
export type FocusStep = { index: number; atBoundary: 'start' | 'end' | null };

/** Mevcut odak indeksinden bir adım. dir: +1 (sonraki) / -1 (önceki). count: kitap sayısı.
 *  Sınırda kalır (clamp), atBoundary ile sınıra çarpıldığını bildirir. */
export function stepFocus(current: number, dir: 1 | -1, count: number): FocusStep;
```

Kurallar:
- `count === 0` → `{ index: 0, atBoundary: null }` (gezinilecek bir şey yok).
- Sonraki ve `current === count - 1` → `{ index: current, atBoundary: 'end' }`.
- Önceki ve `current === 0` → `{ index: current, atBoundary: 'start' }`.
- Aksi halde `{ index: current + dir, atBoundary: null }`.

### 2. `src/utils/libraryFocus.test.ts` (YENİ) — node:test
Olgular: ortadan ileri/geri; sondan ileri → end; baştan geri → start; tek kitap; boş liste.

### 3. `src/screens/LibraryScreen.tsx` (YENİDEN YAZ)
- `useState` `focusIndex` (varsayılan 0). `FlatList` ref'i ile `scrollToIndex`.
- `react-native-gesture-handler` `GestureDetector` + birleşik jestler (`Gesture.Race` /
  `Gesture.Exclusive`):
  - **Pan** (`activeOffsetX` eşiği ile yatay) — bitişte `translationX` işaretine göre
    `stepFocus(focusIndex, +1|-1, count)`; sonucu uygula, odaktaki kitabın adını `speak` et;
    `atBoundary` varsa sınır uyarısını `speak` et.
  - **Tap** `numberOfTaps(2)` — odaktaki kitabı aç (`openBook(books[focusIndex])`).
  - **LongPress** — `onBegin` → `startListening()`, `onFinalize` → `stopListening()`
    (mevcut basılı-tut konuşma akışı, artık tüm ekranda).
- Sesli sonuç işleyici (`handleVoiceResult`) büyük ölçüde korunur: `parseLocalIntent` →
  `go_home`/`go_library` ele alınır, `open_book` isimle/numarayla açar. Açılış anonsu
  ilk kitabı da içerecek şekilde güncellenir.
- Tüm jest mantığı RN tarafında; saf adım mantığı `stepFocus`'tan gelir (test bu modülde).

### 4. `App.tsx` (DEĞİŞİKLİK)
Kök ağacı `GestureHandlerRootView` ile sar (`flex: 1`). Modern Gesture API'nin çalışması
için gerekli; bu olmadan jestler sessizce çalışmaz.

### 5. `src/utils/localIntent.ts` (DEĞİŞİKLİK) — çıkış tuzağı
Şu an `(kitapli|kutuphane)` kuralı, *"kütüphaneden çık"* ifadesindeki "kütüphane"yi görüp
yanlışlıkla `go_library` döndürüyor (kütüphane ekranında "zaten buradasınız" der). Düzeltme:
`go_library` kuralından **önce**, çıkış niyetini yakala — metinde "çık/çıkış" veya
"ana ekran/ana sayfa" geçiyorsa `go_home` döndür. Böylece:
- *"kütüphaneye git"* → `go_library` (korunur)
- *"kütüphaneden çık"* / *"buradan çık"* / *"ana sayfaya dön"* → `go_home`

`src/utils/localIntent.test.ts`'e bu olgular eklenir (özellikle "kütüphaneden çık" → go_home).

## Hata Durumları

- **Boş kütüphane:** Jestler güvenli (no-op); açılışta "Kütüphane şu an boş." Pan/çift-dokun
  bir şey yapmaz.
- **`scrollToIndex` başarısızlığı** (öğe henüz ölçülmemiş): `onScrollToIndexFailed`
  yakalanır, kısa gecikmeyle yeniden denenir (RN standart kalıbı) — çökme olmaz.
- **STT izni reddi:** Mevcut `useSpeech` hata yolu korunur.

## Test Stratejisi

- **Birim (node:test + tsx):** `libraryFocus.test.ts` (odak adımı, sınırlar) ve
  `localIntent.test.ts` (çıkış niyeti) — `package.json` test betiğine eklenir.
- **Tür kontrolü:** `npx tsc --noEmit` temiz (RN ekran + App).
- **Manuel (cihaz):** Kaydır → ad okunur; sınırda uyarı; çift dokun → açar; basılı tut +
  "kütüphaneden çık" → ana ekran; "İstiklâl Marşı'nı aç" → açar.

## Kapsam Dışı (YAGNI)

- Dokunsal (parmak gezdirme) hover-okuma modeli — şimdilik yok, kaydırma yeterli.
- Başa-sona saran döngüsel gezinme — bilinçli olarak yok (sınır uyarısı tercih edildi).
- Arama/kategori/filtre kütüphane içinde — kapsam dışı (arama yalnızca Gutenberg, mevcut).
