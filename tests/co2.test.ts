import { describe, expect, it } from 'vitest';
import { delayMinutes, idleCo2Grams, co2RangeGrams, CO2_FACTORS } from '../src/impact/co2';
import { fixtureResult } from '../src/tomtom/fixture';
import { aqiAdvice, aqiCategory } from '../src/impact/aqi';
import { peakHourEstimate, LOW_DELAY_THRESHOLD_MIN } from '../src/impact/rushHour';
import { healthierMoves } from '../src/impact/moves';
import { isoWeekKey, emptyWeek, addAvoided } from '../src/impact/ledger';
import { BUILTIN_PRESETS, addCorridor, loadSavedCorridors, removeCorridor } from '../src/impact/bookmarks';
import { corridorMapSvg } from '../src/map/corridorSvg';
import { buildReceiptPayload } from '../src/receipt/export';

describe('impact math', () => {
  it('computes delay minutes from travel vs free-flow', () => {
    expect(delayMinutes(600, 480)).toBeCloseTo(2);
    expect(delayMinutes(400, 480)).toBe(0);
  });
  it('idle CO2 is non-negative and scaled by factor', () => {
    expect(idleCo2Grams(0)).toBe(0);
    expect(idleCo2Grams(10)).toBe(200);
    expect(idleCo2Grams(10, 'low')).toBe(100);
    expect(idleCo2Grams(10, 'high')).toBe(400);
    expect(CO2_FACTORS.mid).toBe(20);
  });
  it('co2 range spans 10-40 g/min', () => {
    const r = co2RangeGrams(5);
    expect(r.low).toBe(50);
    expect(r.mid).toBe(100);
    expect(r.high).toBe(200);
  });
  it('fixture has jammy segments, impact, and route points', () => {
    const f = fixtureResult();
    expect(f.mode).toBe('fixture');
    expect(f.jammyCount).toBeGreaterThan(0);
    expect(f.idleCo2G).toBeGreaterThan(0);
    expect(f.routePoints.length).toBeGreaterThanOrEqual(2);
  });
});

describe('aqi lens', () => {
  it('maps US AQI bands', () => {
    expect(aqiCategory(30)).toBe('Good');
    expect(aqiCategory(64)).toBe('Moderate');
    expect(aqiCategory(120)).toBe('Unhealthy for Sensitive Groups');
    expect(aqiAdvice(64).sensitive.toLowerCase()).toContain('asthma');
  });
});

describe('rush hour', () => {
  it('keeps live delay when rush off', () => {
    const p = peakHourEstimate(3, false);
    expect(p.isEstimate).toBe(false);
    expect(p.displayDelayMin).toBe(3);
  });
  it('estimates peak when live delay is low and rush on', () => {
    const p = peakHourEstimate(2, true);
    expect(p.isEstimate).toBe(true);
    expect(p.displayDelayMin).toBeGreaterThan(LOW_DELAY_THRESHOLD_MIN);
    expect(p.label.toLowerCase()).toContain('estimate');
  });
  it('does not fake estimate when already peak-like', () => {
    const p = peakHourEstimate(14, true);
    expect(p.isEstimate).toBe(false);
    expect(p.displayDelayMin).toBe(14);
  });
});

describe('healthier moves', () => {
  it('offers leave-later bike transit and optional alt', () => {
    const moves = healthierMoves({
      delayMin: 14,
      travelTimeSeconds: 42 * 60,
      lengthMeters: 9200,
      alternate: { travelTimeSeconds: 34 * 60, trafficDelaySeconds: 4 * 60, note: 'alt' },
    });
    const kinds = moves.map((m) => m.kind);
    expect(kinds).toContain('alt-route');
    expect(kinds).toContain('leave-later');
    expect(kinds).toContain('bike');
    expect(kinds).toContain('transit');
    expect(moves.every((m) => m.minutesEstimate > 0)).toBe(true);
  });
});

describe('ledger', () => {
  it('iso week key looks like YYYY-Www', () => {
    expect(isoWeekKey(new Date('2026-09-05T12:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });
  it('addAvoided accumulates session and week', () => {
    const week = emptyWeek('2026-W36');
    const session = { delayAvoidedMin: 1, co2AvoidedG: 20 };
    // force same week by using current iso key
    const cur = isoWeekKey();
    const base = emptyWeek(cur);
    const next = addAvoided(base, session, 5, 100);
    expect(next.week.delayAvoidedMin).toBe(5);
    expect(next.session.co2AvoidedG).toBe(120);
    expect(week.week).toBe('2026-W36');
  });
});

describe('bookmarks', () => {
  it('has school-run builtins', () => {
    expect(BUILTIN_PRESETS.some((p) => /school/i.test(p.name))).toBe(true);
  });
  it('saves and removes user corridors in memory storage', () => {
    const mem: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => (k in mem ? mem[k] : null),
      setItem: (k: string, v: string) => {
        mem[k] = v;
      },
      removeItem: (k: string) => {
        delete mem[k];
      },
      clear: () => {
        Object.keys(mem).forEach((k) => delete mem[k]);
      },
      key: () => null,
      length: 0,
    } as Storage;
    addCorridor('Test run', 'A', 'B', storage);
    expect(loadSavedCorridors(storage)).toHaveLength(1);
    const id = loadSavedCorridors(storage)[0].id;
    removeCorridor(id, storage);
    expect(loadSavedCorridors(storage)).toHaveLength(0);
  });
});

describe('map + receipt helpers', () => {
  it('renders svg with jammy marker title', () => {
    const f = fixtureResult();
    const svg = corridorMapSvg(f.routePoints, f.flowSamples, f.origin, f.destination);
    expect(svg).toContain('<svg');
    expect(svg).toContain('polyline');
    expect(svg.toLowerCase()).toContain('jammy');
  });
  it('builds receipt payload', () => {
    const f = fixtureResult();
    const payload = buildReceiptPayload(f, {
      rushHourMode: false,
      displayDelayMin: f.delayMin,
      delayIsEstimate: false,
      idleCo2G: f.idleCo2G,
      co2Factor: 'mid',
    });
    expect(payload.app).toBe('JamBreath');
    expect(payload.mode).toBe('fixture');
    expect(payload.timestamp).toBeTruthy();
  });
});
