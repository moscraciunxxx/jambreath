import type { JamBreathResult } from './types';
import { delayMinutes, idleCo2Grams } from '../impact/co2';

/** Realistic LA corridor fixture when no TomTom key is present. */
export function fixtureResult(): JamBreathResult {
  const travel = 42 * 60;
  const free = 28 * 60;
  const delaySec = travel - free;
  const delayMin = delayMinutes(travel, free);
  const origin = { lat: 34.0522, lon: -118.2437 };
  const destination = { lat: 34.0736, lon: -118.24 };
  const flowSamples = [
    {
      point: { lat: 34.055, lon: -118.244 },
      currentSpeed: 18,
      freeFlowSpeed: 45,
      currentTravelTime: 120,
      freeFlowTravelTime: 48,
      confidence: 0.9,
      roadClosure: false,
      relativeSpeed: 18 / 45,
    },
    {
      point: { lat: 34.062, lon: -118.242 },
      currentSpeed: 12,
      freeFlowSpeed: 40,
      currentTravelTime: 180,
      freeFlowTravelTime: 54,
      confidence: 0.85,
      roadClosure: false,
      relativeSpeed: 12 / 40,
    },
    {
      point: { lat: 34.068, lon: -118.241 },
      currentSpeed: 25,
      freeFlowSpeed: 40,
      currentTravelTime: 90,
      freeFlowTravelTime: 56,
      confidence: 0.8,
      roadClosure: false,
      relativeSpeed: 25 / 40,
    },
  ];
  return {
    mode: 'fixture',
    origin,
    destination,
    originLabel: 'Downtown LA',
    destinationLabel: 'Echo Park (school corridor)',
    summary: {
      lengthMeters: 9200,
      travelTimeSeconds: travel,
      trafficDelaySeconds: delaySec,
    },
    delayMin,
    idleCo2G: idleCo2Grams(delayMin),
    flowSamples,
    jammyCount: 2,
    routePoints: [
      origin,
      { lat: 34.055, lon: -118.244 },
      { lat: 34.062, lon: -118.242 },
      { lat: 34.068, lon: -118.241 },
      destination,
    ],
    aqi: { pm25: 18.4, usAqi: 64, lat: 34.06, lon: -118.24 },
    alternate: {
      travelTimeSeconds: 34 * 60,
      trafficDelaySeconds: 4 * 60,
      note: 'Leave in ~18 min (fixture): delay drops as the jam clears eastbound.',
    },
    fetchedAt: new Date().toISOString(),
  };
}
