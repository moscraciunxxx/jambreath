/**
 * Idle / stop-go CO₂ estimates for congestion delay.
 * ESTIMATE only — not a lifecycle assessment. Sources are order-of-magnitude
 * passenger-car idle emission factors commonly cited ~10–40 g CO₂/min.
 * Default mid factor is 20 g/min; UI can toggle low/mid/high.
 *
 * Illustrative cites (order-of-magnitude, not endorsement):
 * - EPA / idle reduction guidance often frames passenger idle in tens of g/min CO₂
 * - Common transport planning heuristics use ~10–40 g CO₂ per idle minute
 */

export type Co2FactorLevel = 'low' | 'mid' | 'high';

export const CO2_FACTORS: Record<Co2FactorLevel, number> = {
  low: 10,
  mid: 20,
  high: 40,
};

export const IDLE_CO2_G_PER_MIN = CO2_FACTORS.mid;
export const CO2_RANGE_NOTE =
  'Passenger-car idle CO₂ commonly cited ~10–40 g/min; mid default 20 g/min. ESTIMATE only — not a lifecycle assessment.';

export function idleCo2Grams(delayMinutes: number, factor: Co2FactorLevel | number = 'mid'): number {
  const m = Math.max(0, delayMinutes);
  const gPerMin = typeof factor === 'number' ? factor : CO2_FACTORS[factor];
  return Math.round(m * gPerMin);
}

export function delayMinutes(travelSeconds: number, freeFlowSeconds: number): number {
  return Math.max(0, (travelSeconds - freeFlowSeconds) / 60);
}

export function co2RangeGrams(delayMinutes: number): { low: number; mid: number; high: number } {
  return {
    low: idleCo2Grams(delayMinutes, 'low'),
    mid: idleCo2Grams(delayMinutes, 'mid'),
    high: idleCo2Grams(delayMinutes, 'high'),
  };
}
