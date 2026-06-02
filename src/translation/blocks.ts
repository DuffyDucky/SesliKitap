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
