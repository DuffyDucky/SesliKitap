# Tasarım: Ön Bilgileri Atlama (Asıl Metinden Başlama)

**Tarih:** 2026-05-29
**Durum:** Onaylandı (uygulama bekliyor)

## Problem

archive.org'dan gelen kitaplar asıl içerikten önce **ön bilgilerle** başlıyor:
kapak, yazar adı tekrarı, eser listesi ("1 — Çalıkuşu, 2 — Dudaktan Kalbe..."),
yayınevi/ISBN/matbaa bilgisi, önsöz. Kullanıcı (görme engelli) okumaya doğrudan
**asıl metinden** başlamak istiyor; her seferinde sayfa sayfa atlamak zorunda
kalmamalı.

## Karar

Kitap açılınca asıl metnin başladığı yer **otomatik tahmin edilir** ve okuma oradan
başlar. Tahmin OCR'lı metinde %100 kesin olamayacağı için, kullanıcı **sesli
komutla** ön bilgilere geri dönebilir veya tekrar asıl metne geçebilir.

- **Varsayılan davranış:** kırpılmış metin (asıl metinden başlar).
- **Yedek:** sesli komut ile tam metne (ön bilgiler dahil) geçiş.

## Mimari

### 1. Tespit fonksiyonu: `src/utils/frontMatter.ts`

Saf, tek sorumluluğu olan, birim testlenebilir fonksiyon:

```
export function findMainTextStart(text: string): number
```

Metnin asıl başladığı **karakter konumunu (offset)** döndürür. Bulamazsa 0.

Algoritma (sırayla):
1. **Bölüm işareti araması:** Aşağıdaki kalıpların metindeki ilk geçtiği konum
   (ilk satır değilse):
   - `BİRİNCİ BÖLÜM`, `BİRİNCİ KISIM`
   - `1.`/`I.` + `BÖLÜM`/`KISIM`
   - `BÖLÜM`/`KISIM` + `I`/`1`/`BİR`
   (Türkçe büyük/küçük harf ve İ/I varyasyonlarına toleranslı, büyük/küçük harf
   duyarsız.)
2. **Fallback (işaret yoksa):** Metni boş satırlara göre paragraflara böl; baştan
   itibaren ilk "asıl düzyazı paragrafı"nın konumunu döndür. Asıl paragraf ölçütü:
   - uzunluk > 250 karakter,
   - en az 2 cümle sonu işareti (`.`/`!`/`?`),
   - küçük harf içeriyor (yalnızca BÜYÜK HARF başlık/kapak değil).
3. **Güvenlik freni:** Bulunan konum `text.length * 0.5`'ten büyükse, tespit
   güvenilmez sayılır ve **0** döndürülür (yanlışlıkla kitabın yarısından fazlasını
   atlamayı önler).

### 2. ReaderScreen — varsayılan kırpılmış, tam metni sakla

- Kitap yüklenince ham metin `fullText` olarak ve `mainStart = findMainTextStart(fullText)`
  saklanır (ref/state).
- Yeni durum: `includeFrontMatter: boolean` (varsayılan `false`).
- `pages` türetimi:
  - `includeFrontMatter === false` → `splitIntoPages(fullText.slice(mainStart))`
  - `includeFrontMatter === true` → `splitIntoPages(fullText)`
- `includeFrontMatter` değiştiğinde sayfalar yeniden hesaplanır ve sayfa 1'e dönülür.
- Yerel (çevrimdışı) dosyadan okunan metin için de aynı mantık uygulanır.

### 3. İki yeni sesli komut (Gemini intent)

`src/utils/geminiService.ts` `BASE_SYSTEM` aksiyon listesine eklenir:
- `read_full` — "ön bilgiler dahil en baştan oku" ("en baştan oku", "önsözü oku",
  "ön bilgileri göster", "kapaktan başla").
- `skip_intro` — "asıl metne geç / önsözü atla" ("önsözü atla", "asıl metne geç",
  "hikâyeye geç", "ön bilgileri atla").

`IntentAction` tipine de bu iki aksiyon eklenir.

ReaderScreen `handleVoiceResult` switch'i:
- `read_full` → `setIncludeFrontMatter(true)`, sayfa 1, anons: "Ön bilgiler dahil en
  baştan başlıyorum."
- `skip_intro` → `setIncludeFrontMatter(false)`, sayfa 1, anons: "Asıl metne
  geçiyorum."

(`tts.ts announce`'a iki kısa anons eklenebilir veya doğrudan `speak` çağrılır.)

## Veri Akışı

```
Kitap açılır → fetchBookText → fullText
  → mainStart = findMainTextStart(fullText)
  → includeFrontMatter=false → pages = splitIntoPages(fullText.slice(mainStart))
  → okuma asıl metinden başlar

Kullanıcı "en baştan oku" → Gemini {action:"read_full"}
  → includeFrontMatter=true → pages = splitIntoPages(fullText) → sayfa 1

Kullanıcı "asıl metne geç" → Gemini {action:"skip_intro"}
  → includeFrontMatter=false → pages = splitIntoPages(fullText.slice(mainStart)) → sayfa 1
```

## Hata Yönetimi
- `findMainTextStart` hiçbir şey bulamazsa veya güvenlik frenine takılırsa 0 döner
  → davranış bugünküyle aynı (baştan okur), kullanıcı bir şey kaybetmez.
- `mainStart === 0` ise kırpılmış ve tam metin aynıdır; komutlar yine çalışır
  (sadece görünür fark olmaz).

## Test Stratejisi
- `findMainTextStart` saf fonksiyon → birim testler:
  - bölüm işaretli metin → işaretin konumunu döndürür,
  - işaretsiz + önsözlü metin → ilk uzun düzyazı paragrafını döndürür,
  - güvenlik freni → asıl metin %50'den ötedeyse 0 döner,
  - boş/kısa metin → 0 döner.
- Gerçek Çalıkuşu metniyle elle doğrulama: kırpılmış metnin kapak/eser
  listesi/yayın bilgisini içermediğini gör.

## Kapsam Dışı (YAGNI)
- Önsözü asıl metinden ayrı "ayrı okunabilir bölüm" olarak sunmak.
- İçindekiler/bölüm listesini menüleştirmek.
- Sayfa bazlı kalıcı "nereden başladı" tercihini AsyncStorage'a yazmak (oturum içi
  durum yeterli).
