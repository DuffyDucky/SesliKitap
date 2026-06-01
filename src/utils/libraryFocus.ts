/**
 * Kütüphane keşfinde odak adım mantığı (saf, React Native'den bağımsız).
 * Görme engelli kullanıcı kaydırarak gezerken odağı bir kitap ileri/geri taşır.
 * Liste sınırında kalır (clamp) ve sınıra çarpıldığını atBoundary ile bildirir;
 * çağıran ekran buna göre sınır uyarısı seslendirir.
 */
export type FocusStep = { index: number; atBoundary: 'start' | 'end' | null };

/**
 * @param current Mevcut odak indeksi (0 tabanlı)
 * @param dir +1 sonraki kitap, -1 önceki kitap
 * @param count Kütüphanedeki kitap sayısı
 */
export function stepFocus(current: number, dir: 1 | -1, count: number): FocusStep {
  if (count <= 0) return { index: 0, atBoundary: null };
  if (dir === 1) {
    if (current >= count - 1) return { index: current, atBoundary: 'end' };
    return { index: current + 1, atBoundary: null };
  }
  if (current <= 0) return { index: current, atBoundary: 'start' };
  return { index: current - 1, atBoundary: null };
}
