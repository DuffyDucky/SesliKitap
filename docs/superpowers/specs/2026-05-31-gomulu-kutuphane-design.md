# Gömülü Kütüphane (Kendi Çevirilerim) — Tasarım

**Tarih:** 2026-05-31

## Amaç

Kullanıcının (geliştiricinin) zamanla kendi Türkçe çevirilerini uygulamaya gömülü
olarak ekleyebileceği, her kullanıcıda aynı olan, çevrimdışı ve API gerektirmeyen
bir kütüphane. Sesle "kütüphaneye git" denince bu çeviriler listelenir; kullanıcı
isim veya numarayla seçip okutmaya başlar.

## Mimari Konum

- **Gutenberg = 1. (birincil) kaynak.** Ana ekran sesli araması yalnızca Gutenberg'e
  gider. Bu davranış değişmez.
- **Gömülü kütüphane = 2. kaynak.** Zamanla büyüyecek küratörlü koleksiyon. Şimdilik
  yalnızca kütüphane ekranından erişilir, aramaya KARIŞMAZ.

## Bileşenler

### 1. İçerik yapısı — `src/books/`

Her kitap kendi `.ts` dosyasında, tek sorumluluk:

```ts
// src/books/forsa.ts
import type { BundledBook } from './types';

const book: BundledBook = {
  id: 'omer-seyfettin-forsa',
  title: 'Forsa',
  author: 'Ömer Seyfettin',
  aliases: ['forsa', 'omer seyfettin forsa'],
  text: `Forsa
Ömer Seyfettin

...tam metin...`,
};

export default book;
```

- `src/books/types.ts` — `BundledBook` arayüzü (`id, title, author, aliases, text`).
- `src/books/index.ts` — tüm kitap dosyalarını `import` edip tek `BOOKS: BundledBook[]`
  dizisinde toplar.
- Mevcut 3 metin (İstiklâl Marşı, Nasreddin Hoca Fıkraları, Forsa) bu yapıya taşınır.

**Kitap ekleme akışı:** `src/books/<slug>.ts` dosyasını oluştur → `index.ts`'e bir
`import` + diziye ekleme satırı. Başka hiçbir yere dokunulmaz.

### 2. Kaynak bağlantısı — `src/sources/`

- `bundled.ts` artık metinleri inline tutmaz; `src/books/index.ts`'ten `BOOKS`'u
  okur. `bundledSource.fetchText` ve `listBundledBooks` aynı şekilde çalışır.
- `src/sources/index.ts` iki ayrı liste tutar:
  - `SEARCH_SOURCES = [gutenbergSource]` — `searchBook()` yalnızca bunları sorgular.
  - `ALL_SOURCES = [gutenbergSource, bundledSource]` — `fetchBookText()` global ID'yi
    çözmek için bunları kullanır (Okuyucu'nun `bundled:...` metnini açabilmesi için).

Böylece arama Gutenberg-only kalır ama kütüphaneden seçilen gömülü kitabın metni
çevrimdışı yüklenebilir.

### 3. Kütüphane ekranı — `src/screens/LibraryScreen.tsx`

- Liste kaynağı AsyncStorage yerine `listBundledBooks()` (gömülü çeviriler) olur.
- Kitaplar alt alta metin olarak listelenir (numara + başlık + yazar).
- Sesli komut: isim veya numara → eşleşen kitabı bul → Okuyucu'ya `bundled:<id>` ile git.
- Dokunma ile de seçilebilir.

### 4. Okuma

- Seçilen gömülü kitap baştan açılır. Reader, `getBook(bundled:id)` ile yerel dosya
  bulamaz → `fetchBookText('bundled:id')` çağırır → gömülü metin döner (çevrimdışı).
- Kaldığı yerden devam: bu sürümün kapsamı dışında (YAGNI).

## Geri Alınacaklar (bu oturumda yanlış eklenenler)

İngilizce Gutenberg demo seed'i bu vizyonun tersiydi, kaldırılır:
- `src/store/seedBooks.ts`, `src/store/demoBooks.ts`, `src/store/demoBooks.test.ts` silinir.
- `HomeScreen.tsx`'teki `seedDemoBooksOnce()` çağrısı ve import'u geri alınır.
- `package.json` test betiğinden `demoBooks.test.ts` çıkarılır.

## Test

- `src/books/index.test.ts` (node:test, saf mantık):
  - `BOOKS` en az 3 kitap içerir.
  - Her kitabın `id`, `title`, `author`, `text` alanları dolu.
  - `id`'ler benzersiz.

## Erişim

Ana ekran tamamen basılı-tut-konuş yüzeyidir. Kütüphaneye sesle **"kütüphaneye git"**
ile girilir (mevcut `go_library` davranışı). Görünür buton/sekme eklenmez.

## Kapsam Dışı (YAGNI)

- Gömülü kitapların aramaya dahil edilmesi (ileride 2. kaynak yeterince dolunca).
- Kaldığı yerden devam / okuma ilerlemesi kaydı.
- Uygulama içinden kitap ekleme arayüzü (ekleme geliştirici tarafında, dosyayla).
