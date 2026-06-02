# Gemini Blok Çeviri Mimarisi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gutenberg İngilizce kitaplarını, Gemini 3.1 Flash Lite ile blok temelli, okumadan ayrık (önce çevir-önbellekle-sonra oku) ve rate-limit'e takılmayan bir mimariyle Türkçeye çevirmek.

**Architecture:** Çeviri okuma anından koparılır. Saf-mantık modülleri (`blocks`, `quotaGovernor`, `translationStore`, `translationJob`, `geminiTranslate`) RN/Expo importu içermez → node:test ile test edilir. RN bağlama (AsyncStorage + expo-file-system + singleton'lar) tek bir `instances.ts`'te toplanır (tsc + cihaz ile doğrulanır). Okuyucu canlı çeviri yerine diskteki bitmiş bloklardan okur; çeviri arka planda okumanın önünde ilerler.

**Tech Stack:** Expo 55 / React Native 0.83 / TypeScript, node:test + tsx, Gemini 3.1 Flash Lite (generateContent), expo-file-system (`File`/`Directory`/`Paths`), AsyncStorage, Python 3 (PC pipeline).

**Spec:** `docs/superpowers/specs/2026-06-02-gemini-blok-ceviri-design.md`

**Spec'ten sapma (YAGNI):** Spec'teki "öncelik (current block öne alınır)" özelliği v1'de **sıralı**dır. Bloklar sırayla, bitmiş-önek (contiguous prefix) mantığıyla çevrildiği için doğrusal okumada "ilk bitmemiş blok" zaten doğru hedeftir. İleri atlama (çevrilmemiş sayfaya gitme) → okuyucu "çevriliyor/yarın devam" ile karşılar (Task 8). `translationJob`'a `getCurrentBlockIndex` parametresi eklenmez.

## Dosya Yapısı

| Dosya | Sorumluluk | Test |
|-------|-----------|------|
| `src/translation/blocks.ts` | Metni çeviri bloklarına böler (saf) | node:test |
| `src/translation/geminiTranslate.ts` | Tek bloğu Gemini ile çevirir (fetch) | node:test (fetch mock) |
| `src/translation/quotaGovernor.ts` | RPM aralık + RPD bütçe (saf, fabrika) | node:test (sahte saat/store) |
| `src/translation/translationStore.ts` | Çevrilmiş içerik kalıcılığı (saf, fabrika) | node:test (bellek fs) |
| `src/translation/translationJob.ts` | Arka plan koordinatörü (saf, fabrika) | node:test (sahte bağımlılık) |
| `src/translation/instances.ts` | RN bağlama: singleton governor/store/job | tsc + cihaz |
| `src/screens/ReaderScreen.tsx` | Okuyucu entegrasyonu | tsc + cihaz |
| `scripts/gutenberg_to_book.py` | PC pipeline (curated önçeviri) | elle çalıştırma |

**Silinecek:** `src/utils/translator.ts`, `src/utils/textChunk.ts`, `src/utils/textChunk.test.ts`.

---

## Task 1: Blok bölme (`blocks.ts`)

**Files:**
- Create: `src/translation/blocks.ts`
- Test: `src/translation/blocks.test.ts`

- [ ] **Step 1: Testi yaz (başarısız)**

`src/translation/blocks.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoBlocks } from './blocks';

test('boş metin → boş dizi', () => {
  assert.deepEqual(splitIntoBlocks(''), []);
});

test('kısa tek paragraf → tek blok, kaynak korunur', () => {
  const b = splitIntoBlocks('abc');
  assert.equal(b.length, 1);
  assert.equal(b[0].source, 'abc');
});

test('blokların birleşimi orijinale eşittir (kayıp yok)', () => {
  const text = 'Para bir.\n\nPara iki.\n\nPara üç.\n\nPara dört.';
  const blocks = splitIntoBlocks(text, 12);
  assert.equal(blocks.map((b) => b.source).join(''), text);
});

test('paragraf ortasından kesmez — bloklar \\n\\n sınırında biter', () => {
  const text = 'Para bir.\n\nPara iki.\n\nPara üç.';
  const blocks = splitIntoBlocks(text, 12);
  for (let i = 0; i < blocks.length - 1; i++) {
    assert.match(blocks[i].source, /\n\n$/);
  }
});

test('hedeften küçük paragraflarda her blok hedef sınırında kalır', () => {
  const text = 'aaa\n\nbbb\n\nccc\n\nddd';
  const blocks = splitIntoBlocks(text, 6);
  for (const b of blocks) assert.ok(b.source.length <= 6 + 2);
});

test('tek paragraf hedeften büyükse zorla bölmez → tek blok', () => {
  const big = 'x'.repeat(100);
  const blocks = splitIntoBlocks(big, 10);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].source, big);
});

test('index ardışık ve start/end bitişik', () => {
  const text = 'aaa\n\nbbb\n\nccc';
  const blocks = splitIntoBlocks(text, 4);
  blocks.forEach((b, i) => assert.equal(b.index, i));
  for (let i = 1; i < blocks.length; i++) assert.equal(blocks[i].start, blocks[i - 1].end);
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx tsx src/translation/blocks.test.ts`
Expected: FAIL — `Cannot find module './blocks'`.

- [ ] **Step 3: Minimal implementasyonu yaz**

`src/translation/blocks.ts`:
```ts
/**
 * Metni çeviri bloklarına böler. Bloklar paragraf sınırından (\n\n) kesilir;
 * asla cümle/paragraf ortasından bölünmez. blocks.map(b=>b.source).join('')
 * daima orijinal metne eşittir (karakter kaybı yok). Saf fonksiyon.
 */
export interface Block {
  index: number;
  start: number;
  end: number;
  source: string;
}

export function splitIntoBlocks(text: string, targetChars = 22000): Block[] {
  if (text.length === 0) return [];

  // Olası kesim noktaları: her paragraf ayracının (\n\n+) BİTİŞİ ve metin sonu.
  const cutPoints: number[] = [];
  const paraRegex = /\n{2,}/g;
  let m: RegExpExecArray | null;
  while ((m = paraRegex.exec(text)) !== null) {
    cutPoints.push(m.index + m[0].length);
  }
  cutPoints.push(text.length);

  const blocks: Block[] = [];
  let start = 0;
  let safeCut = 0; // mevcut blok için son güvenli kesim (paragraf sınırı)

  for (const cp of cutPoints) {
    // Bu kesim noktasını eklemek hedefi aşıyorsa ve elimizde güvenli bir
    // kesim varsa, bloğu orada kapat (paragraf ortasından bölme).
    if (cp - start > targetChars && safeCut > start) {
      blocks.push({ index: blocks.length, start, end: safeCut, source: text.slice(start, safeCut) });
      start = safeCut;
    }
    safeCut = cp;
  }
  if (start < text.length) {
    blocks.push({ index: blocks.length, start, end: text.length, source: text.slice(start, text.length) });
  }
  return blocks;
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx tsx src/translation/blocks.test.ts`
Expected: PASS (7 test).

- [ ] **Step 5: Commit**

```bash
git add src/translation/blocks.ts src/translation/blocks.test.ts
git commit -m "feat(translation): metni çeviri bloklarına bölen splitIntoBlocks"
```

---

## Task 2: Gemini çeviri çağrısı (`geminiTranslate.ts`)

**Files:**
- Create: `src/translation/geminiTranslate.ts`
- Test: `src/translation/geminiTranslate.test.ts`

**Kurulum notu:** Bu modül `EXPO_PUBLIC_GEMINI_MODEL` env değişkenini okur. Çalışma ortamında bu değer **Gemini 3.1 Flash Lite** model kimliğine ayarlanmalı (varsayılan alias `gemini-flash-lite-latest`).

- [ ] **Step 1: Testi yaz (başarısız)**

`src/translation/geminiTranslate.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Modül yüklenmeden ÖNCE anahtarı ayarla (geminiService.test.ts kalıbı).
process.env.EXPO_PUBLIC_GEMINI_API_KEY = 'test-key';

function mockFetch(payload: unknown, ok = true, status = 200): void {
  (globalThis as any).fetch = async () => ({ ok, status, json: async () => payload });
}

test('translateBlock: çeviriyi döndürür', async () => {
  mockFetch({ candidates: [{ content: { parts: [{ text: 'Merhaba dünya' }] } }] });
  const { translateBlock } = await import('./geminiTranslate');
  assert.equal(await translateBlock('Hello world'), 'Merhaba dünya');
});

test('translateBlock: boş girdi → aynen döner (istek atmaz)', async () => {
  const { translateBlock } = await import('./geminiTranslate');
  assert.equal(await translateBlock('   '), '   ');
});

test('translateBlock: boş yanıt → hata fırlatır', async () => {
  mockFetch({ candidates: [] });
  const { translateBlock } = await import('./geminiTranslate');
  await assert.rejects(() => translateBlock('Hello'));
});

test('translateBlock: 429 (retry kapalı) → hata fırlatır', async () => {
  mockFetch({}, false, 429);
  const { translateBlock } = await import('./geminiTranslate');
  await assert.rejects(() => translateBlock('Hello', false));
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx tsx src/translation/geminiTranslate.test.ts`
Expected: FAIL — `Cannot find module './geminiTranslate'`.

- [ ] **Step 3: Minimal implementasyonu yaz**

`src/translation/geminiTranslate.ts`:
```ts
/**
 * Tek bir metin bloğunu Gemini 3.1 Flash Lite ile İngilizceden Türkçeye çevirir.
 * geminiService.ts'ten ayrıdır (o niyet/sohbet için). Sadece çeviri yapar.
 * 429 alırsa bir kez (5 sn sonra) yeniden dener — emniyet kemeri.
 */
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-flash-lite-latest';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/** PC pipeline (Python) ile BİREBİR aynı tutulmalı. */
export const TRANSLATE_PROMPT =
  'Bu İngilizce metni edebî, akıcı Türkçeye çevir. Paragraf yapısını ' +
  '(boş satırları) koru. Sadece çeviriyi yaz; açıklama, başlık veya not ekleme.';

export async function translateBlock(english: string, retryOn429 = true): Promise<string> {
  if (!english.trim()) return english;
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    throw new Error('Gemini anahtarı ayarlı değil');
  }

  const res = await fetchWithTimeout(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: TRANSLATE_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: english }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    }),
  }, 30000);

  if (!res.ok) {
    if (res.status === 429 && retryOn429) {
      await new Promise((r) => setTimeout(r, 5000));
      return translateBlock(english, false);
    }
    throw new Error(`Çeviri hatası: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Çeviri boş döndü');
  return String(text).trim();
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx tsx src/translation/geminiTranslate.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/translation/geminiTranslate.ts src/translation/geminiTranslate.test.ts
git commit -m "feat(translation): Gemini 3.1 Flash Lite blok çeviri çağrısı"
```

---

## Task 3: Kota bekçisi (`quotaGovernor.ts`)

**Files:**
- Create: `src/translation/quotaGovernor.ts`
- Test: `src/translation/quotaGovernor.test.ts`

- [ ] **Step 1: Testi yaz (başarısız)**

`src/translation/quotaGovernor.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor } from './quotaGovernor';

