# Tasarım: archive.org Türkçe Kaynak Entegrasyonu

**Tarih:** 2026-05-29
**Durum:** Onaylandı (uygulama bekliyor)

## Problem

Uygulamanın önceki/hedeflenen akışında İngilizce (Gutenberg) kitaplar Gemini ile
Türkçeye çevriliyordu. Bir kitap 30+ sayfa = 30+ Gemini isteği olduğu için günlük
kota (`gemini-2.5-flash-lite`, 1000 istek/gün) hızla doluyordu.

## Karar

Çeviri tamamen bırakılır. Kitaplar **zaten Türkçe** olan tek bir kaynaktan gelir:
**archive.org** (Internet Archive). archive.org Türkçe metinleri doğrudan düz metin
(`.txt`) olarak sunduğu için çeviriye gerek kalmaz — Gemini yalnızca sesli komut
anlama için kullanılır, kota sorunu ortadan kalkar.

- **Tek kaynak:** archive.org.
- **Kalite beklentisi:** Kusursuz olmak zorunda değil, ama "abuk subuk" (bozuk OCR,
  müzik/rastgele tarama) sonuçlar kullanıcıya gösterilmez.

### Arka plan: OCR ve kalite riski

archive.org'daki `.txt` dosyaları taranmış kitaplardan OCR (Optik Karakter Tanıma)
ile üretilir. Kötü taramalarda harfler yanlış tanınır (`İstanbul` → `Istanbu1`),
metne sayfa numarası/sembol karışır. Bu metin TTS ile sesli okunduğu için bozuk OCR
doğrudan kötü kullanıcı deneyimine dönüşür. Bu yüzden tasarımda **temizlik** ve
**kalite kapısı** zorunlu bileşenlerdir.

## Mimari

### 1. Yeni kaynak: `src/sources/archive.ts`

Mevcut `BookSource` arayüzünü (`src/sources/types.ts`) uygular — `bundled.ts` ve
`wikisource.ts` ile aynı kalıp.

```
export const archiveSource: BookSource = {
  name: 'archive',
  search(query): Promise<BookSearchResult[]>
  fetchText(sourceId): Promise<string>
}
```

#### `search(query)`
- Endpoint: `https://archive.org/advancedsearch.php`
- Sorgu: `q=<query> AND mediatype:texts AND language:(Turkish OR turkish)`
- İstenen alanlar: `identifier`, `title`, `creator`, `format`
- `rows=15`, `output=json`
- **Gürültü filtresi:** Yalnızca `format` alanında metin biçimi
  (`DjVuTXT` veya `Text`) bulunan öğeler tutulur. Böylece müzik/görsel/rastgele
  tarama öğeleri arama aşamasında elenir.
- Dönüş: her öğe `{ id: "archive:<identifier>", title, author: creator, source: "archive", sourceId: identifier }`.

#### `fetchText(sourceId)`  (sourceId = archive identifier)
1. `https://archive.org/metadata/<id>` ile öğenin dosya listesini al.
2. Listeden gerçek metin dosyasını bul (öncelik: `*_djvu.txt`, yoksa diğer `.txt`).
   Dosya adı her zaman `<id>_djvu.txt` olmadığı için sabit URL varsaymak yerine
   metadata'dan okunur.
3. Dosyayı `https://archive.org/download/<id>/<dosyaadı>` üzerinden indir.
4. `cleanArchiveText()` ile temizle.
5. **Kalite kapısı:** Temizlenmiş metin `MIN_TEXT_LENGTH`'ten kısaysa veya
   "bozuk oran" eşiğini aşıyorsa `Error` fırlat (çağıran sonraki arama sonucuna geçer).

#### `cleanArchiveText(raw): string`
Saf metin temizliği (tek başına test edilebilir saf fonksiyon):
- Yalnızca sayfa numarası / Romen rakamı olan satırları sil.
- Tekrarlayan üstbilgi/altbilgi satırlarını sadeleştir.
- 3+ ardışık boş satırı 2'ye indir, baştaki/sondaki boşlukları kırp.
- Aşırı yoğun sembol/non-Türkçe karakter kümelerini ayıkla.

#### Kalite kapısı: "bozuk oran" (garbageRatio)
Saf fonksiyon. Metindeki Türkçe harf + boşluk + temel noktalama oranını hesaplar;
bu oran eşiğin altındaysa (örn. < %85) metin "bozuk" sayılır. Eşik değeri
uygulama sırasında birkaç gerçek örnekle kalibre edilir.

