/**
 * Dayanıklı blok çevirisi: önce Gemini, içerik reddi/boş/zaman aşımında Google
 * Translate fallback, o da olmazsa yer tutucu. Kota (429) hatasını AYIRIR —
 * onu yeniden fırlatır ki iş 'paused-quota' olup yarın Gemini ile yeniden
 * denesin (GT'ye düşüp düşük kaliteyi kalıcı kaydetmesin). Saf fabrika.
 */
export const PLACEHOLDER = '[Bu bölüm çevrilemedi.]';

/** Gemini günlük/dakikalık kota (429) hatası — fallback YOK, iş duraklatılır. */
export class QuotaError extends Error {
  readonly quota = true;
  constructor(message = 'Gemini kota sınırı (429)') {
    super(message);
    this.name = 'QuotaError';
  }
}

export interface ResilientDeps {
  gemini: (source: string) => Promise<string>;
  google: (source: string) => Promise<string>;
}

export function createResilientTranslate(deps: ResilientDeps): (source: string) => Promise<string> {
  return async (source: string): Promise<string> => {
    try {
      return await deps.gemini(source);
    } catch (e) {
      if (e instanceof QuotaError || (e as any)?.quota) throw e; // kota → iş duraklasın
      // İçerik reddi / boş / zaman aşımı → Google Translate fallback.
      try {
        return await deps.google(source);
      } catch {
        return PLACEHOLDER;
      }
    }
  };
}
