# Gemini Blok Çeviri Mimarisi — Tasarım

**Tarih:** 2026-06-02
**Durum:** Onaylandı (kullanıcı brainstorming'de doğruladı)

## Amaç

Gutenberg'den çekilen İngilizce kitapları, Gemini'nin RPM/RPD limitlerine
takılmadan ve düşük kaliteli canlı Google Translate'e mahkûm olmadan kaliteli
Türkçeye çevirmek.

## Sorun

Mevcut sistemde çeviri:
- **Canlı, sayfa-sayfa** (~2000 karakter) yapılıyor → okuma anında bloklayan
  ağ isteği.
- **Cümle ortasından** kesen parçalarla → bozuk çeviri.
- Ne RPM ne RPD takibi var → limit aşımında "patlıyor".
- Google Translate motoru → kullanıcı kalitesini yetersiz buluyor.

## Çözüm — Temel İlke

**Çeviriyi okumadan ayır.** Okuma anında asla canlı çeviri isteği atılmaz;
okuma daima diskteki önbellekten gelir. Çeviri, okumanın *önünde* giden bir
arka plan işiyle, **blok temelli** ve **Gemini** ile yapılır.

## Kararlar (kullanıcı onaylı)

| Konu | Karar |
|------|-------|
| Kapsam | İki yol: (1) curated kitaplar PC'de önceden çevrilip gömülür, (2) aranan kitaplar telefonda çevrilir |
| Motor (her iki yol) | Gemini (`gemini-2.5-flash-lite`) — Google Translate tamamen kaldırılır |
| Kota bitince | "Bekle, yarın devam" — Google Translate'e DÜŞÜLMEZ |
| Arka plan | Uygulama açıkken çalışır (Expo gerçek-arka-plan kullanılmaz) |
| Limit yönetimi | Önleyici aralık (governor, ≥4.5 sn) ana mekanizma + 429 geri-çekilme emniyet kemeri |

## Mimari ve Veri Akışı

```
Kitap açılır (needsTranslation)
   │
   ├─ translationJob.startJob(bookId, englishText, getCurrentBlockIndex)
   │     ├─ Metni bloklara böl (~22k karakter, paragraf sınırından)
   │     ├─ Kullanıcının BULUNDUĞU bloğu öne al (öncelik)
   │     └─ Döngü: governor.acquire()
   │              'ok'        → translateBlock → saveBlock → record → subscribe bildir
   │              'exhausted' → durum 'paused-quota', dur
   │
   └─ Okuyucu daima diskteki çevrilmiş bloklardan okur (pages = bitmiş blokların TR'si)
         ├─ Sayfa hazır                 → oku
         ├─ Hazır değil + kota var      → "çevriliyor", subscribe ile blok gelince devam
         └─ Hazır değil + kota yok      → "günlük sınır doldu, yarın devam", duraksa
```

### Birimler
- **Blok** = çeviri birimi (~22.000 karakter, ~25 adet/roman). Gemini'ye giden parça.
- **Sayfa** = okuma birimi (~2000 karakter). **Bitmiş blokların Türkçesinden**
  `splitIntoPages` ile türetilir. Bir blok ≈ 10 sayfa.

Bloklar sırayla (ve bulunulan blok öncelikli) bittiği için `pages` dizisi baştan
büyüyen, **kararlı** bir listedir → önceki sayfalar kaymaz → `saveProgress(page,
sentence)` aynen çalışır.

### Kalıcılık (3 katman)
1. **Çevrilmiş içerik** — `${documentDirectory}translated/<bookId>.json`
   = `{ totalBlocks, done: { [index]: turkishText } }`. Çevrilen blok bir daha
   asla çevrilmez (kota korunur, tekrar okumada anında).
2. **İlerleme** — hangi bloklar bitti (iş yarıda kalırsa kaldığından devam).
   `done` anahtarlarından türetilir.
3. **Günlük kota** — AsyncStorage `{ date, count }`. Yeni günde sıfırlanır (RPD bütçesi).

## Modüller

### `src/translation/blocks.ts`
- `Block = { index: number; start: number; end: number; source: string }`
- `splitIntoBlocks(text: string, targetChars = 22000): Block[]`
- Paragraf sınırından (`\n\n`) keser; hedefi aşınca yeni blok. **Asla**
  cümle/paragraf ortasından bölmez. Tek paragraf hedeften büyükse zorla bölmez,
  tek blok kalır. Saf fonksiyon.

### `src/translation/geminiTranslate.ts`
- `translateBlock(english: string): Promise<string>`
- Tek bloğu çeviren Gemini `generateContent` çağrısı. `geminiService.ts`'ten
  ayrı (o niyet/sohbet için). Ortak `GEMINI_API_KEY` / `GEMINI_MODEL` env'ini paylaşır.
- **Çeviri promptu (PAYLAŞILAN GERÇEK — PC script ile birebir aynı):**
  > "Bu İngilizce metni edebî, akıcı Türkçeye çevir. Paragraf yapısını
  > (boş satırları) koru. Sadece çeviriyi yaz; açıklama, başlık veya not ekleme."
- `generationConfig: { temperature: 0, maxOutputTokens: 8192 }`.
- 429 alırsa kısa bekleyip o bloğu bir kez yeniden dener (emniyet kemeri).

### `src/translation/quotaGovernor.ts`
- `acquire(): Promise<'ok' | 'exhausted'>` — RPM doluysa boşluğa kadar bekler
  (iki istek arası ≥4.5 sn); bugünkü RPD bütçesi dolduysa `'exhausted'`.
- `record(): Promise<void>` — bellek RPM penceresi + AsyncStorage RPD sayacı.
- `isExhaustedToday(): Promise<boolean>` — okuyucunun "yarın devam" kararı için.
- Tarih değişince RPD sayacı sıfırlanır. Sahte saat/sleep enjekte edilebilir (test).
- `RPD_BUDGET` yapılandırılabilir sabit (varsayılan muhafazakâr; gerçek kotaya göre ayarlanır).

### `src/translation/translationStore.ts`
- expo-file-system tabanlı (büyük metin AsyncStorage'a değil dosyaya).
- `getStore(bookId): Promise<{ totalBlocks, done }>`
- `saveBlock(bookId, index, turkish): Promise<void>`
- `getDoneBlocks(bookId): Promise<Record<number,string>>`
- Bozuk JSON → temiz başlangıç (mevcut store kalıbı).

### `src/translation/translationJob.ts` (singleton koordinatör)
- `startJob(bookId, englishText, getCurrentBlockIndex: () => number): void`
- Bloklara böler, bitmemişleri sıraya alır. Döngü: `acquire()` → `'ok'` ise
  `translateBlock`→`saveBlock`→`record`→abonelere bildir; `'exhausted'` ise
  dur, durum `'paused-quota'`.
- `getCurrentBlockIndex()` ile kullanıcının bulunduğu blok sıranın önüne geçer.
- `subscribe(cb): () => void` — ilerleme/durum değişince okuyucu tazelenir.
- Aynı kitap için tek iş; `bookId` değişince eskisini durdurur.
- Yeniden başlatınca yalnız `done`'da olmayan blokları çevirir.

## Okuyucu Entegrasyonu (`ReaderScreen.tsx`)

1. `needsTranslation` ise: canlı `translateToTurkish` **kalkar**; yerine
   `translationJob.startJob(bookId, englishText, () => currentBlockIndex)`.
2. `translationJob.subscribe(...)` → yeni blok bitince `pages` yeniden türetilir,
   ekran tazelenir.
3. `readFromCurrent` döngüsündeki sayfa-içi `translateToTurkish(text)` **kalkar**;
   döngü hazır Türkçe `pages`'ten okur.
4. Sınır durumları:
   - Sayfa hazır değil + kota var → "çevriliyor, bir saniye"; `subscribe` ile blok
     gelince kaldığı cümleden devam.
   - Sayfa hazır değil + kota yok (`isExhaustedToday`) → "günlük çeviri sınırına
     ulaşıldı, yarın kaldığım yerden devam ederim", duraksa.
   - "X. sayfaya git" → o blok önceliklenir (kota varsa çevrilir).
5. `currentBlockIndex` = currentPage'in düştüğü blok (öncelik için).

**Dokunulmayanlar:** Gömülü Türkçe kitaplar (`bundled:`) ve İngilizce okuma modu
(`needsTranslation=false`) bu yola hiç girmez — tam metin doğrudan okunur.

## PC Pipeline — `scripts/gutenberg_to_book.py`

Curated kitaplar için: zamanın sınırsız olduğu PC'de bir kez çevir, gömülü `.ts`
üret → çalışma anında sıfır istek, sıfır bekleme, en yüksek kalite.

1. **Çek:** Gutenberg ID → İngilizce düz metin (boilerplate kırpma, `gutenbergText.ts`
   mantığının Python karşılığı).
2. **Blokla:** TS `splitIntoBlocks` ile **birebir aynı kural** (~22k, paragraf sınırı).
3. **Çevir:** Her blok Gemini `generateContent` (Python `requests`), **aynı çeviri
   promptu**. İstekler arası ~4.5 sn delay (429 yememek için).
4. **Yaz:** `src/books/<slug>.ts` (BundledBook, `text` = tam Türkçe). `index.ts`'e
   elle eklenir (mevcut akış).

**Paylaşılan gerçek:** Blok bölme kuralı ve çeviri promptu PC (Python) ve telefon
(TS) tarafında birebir aynı metinle tanımlanır; yoksa farklı sınır/çeviri üretir.

## Test Stratejisi (node:test + tsx)

- **`blocks.test.ts`** — paragraf sınırından keser / cümle ortasından kesmez;
  blok ≤ hedef+tolerans; birleşim = orijinal; büyük tek paragraf tek blok; boş→sıfır/tek.
- **`quotaGovernor.test.ts`** — sahte saat: ardışık `acquire` ≥4.5 sn aralık;
  RPD dolunca `'exhausted'`; tarih değişince sıfırlama; `isExhaustedToday` doğru. AsyncStorage mock.
- **`translationStore.test.ts`** — `saveBlock`/`getDoneBlocks` round-trip; bozuk JSON→temiz. fs mock.
- **`translationJob.test.ts`** — sahte translateBlock+governor: sırayla çevir/kaydet;
  öncelik öne alır; `'exhausted'`→`'paused-quota'`+dur; yeniden başlatınca yalnız
  bitmemişleri çevir; `subscribe` tetiklenir.
- **`geminiTranslate.ts`** — `fetch` mock (geminiService.test.ts gibi): prompt/parse doğrula.
- **RN** — `npx tsc --noEmit` + telefon: ara→çevrilsin→oku; ortada çık-gir (kaldığı
  yerden); düşük RPD bütçesiyle "yarın devam".

## Kaldırılacak / Değişecek Kod

- **Silinir:** `src/utils/translator.ts` (canlı Google Translate — ölü yol).
- **Silinir:** `src/utils/textChunk.ts` + `src/utils/textChunk.test.ts`
  (yalnız translator.ts kullanıyor — grep ile doğrulandı).
- **Değişir:** `ReaderScreen.tsx` — `translateToTurkish` importu ve iki kullanımı çıkar.
- **Eklenir:** `src/translation/` (5 modül), `scripts/gutenberg_to_book.py`.
- **Migrasyon:** Eski `@tr:<hash>` AsyncStorage anahtarları zararsız kalır (temizlik YAGNI).
