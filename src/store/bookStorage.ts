import AsyncStorage from '@react-native-async-storage/async-storage';

const BOOKS_KEY = '@seslikitap_books';
const SPEED_KEY = '@seslikitap_speed';
const LANGUAGE_KEY = '@app_language';

export interface BookMetadata {
  id: string;
  title: string;
  author: string;
  source: string;
  sourceId: string | number;
  downloadedAt: string;
  localPath: string;
  totalPages: number;
  lastPage: number;
  bookmarks?: number[];
}

export async function saveBook(book: BookMetadata): Promise<void> {
  const books = await getBooks();
  const idx = books.findIndex((b) => b.id === book.id);
  if (idx >= 0) {
    books[idx] = book;
  } else {
    books.push(book);
  }
  await AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(books));
}

export async function getBooks(): Promise<BookMetadata[]> {
  const data = await AsyncStorage.getItem(BOOKS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    console.warn('bookStorage: bozuk veri temizlendi');
    await AsyncStorage.removeItem(BOOKS_KEY);
    return [];
  }
}

export async function getBook(id: string): Promise<BookMetadata | null> {
  const books = await getBooks();
  return books.find((b) => b.id === id) ?? null;
}

const pendingUpdates = new Map<string, ReturnType<typeof setTimeout>>();

export async function updateLastPage(id: string, page: number): Promise<void> {
  // Debounce: aynı kitap için 500ms içinde birden fazla güncelleme olursa sadece sonuncusunu yaz
  const existing = pendingUpdates.get(id);
  if (existing) clearTimeout(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      pendingUpdates.delete(id);
      const books = await getBooks();
      const book = books.find((b) => b.id === id);
      if (book) {
        book.lastPage = page;
        await AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(books));
      }
      resolve();
    }, 500);
    pendingUpdates.set(id, timer);
  });
}

// --- Okuma ilerlemesi (her kitap için sayfa + cümle) ---------------------
// BookMetadata yalnızca indirilmiş kitaplarda bulunur; gömülü (bundled:)
// kitaplarda kayıt olmadığı için ilerleme ayrı, kitap-bağımsız bir haritada
// tutulur. Böylece her kitap (gömülü dahil) kaldığı yerden devam eder.
const PROGRESS_KEY = '@seslikitap_progress';

export interface ReadingProgress {
  page: number;
  sentence: number;
}

export async function getProgress(id: string): Promise<ReadingProgress | null> {
  const data = await AsyncStorage.getItem(PROGRESS_KEY);
  if (!data) return null;
  try {
    const map = JSON.parse(data) as Record<string, ReadingProgress>;
    return map[id] ?? null;
  } catch {
    await AsyncStorage.removeItem(PROGRESS_KEY);
    return null;
  }
}

const pendingProgress = new Map<string, ReturnType<typeof setTimeout>>();

/** İlerlemeyi kaydeder (300ms debounce; cümle başına çağrılabilir). */
export async function saveProgress(
  id: string,
  page: number,
  sentence: number
): Promise<void> {
  const existing = pendingProgress.get(id);
  if (existing) clearTimeout(existing);

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      pendingProgress.delete(id);
      const data = await AsyncStorage.getItem(PROGRESS_KEY);
      let map: Record<string, ReadingProgress> = {};
      if (data) {
        try {
          map = JSON.parse(data);
        } catch {
          map = {};
        }
      }
      map[id] = { page, sentence };
      await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
      resolve();
    }, 300);
    pendingProgress.set(id, timer);
  });
}

export async function removeBook(id: string): Promise<void> {
  const books = await getBooks();
  await AsyncStorage.setItem(
    BOOKS_KEY,
    JSON.stringify(books.filter((b) => b.id !== id))
  );
}

export async function addBookmark(id: string, page: number): Promise<number[]> {
  const books = await getBooks();
  const book = books.find((b) => b.id === id);
  if (!book) return [];
  const marks = book.bookmarks ?? [];
  if (!marks.includes(page)) marks.push(page);
  book.bookmarks = marks;
  await AsyncStorage.setItem(BOOKS_KEY, JSON.stringify(books));
  return marks;
}

export async function getBookmarks(id: string): Promise<number[]> {
  const book = await getBook(id);
  return book?.bookmarks ?? [];
}

export async function saveSpeed(rate: number): Promise<void> {
  await AsyncStorage.setItem(SPEED_KEY, String(rate));
}

export async function loadSpeed(): Promise<number | null> {
  const val = await AsyncStorage.getItem(SPEED_KEY);
  if (!val) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

export type AppLanguage = 'en' | 'tr';

/** Global okuma dili. Kayıtlı değer yoksa varsayılan 'en' (İngilizce). */
export async function getLanguage(): Promise<AppLanguage> {
  const val = await AsyncStorage.getItem(LANGUAGE_KEY);
  return val === 'tr' ? 'tr' : 'en';
}

/** Global okuma dilini kalıcı olarak ayarlar. */
export async function setLanguage(lang: AppLanguage): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}
