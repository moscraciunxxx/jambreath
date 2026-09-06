import { describe, expect, it } from 'vitest';
import { delayMinutes, idleCo2Grams } from '../src/impact/co2';
import { fixtureResult } from '../src/tomtom/fixture';

describe('impact math', () => {
  it('computes delay minutes from travel vs free-flow', () => {
    expect(delayMinutes(600, 480)).toBeCloseTo(2);
    expect(delayMinutes(400, 480)).toBe(0);
  });
  it('idle CO2 is non-negative and scaled', () => {
    expect(idleCo2Grams(0)).toBe(0);
    expect(idleCo2Grams(10)).toBe(200);
  });
  it('fixture has jammy segments and impact', () => {
    const f = fixtureResult();
    expect(f.mode).toBe('fixture');
    expect(f.jammyCount).toBeGreaterThan(0);
    expect(f.idleCo2G).toBeGreaterThan(0);
  });
});
