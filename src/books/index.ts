import type { BundledBook } from './types';
import istiklalMarsi from './istiklal-marsi';
import nasreddinHoca from './nasreddin-hoca';
import forsa from './forsa';

/**
 * Uygulamaya gömülü tüm kitaplar. Yeni kitap eklemek için:
 * 1) src/books/<slug>.ts dosyası oluştur (default export BundledBook),
 * 2) buraya import et ve aşağıdaki diziye ekle.
 */
export const BOOKS: BundledBook[] = [istiklalMarsi, nasreddinHoca, forsa];

export type { BundledBook };
