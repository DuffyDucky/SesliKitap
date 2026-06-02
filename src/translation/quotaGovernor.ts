/**
 * Gemini 3.1 Flash Lite limit bekçisi: RPM (istekler arası aralık) + RPD
 * (günlük bütçe). Saf fabrika — saat/sleep/depolama enjekte edilir, böylece
 * test edilebilir ve RN importu içermez. Varsayılan singleton instances.ts'te.
 */
export const RPD_BUDGET = 500;
export const RPM_SPACING_MS = 4500; // 15 RPM → ~4 sn; güvenli pay ile 4.5 sn

const RPD_KEY = '@gemini_rpd';

export interface GovernorDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  rpdBudget: number;
  rpmSpacingMs: number;
}

export interface Governor {
  acquire: () => Promise<'ok' | 'exhausted'>;
  record: () => Promise<void>;
  isExhaustedToday: () => Promise<boolean>;
}

export function createGovernor(deps: GovernorDeps): Governor {
  let lastAt = -Infinity;

  function today(): string {
    return new Date(deps.now()).toISOString().slice(0, 10);
  }

  async function readRpd(): Promise<{ date: string; count: number }> {
    const raw = await deps.getItem(RPD_KEY);
    if (raw) {
      try {
        const p = JSON.parse(raw);
        if (p && p.date === today() && typeof p.count === 'number') return p;
      } catch {
        // bozuk → sıfırla
      }
    }
    return { date: today(), count: 0 };
  }

  async function isExhaustedToday(): Promise<boolean> {
    return (await readRpd()).count >= deps.rpdBudget;
  }

  async function acquire(): Promise<'ok' | 'exhausted'> {
    if (await isExhaustedToday()) return 'exhausted';
    const wait = deps.rpmSpacingMs - (deps.now() - lastAt);
    if (wait > 0) await deps.sleep(wait);
    lastAt = deps.now();
    return 'ok';
  }

  async function record(): Promise<void> {
    const cur = await readRpd();
    await deps.setItem(RPD_KEY, JSON.stringify({ date: cur.date, count: cur.count + 1 }));
  }

  return { acquire, record, isExhaustedToday };
}
