/**
 * Kitap metninde "asıl metnin" (kapak/önsöz/eser listesi sonrası) başladığı
 * karakter konumunu tahmin eder. OCR metni için sezgiseldir; bulamazsa 0 döner.
 */

/** Satırı sade ASCII'ye indirir (bölüm işareti eşleştirmesi için). */
function normLine(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/i̇/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c')
    .replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')
    .trim();
}

// "birinci bolum/kisim", "1. bolum", "i. kisim", "bolum 1", "kisim bir" vb.
const MARKER_RE =
  /^(birinci\s+(bolum|kisim)|(1|i)\s*[.\-—]?\s*(bolum|kisim)|(bolum|kisim)\s+(1|i|bir))\b/;

export function findMainTextStart(text: string): number {
  if (!text || text.length < 200) return 0;
  const limit = text.length * 0.5;

  // 1) Bölüm işareti araması (satır bazlı, orijinal offset korunur).
  {
    const lines = text.split('\n');
    let offset = 0;
    for (const line of lines) {
      if (offset > 30 && offset <= limit && MARKER_RE.test(normLine(line))) {
        return offset;
      }
      offset += line.length + 1; // +1: '\n'
    }
  }

  // 2) Fallback: ilk "asıl düzyazı paragrafı".
  {
    let cursor = 0;
    for (const para of text.split(/\n\s*\n/)) {
      const start = text.indexOf(para, cursor);
      if (start < 0) break;
      cursor = start + para.length;
      const sentences = (para.match(/[.!?]/g) || []).length;
      const hasLower = /[a-zçğıöşü]/.test(para);
      if (para.trim().length > 250 && sentences >= 2 && hasLower) {
        return start > limit ? 0 : start;
      }
    }
  }

  return 0;
}
