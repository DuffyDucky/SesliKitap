# Açılan Kitabı Kütüphaneye Ekleme + Türkçe Başlık — Tasarım

**Tarih:** 2026-06-03
**Durum:** Onaylandı (kullanıcı brainstorming'de doğruladı)

## Amaç

İki kullanıcı isteği:
1. Aranıp açılan bir Gutenberg kitabı **anında kütüphaneye eklensin** — çeviri
   arka planda sürerken bile listede dursun, çıkıp girince tekrar aramaya gerek
   kalmadan kaldığı yerden açılsın.
2. Kitap başlığı **Türkçe** görünsün (hem kütüphane listesinde hem okuma
   ekranının üstünde) — İngilizce "Crime and Punishment" yerine "Suç ve Ceza".

## Mevcut Durum

- `LibraryScreen` yalnızca gömülü kitapları (`listBundledBooks()`) listeler.
- Gutenberg kitapları aranıp açılır (`HomeScreen.searchAndOpenBook`), diske
  çevrilir (`translated/<id>.json`) ama **kalıcı bir kütüphane kaydı oluşmaz**.
- Reader'a giden başlık Gutenberg'in **İngilizce** başlığıdır (`hit.title`).
- Açma akışında kullanıcının orijinal Türkçe sorgusu da mevcuttur ama başlık
  olarak kullanılmaz.

## Kapsam (v1) ve Kapsam Dışı

**v1:** Kütüphaneye ekleme + Türkçe başlık. Kütüphaneden açınca İngilizce kaynak
metin bugünkü gibi internetten tekrar indirilir (ağ gerekir); Türkçe sayfalar
diskteki önbellekten anında gelir, kalan bloklar arka planda dolar.

**Kapsam dışı (sonraki iş):** Tam çevrilmiş kitabı **internetsiz** okuma. Bu,
sayfa türetmeyi `fullText`'ten koparmayı gerektirir (daha büyük değişiklik);
kullanıcı şimdilik basit planı seçti.

## Kararlar (kullanıcı onaylı)

| Konu | Karar |
|------|-------|
| Ekleme anı | Kitap **açılır açılmaz** (çeviri başlamadan beklemeden) |
| Türkçe başlık kaynağı | İngilizce başlığı **Gemini** ile çevir; başarısız/boş olursa Google Translate'e, o da olmazsa İngilizce başlığa düş |
| Çevrimdışı okuma | v1'de yok — açılışta ağ gerekir |
| Depolama | Yeni odaklı `libraryStore` (mevcut `bookStorage` BookMetadata'yı kirletmeden) |

## Mimari

### Yeni: `src/store/libraryStore.ts`
Kütüphaneye eklenen (gömülü olmayan) kitapların minimal kalıcı listesi.

```ts
export interface LibraryEntry {
  id: string;       // global id, örn. "gutenberg:2554"
  title: string;    // Türkçe başlık
  author: string;
  addedAt: string;  // ISO tarih
}
```
- `getEntries(): Promise<LibraryEntry[]>` — bozuk JSON → temiz ([]).
- `upsertEntry(entry): Promise<void>` — aynı `id` varsa günceller, yoksa ekler.
- `hasEntry(id): Promise<boolean>`.
- AsyncStorage anahtarı `@seslikitap_library`. `bookStorage` kalıbının aynısı.

### Yeni: `resolveTurkishTitle(englishTitle)` (`src/utils/geminiService.ts`)
`resolveEnglishTitle`'ın simetriği. Tek-atış Gemini `generateContent` ile EN→TR
başlık. **Asla çökmez/işi durdurmaz:** Gemini başarısız/boş/kota → `googleTranslate`
fallback → o da başarısız → İngilizce başlığı aynen döndür. Kısa metin, conversation
history'den bağımsız.

### Değişiklik: `src/screens/ReaderScreen.tsx`
- `displayTitle` state (varsayılan: route `bookTitle`). Başlık çubuğu artık
  `bookTitle` yerine `displayTitle` gösterir.
- `needsTranslation` kitabı açıldığında (mevcut çeviri effect'i ya da ona komşu
  bir effect):
  - `libraryStore.hasEntry(bookId)` ise → kayıtlı `title`'ı `displayTitle`'a koy.
  - Değilse → `resolveTurkishTitle(bookTitle)` → `displayTitle`'a koy →
    `upsertEntry({ id: bookId, title: TR, author: bookAuthor, addedAt })`.
  - Böylece başlık bir kez çevrilir; sonraki açılışlarda kayıttan gelir.
- Gömülü kitaplar (`needsTranslation=false`) bu yola girmez — başlığı zaten Türkçe.

### Değişiklik: `src/screens/LibraryScreen.tsx`
- Kitap listesi artık async yüklenir: `[...libraryStore kayıtları (yeni→eski),
  ...listBundledBooks()]` → `BookSearchResult[]` (LibraryEntry → `{ id, title,
  author, source, sourceId }`; gutenberg id'den source/sourceId türetilir).
- Render, odak/kaydırma, çift-dokun-aç **her id için** zaten çalışır (Reader
  `gutenberg:` id'lerini açabiliyor).
- Sesle "kitap adı" ile açmada: gömülü `bundledSource.search`'e ek olarak
  kütüphane kayıtlarında da basit normalize-eşleşme yapılır.
- Açılış/odak anonsları ve boş-liste durumu aynı kalır.

## Veri Akışı

```
Kitap ara/aç (HomeScreen) → Reader (gutenberg:2554, İngilizce başlık)
   │
   ├─ needsTranslation effect:
   │     hasEntry? → evet: displayTitle = kayıtlı TR başlık
   │                 hayır: resolveTurkishTitle(EN) → displayTitle = TR
   │                        upsertEntry({id, title:TR, author})
   │     translationJob.start(...)   (mevcut)
   │
   └─ Kütüphane ekranı: gömülü + kayıtlar → kitap listede görünür
         çift dokun → Reader (gutenberg:2554) → önbellekten Türkçe okur
```

## Hata Yönetimi
- Başlık çevirisi her katmanda graceful düşer (TR→GT→EN); başlık asla okumayı
  engellemez.
- `libraryStore` bozuk JSON'da temizlenir (mevcut store kalıbı).
- `upsertEntry` idempotent; aynı kitabın tekrar açılması çift kayıt yaratmaz.

## Test Stratejisi (node:test + tsx)
- **`libraryStore.test.ts`** — upsert+getEntries round-trip; aynı id güncellenir
  (çift kayıt yok); `hasEntry` doğru; bozuk JSON → []. AsyncStorage mock.
- **`resolveTurkishTitle`** (`geminiService.test.ts`'e ek) — fetch mock: başarıda
  TR döner; !ok/boş → İngilizce döner (fallback yolu).
- **RN** — `npx tsc --noEmit` + cihaz: Gutenberg kitabı aç → kütüphanede Türkçe
  adıyla belirir; başlık çubuğu Türkçe; çıkıp kütüphaneden tekrar aç → kaldığı
  yerden.

## Dokunulmayanlar
- Çeviri motoru / blok mantığı / quotaGovernor / resilientTranslate (mevcut).
- Gömülü kitaplar ve İngilizce okuma modu.
- `bookStorage` (indirilmiş kitap/ilerleme) — ayrı sorumluluk, değişmez.
