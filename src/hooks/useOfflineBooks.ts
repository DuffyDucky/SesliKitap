import { useState, useCallback } from 'react';
import { Directory, File, Paths, downloadAsync, readAsStringAsync } from 'expo-file-system';
import { BookMetadata, getBooks, saveBook, removeBook } from '../store/bookStorage';
import { announce } from '../utils/tts';

const CHARS_PER_PAGE = 2000;

function getBooksDir(): Directory {
  return new Directory(Paths.document, 'books');
}

function getBookFile(id: string): File {
  return new File(getBooksDir(), id + '.txt');
}

async function ensureBooksDir(): Promise<void> {
  const dir = getBooksDir();
  if (!dir.exists) {
    dir.create();
  }
}

export function splitIntoPages(text: string): string[] {
  const pages: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= CHARS_PER_PAGE) {
      pages.push(remaining);
      break;
    }

    let cutAt = CHARS_PER_PAGE;
    // Paragraf sınırı ara
    const paraBreak = remaining.lastIndexOf('\n\n', cutAt);
    if (paraBreak > cutAt * 0.5) {
      cutAt = paraBreak + 2;
    } else {
      // Cümle sonu ara
      const sentenceEnd = remaining.slice(0, cutAt).search(/[.!?…]\s+(?=\S)[^]*$/);
      if (sentenceEnd > cutAt * 0.5) {
        cutAt = sentenceEnd + 1;
      } else {
        // Kelime sınırı ara
        const lastSpace = remaining.lastIndexOf(' ', cutAt);
        if (lastSpace > cutAt * 0.5) {
          cutAt = lastSpace + 1;
        }
      }
    }

    pages.push(remaining.slice(0, cutAt).trimEnd());
    remaining = remaining.slice(cutAt).trimStart();
  }

  return pages.length > 0 ? pages : [''];
}

// Sayfa cache — aynı kitap tekrar tekrar okunduğunda dosyayı tekrar bölmemek için
const MAX_CACHED_BOOKS = 3;
const pageCache = new Map<string, string[]>();

function pageCacheSet(id: string, pages: string[]): void {
  // LRU: en eski girişi sil
  if (pageCache.size >= MAX_CACHED_BOOKS && !pageCache.has(id)) {
    const oldestKey = pageCache.keys().next().value;
    if (oldestKey !== undefined) pageCache.delete(oldestKey);
  }
  // Mevcut girişi sil ve sona ekle (LRU sırasını güncelle)
  pageCache.delete(id);
  pageCache.set(id, pages);
}

interface UseOfflineBooksResult {
  books: BookMetadata[];
  downloading: boolean;
  loadBooks: () => Promise<void>;
  downloadBook: (params: {
    id: string;
    title: string;
    author: string;
    source: 'gutenberg' | 'wikisource';
    sourceId: string | number;
    textUrl: string;
  }) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  readPage: (id: string, page: number) => Promise<string | null>;
  getTotalPages: (id: string) => Promise<number>;
}

export function useOfflineBooks(): UseOfflineBooksResult {
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [downloading, setDownloading] = useState(false);

  const loadBooks = useCallback(async () => {
    const stored = await getBooks();
    setBooks(stored);
  }, []);

  const downloadBook = useCallback(
    async ({
      id,
      title,
      author,
      source,
      sourceId,
      textUrl,
    }: {
      id: string;
      title: string;
      author: string;
      source: 'gutenberg' | 'wikisource';
      sourceId: string | number;
      textUrl: string;
    }) => {
      setDownloading(true);
      await announce.downloading(title);
      try {
        await ensureBooksDir();
        const bookFile = getBookFile(id);
        await downloadAsync(textUrl, bookFile.uri);
        const content = await readAsStringAsync(bookFile.uri);
        const pages = splitIntoPages(content);
        const metadata: BookMetadata = {
          id,
          title,
          author,
          source,
          sourceId,
          downloadedAt: new Date().toISOString(),
          localPath: bookFile.uri,
          totalPages: pages.length,
          lastPage: 1,
        };
        await saveBook(metadata);
        setBooks((prev) => {
          const idx = prev.findIndex((b) => b.id === id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = metadata;
            return updated;
          }
          return [...prev, metadata];
        });
        await announce.downloadComplete();
      } catch {
        await announce.apiError();
      } finally {
        setDownloading(false);
      }
    },
    []
  );

  const deleteBook = useCallback(async (id: string) => {
    const bookFile = getBookFile(id);
    if (bookFile.exists) {
      bookFile.delete();
    }
    pageCache.delete(id);
    await removeBook(id);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const getCachedPages = useCallback(async (id: string): Promise<string[] | null> => {
    if (pageCache.has(id)) {
      // LRU: erişilen girişi sona taşı
      const cached = pageCache.get(id)!;
      pageCache.delete(id);
      pageCache.set(id, cached);
      return cached;
    }
    const bookFile = getBookFile(id);
    if (!bookFile.exists) return null;
    const content = await readAsStringAsync(bookFile.uri);
    const pages = splitIntoPages(content);
    pageCacheSet(id, pages);
    return pages;
  }, []);

  const readPage = useCallback(async (id: string, page: number): Promise<string | null> => {
    const pages = await getCachedPages(id);
    if (!pages) return null;
    const idx = Math.max(0, Math.min(page - 1, pages.length - 1));
    return pages[idx] ?? null;
  }, [getCachedPages]);

  const getTotalPages = useCallback(async (id: string): Promise<number> => {
    const pages = await getCachedPages(id);
    return pages ? pages.length : 0;
  }, [getCachedPages]);

  return { books, downloading, loadBooks, downloadBook, deleteBook, readPage, getTotalPages };
}
