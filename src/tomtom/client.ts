import type { FlowSample, JamBreathResult, LatLng, RouteStop } from './types';
import { delayMinutes, idleCo2Grams } from '../impact/co2';
import { fixtureResult } from './fixture';
import { detectCityFromLabel } from '../impact/city';

const KEY = () => (import.meta.env.VITE_TOMTOM_API_KEY || '').trim();

export function hasTomTomKey(): boolean {
  return KEY().length > 8;
}

async function geocode(q: string): Promise<{ pos: LatLng; label: string }> {
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(q)}.json?key=${KEY()}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode failed (${res.status})`);
  const data = await res.json();
  const r = data.results?.[0];
  if (!r) throw new Error(`No geocode result for ${q}`);
  return {
    pos: { lat: r.position.lat, lon: r.position.lon },
    label: r.address?.freeformAddress || q,
  };
}

async function route(points: LatLng[]) {
  const path = points.map((p) => `${p.lat},${p.lon}`).join(':');
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${path}/json?key=${KEY()}&traffic=true&travelMode=car&computeBestOrder=false&sectionType=traffic&maxAlternatives=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  return res.json();
}

async function flowAt(point: LatLng): Promise<FlowSample | null> {
  const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json?key=${KEY()}&point=${point.lat},${point.lon}&unit=KMPH`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const f = data.flowSegmentData;
  if (!f) return null;
  const rel = f.freeFlowSpeed > 0 ? f.currentSpeed / f.freeFlowSpeed : 1;
  return {
    point,
    currentSpeed: f.currentSpeed,
    freeFlowSpeed: f.freeFlowSpeed,
    currentTravelTime: f.currentTravelTime,
    freeFlowTravelTime: f.freeFlowTravelTime,
    confidence: f.confidence,
    roadClosure: !!f.roadClosure,
    relativeSpeed: rel,
  };
}

async function aqiNear(point: LatLng) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${point.lat}&longitude=${point.lon}&current=pm2_5,us_aqi`;
  const res = await fetch(url);
  if (!res.ok) return undefined;
  const data = await res.json();
  return {
    pm25: data.current?.pm2_5 ?? 0,
    usAqi: data.current?.us_aqi ?? 0,
    lat: point.lat,
    lon: point.lon,
  };
}

function samplePoints(points: Array<{ latitude: number; longitude: number }>, n = 5): LatLng[] {
  if (!points.length) return [];
  const out: LatLng[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.min(points.length - 1, Math.round((i / Math.max(1, n - 1)) * (points.length - 1)));
    const p = points[idx];
    out.push({ lat: p.latitude, lon: p.longitude });
  }
  return out;
}

/** Downsample leg points for map polyline. */
function simplifyRoute(points: Array<{ latitude: number; longitude: number }>, max = 64): LatLng[] {
  if (!points.length) return [];
  if (points.length <= max) {
    return points.map((p) => ({ lat: p.latitude, lon: p.longitude }));
  }
  return samplePoints(points, max);
}

function collectLegPoints(primary: {
  legs?: Array<{ points?: Array<{ latitude: number; longitude: number }> }>;
}): Array<{ latitude: number; longitude: number }> {
  const legs = primary.legs || [];
  const all: Array<{ latitude: number; longitude: number }> = [];
  for (const leg of legs) {
    for (const p of leg.points || []) all.push(p);
  }
  return all;
}

/**
 * Analyze origin → optional stops → destination.
 * Live TomTom uses calculateRoute waypoints; fixture aggregates multi-leg.
 */
export async function analyzeRoute(
  originQ: string,
  destQ: string,
  stopQueries: string[] = [],
): Promise<JamBreathResult> {
  const stopsClean = stopQueries.map((s) => s.trim()).filter(Boolean);
  if (!hasTomTomKey()) return fixtureResult(stopsClean);

  const [o, d, ...stopGeos] = await Promise.all([
    geocode(originQ),
    geocode(destQ),
    ...stopsClean.map((q) => geocode(q)),
  ]);

  const stops: RouteStop[] = stopGeos.map((g, i) => ({
    label: g.label || stopsClean[i],
    pos: g.pos,
  }));

  const wayPoints = [o.pos, ...stops.map((s) => s.pos), d.pos];
  const routed = await route(wayPoints);
  const routes = routed.routes || [];
  if (!routes.length) throw new Error('No routes returned');
  const primary = routes[0];
  const summary = primary.summary;
  const legsPts = collectLegPoints(primary);
  const routePoints = simplifyRoute(legsPts, 64);
  const pts = samplePoints(legsPts, Math.min(8, 3 + stops.length * 2));
  const flows = (await Promise.all(pts.map(flowAt))).filter(Boolean) as FlowSample[];
  const jammyCount = flows.filter((f) => f.relativeSpeed < 0.55).length;
  const travel = summary.travelTimeInSeconds;
  const delaySec = summary.trafficDelayInSeconds ?? 0;
  const free = Math.max(1, travel - delaySec);
  const delayMin = delayMinutes(travel, free);
  const mid = pts[Math.floor(pts.length / 2)] || o.pos;
  const aqi = await aqiNear(mid);
  const city = detectCityFromLabel(d.label, o.label);

  let alternate: JamBreathResult['alternate'];
  if (routes[1]) {
    const s = routes[1].summary;
    alternate = {
      travelTimeSeconds: s.travelTimeInSeconds,
      trafficDelaySeconds: s.trafficDelayInSeconds ?? 0,
      note: 'TomTom alternate route',
    };
  } else if (delayMin >= 5) {
    alternate = {
      travelTimeSeconds: Math.round(travel * 0.82),
      trafficDelaySeconds: Math.round(delaySec * 0.35),
      note: `ESTIMATE: waiting ~${Math.min(25, Math.round(delayMin * 0.6))} min may clear the worst queue (heuristic).`,
    };
  }

  return {
    mode: 'live',
    origin: o.pos,
    destination: d.pos,
    originLabel: o.label,
    destinationLabel: d.label,
    summary: {
      lengthMeters: summary.lengthInMeters,
      travelTimeSeconds: travel,
      trafficDelaySeconds: delaySec,
    },
    delayMin,
    idleCo2G: idleCo2Grams(delayMin),
    flowSamples: flows,
    jammyCount,
    routePoints: routePoints.length >= 2 ? routePoints : wayPoints,
    stops,
    city,
    legCount: 1 + stops.length,
    aqi,
    alternate,
    fetchedAt: new Date().toISOString(),
  };
}