function fakeStore() {
  const m = new Map<string, string>();
  return {
    getItem: async (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: async (k: string, v: string) => { m.set(k, v); },
  };
}

test('acquire: ilk istek beklemez, ikinci RPM aralığı kadar uyur', async () => {
  let t = 0;
  const slept: number[] = [];
  const s = fakeStore();
  const g = createGovernor({
    now: () => t,
    sleep: async (ms) => { slept.push(ms); t += ms; },
    getItem: s.getItem, setItem: s.setItem,
    rpdBudget: 500, rpmSpacingMs: 4500,
  });
  assert.equal(await g.acquire(), 'ok');
  assert.equal(await g.acquire(), 'ok');
  assert.deepEqual(slept, [4500]);
});

test('isExhaustedToday: bütçe dolunca true, acquire exhausted döner', async () => {
  let t = 0;
  const s = fakeStore();
  const g = createGovernor({
    now: () => t, sleep: async () => {},
    getItem: s.getItem, setItem: s.setItem,
    rpdBudget: 2, rpmSpacingMs: 0,
  });
  assert.equal(await g.isExhaustedToday(), false);
  await g.record();
  await g.record();
  assert.equal(await g.isExhaustedToday(), true);
  assert.equal(await g.acquire(), 'exhausted');
});

test('record: yeni günde sayaç sıfırlanır', async () => {
  let t = 0;
  const s = fakeStore();
  const g = createGovernor({
    now: () => t, sleep: async () => {},
    getItem: s.getItem, setItem: s.setItem,
    rpdBudget: 2, rpmSpacingMs: 0,
  });
  await g.record();
  await g.record();
  assert.equal(await g.isExhaustedToday(), true);
  t += 24 * 60 * 60 * 1000; // ertesi gün
  assert.equal(await g.isExhaustedToday(), false);
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx tsx src/translation/quotaGovernor.test.ts`
Expected: FAIL — `Cannot find module './quotaGovernor'`.

- [ ] **Step 3: Minimal implementasyonu yaz**

`src/translation/quotaGovernor.ts`:
```ts
/**
 * Gemini 3.1 Flash Lite limit bekçisi: RPM (istekler arası aralık) + RPD
 * (günlük bütçe). Saf fabrika — saat/sleep/depolama enjekte edilir, böylece
 * test edilebilir ve RN importu içermez. Varsayılan singleton instances.ts'te.
 */
export const RPD_BUDGET = 500;
export const RPM_SPACING_MS = 4500; // 15 RPM → ~4 sn; güvenli pay ile 4.5 sn

const RPD_KEY = '@gemini_rpd';

export interface GovernorDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  rpdBudget: number;
  rpmSpacingMs: number;
}

export interface Governor {
  acquire: () => Promise<'ok' | 'exhausted'>;
  record: () => Promise<void>;
  isExhaustedToday: () => Promise<boolean>;
}

export function createGovernor(deps: GovernorDeps): Governor {
  let lastAt = -Infinity;

  function today(): string {
    return new Date(deps.now()).toISOString().slice(0, 10);
  }

  async function readRpd(): Promise<{ date: string; count: number }> {
    const raw = await deps.getItem(RPD_KEY);
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (p && p.date === today() && typeof p.count === 'number') return p;
      } catch {
        // bozuk → sıfırla
      }
    }
    return { date: today(), count: 0 };
  }

  async function isExhaustedToday(): Promise<boolean> {
    return (await readRpd()).count >= deps.rpdBudget;
  }

  async function acquire(): Promise<'ok' | 'exhausted'> {
    if (await isExhaustedToday()) return 'exhausted';
    const wait = deps.rpmSpacingMs - (deps.now() - lastAt);
    if (wait > 0) await deps.sleep(wait);
    lastAt = deps.now();
    return 'ok';
  }

  async function record(): Promise<void> {
    const cur = await readRpd();
    await deps.setItem(RPD_KEY, JSON.stringify({ date: cur.date, count: cur.count + 1 }));
  }

  return { acquire, record, isExhaustedToday };
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx tsx src/translation/quotaGovernor.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/translation/quotaGovernor.ts src/translation/quotaGovernor.test.ts
git commit -m "feat(translation): RPM+RPD kota bekçisi (quotaGovernor)"
```

---

## Task 4: Çeviri deposu (`translationStore.ts`)

**Files:**
- Create: `src/translation/translationStore.ts`
- Test: `src/translation/translationStore.test.ts`

- [ ] **Step 1: Testi yaz (başarısız)**

`src/translation/translationStore.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './translationStore';

function memFs() {
  const files = new Map<string, string>();
  return {
    readFile: async (n: string) => (files.has(n) ? files.get(n)! : null),
    writeFile: async (n: string, d: string) => { files.set(n, d); },
    files,
  };
}

test('saveBlock + getDone round-trip', async () => {
  const fs = memFs();
  const store = createStore(fs);
  await store.saveBlock('gutenberg:42', 0, 'Birinci', 3);
  await store.saveBlock('gutenberg:42', 1, 'İkinci', 3);
  assert.deepEqual(await store.getDone('gutenberg:42'), { 0: 'Birinci', 1: 'İkinci' });
});

test('get: totalBlocks korunur, eksik bloklar yok', async () => {
  const fs = memFs();
  const store = createStore(fs);
  await store.saveBlock('x:1', 2, 'C', 5);
  const d = await store.get('x:1');
  assert.equal(d.totalBlocks, 5);
  assert.deepEqual(d.done, { 2: 'C' });
});

test('bozuk JSON → temiz başlangıç', async () => {
  const fs = memFs();
  const store = createStore(fs);
  await fs.writeFile('gutenberg_42.json', '{bozuk');
  assert.deepEqual(await store.get('gutenberg:42'), { totalBlocks: 0, done: {} });
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx tsx src/translation/translationStore.test.ts`
Expected: FAIL — `Cannot find module './translationStore'`.

- [ ] **Step 3: Minimal implementasyonu yaz**

`src/translation/translationStore.ts`:
```ts
/**
 * Çevrilmiş kitap içeriğinin kalıcılığı. Saf fabrika — dosya okuma/yazma
 * enjekte edilir (RN importu yok). Dosya adı bookId'den türetilir; "translated/"
 * dizini ve gerçek expo-file-system bağlaması instances.ts'tedir.
 */
export interface StoreFs {
  readFile: (name: string) => Promise<string | null>; // yoksa null
  writeFile: (name: string, data: string) => Promise<void>;
}

export interface BookStoreData {
  totalBlocks: number;
  done: Record<number, string>;
}

export interface TranslationStore {
  get: (bookId: string) => Promise<BookStoreData>;
  saveBlock: (bookId: string, index: number, turkish: string, totalBlocks: number) => Promise<void>;
  getDone: (bookId: string) => Promise<Record<number, string>>;
}

function fileName(bookId: string): string {
  return bookId.replace(/[^a-z0-9]/gi, '_') + '.json';
}

export function createStore(fs: StoreFs): TranslationStore {
  async function get(bookId: string): Promise<BookStoreData> {
    const raw = await fs.readFile(fileName(bookId));
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          return { totalBlocks: p.totalBlocks ?? 0, done: p.done ?? {} };
        }
      } catch {
        // bozuk → temiz başlangıç
      }
    }
    return { totalBlocks: 0, done: {} };
  }

  async function saveBlock(bookId: string, index: number, turkish: string, totalBlocks: number): Promise<void> {
    const cur = await get(bookId);
    cur.done[index] = turkish;
    cur.totalBlocks = Math.max(cur.totalBlocks, totalBlocks);
    await fs.writeFile(fileName(bookId), JSON.stringify(cur));
  }

  async function getDone(bookId: string): Promise<Record<number, string>> {
    return (await get(bookId)).done;
  }

  return { get, saveBlock, getDone };
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx tsx src/translation/translationStore.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/translation/translationStore.ts src/translation/translationStore.test.ts
git commit -m "feat(translation): çevrilmiş içerik deposu (translationStore)"
```

---

## Task 5: Arka plan işi (`translationJob.ts`)

**Files:**
- Create: `src/translation/translationJob.ts`
- Test: `src/translation/translationJob.test.ts`

- [ ] **Step 1: Testi yaz (başarısız)**

`src/translation/translationJob.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJob } from './translationJob';
import { splitIntoBlocks } from './blocks';

