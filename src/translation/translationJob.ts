/**
 * Arka plan çeviri koordinatörü (singleton fabrika). Kitabı bloklara böler,
 * bitmemişleri sırayla governor.acquire() ile kotaya uyarak çevirir, diske
 * kaydeder. Kota bitince 'paused-quota' olur ve durur. Aboneler her
 * ilerleme/durum değişiminde bilgilendirilir. RN importu yok.
 */
import type { Block } from './blocks';

export interface Governor {
  acquire: () => Promise<'ok' | 'exhausted'>;
  record: () => Promise<void>;
  isExhaustedToday: () => Promise<boolean>;
}

export interface TranslationStore {
  get: (bookId: string) => Promise<{ totalBlocks: number; done: Record<number, string> }>;
  saveBlock: (bookId: string, index: number, turkish: string, totalBlocks: number) => Promise<void>;
  getDone: (bookId: string) => Promise<Record<number, string>>;
}

export type JobStatus = 'idle' | 'running' | 'paused-quota' | 'done' | 'error';

export interface JobState {
  bookId: string | null;
  status: JobStatus;
  doneBlocks: number;
  totalBlocks: number;
}

export interface JobDeps {
  translateBlock: (s: string) => Promise<string>;
  governor: Governor;
  store: TranslationStore;
  splitIntoBlocks: (t: string, target?: number) => Block[];
}

export interface TranslationJob {
  start: (bookId: string, englishText: string) => void;
  stop: () => void;
  subscribe: (cb: (s: JobState) => void) => () => void;
  getState: () => JobState;
}

export function createJob(deps: JobDeps): TranslationJob {
  let state: JobState = { bookId: null, status: 'idle', doneBlocks: 0, totalBlocks: 0 };
  const subs = new Set<(s: JobState) => void>();
  let runToken = 0;

  function set(patch: Partial<JobState>): void {
    state = { ...state, ...patch };
    subs.forEach((cb) => cb(state));
  }

  async function run(bookId: string, blocks: Block[], token: number): Promise<void> {
    // Durumu ilk await'ten ÖNCE 'running' yap: start() bunu senkron çağırdığı
    // için aboneler/izleyiciler işin başladığını hemen görür.
    set({ bookId, status: 'running', totalBlocks: blocks.length, doneBlocks: 0 });
    const existing = await deps.store.getDone(bookId);
    if (token !== runToken) return;
    let doneCount = Object.keys(existing).filter((k) => existing[Number(k)] != null).length;
    set({ doneBlocks: doneCount });

    for (let i = 0; i < blocks.length; i++) {
      if (token !== runToken) return; // durduruldu / yeni iş
      if (existing[i] != null) continue; // zaten çevrili
      const gate = await deps.governor.acquire();
      if (token !== runToken) return;
      if (gate === 'exhausted') { set({ status: 'paused-quota' }); return; }
      try {
        const tr = await deps.translateBlock(blocks[i].source);
        if (token !== runToken) return;
        await deps.store.saveBlock(bookId, i, tr, blocks.length);
        await deps.governor.record();
        existing[i] = tr;
        doneCount++;
        set({ doneBlocks: doneCount });
      } catch (e) {
        // Kota (429) → duraklat, yarın Gemini ile yeniden dene. Diğer her şey
        // resilient çeviri tarafından yutulur; buraya düşerse gerçek hatadır.
        if ((e as any)?.quota) set({ status: 'paused-quota' });
        else set({ status: 'error' });
        return;
      }
    }
    set({ status: 'done' });
  }

  return {
    start(bookId, englishText) {
      if (state.bookId === bookId && state.status === 'running') return;
      runToken++;
      const token = runToken;
      run(bookId, deps.splitIntoBlocks(englishText), token);
    },
    stop() {
      runToken++;
    },
    subscribe(cb) {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
    getState() {
      return state;
    },
  };
}
