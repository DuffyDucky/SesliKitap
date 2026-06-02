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
