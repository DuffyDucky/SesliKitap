/**
 * Kitap kaynakları için ortak arayüz.
 * Yeni bir kaynak eklemek için: bu arayüzü implemente et, sources/index.ts'te kaydet.
 */

export interface BookSearchResult {
  id: string;            // "source:uniqueId" formatında global ID
  title: string;
  author: string;
  source: string;        // kaynak adı (wikisource, bundled, vb.)
  sourceId: string;      // kaynağa özgü ID (örn. Wikisource sayfa başlığı)
}

export interface BookSource {
  name: string;
  /** Başlığa göre arama. Eşleşme yoksa boş dizi. */
  search(query: string): Promise<BookSearchResult[]>;
  /** Kitabın tam metnini Türkçe düz metin olarak getirir. */
  fetchText(sourceId: string): Promise<string>;
}
