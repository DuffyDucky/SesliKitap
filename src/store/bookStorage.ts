import AsyncStorage from '@react-native-async-storage/async-storage';

const BOOKS_KEY = '@seslikitap_books';
const SPEED_KEY = '@seslikitap_speed';

export interface BookMetadata {
  id: string;
  title: string;
  author: string;
  source: 'gutenberg' | 'wikisource';
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
