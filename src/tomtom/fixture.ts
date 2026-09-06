import type { JamBreathResult, LatLng, RouteStop } from './types';
import { delayMinutes, idleCo2Grams } from '../impact/co2';

function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

/** Realistic LA corridor fixture when no TomTom key is present. Supports multi-leg stops. */
export function fixtureResult(stopLabels: string[] = []): JamBreathResult {
  const nStops = stopLabels.length;
  const legMult = 1 + nStops * 0.55;
  const travel = Math.round(42 * 60 * legMult);
  const free = Math.round(28 * 60 * legMult);
  const delaySec = travel - free;
  const delayMin = delayMinutes(travel, free);
  const origin = { lat: 34.0522, lon: -118.2437 };
  const destination = { lat: 34.0736, lon: -118.24 };

  const stops: RouteStop[] = stopLabels.map((label, i) => {
    const t = (i + 1) / (nStops + 1);
    return { label: label || `Stop ${i + 1}`, pos: lerp(origin, destination, t) };
  });

  const routePoints: LatLng[] = [origin];
  for (const s of stops) routePoints.push(s.pos);
  if (!stops.length) {
    routePoints.push(
      { lat: 34.055, lon: -118.244 },
      { lat: 34.062, lon: -118.242 },
      { lat: 34.068, lon: -118.241 },
    );
  } else {
    // midpoints between stops for a nicer polyline
    for (let i = 0; i < routePoints.length - 1; i++) {
      /* filled below */
    }
  }
  routePoints.push(destination);

  // Rebuild with midpoints when stops exist
  let poly: LatLng[] = [origin];
  const chain = [origin, ...stops.map((s) => s.pos), destination];
  for (let i = 0; i < chain.length - 1; i++) {
    poly.push(lerp(chain[i], chain[i + 1], 0.5));
    poly.push(chain[i + 1]);
  }

  const flowSamples = [
    {
      point: poly[Math.min(1, poly.length - 1)] || { lat: 34.055, lon: -118.244 },
      currentSpeed: 18,
      freeFlowSpeed: 45,
      currentTravelTime: 120,
      freeFlowTravelTime: 48,
      confidence: 0.9,
      roadClosure: false,
      relativeSpeed: 18 / 45,
    },
    {
      point: poly[Math.floor(poly.length / 2)] || { lat: 34.062, lon: -118.242 },
      currentSpeed: 12,
      freeFlowSpeed: 40,
      currentTravelTime: 180,
      freeFlowTravelTime: 54,
      confidence: 0.85,
      roadClosure: false,
      relativeSpeed: 12 / 40,
    },
    {
      point: poly[Math.max(0, poly.length - 2)] || { lat: 34.068, lon: -118.241 },
      currentSpeed: 25,
      freeFlowSpeed: 40,
      currentTravelTime: 90,
      freeFlowTravelTime: 56,
      confidence: 0.8,
      roadClosure: false,
      relativeSpeed: 25 / 40,
    },
  ];

  const destLabel =
    nStops > 0
      ? `Echo Park via ${nStops} stop${nStops > 1 ? 's' : ''} (school corridor)`
      : 'Echo Park (school corridor)';

  return {
    mode: 'fixture',
    origin,
    destination,
    originLabel: 'Downtown LA',
    destinationLabel: destLabel,
    summary: {
      lengthMeters: Math.round(9200 * legMult),
      travelTimeSeconds: travel,
      trafficDelaySeconds: delaySec,
    },
    delayMin,
    idleCo2G: idleCo2Grams(delayMin),
    flowSamples,
    jammyCount: 2,
    routePoints: poly,
    stops,
    city: 'Los Angeles',
    legCount: 1 + nStops,
    aqi: { pm25: 18.4, usAqi: 64, lat: 34.06, lon: -118.24 },
    alternate: {
      travelTimeSeconds: Math.round(34 * 60 * legMult),
      trafficDelaySeconds: Math.round(4 * 60 * legMult),
      note: 'Leave in ~18 min (fixture): delay drops as the jam clears eastbound.',
    },
    fetchedAt: new Date().toISOString(),
  };
}