// Her paragrafı ayrı blok yapan bölücü (target=1).
const split = (t: string) => splitIntoBlocks(t, 1);
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function memStore() {
  const done: Record<string, Record<number, string>> = {};
  return {
    get: async (id: string) => ({ totalBlocks: 0, done: done[id] ?? {} }),
    saveBlock: async (id: string, i: number, tr: string) => { (done[id] ??= {})[i] = tr; },
    getDone: async (id: string) => done[id] ?? {},
  };
}

function governor(okCount: number) {
  let n = 0;
  return {
    acquire: async () => (n++ < okCount ? 'ok' : 'exhausted') as 'ok' | 'exhausted',
    record: async () => {},
    isExhaustedToday: async () => n >= okCount,
  };
}

async function settle(job: { getState: () => { status: string } }) {
  for (let i = 0; i < 30 && job.getState().status === 'running'; i++) await flush();
}

test('blokları sırayla çevirir ve kaydeder → done', async () => {
  const store = memStore();
  const job = createJob({ translateBlock: async (s) => 'TR:' + s, governor: governor(99), store, splitIntoBlocks: split });
  job.start('b:1', 'A\n\nB\n\nC');
  await settle(job);
  assert.deepEqual(await store.getDone('b:1'), { 0: 'TR:A\n\n', 1: 'TR:B\n\n', 2: 'TR:C' });
  assert.equal(job.getState().status, 'done');
});

