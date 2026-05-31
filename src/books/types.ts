/** Uygulamaya gömülü tek bir kitabın şekli. Saf veri — hiçbir react-native importu yok. */
export interface BundledBook {
  id: string;            // benzersiz slug, örn. "omer-seyfettin-forsa"
  title: string;
  author: string;
  aliases: string[];     // sesli komutla eşleşmeyi kolaylaştırmak için
  text: string;          // tam düz metin
}
