/**
 * Rush-hour / worst-of-day framing.
 * When live delay is low, optionally show a peak-hour ESTIMATE.
 * Never labeled as live data.
 */

export type PeakEstimate = {
  /** Delay minutes to display when rush mode is on */
  displayDelayMin: number;
  /** Whether the displayed delay is an estimate (not live) */
  isEstimate: boolean;
  /** Clear UI label */
  label: string;
  /** Multiplier applied vs live delay when estimating */
  peakMultiplier: number;
  liveDelayMin: number;
};

/** Below this live delay (min), rush mode switches to peak ESTIMATE framing. */
export const LOW_DELAY_THRESHOLD_MIN = 5;

/** Fixture-like peak multiplier when live delay is low. */
export const PEAK_MULTIPLIER = 2.6;

/** Floor for peak estimate so sparse off-peak doesn't look empty. */
export const PEAK_FLOOR_MIN = 12;

export function peakHourEstimate(liveDelayMin: number, rushMode: boolean): PeakEstimate {
  const live = Math.max(0, liveDelayMin);
  if (!rushMode) {
    return {
      displayDelayMin: live,
      isEstimate: false,
      label: 'Live / current delay',
      peakMultiplier: 1,
      liveDelayMin: live,
    };
  }
  if (live >= LOW_DELAY_THRESHOLD_MIN) {
    return {
      displayDelayMin: live,
      isEstimate: false,
      label: 'Current delay already in peak-like range (live)',
      peakMultiplier: 1,
      liveDelayMin: live,
    };
  }
  const scaled = Math.max(PEAK_FLOOR_MIN, live * PEAK_MULTIPLIER);
  return {
    displayDelayMin: Math.round(scaled * 10) / 10,
    isEstimate: true,
    label: `ESTIMATE · worst-of-day / rush band (≈${PEAK_MULTIPLIER}× off-peak, floor ${PEAK_FLOOR_MIN} min) — not live`,
    peakMultiplier: PEAK_MULTIPLIER,
    liveDelayMin: live,
  };
}
