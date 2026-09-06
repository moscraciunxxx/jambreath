/**
 * Idle / stop-go CO₂ estimates for congestion delay.
 * ESTIMATE only — not a lifecycle assessment. Sources are order-of-magnitude
 * passenger-car idle emission factors commonly cited ~10–40 g CO₂/min.
 * We use 20 g/min as a mid estimate and label it in the UI.
 */
export const IDLE_CO2_G_PER_MIN = 20;

export function idleCo2Grams(delayMinutes: number): number {
  const m = Math.max(0, delayMinutes);
  return Math.round(m * IDLE_CO2_G_PER_MIN);
}

export function delayMinutes(travelSeconds: number, freeFlowSeconds: number): number {
  return Math.max(0, (travelSeconds - freeFlowSeconds) / 60);
}
