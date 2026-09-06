import { idleCo2Grams, type Co2FactorLevel, type VehicleClass } from './co2';

export type MoveKind = 'alt-route' | 'leave-later' | 'bike' | 'transit';

export type HealthierMove = {
  kind: MoveKind;
  title: string;
  /** Estimated door-to-door or wait+travel minutes for this option */
  minutesEstimate: number;
  /** Idle CO₂ avoided vs sitting through the jam (driving) — ESTIMATE */
  idleCo2AvoidedG: number;
  note: string;
  isEstimate: boolean;
};

export type MovesInput = {
  delayMin: number;
  travelTimeSeconds: number;
  lengthMeters: number;
  factor?: Co2FactorLevel;
  vehicle?: VehicleClass;
  alternate?: { travelTimeSeconds: number; trafficDelaySeconds: number; note: string };
};

/** ~ bike 15 km/h average urban */
const BIKE_KMH = 15;
/** transit heuristic: 22 km/h + 8 min access/wait */
const TRANSIT_KMH = 22;
const TRANSIT_ACCESS_MIN = 8;

export function healthierMoves(input: MovesInput): HealthierMove[] {
  const factor = input.factor ?? 'mid';
  const vehicle = input.vehicle ?? 'mid';
  const delay = Math.max(0, input.delayMin);
  const km = Math.max(0.5, input.lengthMeters / 1000);
  const driveMin = Math.max(1, input.travelTimeSeconds / 60);
  const moves: HealthierMove[] = [];

  if (input.alternate) {
    const altDelayMin = input.alternate.trafficDelaySeconds / 60;
    const saved = Math.max(0, delay - altDelayMin);
    moves.push({
      kind: 'alt-route',
      title: 'Alternate drive route',
      minutesEstimate: Math.round(input.alternate.travelTimeSeconds / 60),
      idleCo2AvoidedG: idleCo2Grams(saved, factor, vehicle),
      note: input.alternate.note,
      isEstimate: /estimate/i.test(input.alternate.note),
    });
  }

  const leaveWait = Math.min(25, Math.max(8, Math.round(delay * 0.65)));
  const leaveDelayLeft = Math.max(0, delay * 0.35);
  const leaveSaved = Math.max(0, delay - leaveDelayLeft);
  moves.push({
    kind: 'leave-later',
    title: `Leave ~${leaveWait} min later`,
    minutesEstimate: Math.round(driveMin - leaveSaved + leaveWait),
    idleCo2AvoidedG: idleCo2Grams(leaveSaved, factor, vehicle),
    note: `ESTIMATE: waiting ~${leaveWait} min may shed ~${leaveSaved.toFixed(0)} min of jam delay (heuristic, not live prediction).`,
    isEstimate: true,
  });

  const bikeMin = Math.round((km / BIKE_KMH) * 60);
  moves.push({
    kind: 'bike',
    title: 'Bike instead',
    minutesEstimate: bikeMin,
    idleCo2AvoidedG: idleCo2Grams(delay, factor, vehicle),
    note: `ESTIMATE: ~${km.toFixed(1)} km at ~${BIKE_KMH} km/h urban. Avoids the jam's idle CO₂ entirely (no car idle).`,
    isEstimate: true,
  });

  const transitMin = Math.round((km / TRANSIT_KMH) * 60 + TRANSIT_ACCESS_MIN);
  moves.push({
    kind: 'transit',
    title: 'Transit instead',
    minutesEstimate: transitMin,
    idleCo2AvoidedG: idleCo2Grams(delay, factor, vehicle),
    note: `ESTIMATE: ~${km.toFixed(1)} km at ~${TRANSIT_KMH} km/h + ${TRANSIT_ACCESS_MIN} min access/wait. Avoids sitting in the car queue.`,
    isEstimate: true,
  });

  return moves;
}
