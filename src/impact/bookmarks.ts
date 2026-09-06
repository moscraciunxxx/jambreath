/** Saved corridors (localStorage) + built-in presets. */

export type Corridor = {
  id: string;
  name: string;
  origin: string;
  dest: string;
  builtin?: boolean;
};

export const BUILTIN_PRESETS: Corridor[] = [
  {
    id: 'la-school',
    name: 'LA school-run · Downtown → Echo Park',
    origin: 'Downtown Los Angeles, CA',
    dest: 'Echo Park, Los Angeles, CA',
    builtin: true,
  },
  {
    id: 'la-school-reverse',
    name: 'LA school-run · Echo Park → Downtown',
    origin: 'Echo Park, Los Angeles, CA',
    dest: 'Downtown Los Angeles, CA',
    builtin: true,
  },
  {
    id: 'sf',
    name: 'SF Financial → Mission',
    origin: 'Financial District, San Francisco, CA',
    dest: 'Mission District, San Francisco, CA',
    builtin: true,
  },
  {
    id: 'seattle',
    name: 'Seattle downtown → U-District',
    origin: 'Downtown Seattle, WA',
    dest: 'University District, Seattle, WA',
    builtin: true,
  },
];

const STORE_KEY = 'jambreath-corridors';

export function loadSavedCorridors(storage: Storage = localStorage): Corridor[] {
  try {
    const raw = storage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Corridor[];
    return Array.isArray(parsed) ? parsed.filter((c) => c.id && c.origin && c.dest) : [];
  } catch {
    return [];
  }
}

export function saveSavedCorridors(list: Corridor[], storage: Storage = localStorage): void {
  const userOnly = list.filter((c) => !c.builtin);
  storage.setItem(STORE_KEY, JSON.stringify(userOnly));
}

export function allCorridors(storage: Storage = localStorage): Corridor[] {
  return [...BUILTIN_PRESETS, ...loadSavedCorridors(storage)];
}

export function addCorridor(
  name: string,
  origin: string,
  dest: string,
  storage: Storage = localStorage,
): Corridor[] {
  const saved = loadSavedCorridors(storage);
  const id = `user-${Date.now().toString(36)}`;
  const next = [...saved, { id, name: name.trim() || `${origin} → ${dest}`, origin, dest }];
  saveSavedCorridors(next, storage);
  return next;
}

export function removeCorridor(id: string, storage: Storage = localStorage): Corridor[] {
  const next = loadSavedCorridors(storage).filter((c) => c.id !== id);
  saveSavedCorridors(next, storage);
  return next;
}
