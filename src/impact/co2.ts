/**
 * Idle / stop-go CO₂ estimates for congestion delay.
 * ESTIMATE only — not a lifecycle assessment.
 *
 * Vehicle-class mid idle factors (order-of-magnitude cites):
 * - compact ≈15 g/min, mid/sedan ≈20 g/min, SUV ≈32 g/min
 * - hybrid ≈8 g/min (engine often off at idle), EV ≈0 g/min tailpipe idle
 * Common passenger-car heuristics ~10–40 g CO₂/min; intensity low/mid/high scales ICE classes.
 */

export type Co2Intensity = 'low' | 'mid' | 'high';
/** @deprecated alias kept for receipt/tests — prefer Co2Intensity */
export type Co2FactorLevel = Co2Intensity;

export type VehicleClass = 'compact' | 'mid' | 'suv' | 'hybrid' | 'ev';

/** Mid idle g CO₂/min by vehicle class (cited mid values; ESTIMATE). */
export const VEHICLE_IDLE_G_PER_MIN: Record<VehicleClass, number> = {
  compact: 15,
  mid: 20,
  suv: 32,
  hybrid: 8,
  ev: 0,
};

export const VEHICLE_LABELS: Record<VehicleClass, string> = {
  compact: 'Compact / small car',
  mid: 'Mid-size sedan',
  suv: 'SUV / light truck',
  hybrid: 'Hybrid (ICE+electric)',
  ev: 'Battery EV (tailpipe idle ≈0)',
};

export const VEHICLE_CITATION =
  'Idle factors are mid literature/heuristic values (compact≈15, mid≈20, SUV≈32, hybrid≈8, EV≈0 g/min). Intensity low/mid/high scales ICE classes (~0.5× / 1× / 2×). ESTIMATE only.';

/** Intensity multipliers vs the vehicle mid factor (preserves legacy 10/20/40 for mid sedan). */
export const INTENSITY_MULT: Record<Co2Intensity, number> = {
  low: 0.5,
  mid: 1,
  high: 2,
};

/** Legacy absolute factors for mid sedan (tests + older UI). */
export const CO2_FACTORS: Record<Co2Intensity, number> = {
  low: 10,
  mid: 20,
  high: 40,
};

export const IDLE_CO2_G_PER_MIN = CO2_FACTORS.mid;
export const CO2_RANGE_NOTE =
  'Passenger-car idle CO₂ commonly cited ~10–40 g/min; mid default 20 g/min. Vehicle class adjusts the base. ESTIMATE only — not a lifecycle assessment.';

export function idleGPerMin(
  vehicle: VehicleClass = 'mid',
  intensity: Co2Intensity = 'mid',
): number {
  const base = VEHICLE_IDLE_G_PER_MIN[vehicle];
  if (vehicle === 'ev' || base === 0) return 0;
  return base * INTENSITY_MULT[intensity];
}

export function idleCo2Grams(
  delayMinutes: number,
  factor: Co2Intensity | number = 'mid',
  vehicle: VehicleClass = 'mid',
): number {
  const m = Math.max(0, delayMinutes);
  const gPerMin =
    typeof factor === 'number' ? factor : idleGPerMin(vehicle, factor);
  return Math.round(m * gPerMin);
}

export function delayMinutes(travelSeconds: number, freeFlowSeconds: number): number {
  return Math.max(0, (travelSeconds - freeFlowSeconds) / 60);
}

export function co2RangeGrams(
  delayMinutes: number,
  vehicle: VehicleClass = 'mid',
): { low: number; mid: number; high: number } {
  return {
    low: idleCo2Grams(delayMinutes, 'low', vehicle),
    mid: idleCo2Grams(delayMinutes, 'mid', vehicle),
    high: idleCo2Grams(delayMinutes, 'high', vehicle),
  };
}
