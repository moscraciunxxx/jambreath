import type { JamBreathResult } from '../tomtom/types';
import type { Co2FactorLevel } from '../impact/co2';
import type { AqiAdvice } from '../impact/aqi';

export type ReceiptPayload = {
  app: 'JamBreath';
  version: 1;
  timestamp: string;
  mode: JamBreathResult['mode'];
  rushHourMode: boolean;
  delayMin: number;
  delayIsEstimate: boolean;
  idleCo2G: number;
  co2Factor: Co2FactorLevel;
  aqi?: { usAqi: number; pm25: number; category?: string };
  origin: string;
  destination: string;
  jammyCount: number;
  flowSampleCount: number;
};

export function buildReceiptPayload(
  r: JamBreathResult,
  opts: {
    rushHourMode: boolean;
    displayDelayMin: number;
    delayIsEstimate: boolean;
    idleCo2G: number;
    co2Factor: Co2FactorLevel;
    aqiAdvice?: AqiAdvice;
  },
): ReceiptPayload {
  return {
    app: 'JamBreath',
    version: 1,
    timestamp: new Date().toISOString(),
    mode: r.mode,
    rushHourMode: opts.rushHourMode,
    delayMin: opts.displayDelayMin,
    delayIsEstimate: opts.delayIsEstimate,
    idleCo2G: opts.idleCo2G,
    co2Factor: opts.co2Factor,
    aqi: r.aqi
      ? {
          usAqi: r.aqi.usAqi,
          pm25: r.aqi.pm25,
          category: opts.aqiAdvice?.category,
        }
      : undefined,
    origin: r.originLabel,
    destination: r.destinationLabel,
    jammyCount: r.jammyCount,
    flowSampleCount: r.flowSamples.length,
  };
}

export function downloadJson(payload: ReceiptPayload, filename = 'jambreath-receipt.json'): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadReceiptPng(payload: ReceiptPayload, filename = 'jambreath-receipt.png'): void {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 520;
  const ctx = canvas.getContext('2d')!;
  // background
  ctx.fillStyle = '#0b1210';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#143126';
  ctx.fillRect(0, 0, canvas.width, 8);

  ctx.fillStyle = '#3dffa8';
  ctx.font = 'bold 28px system-ui,sans-serif';
  ctx.fillText('JamBreath · impact receipt', 36, 56);

  ctx.fillStyle = '#8fa89a';
  ctx.font = '14px system-ui,sans-serif';
  ctx.fillText(payload.timestamp, 36, 84);
  ctx.fillText(`${payload.mode.toUpperCase()}${payload.rushHourMode ? ' · rush-hour framing' : ''}`, 36, 106);

  ctx.fillStyle = '#e7f2ea';
  ctx.font = '18px system-ui,sans-serif';
  const corridor = `${payload.origin} → ${payload.destination}`;
  wrapText(ctx, corridor, 36, 150, 820, 26);

  const rows: Array<[string, string]> = [
    ['Delay', `${payload.delayMin.toFixed(1)} min${payload.delayIsEstimate ? ' (ESTIMATE)' : ''}`],
    ['Idle CO₂', `${payload.idleCo2G} g (${payload.co2Factor} factor) · ESTIMATE`],
    ['Jammy segments', `${payload.jammyCount} / ${payload.flowSampleCount}`],
  ];
  if (payload.aqi) {
    rows.push(['US AQI', `${Math.round(payload.aqi.usAqi)}${payload.aqi.category ? ` · ${payload.aqi.category}` : ''} (PM2.5 ${payload.aqi.pm25})`]);
  }

  let y = 220;
  for (const [k, v] of rows) {
    ctx.fillStyle = '#8fa89a';
    ctx.font = '14px system-ui,sans-serif';
    ctx.fillText(k, 36, y);
    ctx.fillStyle = '#e7f2ea';
    ctx.font = 'bold 22px ui-monospace,monospace';
    ctx.fillText(v, 36, y + 28);
    y += 70;
  }

  ctx.fillStyle = '#8fa89a';
  ctx.font = '12px system-ui,sans-serif';
  ctx.fillText('Idle CO₂ is an ESTIMATE (10–40 g/min range). Not a lifecycle assessment.', 36, canvas.height - 28);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
