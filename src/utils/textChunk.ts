/**
 * Uzun metni, çeviri servisinin URL/uzunluk sınırına takılmamak için
 * cümle/satır/boşluk sınırlarından parçalara böler. Parçalar birleştirildiğinde
 * orijinal metne birebir eşittir (karakter kaybı yok). Saf fonksiyon.
 */
export function chunkText(text: string, maxLen = 1500): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let rem = text;
  while (rem.length > maxLen) {
    let cut = rem.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.5) cut = rem.lastIndexOf('.', maxLen);
    if (cut < maxLen * 0.5) cut = rem.lastIndexOf(' ', maxLen);
    if (cut < maxLen * 0.5) cut = maxLen - 1; // sınır bulunamadı: zorla kes
    cut = cut + 1; // sınır karakterini bu parçaya dahil et
    chunks.push(rem.slice(0, cut));
    rem = rem.slice(cut);
  }
  if (rem.length > 0) chunks.push(rem);
  return chunks;
}
