import type { FlowSample, JamBreathResult, LatLng } from './types';
import { delayMinutes, idleCo2Grams } from '../impact/co2';
import { fixtureResult } from './fixture';

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

async function route(origin: LatLng, dest: LatLng) {
  const path = `${origin.lat},${origin.lon}:${dest.lat},${dest.lon}`;
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

export async function analyzeRoute(originQ: string, destQ: string): Promise<JamBreathResult> {
  if (!hasTomTomKey()) return fixtureResult();

  const [o, d] = await Promise.all([geocode(originQ), geocode(destQ)]);
  const routed = await route(o.pos, d.pos);
  const routes = routed.routes || [];
  if (!routes.length) throw new Error('No routes returned');
  const primary = routes[0];
  const summary = primary.summary;
  const legs = primary.legs?.[0]?.points || [];
  const pts = samplePoints(legs, 5);
  const flows = (await Promise.all(pts.map(flowAt))).filter(Boolean) as FlowSample[];
  const jammyCount = flows.filter((f) => f.relativeSpeed < 0.55).length;
  const travel = summary.travelTimeInSeconds;
  const delaySec = summary.trafficDelayInSeconds ?? 0;
  const free = Math.max(1, travel - delaySec);
  const delayMin = delayMinutes(travel, free);
  const mid = pts[Math.floor(pts.length / 2)] || o.pos;
  const aqi = await aqiNear(mid);

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
    aqi,
    alternate,
    fetchedAt: new Date().toISOString(),
  };
}
