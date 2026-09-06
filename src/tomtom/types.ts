export type LatLng = { lat: number; lon: number };

export type RouteSummary = {
  lengthMeters: number;
  travelTimeSeconds: number;
  trafficDelaySeconds: number;
  departure?: string;
  arrival?: string;
};

export type FlowSample = {
  point: LatLng;
  currentSpeed: number;
  freeFlowSpeed: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
  roadClosure: boolean;
  relativeSpeed: number; // current/freeFlow
};

export type JamBreathResult = {
  mode: 'live' | 'fixture';
  origin: LatLng;
  destination: LatLng;
  originLabel: string;
  destinationLabel: string;
  summary: RouteSummary;
  delayMin: number;
  idleCo2G: number;
  flowSamples: FlowSample[];
  jammyCount: number;
  aqi?: { pm25: number; usAqi: number; lat: number; lon: number };
  alternate?: { travelTimeSeconds: number; trafficDelaySeconds: number; note: string };
  fetchedAt: string;
};