test('kota bitince paused-quota ve durur', async () => {
  const store = memStore();
  const job = createJob({ translateBlock: async (s) => 'TR:' + s, governor: governor(2), store, splitIntoBlocks: split });
  job.start('b:2', 'A\n\nB\n\nC');
  await settle(job);
  assert.equal(job.getState().status, 'paused-quota');
  assert.equal(Object.keys(await store.getDone('b:2')).length, 2);
});

test('yeniden başlatınca yalnız bitmemiş blokları çevirir', async () => {
  const store = memStore();
  let calls = 0;
  const mk = (ok: number) => createJob({
    translateBlock: async (s) => { calls++; return 'TR:' + s; },
    governor: governor(ok), store, splitIntoBlocks: split,
  });
  const j1 = mk(2);
  j1.start('b:3', 'A\n\nB\n\nC');
  await settle(j1);
  assert.equal(calls, 2);
  const j2 = mk(99);
  j2.start('b:3', 'A\n\nB\n\nC');
  await settle(j2);
  assert.equal(calls, 3); // yalnız kalan 1 blok
  assert.equal(Object.keys(await store.getDone('b:3')).length, 3);
});

test('subscribe her blokta tetiklenir', async () => {
  const store = memStore();
  let n = 0;
  const job = createJob({ translateBlock: async (s) => 'TR:' + s, governor: governor(99), store, splitIntoBlocks: split });
  const unsub = job.subscribe(() => { n++; });
  job.start('b:4', 'A\n\nB\n\nC');
  await settle(job);
  unsub();
  assert.ok(n >= 3);
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx tsx src/translation/translationJob.test.ts`
Expected: FAIL — `Cannot find module './translationJob'`.

- [ ] **Step 3: Minimal implementasyonu yaz**

`src/translation/translationJob.ts`:
```ts
/**
 * Arka plan çeviri koordinatörü (singleton fabrika). Kitabı bloklara böler,
 * bitmemişleri sırayla governor.acquire() ile kotaya uyarak çevirir, diske
 * kaydeder. Kota bitince 'paused-quota' olur ve durur. Aboneler her
 * ilerleme/durum değişiminde bilgilendirilir. RN importu yok.
 */
import type { Block } from './blocks';

export interface Governor {
  acquire: () => Promise<'ok' | 'exhausted'>;
  record: () => Promise<void>;
  isExhaustedToday: () => Promise<boolean>;
}

export interface TranslationStore {
  get: (bookId: string) => Promise<{ totalBlocks: number; done: Record<number, string> }>;
  saveBlock: (bookId: string, index: number, turkish: string, totalBlocks: number) => Promise<void>;
  getDone: (bookId: string) => Promise<Record<number, string>>;
}

export type JobStatus = 'idle' | 'running' | 'paused-quota' | 'done' | 'error';

export interface JobState {
  bookId: string | null;
  status: JobStatus;
  doneBlocks: number;
  totalBlocks: number;
}

export interface JobDeps {
  translateBlock: (s: string) => Promise<string>;
  governor: Governor;
  store: TranslationStore;
  splitIntoBlocks: (t: string, target?: number) => Block[];
}

export interface TranslationJob {
  start: (bookId: string, englishText: string) => void;
  stop: () => void;
  subscribe: (cb: (s: JobState) => void) => () => void;
  getState: () => JobState;
}

export function createJob(deps: JobDeps): TranslationJob {
  let state: JobState = { bookId: null, status: 'idle', doneBlocks: 0, totalBlocks: 0 };
  const subs = new Set<(s: JobState) => void>();
  let runToken = 0;

  function set(patch: Partial<JobState>): void {
    state = { ...state, ...patch };
    subs.forEach((cb) => cb(state));
  }

  async function run(bookId: string, blocks: Block[], token: number): Promise<void> {
    const existing = await deps.store.getDone(bookId);
    let doneCount = Object.keys(existing).filter((k) => existing[Number(k)] != null).length;
    set({ bookId, status: 'running', totalBlocks: blocks.length, doneBlocks: doneCount });

    for (let i = 0; i < blocks.length; i++) {
      if (token !== runToken) return; // durduruldu / yeni iş
      if (existing[i] != null) continue; // zaten çevrili
      const gate = await deps.governor.acquire();
      if (token !== runToken) return;
      if (gate === 'exhausted') { set({ status: 'paused-quota' }); return; }
      try {
        const tr = await deps.translateBlock(blocks[i].source);
        if (token !== runToken) return;
        await deps.store.saveBlock(bookId, i, tr, blocks.length);
        await deps.governor.record();
        existing[i] = tr;
        doneCount++;
        set({ doneBlocks: doneCount });
      } catch {
        set({ status: 'error' });
        return;
      }
    }
    set({ status: 'done' });
  }

  return {
    start(bookId, englishText) {
      if (state.bookId === bookId && state.status === 'running') return;
      runToken++;
      const token = runToken;
      run(bookId, deps.splitIntoBlocks(englishText), token);
    },
    stop() {
      runToken++;
    },
    subscribe(cb) {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
    getState() {
      return state;
    },
  };
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx tsx src/translation/translationJob.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/translation/translationJob.ts src/translation/translationJob.test.ts
git commit -m "feat(translation): arka plan çeviri koordinatörü (translationJob)"
```

---

## Task 6: RN bağlama (`instances.ts`)

**Files:**
- Create: `src/translation/instances.ts`

Bu dosya **test edilmez** (RN/Expo importları node:test'te çalışmaz); `npx tsc --noEmit` ile derleme doğrulanır.

- [ ] **Step 1: Implementasyonu yaz**

`src/translation/instances.ts`:
```ts
/**
 * Saf çeviri modüllerini RN/Expo ile bağlar ve uygulama genelinde tek
 * (singleton) governor / store / job örneği sunar. ReaderScreen bunları kullanır.
 * Bu dosya node:test ile test edilmez (RN importları içerir).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths, readAsStringAsync } from 'expo-file-system';
import { createGovernor, RPD_BUDGET, RPM_SPACING_MS } from './quotaGovernor';
import { createStore, type StoreFs } from './translationStore';
import { createJob } from './translationJob';
import { translateBlock } from './geminiTranslate';
import { splitIntoBlocks } from './blocks';

export const quotaGovernor = createGovernor({
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  rpdBudget: RPD_BUDGET,
  rpmSpacingMs: RPM_SPACING_MS,
});

function translatedDir(): Directory {
  return new Directory(Paths.document, 'translated');
}

const fs: StoreFs = {
  readFile: async (name) => {
    const file = new File(translatedDir(), name);
    if (!file.exists) return null;
    try {
      return await readAsStringAsync(file.uri);
    } catch {
      return null;
    }
  },
  writeFile: async (name, data) => {
    const dir = translatedDir();
    if (!dir.exists) dir.create();
    const file = new File(dir, name);
    if (!file.exists) file.create();
    file.write(data);
  },
};

export const translationStore = createStore(fs);

export const translationJob = createJob({
  translateBlock,
  governor: quotaGovernor,
  store: translationStore,
  splitIntoBlocks,
});
```

- [ ] **Step 2: Derlemeyi doğrula**

Run: `npx tsc --noEmit`
Expected: Hata yok. (Eğer `file.write`/`file.create`/`dir.create` imzaları bu Expo sürümünde farklıysa, `src/hooks/useOfflineBooks.ts`'teki kullanım kalıbına uydur — orada `dir.create()` ve `File` API'si zaten çalışıyor.)

- [ ] **Step 3: Commit**

```bash
git add src/translation/instances.ts
git commit -m "feat(translation): RN bağlama ve singleton örnekler (instances)"
```

---

## Task 7: Okuyucu — çeviri motorunu değiştir (`ReaderScreen.tsx`)

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

Canlı Google Translate kalkar; sayfalar diskteki bitmiş Türkçe bloklardan türetilir; okuma döngüsü hazır Türkçe sayfalardan okur. RN — `npx tsc --noEmit` + cihaz ile doğrulanır.

- [ ] **Step 1: Import'u değiştir**

`src/screens/ReaderScreen.tsx` satır 15'i sil:
```ts
import { translateToTurkish } from '../utils/translator';
```
Yerine ekle (satır 14 `findMainTextStart` importundan sonra):
```ts
import { translationJob, translationStore, quotaGovernor } from '../translation/instances';
```

- [ ] **Step 2: State'i değiştir**

Satır 40'ı sil:
```ts
  const [pageText, setPageText] = useState('');
```
Yerine ekle:
```ts
  const [translatedText, setTranslatedText] = useState('');
```

`pages` ref'ini ekle (satır 49 `const isPlayingRef = useRef(false);` sonrasına):
```ts
  const pagesRef = useRef<string[]>([]);
```

- [ ] **Step 3: Sayfa türetmeyi çevirili metne göre güncelle**

Satır 112-116'daki effect'i:
```ts
  useEffect(() => {
    if (!fullText) return;
    const body = includeFrontMatter ? fullText : fullText.slice(mainStart);
    setPages(splitIntoPages(body));
  }, [fullText, mainStart, includeFrontMatter]);
```
şununla değiştir:
```ts
  // needsTranslation: sayfalar diskteki çevrilmiş metinden türetilir (büyüyen,
  // kararlı liste). Aksi halde ham İngilizce/gömülü gövdeden.
  useEffect(() => {
    if (needsTranslation) {
      setPages(translatedText ? splitIntoPages(translatedText) : []);
      return;
    }
    if (!fullText) return;
    const body = includeFrontMatter ? fullText : fullText.slice(mainStart);
    setPages(splitIntoPages(body));
  }, [fullText, mainStart, includeFrontMatter, needsTranslation, translatedText]);

  // pages'i ref'te tut (okuma döngüsü closure tazeliği için).
  useEffect(() => { pagesRef.current = pages; }, [pages]);
```

- [ ] **Step 4: currentText'i sadeleştir, pageText kalıntısını kaldır**

Satır 118-119:
```ts
  const rawPage = pages[currentPage - 1] ?? '';
  const currentText = needsTranslation ? pageText : rawPage;
```
şununla değiştir:
```ts
  const currentText = pages[currentPage - 1] ?? '';
```

- [ ] **Step 5: Canlı çeviri effect'ini iş başlatma+abonelik ile değiştir**

Satır 144-158'deki Gutenberg çeviri effect'ini (`useEffect(() => { if (!needsTranslation) return; ... }, [rawPage, needsTranslation]);`) şununla değiştir:
```ts
  // Çeviri işi: Gutenberg kitabı için arka planda blok blok Türkçeye çevir.
  // Okuma diskteki bitmiş bloklardan gelir; canlı çeviri YOK.
  useEffect(() => {
    if (!needsTranslation || !fullText) return;
    const english = includeFrontMatter ? fullText : fullText.slice(mainStart);

    const refresh = async () => {
      const done = await translationStore.getDone(bookId);
      let t = '';
      let i = 0;
      while (done[i] != null) { t += done[i]; i++; } // bitmiş-önek (contiguous)
      setTranslatedText(t);
      const st = translationJob.getState();
      setTranslating(st.status === 'running' && i < st.totalBlocks);
    };

    translationJob.start(bookId, english);
    const unsub = translationJob.subscribe(() => { refresh(); });
    refresh(); // ilk açılışta diskte hazır çeviri varsa hemen göster
    return () => { unsub(); };
  }, [needsTranslation, fullText, mainStart, includeFrontMatter, bookId]);
```

- [ ] **Step 6: readFromCurrent'i ref-temelli, çevirisiz hale getir**

Satır 199-241'deki `readFromCurrent` callback'ini şununla değiştir:
```ts
  // Sürekli okuma: hazır Türkçe sayfalardan okur (canlı çeviri yok).
  // Başlangıç konumunu ref'lerden alır → pages/translatedText büyüse de stabil kalır.
  const readFromCurrent = useCallback(async () => {
    if (pagesRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsPlaying(true);

    let page = currentPageRef.current;
    let startSentence = currentSentenceRef.current;

    while (isPlayingRef.current && page <= pagesRef.current.length) {
      const sents = splitIntoSentences(pagesRef.current[page - 1] ?? '');
      for (let s = startSentence; s < sents.length; s++) {
        if (!isPlayingRef.current) break;
        setCurrentSentence(s);
        currentSentenceRef.current = s;
        saveProgress(bookId, page, s);
        await speakBook(sents[s], getRate());
      }
      if (!isPlayingRef.current) break;

      if (page < pagesRef.current.length) {
        page += 1;
        setCurrentPage(page);
        currentPageRef.current = page;
        setCurrentSentence(0);
        currentSentenceRef.current = 0;
        startSentence = 0;
        saveProgress(bookId, page, 0);
      } else {
        // Mevcut son sayfanın sonu. (Task 8 burada kota-farkında sınır ekler.)
        isPlayingRef.current = false;
        setIsPlaying(false);
        await announce.bookEnded();
        return;
      }
    }
  }, [bookId]);
```

- [ ] **Step 7: Derlemeyi doğrula**

Run: `npx tsc --noEmit`
Expected: Hata yok. (`pageText`, `rawPage`, `translateToTurkish` artık referanslanmamalı; kalmışsa temizle.)

- [ ] **Step 8: Cihazda doğrula**

Telefonda (global dil 'tr'): bir Gutenberg kitabı ara/aç → birkaç saniye içinde Türkçe sayfalar belirir, sesli okur. Çıkıp tekrar gir → diskten anında gelir, kaldığı yerden devam.

- [ ] **Step 9: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): canlı çeviri yerine blok temelli önbellekli Türkçe okuma"
```

---

## Task 8: Okuyucu — kota sınırı UX'i (`ReaderScreen.tsx`)

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

Çevrilmiş sayfaların sonuna gelince: daha blok yoksa kitap bitti; kota varsa "çevriliyor" deyip yeni blok gelince devam; kota bittiyse "yarın devam" deyip durur.

- [ ] **Step 1: Bekleme bayrağı ref'i ekle**

Task 7'de eklenen `pagesRef` satırının altına:
```ts
  const awaitingTranslationRef = useRef(false);
  const readFromCurrentRef = useRef<() => void>(() => {});
```

- [ ] **Step 2: readFromCurrent'in else-dalını kota-farkında yap**

Task 7'deki `readFromCurrent` içindeki `else { ... announce.bookEnded(); return; }` bloğunu şununla değiştir:
```ts
      } else {
        // Çevrilmiş sayfaların sonu.
        const st = translationJob.getState();
        const moreBlocks = needsTranslation && st.bookId === bookId && st.doneBlocks < st.totalBlocks;
        if (!moreBlocks) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          await announce.bookEnded();
          return;
        }
        if (await quotaGovernor.isExhaustedToday()) {
          isPlayingRef.current = false;
          setIsPlaying(false);
          await speak('Günlük çeviri sınırına ulaşıldı. Yarın kaldığım yerden devam ederim.');
          return;
        }
        // Kota var: sıradaki blok birazdan gelecek. Duraklat, yeni sayfa çıkınca
        // otomatik devam et (aşağıdaki effect tetikler).
        await speak('Çevriliyor, bir saniye.');
        awaitingTranslationRef.current = true;
        isPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }
```

Ayrıca `readFromCurrent`'in bağımlılık dizisini güncelle:
```ts
  }, [bookId, needsTranslation]);
```

- [ ] **Step 3: readFromCurrent ref'ini ve otomatik devam effect'ini ekle**

`readFromCurrent` tanımından sonra ekle:
```ts
  useEffect(() => { readFromCurrentRef.current = readFromCurrent; }, [readFromCurrent]);

  // Çeviri ilerleyip yeni sayfa çıkınca, kotadan ötürü beklerken bırakıldıysa
  // sonraki sayfadan otomatik devam et.
  useEffect(() => {
    if (awaitingTranslationRef.current && totalPages > currentPageRef.current) {
      awaitingTranslationRef.current = false;
      const next = currentPageRef.current + 1;
      setCurrentPage(next);
      currentPageRef.current = next;
      setCurrentSentence(0);
      currentSentenceRef.current = 0;
      readFromCurrentRef.current();
    }
  }, [totalPages]);
```

- [ ] **Step 4: Derlemeyi doğrula**

Run: `npx tsc --noEmit`
Expected: Hata yok.

- [ ] **Step 5: Cihazda doğrula (kota simülasyonu)**

Geçici olarak `src/translation/quotaGovernor.ts`'te `RPD_BUDGET = 3` yap, uygulamayı yükle, bir Gutenberg kitabı oku. 3 blok sonrası okuma sonuna gelince "günlük çeviri sınırına ulaşıldı, yarın devam" anonsu gelmeli ve durmalı. Doğruladıktan sonra `RPD_BUDGET = 500`'e geri al.

- [ ] **Step 6: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(reader): kota bitince 'yarın devam', kota varken otomatik bekle-devam"
```

---

## Task 9: Eski Google Translate yolunu kaldır + test script'ini güncelle

**Files:**
- Delete: `src/utils/translator.ts`, `src/utils/textChunk.ts`, `src/utils/textChunk.test.ts`
- Modify: `package.json:10`

- [ ] **Step 1: Hiçbir yerde kullanılmadığını doğrula**

Run: `npx tsx -e "0"` öncesi grep —
```bash
grep -rn "translator'\|translateToTurkish\|textChunk\|chunkText" src
```
Expected: Yalnızca silinecek dosyaların kendi içinde eşleşme (ReaderScreen Task 7'de temizlendi). Başka kullanım varsa önce onu gider.

- [ ] **Step 2: Dosyaları sil**

```bash
git rm src/utils/translator.ts src/utils/textChunk.ts src/utils/textChunk.test.ts
```

- [ ] **Step 3: package.json test script'ini güncelle**

`package.json` satır 10'daki `"test": "..."` değerini şununla değiştir (textChunk.test.ts çıkar, 5 yeni dosya eklenir):
```json
    "test": "tsx src/utils/frontMatter.test.ts && tsx src/sources/gutenbergText.test.ts && tsx src/utils/localIntent.test.ts && tsx src/utils/geminiService.test.ts && tsx src/books/index.test.ts && tsx src/utils/libraryFocus.test.ts && tsx src/translation/blocks.test.ts && tsx src/translation/geminiTranslate.test.ts && tsx src/translation/quotaGovernor.test.ts && tsx src/translation/translationStore.test.ts && tsx src/translation/translationJob.test.ts"
```

- [ ] **Step 4: Tüm testleri ve derlemeyi doğrula**

Run: `npm test`
Expected: Tüm test dosyaları PASS (yeni 5 + mevcutlar, textChunk hariç).

Run: `npx tsc --noEmit`
Expected: Hata yok (silinen modüllere dangling referans yok).

- [ ] **Step 5: Commit**

```bash
git add package.json src/utils/translator.ts src/utils/textChunk.ts src/utils/textChunk.test.ts
git commit -m "chore: canlı Google Translate yolunu kaldır (Gemini blok çeviriye geçildi)"
```

---

## Task 10: PC pipeline (`scripts/gutenberg_to_book.py`)

**Files:**
- Create: `scripts/gutenberg_to_book.py`

Curated kitapları PC'de bir kez Gemini ile çevirip gömülü `.ts` üretir. Otomatik test yok (projede pytest kurulu değil); elle çalıştırma ile doğrulanır. Blok kuralı ve çeviri promptu `blocks.ts` / `geminiTranslate.ts` ile birebir aynıdır.

- [ ] **Step 1: Script'i yaz**

`scripts/gutenberg_to_book.py`:
```python
"""
Gutenberg kitabı -> Gemini ile Türkçeye çevrilmiş gömülü kitap (.ts).

İngilizce düz metni indirir, boilerplate kırpar, blocks.ts ile AYNI kuralla
(~22000 karakter, paragraf sınırı) bloklara böler, her bloğu Gemini 3.1 Flash
Lite ile (geminiTranslate.ts ile AYNI prompt) çevirir ve src/books/<slug>.ts
üretir. İstekler arası 4.5 sn delay (429 yememek için).

Kullanim:
    set EXPO_PUBLIC_GEMINI_API_KEY=...   (Windows; veya export)
    python scripts/gutenberg_to_book.py <gutenberg_id> <slug> "<Baslik>" "<Yazar>"
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse

BOOKS_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "books")
API_KEY = os.environ.get("EXPO_PUBLIC_GEMINI_API_KEY", "")
MODEL = os.environ.get("EXPO_PUBLIC_GEMINI_MODEL", "gemini-flash-lite-latest")

# geminiTranslate.ts TRANSLATE_PROMPT ile BİREBİR AYNI.
TRANSLATE_PROMPT = (
    "Bu İngilizce metni edebî, akıcı Türkçeye çevir. Paragraf yapısını "
    "(boş satırları) koru. Sadece çeviriyi yaz; açıklama, başlık veya not ekleme."
)


def fetch_gutenberg(book_id):
    urls = [
        f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt",
        f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt",
    ]
    for u in urls:
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception:
            continue
    raise RuntimeError("Gutenberg metni indirilemedi: " + str(book_id))


def strip_boilerplate(text):
    text = text.replace("\r\n", "\n")
    start = re.search(r"\*\*\*\s*START OF TH(E|IS) PROJECT GUTENBERG.*?\*\*\*", text, re.I)
    if start:
        text = text[start.end():]
    end = re.search(r"\*\*\*\s*END OF TH(E|IS) PROJECT GUTENBERG", text, re.I)
    if end:
        text = text[:end.start()]
    return text.strip()


def split_into_blocks(text, target_chars=22000):
    """blocks.ts splitIntoBlocks ile aynı mantık."""
    if not text:
        return []
    cut_points = [m.end() for m in re.finditer(r"\n{2,}", text)]
    cut_points.append(len(text))
    blocks = []
    start = 0
    safe_cut = 0
    for cp in cut_points:
        if cp - start > target_chars and safe_cut > start:
            blocks.append(text[start:safe_cut])
            start = safe_cut
        safe_cut = cp
    if start < len(text):
        blocks.append(text[start:])
    return blocks


def translate(block):
    if not API_KEY:
        raise RuntimeError("EXPO_PUBLIC_GEMINI_API_KEY ayarlı değil")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}"
        f":generateContent?key={API_KEY}"
    )
    payload = {
        "system_instruction": {"parts": [{"text": TRANSLATE_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": block}]}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 8192},
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read().decode("utf-8"))
    return resp["candidates"][0]["content"]["parts"][0]["text"].strip()


def write_ts(slug, book_id, title, author, text):
    path = os.path.join(BOOKS_DIR, slug + ".ts")
    aliases = [title.lower()]
    body = (
        "import { BundledBook } from './types';\n\n"
        "const book: BundledBook = {\n"
        "  id: " + json.dumps(book_id, ensure_ascii=False) + ",\n"
        "  title: " + json.dumps(title, ensure_ascii=False) + ",\n"
        "  author: " + json.dumps(author, ensure_ascii=False) + ",\n"
        "  aliases: " + json.dumps(aliases, ensure_ascii=False) + ",\n"
        "  text: " + json.dumps(text, ensure_ascii=False) + ",\n"
        "};\n\n"
        "export default book;\n"
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    return path


def main():
    if len(sys.argv) < 5:
        print('Kullanim: python scripts/gutenberg_to_book.py <gutenberg_id> <slug> "<Baslik>" "<Yazar>"')
        sys.exit(1)
    gid, slug, title, author = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
    book_id = "bundled-" + slug

    raw = strip_boilerplate(fetch_gutenberg(gid))
    blocks = split_into_blocks(raw)
    print(f"{len(blocks)} blok çevriliyor (~{len(raw):,} karakter)...")

    translated = []
    for i, b in enumerate(blocks):
        translated.append(translate(b))
        print(f"  blok {i + 1}/{len(blocks)} bitti")
        if i < len(blocks) - 1:
            time.sleep(4.5)  # RPM koruması

    path = write_ts(slug, book_id, title, author, "".join(translated))
    print("OK:", os.path.basename(path))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Elle çalıştır ve doğrula**

```bash
python scripts/gutenberg_to_book.py 1342 pride-and-prejudice "Gurur ve Önyargı" "Jane Austen"
```
Expected: `src/books/pride-and-prejudice.ts` oluşur; `text` alanı akıcı Türkçe. (İsteğe bağlı: küçük bir kitapla test et; çevirinin uzunluğu/kalitesi gözle doğrulanır.)

- [ ] **Step 3: Üretilen kitabı kütüphaneye bağla (mevcut akış)**

`src/books/index.ts`'e import + `BOOKS` dizisine ekle (Atomik Alışkanlıklar'daki kalıbın aynısı). `npx tsc --noEmit` ile doğrula.

- [ ] **Step 4: Commit**

```bash
git add scripts/gutenberg_to_book.py
git commit -m "feat(scripts): Gutenberg→Gemini Türkçe gömülü kitap pipeline'ı"
```

---

## Plan Tamamlanma Kriteri

- `npm test` → tüm testler geçer (blocks, geminiTranslate, quotaGovernor, translationStore, translationJob + mevcutlar).
- `npx tsc --noEmit` → hata yok.
- Cihazda: Gutenberg kitabı Türkçe okunur (önbellekten, canlı çeviri yok); çık-gir kaldığı yerden; kota bitince "yarın devam".
- Google Translate yolu (`translator.ts`/`textChunk.ts`) tamamen kaldırılmış.
- PC pipeline ile en az bir curated kitap üretilebilir.
