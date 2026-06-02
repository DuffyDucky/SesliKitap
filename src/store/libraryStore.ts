/**
 * Kütüphaneye eklenen (gömülü olmayan) kitapların kalıcı listesi. Saf fabrika —
 * depolama (getItem/setItem) enjekte edilir, RN importu yoktur → node:test ile
 * test edilebilir. AsyncStorage'a bağlı varsayılan singleton libraryStoreInstance.ts'te.
 */
export const LIBRARY_KEY = '@seslikitap_library';

export interface LibraryEntry {
  id: string; // global id, örn. "gutenberg:2554"
  title: string; // Türkçe başlık
  author: string;
  addedAt: string; // ISO tarih
}

export interface LibraryStorage {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
}

export interface LibraryStore {
  getEntries: () => Promise<LibraryEntry[]>;
  upsertEntry: (entry: LibraryEntry) => Promise<void>;
  hasEntry: (id: string) => Promise<boolean>;
}

export function createLibraryStore(storage: LibraryStorage): LibraryStore {
  async function getEntries(): Promise<LibraryEntry[]> {
    const raw = await storage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return []; // bozuk → temiz başlangıç
    }
  }

  async function upsertEntry(entry: LibraryEntry): Promise<void> {
    const entries = await getEntries();
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx >= 0) entries[idx] = entry;
    else entries.push(entry);
    await storage.setItem(LIBRARY_KEY, JSON.stringify(entries));
  }

  async function hasEntry(id: string): Promise<boolean> {
    return (await getEntries()).some((e) => e.id === id);
  }

  return { getEntries, upsertEntry, hasEntry };
}
