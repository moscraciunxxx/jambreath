/** Cross-session weekly ledger in localStorage (ISO week keys). */

export type WeekBucket = {
  week: string;
  delayAvoidedMin: number;
  co2AvoidedG: number;
};

export type LedgerState = {
  session: { delayAvoidedMin: number; co2AvoidedG: number };
  week: WeekBucket;
};

const WEEK_KEY = 'jambreath-week-ledger';
const LEGACY_KEY = 'jambreath-ledger';

/** ISO week string YYYY-Www (UTC). */
export function isoWeekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function emptyWeek(week = isoWeekKey()): WeekBucket {
  return { week, delayAvoidedMin: 0, co2AvoidedG: 0 };
}

export function loadWeekLedger(storage: Storage = localStorage): WeekBucket {
  const current = isoWeekKey();
  try {
    const raw = storage.getItem(WEEK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WeekBucket;
      if (parsed.week === current) return parsed;
      return emptyWeek(current);
    }
    // migrate legacy session-only totals into this week once
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      const L = JSON.parse(legacy) as { delayAvoidedMin?: number; co2AvoidedG?: number };
      const migrated = {
        week: current,
        delayAvoidedMin: Number(L.delayAvoidedMin) || 0,
        co2AvoidedG: Number(L.co2AvoidedG) || 0,
      };
      storage.setItem(WEEK_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return emptyWeek(current);
}

export function saveWeekLedger(week: WeekBucket, storage: Storage = localStorage): void {
  storage.setItem(WEEK_KEY, JSON.stringify(week));
}

export function addAvoided(
  week: WeekBucket,
  session: { delayAvoidedMin: number; co2AvoidedG: number },
  delayMin: number,
  co2G: number,
): { week: WeekBucket; session: { delayAvoidedMin: number; co2AvoidedG: number } } {
  const current = isoWeekKey();
  const base = week.week === current ? week : emptyWeek(current);
  const nextWeek = {
    week: current,
    delayAvoidedMin: base.delayAvoidedMin + delayMin,
    co2AvoidedG: base.co2AvoidedG + co2G,
  };
  const nextSession = {
    delayAvoidedMin: session.delayAvoidedMin + delayMin,
    co2AvoidedG: session.co2AvoidedG + co2G,
  };
  return { week: nextWeek, session: nextSession };
}
