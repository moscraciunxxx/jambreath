/**
 * Time-travel / departure-hour traffic ESTIMATES.
 * Diurnal peak curve — honest labels (PEAK ESTIMATE / off-peak ESTIMATE).
 * Never claimed as live historical playback.
 */

export type DepartureHour = number | 'now'; // 0–23 or now

export type TimeTravelEstimate = {
  hour: number;
  isNow: boolean;
  /** Scaled delay minutes to display */
  displayDelayMin: number;
  /** Relative diurnal factor 0–1 */
  factor: number;
  isEstimate: boolean;
  /** PEAK ESTIMATE | off-peak ESTIMATE | Live / current */
  label: string;
  band: 'peak' | 'off-peak' | 'live';
  liveDelayMin: number;
};

/** Typical urban dual-peak diurnal curve (relative 0–1). */
export function diurnalFactor(hour: number): number {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  // Morning peak 7–9, evening peak 16–18
  const morning = Math.exp(-0.5 * Math.pow((h - 8) / 1.4, 2));
  const evening = Math.exp(-0.5 * Math.pow((h - 17) / 1.6, 2));
  const midday = 0.45 * Math.exp(-0.5 * Math.pow((h - 12.5) / 2.2, 2));
  const night = h >= 22 || h <= 5 ? 0.22 : 0.28;
  const raw = Math.max(night, morning * 1.0, evening * 0.98, midday);
  return Math.min(1, Math.max(0.18, raw));
}

export function isPeakHour(hour: number): boolean {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  return (h >= 7 && h <= 9) || (h >= 16 && h <= 18);
}

export function currentHour(d: Date = new Date()): number {
  return d.getHours();
}

/**
 * Scale a live/fixture delay by the diurnal curve relative to "now".
 * When departure !== now, always labeled ESTIMATE.
 */
export function timeTravelEstimate(
  liveDelayMin: number,
  departure: DepartureHour,
  now: Date = new Date(),
): TimeTravelEstimate {
  const live = Math.max(0, liveDelayMin);
  const nowH = currentHour(now);
  const isNow = departure === 'now';
  const hour = isNow ? nowH : ((Math.round(departure as number) % 24) + 24) % 24;
  const nowF = Math.max(0.2, diurnalFactor(nowH));
  const f = diurnalFactor(hour);

  if (isNow) {
    return {
      hour,
      isNow: true,
      displayDelayMin: live,
      factor: f,
      isEstimate: false,
      label: 'Live / current delay',
      band: 'live',
      liveDelayMin: live,
    };
  }

  // Scale live delay from "now" conditions to chosen hour
  const scaled = Math.round(((live * f) / nowF) * 10) / 10;
  const peak = isPeakHour(hour);
  return {
    hour,
    isNow: false,
    displayDelayMin: scaled,
    factor: f,
    isEstimate: true,
    label: peak
      ? `PEAK ESTIMATE · depart ${String(hour).padStart(2, '0')}:00 (diurnal curve — not live)`
      : `off-peak ESTIMATE · depart ${String(hour).padStart(2, '0')}:00 (diurnal curve — not live)`,
    band: peak ? 'peak' : 'off-peak',
    liveDelayMin: live,
  };
}

/** 24-point sparkline of estimated delay across the day (ESTIMATE). */
export function delayAcrossDay(liveDelayMin: number, now: Date = new Date()): number[] {
  const nowH = currentHour(now);
  const nowF = Math.max(0.2, diurnalFactor(nowH));
  const live = Math.max(0, liveDelayMin);
  return Array.from({ length: 24 }, (_, h) =>
    Math.round(((live * diurnalFactor(h)) / nowF) * 10) / 10,
  );
}

export function sparklineSvg(values: number[], width = 320, height = 56): string {
  if (!values.length) return '';
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const pts = values
    .map((v, i) => {
      const x = i * step;
      const y = height - 4 - (v / max) * (height - 12);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const peakIdx = values.indexOf(Math.max(...values));
  const px = peakIdx * step;
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="Delay across the day ESTIMATE sparkline" width="100%" height="${height}">
  <polyline fill="none" stroke="#3dffa855" stroke-width="4" points="${pts}"/>
  <polyline fill="none" stroke="#3dffa8" stroke-width="2" points="${pts}"/>
  <circle cx="${px.toFixed(1)}" cy="${(height - 4 - (values[peakIdx] / max) * (height - 12)).toFixed(1)}" r="3.5" fill="#ffc857"/>
  <text x="4" y="12" fill="#8fa89a" font-size="10" font-family="system-ui,sans-serif">0h</text>
  <text x="${width - 22}" y="12" fill="#8fa89a" font-size="10" font-family="system-ui,sans-serif">23h</text>
</svg>`;
}