### 2. Ekranları birleşik kaynak katmanına bağlama

Şu an `HomeScreen`/`ReaderScreen` doğrudan `utils/gutenbergAPI` ve
`utils/wikisourceAPI`'yi kullanıyor. Bunlar `src/sources/index.ts`'in
`searchBook()` / `fetchBookText()` fonksiyonlarına bağlanır.

- `src/sources/index.ts`: `SOURCES = [archiveSource]` (tek kaynak).
- **HomeScreen:** `searchAndOpenBook` → `searchBook(query)` → dönen adayları sırayla
  `fetchBookText` ile dener; **kalite kapısından geçen ilk aday** seçilir. Geçerli
  metin modül düzeyinde kısa süreli cache'e yazılır, sonra Reader'a
  `{ bookId: hit.id, bookTitle: hit.title, bookAuthor: hit.author }` ile gidilir.
  Hiçbir aday geçemezse "uygun metin bulunamadı" anonsu yapılır (Reader'a gidilmez).
- **ReaderScreen:** Metin yükleme mantığı `fetchBookText(route.params.bookId)`
  çağrısına indirgenir; HomeScreen'in doldurduğu cache sayesinde tekrar indirme
  yapılmaz. Çevrimdışı yerel dosya yolu (`savedBook.localPath`) korunur ve cache'ten önce denenir.
- **Navigasyon parametreleri sadeleşir:** `textUrl`, `source`, `wikisourceTitle`,
  `sourceId` kaldırılır; yerine tek global ID (`archive:<identifier>`).
  `App.tsx`'teki `RootStackParamList` buna göre güncellenir.

### 3. Silinecekler
- `src/utils/gutenbergAPI.ts`
- `src/utils/wikisourceAPI.ts`
- Bunlara ait import'lar ve İngilizce/çeviri ile ilgili artık kod.

`src/sources/bundled.ts` ve `src/sources/wikisource.ts` dosyaları silinmez ama
`SOURCES` dizisinde yer almaz (ileride çevrimdışı/yedek kaynak olarak yeniden
eklenebilir). Tek aktif kaynak archive.org'dur.

### 4. Aynen kalanlar
- Sesli komut akışı: `geminiService.chat()` yalnızca komut anlama için.
- TTS (`tts.ts`), çevrimdışı indirme/depolama (`useOfflineBooks`, `bookStorage`),
  yer imi, otomatik kaydırma, kelime highlight.

## Veri Akışı

```
Kullanıcı sesli komut ("X kitabını aç")
  → useSpeech (STT, tr-TR)
  → geminiService.chat() → { action: "open_book", book: "X" }
  → HomeScreen.searchAndOpenBook("X")
  → searchBook("X")  → archiveSource.search → [BookSearchResult...]
  → adayları sırayla fetchBookText ile dene → kalite kapısından geçen ilk aday
       → archiveSource.fetchText(<id>)
            → metadata → .txt dosyasını bul → indir
            → cleanArchiveText → kalite kapısı (geçemezse sonraki aday)
       → temiz Türkçe metin (cache'e yazılır)
  → navigate Reader { bookId: "archive:<id>", title, author }
  → ReaderScreen → fetchBookText("archive:<id>") → cache'ten temiz metin
  → splitIntoPages → TTS ile oku
```

## Hata Yönetimi
- Arama 0 sonuç → kullanıcıya "bulunamadı" anonsu (mevcut davranış).
- `fetchText` kalite kapısından geçemezse → Error fırlatır; HomeScreen sıradaki
  arama adayını dener. Tüm adaylar başarısızsa "uygun metin bulunamadı" anonsu.
- Ağ hatası / timeout → mevcut `fetchWithTimeout` + anons mekanizması.

## Test Stratejisi
- `cleanArchiveText` ve `garbageRatio` saf fonksiyonlardır → birim testlerle
  (temiz metin, bozuk OCR örneği, sayfa numaralı metin) doğrulanır.
- `archiveSource.search` ve `fetchText` gerçek archive.org örnek ID'leriyle elle
  doğrulanır (cihazda + birkaç örnek kitap).

## Kapsam Dışı (YAGNI)
- Çoklu kaynak / hibrit arama.
- Wikisource ve bundled'ın yeniden devreye alınması.
- Gelişmiş OCR düzeltme (sözlük tabanlı vb.).
- Arama sonuçları arasından kullanıcıya seçtirme UI'ı (ilk geçerli sonuç açılır).
