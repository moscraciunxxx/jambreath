import type { FlowSample, LatLng } from '../tomtom/types';

const W = 640;
const H = 280;
const PAD = 28;

function project(points: LatLng[]): Array<{ x: number; y: number; lat: number; lon: number }> {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const dLat = Math.max(0.002, maxLat - minLat);
  const dLon = Math.max(0.002, maxLon - minLon);
  // pad bounds slightly
  const padLat = dLat * 0.12;
  const padLon = dLon * 0.12;
  const loLat = minLat - padLat;
  const hiLat = maxLat + padLat;
  const loLon = minLon - padLon;
  const hiLon = maxLon + padLon;
  const spanLat = hiLat - loLat;
  const spanLon = hiLon - loLon;
  return points.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    x: PAD + ((p.lon - loLon) / spanLon) * (W - PAD * 2),
    // lat increases north; SVG y increases down
    y: PAD + ((hiLat - p.lat) / spanLat) * (H - PAD * 2),
  }));
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Lightweight SVG corridor map — no map SDK dependency. */
export function corridorMapSvg(
  routePoints: LatLng[],
  flowSamples: FlowSample[],
  origin: LatLng,
  destination: LatLng,
): string {
  const pathPts =
    routePoints.length >= 2
      ? routePoints
      : [origin, ...flowSamples.map((f) => f.point), destination];
  const uniq = pathPts.length ? pathPts : [origin, destination];
  const proj = project(uniq);
  const poly = proj.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const o = project([origin])[0];
  const d = project([destination])[0];

  const markers = flowSamples
    .map((f) => {
      const p = project([f.point])[0];
      const jammy = f.relativeSpeed < 0.55;
      const fill = jammy ? '#ff6b6b' : '#3dffa8';
      const label = jammy ? 'jammy' : 'ok';
      const pct = (f.relativeSpeed * 100).toFixed(0);
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="${fill}" stroke="#0b1210" stroke-width="2">
        <title>${escapeAttr(`${label}: ${pct}% free-flow @ ${f.currentSpeed.toFixed(0)}/${f.freeFlowSpeed.toFixed(0)} km/h`)}</title>
      </circle>`;
    })
    .join('');

  return `
<svg class="corridor-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Corridor map with route and jammy flow samples">
  <rect width="${W}" height="${H}" rx="12" fill="#0e1613" stroke="#24332c"/>
  <text x="14" y="22" fill="#8fa89a" font-size="12" font-family="system-ui,sans-serif">Corridor · jammy = &lt;55% free-flow</text>
  <polyline fill="none" stroke="#3dffa855" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" points="${poly}"/>
  <polyline fill="none" stroke="#3dffa8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${poly}"/>
  ${markers}
  <circle cx="${o.x.toFixed(1)}" cy="${o.y.toFixed(1)}" r="5" fill="#ffe6a3" stroke="#0b1210" stroke-width="2"/>
  <circle cx="${d.x.toFixed(1)}" cy="${d.y.toFixed(1)}" r="5" fill="#7eb6ff" stroke="#0b1210" stroke-width="2"/>
  <text x="14" y="${H - 12}" fill="#8fa89a" font-size="11" font-family="system-ui,sans-serif">● origin  ● destination  ● flow (red = jammy)</text>
</svg>`.trim();
}
