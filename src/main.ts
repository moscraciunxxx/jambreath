import './style.css';
import { analyzeRoute, hasTomTomKey } from './tomtom/client';
import type { JamBreathResult } from './tomtom/types';
import {
  CO2_RANGE_NOTE,
  VEHICLE_CITATION,
  VEHICLE_IDLE_G_PER_MIN,
  VEHICLE_LABELS,
  co2RangeGrams,
  idleCo2Grams,
  idleGPerMin,
  type Co2FactorLevel,
  type VehicleClass,
} from './impact/co2';
import { aqiAdvice } from './impact/aqi';
import { peakHourEstimate } from './impact/rushHour';
import { healthierMoves } from './impact/moves';
import { addAvoided, loadWeekLedger, saveWeekLedger, type WeekBucket } from './impact/ledger';
import {
  addCorridor,
  allCorridors,
  BUILTIN_PRESETS,
  removeCorridor,
  type Corridor,
} from './impact/bookmarks';
import { corridorMapSvg } from './map/corridorSvg';
import { mountCorridorMap, type MapHandle } from './map/leafletMap';
import { buildReceiptPayload, downloadJson, downloadReceiptPng } from './receipt/export';
import {
  delayAcrossDay,
  sparklineSvg,
  timeTravelEstimate,
  type DepartureHour,
} from './impact/timeTravel';
import { cancelTour, runTour, type TourStep } from './impact/tour';
import { detectCityFromLabel } from './impact/city';

type UiState = {
  result?: JamBreathResult;
  busy: boolean;
  err?: string;
  rushMode: boolean;
  co2Factor: Co2FactorLevel;
  vehicle: VehicleClass;
  co2Expanded: boolean;
  origin: string;
  dest: string;
  presetId: string;
  departure: DepartureHour;
  stops: string[];
  tourRunning: boolean;
  tourStatus: string;
  highlightMoves: boolean;
};

const app = document.querySelector<HTMLDivElement>('#app')!;

let session = { delayAvoidedMin: 0, co2AvoidedG: 0 };
let week: WeekBucket = loadWeekLedger();
let corridors: Corridor[] = allCorridors();
let mapHandle: MapHandle | null = null;

const state: UiState = {
  busy: false,
  rushMode: false,
  co2Factor: 'mid',
  vehicle: 'mid',
  co2Expanded: false,
  origin: BUILTIN_PRESETS[0].origin,
  dest: BUILTIN_PRESETS[0].dest,
  presetId: BUILTIN_PRESETS[0].id,
  departure: 'now',
  stops: [],
  tourRunning: false,
  tourStatus: '',
  highlightMoves: false,
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMin(sec: number): string {
  return `${Math.round(sec / 60)} min`;
}

function displayDelayFor(result: JamBreathResult): {
  displayDelayMin: number;
  isEstimate: boolean;
  label: string;
  peak: ReturnType<typeof peakHourEstimate>;
  travel: ReturnType<typeof timeTravelEstimate>;
} {
  const peak = peakHourEstimate(result.delayMin, state.rushMode);
  const travel = timeTravelEstimate(peak.displayDelayMin, state.departure);
  if (!travel.isNow) {
    return {
      displayDelayMin: travel.displayDelayMin,
      isEstimate: true,
      label: travel.label,
      peak,
      travel,
    };
  }
  return {
    displayDelayMin: peak.displayDelayMin,
    isEstimate: peak.isEstimate,
    label: peak.label,
    peak,
    travel,
  };
}

function persistInputsFromDom() {
  const o = app.querySelector<HTMLInputElement>('#origin');
  const d = app.querySelector<HTMLInputElement>('#dest');
  const p = app.querySelector<HTMLSelectElement>('#preset');
  const rush = app.querySelector<HTMLInputElement>('#rushMode');
  const factor = app.querySelector<HTMLSelectElement>('#co2Factor');
  const vehicle = app.querySelector<HTMLSelectElement>('#vehicle');
  const dep = app.querySelector<HTMLSelectElement>('#departure');
  if (o) state.origin = o.value;
  if (d) state.dest = d.value;
  if (p) state.presetId = p.value;
  if (rush) state.rushMode = rush.checked;
  if (factor) state.co2Factor = factor.value as Co2FactorLevel;
  if (vehicle) state.vehicle = vehicle.value as VehicleClass;
  if (dep) state.departure = dep.value === 'now' ? 'now' : Number(dep.value);
  const stopInputs = app.querySelectorAll<HTMLInputElement>('.stop-input');
  if (stopInputs.length) state.stops = [...stopInputs].map((el) => el.value);
}

function destroyMap() {
  mapHandle?.destroy();
  mapHandle = null;
}

async function afterRenderMap() {
  const el = app.querySelector<HTMLElement>('#leafletMap');
  if (!el || !state.result) return;
  destroyMap();
  const r = state.result;
  const handle = await mountCorridorMap({
    container: el,
    routePoints: r.routePoints || [],
    flowSamples: r.flowSamples,
    origin: r.origin,
    destination: r.destination,
    stopPoints: (r.stops || []).map((s) => s.pos),
  });
  mapHandle = handle;
  const note = app.querySelector('#mapFallbackNote');
  if (note) {
    note.textContent =
      handle.mode === 'svg' ? 'Map tiles unavailable — showing SVG corridor fallback.' : '';
    (note as HTMLElement).hidden = handle.mode !== 'svg';
  }
}

function render() {
  const live = hasTomTomKey();
  const { result, busy, err } = state;
  const hourOpts = Array.from({ length: 24 }, (_, h) => {
    const sel = state.departure !== 'now' && Number(state.departure) === h ? 'selected' : '';
    return `<option value="${h}" ${sel}>${String(h).padStart(2, '0')}:00</option>`;
  }).join('');

  app.innerHTML = `
  <div class="wrap">
    <div class="topbar">
      <p class="tag">NextStep · Earth Forward</p>
      <div class="topbar-actions">
        ${
          state.tourRunning
            ? `<button type="button" id="cancelTour" class="secondary">Cancel demo</button>`
            : `<button type="button" id="playTour" class="secondary">Play 60s demo</button>`
        }
      </div>
    </div>
    <h1>JamBreath</h1>
    <p class="thesis">Live traffic jams are an air problem and a climate problem. JamBreath pulls <b>TomTom</b> congestion, estimates idle CO₂ from delay, checks corridor AQI, and helps you pick a healthier move — leave later, bike, transit, or an alternate route.</p>
    ${live ? '' : `<div class="banner" role="status"><b>Fixture mode</b> — add <code>VITE_TOMTOM_API_KEY</code> for live TomTom jams. Demo still runs with a realistic LA corridor.</div>`}
    ${state.tourStatus ? `<div class="banner tour-banner" role="status" aria-live="polite">${escapeHtml(state.tourStatus)}</div>` : ''}

    <div class="card">
      <div class="row">
        <label>Origin<input id="origin" value="${escapeHtml(state.origin)}" autocomplete="street-address" /></label>
        <label>Destination<input id="dest" value="${escapeHtml(state.dest)}" autocomplete="street-address" /></label>
      </div>
      <div class="row" style="margin-top:10px; align-items:flex-end;">
        <label>Corridor
          <select id="preset" aria-label="Corridor preset">
            ${corridors
              .map(
                (p) =>
                  `<option value="${escapeHtml(p.id)}" ${p.id === state.presetId ? 'selected' : ''}>${escapeHtml(p.name)}${p.builtin ? '' : ' ★'}</option>`,
              )
              .join('')}
          </select>
        </label>
        <button id="go" ${busy ? 'disabled' : ''}>${busy ? 'Listening to jams…' : 'Fetch live impact'}</button>
      </div>

      <div class="stops-block" style="margin-top:12px;">
        <div class="row" style="align-items:center; justify-content:space-between;">
          <strong>School-run stops (optional)</strong>
          <button type="button" id="addStop" class="secondary">Add stop</button>
        </div>
        <div id="stopsList" class="stops-list">
          ${
            state.stops
              .map(
                (s, i) => `
            <div class="stop-row">
              <input class="stop-input" data-idx="${i}" value="${escapeHtml(s)}" placeholder="Stop address (e.g. daycare)" aria-label="Stop ${i + 1}" />
              <button type="button" class="secondary remove-stop" data-idx="${i}">Remove</button>
            </div>`,
              )
              .join('') ||
            `<p class="hint" style="margin:6px 0 0;">home → school. Add a stop for a multi-leg school run (impact aggregates).</p>`
          }
        </div>
      </div>

      <div class="row toolbar" style="margin-top:12px; align-items:flex-end;">
        <label>Departure hour
          <select id="departure" aria-label="Departure hour">
            <option value="now" ${state.departure === 'now' ? 'selected' : ''}>Now (live)</option>
            ${hourOpts}
          </select>
        </label>
        <label class="check"><input type="checkbox" id="rushMode" ${state.rushMode ? 'checked' : ''}/> Rush-hour / worst-of-day framing</label>
        <button type="button" id="saveCorridor" class="secondary">Save corridor</button>
        <button type="button" id="deleteCorridor" class="secondary" ${
          corridors.find((c) => c.id === state.presetId)?.builtin ? 'disabled' : ''
        }>Delete saved</button>
      </div>
      <p class="hint">Saved corridors stay in this browser. Built-in presets include school-run defaults.</p>
    </div>

    ${err ? `<div class="banner" role="alert">${escapeHtml(err)}</div>` : ''}
    ${result ? renderResult(result) : ''}

    <div class="card" id="ledgerCard">
      <h3 style="margin:0 0 8px;">Impact ledger</h3>
      <div class="metrics">
        <div class="metric ok"><b>${session.delayAvoidedMin.toFixed(0)}</b><span>session · delay min avoided</span></div>
        <div class="metric ok"><b>${session.co2AvoidedG}</b><span>session · g CO₂ avoided (ESTIMATE)</span></div>
        <div class="metric ok"><b>${week.delayAvoidedMin.toFixed(0)}</b><span>this week (${escapeHtml(week.week)}) · delay min</span></div>
        <div class="metric ok"><b>${week.co2AvoidedG}</b><span>this week · g CO₂ avoided (ESTIMATE)</span></div>
      </div>
    </div>

    <p class="foot">Idle CO₂ uses vehicle class + intensity — labeled ESTIMATE. AQI via Open-Meteo. Traffic via TomTom when a key is set. Source: <a href="https://github.com/moscraciunxxx/jambreath">github.com/moscraciunxxx/jambreath</a></p>
  </div>`;

  wireEvents();
  void afterRenderMap();
}

function renderResult(r: JamBreathResult): string {
  const d = displayDelayFor(r);
  const displayDelay = d.displayDelayMin;
  const idleG = idleCo2Grams(displayDelay, state.co2Factor, state.vehicle);
  const range = co2RangeGrams(displayDelay, state.vehicle);
  const delayClass = displayDelay >= 12 ? 'bad' : displayDelay >= 5 ? 'warn' : 'ok';
  const advice = r.aqi ? aqiAdvice(r.aqi.usAqi) : undefined;
  const moves = healthierMoves({
    delayMin: displayDelay,
    travelTimeSeconds: r.summary.travelTimeSeconds,
    lengthMeters: r.summary.lengthMeters,
    factor: state.co2Factor,
    vehicle: state.vehicle,
    alternate: r.alternate,
  });
  const spark = sparklineSvg(delayAcrossDay(r.delayMin));
  const gPerMin = idleGPerMin(state.vehicle, state.co2Factor);
  const svgFallback = corridorMapSvg(r.routePoints || [], r.flowSamples, r.origin, r.destination);

  return `
  <div class="card">
    <div class="row" style="justify-content:space-between; align-items:baseline;">
      <div>
        <div class="tag">${r.mode === 'live' ? 'LIVE TomTom' : 'FIXTURE'}</div>
        ${d.isEstimate ? `<div class="tag warn-tag">${d.travel.band === 'peak' || d.peak.isEstimate ? 'PEAK ESTIMATE' : 'off-peak ESTIMATE'}</div>` : ''}
        ${r.legCount && r.legCount > 1 ? `<div class="tag">${r.legCount} legs</div>` : ''}
        <h2 style="margin:8px 0 0; font-size:1.1rem;">${escapeHtml(r.originLabel)} → ${escapeHtml(r.destinationLabel)}</h2>
      </div>
      <small style="color:var(--muted)">${new Date(r.fetchedAt).toLocaleString()}</small>
    </div>
    ${
      d.isEstimate || state.rushMode
        ? `<p class="hint" style="margin-top:10px;"><b>${escapeHtml(d.label)}</b>${
            d.peak.isEstimate && d.travel.isNow
              ? ` · live delay was ${d.peak.liveDelayMin.toFixed(1)} min — figures below are framed as rush/worst-of-day <em>ESTIMATE</em>, not fake live data.`
              : !d.travel.isNow
                ? ` · scaled from live ${d.travel.liveDelayMin.toFixed(1)} min via diurnal curve.`
                : ''
          }</p>`
        : ''
    }
    <div class="metrics" style="margin-top:12px;">
      <div class="metric"><b>${fmtMin(r.summary.travelTimeSeconds)}</b><span>travel time</span></div>
      <div class="metric ${delayClass}"><b>${displayDelay.toFixed(1)} min</b><span>${
        d.isEstimate
          ? d.travel.band === 'peak' || (d.peak.isEstimate && d.travel.isNow)
            ? 'peak delay ESTIMATE'
            : 'off-peak delay ESTIMATE'
          : 'traffic delay'
      }</span></div>
      <div class="metric ${delayClass}"><b>${idleG} g</b><span>idle CO₂ ESTIMATE (${escapeHtml(state.vehicle)} · ${gPerMin} g/min)</span></div>
      <div class="metric"><b>${r.jammyCount}/${r.flowSamples.length}</b><span>jammy segments (&lt;55% free-flow)</span></div>
      ${r.aqi ? `<div class="metric"><b>${Math.round(r.aqi.usAqi)}</b><span>US AQI · ${escapeHtml(advice?.category || '')}</span></div>` : ''}
    </div>
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Time-travel traffic</h3>
    <p class="hint" style="margin-top:0;">Delay across the day (ESTIMATE diurnal curve — not historical playback)</p>
    <div class="spark-wrap">${spark}</div>
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Corridor map</h3>
    <div id="leafletMap" class="map-leaflet" role="region" aria-label="Interactive corridor map"></div>
    <p id="mapFallbackNote" class="hint" hidden></p>
    <noscript>${svgFallback}</noscript>
  </div>

  <div class="card" id="co2Card">
    <div class="row" style="justify-content:space-between; align-items:center;">
      <h3 style="margin:0;">Honest CO₂ card</h3>
      <button type="button" id="toggleCo2" class="secondary">${state.co2Expanded ? 'Hide details' : 'Show sources & range'}</button>
    </div>
    <div class="row" style="margin-top:10px; align-items:flex-end;">
      <label>Vehicle class
        <select id="vehicle" aria-label="Vehicle class">
          ${(Object.keys(VEHICLE_LABELS) as VehicleClass[])
            .map(
              (v) =>
                `<option value="${v}" ${state.vehicle === v ? 'selected' : ''}>${escapeHtml(VEHICLE_LABELS[v])} · ${VEHICLE_IDLE_G_PER_MIN[v]} g/min</option>`,
            )
            .join('')}
        </select>
      </label>
      <label>Idle intensity
        <select id="co2Factor" aria-label="Idle intensity">
          <option value="low" ${state.co2Factor === 'low' ? 'selected' : ''}>Low · ${idleGPerMin(state.vehicle, 'low')} g/min</option>
          <option value="mid" ${state.co2Factor === 'mid' ? 'selected' : ''}>Mid · ${idleGPerMin(state.vehicle, 'mid')} g/min</option>
          <option value="high" ${state.co2Factor === 'high' ? 'selected' : ''}>High · ${idleGPerMin(state.vehicle, 'high')} g/min</option>
        </select>
      </label>
      <div class="metrics" style="flex:2;">
        <div class="metric"><b>${idleG} g</b><span>${escapeHtml(state.vehicle)} · ${state.co2Factor}</span></div>
      </div>
    </div>
    ${
      state.co2Expanded
        ? `<div class="co2-panel">
      <p>${escapeHtml(CO2_RANGE_NOTE)}</p>
      <p class="hint">${escapeHtml(VEHICLE_CITATION)}</p>
      <div class="metrics">
        <div class="metric"><b>${range.low} g</b><span>low intensity</span></div>
        <div class="metric"><b>${range.mid} g</b><span>mid intensity</span></div>
        <div class="metric"><b>${range.high} g</b><span>high intensity</span></div>
      </div>
      <p class="hint">Recomputes from ${displayDelay.toFixed(1)} min of ${d.isEstimate ? 'ESTIMATE' : 'current'} delay. EV idle ≈ 0. Not a lifecycle assessment.</p>
    </div>`
        : ''
    }
  </div>

  ${
    advice && r.aqi
      ? `<div class="card">
    <h3 style="margin-top:0;">Asthma / sensitive-group AQI lens</h3>
    <p style="margin:0 0 8px;"><span class="tag">${escapeHtml(advice.category)}</span> <span class="hint">US AQI ${Math.round(r.aqi.usAqi)} · band ${escapeHtml(advice.band)} · PM2.5 ${r.aqi.pm25}</span></p>
    <p style="margin:0 0 6px;color:var(--muted)">${escapeHtml(advice.general)}</p>
    <p class="sensitive">${escapeHtml(advice.sensitive)}</p>
  </div>`
      : ''
  }

  <div class="card">
    <h3 style="margin-top:0;">Flow samples (TomTom)</h3>
    <ul class="list">
      ${
        r.flowSamples
          .map((f) => {
            const jam = f.relativeSpeed < 0.55;
            return `<li class="${jam ? 'jammy' : ''}">${f.currentSpeed.toFixed(0)}/${f.freeFlowSpeed.toFixed(0)} km/h · ${(f.relativeSpeed * 100).toFixed(0)}% of free-flow · confidence ${(f.confidence * 100).toFixed(0)}%${jam ? ' · <b>jammy</b>' : ''}</li>`;
          })
          .join('') || '<li>No flow samples</li>'
      }
    </ul>
  </div>

  <div class="card ${state.highlightMoves ? 'highlight-moves' : ''}" id="movesCard">
    <h3 style="margin-top:0;">Healthier moves</h3>
    <p class="hint" style="margin-top:0;">Minutes and idle CO₂ avoided are labeled ESTIMATE where noted. Logging adds to session + this-week ledger.</p>
    <div class="moves">
      ${moves
        .map(
          (m, i) => `
        <div class="move">
          <div class="move-head">
            <strong>${escapeHtml(m.title)}</strong>
            ${m.isEstimate ? '<span class="tag warn-tag">ESTIMATE</span>' : '<span class="tag">route</span>'}
          </div>
          <div class="metrics">
            <div class="metric"><b>${m.minutesEstimate} min</b><span>option time</span></div>
            <div class="metric ok"><b>${m.idleCo2AvoidedG} g</b><span>idle CO₂ avoided vs jam</span></div>
          </div>
          <p class="hint">${escapeHtml(m.note)}</p>
          <button type="button" class="secondary take-move" data-idx="${i}">I take this move — log avoided impact</button>
        </div>`,
        )
        .join('')}
    </div>
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Shareable impact receipt</h3>
    <p class="hint" style="margin-top:0;">Download a PNG card or JSON snapshot (delay / CO₂ / AQI / mode / timestamp).</p>
    <div class="row">
      <button type="button" id="dlPng">Download PNG</button>
      <button type="button" id="dlJson" class="secondary">Download JSON</button>
    </div>
  </div>
  `;
}

function wireEvents() {
  const preset = app.querySelector<HTMLSelectElement>('#preset');
  const origin = app.querySelector<HTMLInputElement>('#origin');
  const dest = app.querySelector<HTMLInputElement>('#dest');

  preset?.addEventListener('change', () => {
    const p = corridors.find((x) => x.id === preset.value);
    if (!p) return;
    state.presetId = p.id;
    state.origin = p.origin;
    state.dest = p.dest;
    if (origin) origin.value = p.origin;
    if (dest) dest.value = p.dest;
  });

  app.querySelector('#go')?.addEventListener('click', () => {
    persistInputsFromDom();
    void run(state.origin, state.dest, state.stops);
  });

  const rerender = () => {
    persistInputsFromDom();
    render();
  };

  app.querySelector('#rushMode')?.addEventListener('change', rerender);
  app.querySelector('#co2Factor')?.addEventListener('change', rerender);
  app.querySelector('#vehicle')?.addEventListener('change', rerender);
  app.querySelector('#departure')?.addEventListener('change', rerender);

  app.querySelector('#toggleCo2')?.addEventListener('click', () => {
    persistInputsFromDom();
    state.co2Expanded = !state.co2Expanded;
    render();
  });

  app.querySelector('#addStop')?.addEventListener('click', () => {
    persistInputsFromDom();
    state.stops = [...state.stops, ''];
    render();
  });

  app.querySelectorAll('.remove-stop').forEach((btn) => {
    btn.addEventListener('click', () => {
      persistInputsFromDom();
      const idx = Number((btn as HTMLElement).dataset.idx);
      state.stops = state.stops.filter((_, i) => i !== idx);
      render();
    });
  });

  app.querySelector('#saveCorridor')?.addEventListener('click', () => {
    persistInputsFromDom();
    const name = window.prompt('Name this corridor', `${state.origin} → ${state.dest}`);
    if (name == null) return;
    addCorridor(name, state.origin, state.dest);
    corridors = allCorridors();
    const last = corridors[corridors.length - 1];
    state.presetId = last.id;
    render();
  });

  app.querySelector('#deleteCorridor')?.addEventListener('click', () => {
    const cur = corridors.find((c) => c.id === state.presetId);
    if (!cur || cur.builtin) return;
    removeCorridor(cur.id);
    corridors = allCorridors();
    state.presetId = BUILTIN_PRESETS[0].id;
    state.origin = BUILTIN_PRESETS[0].origin;
    state.dest = BUILTIN_PRESETS[0].dest;
    render();
  });

  app.querySelector('#playTour')?.addEventListener('click', () => {
    void startJudgeTour();
  });
  app.querySelector('#cancelTour')?.addEventListener('click', () => {
    cancelTour();
    state.tourRunning = false;
    state.tourStatus = 'Demo cancelled';
    state.highlightMoves = false;
    render();
  });

  app.querySelectorAll('.take-move').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.result) return;
      persistInputsFromDom();
      const d = displayDelayFor(state.result);
      const moves = healthierMoves({
        delayMin: d.displayDelayMin,
        travelTimeSeconds: state.result.summary.travelTimeSeconds,
        lengthMeters: state.result.summary.lengthMeters,
        factor: state.co2Factor,
        vehicle: state.vehicle,
        alternate: state.result.alternate,
      });
      const idx = Number((btn as HTMLElement).dataset.idx);
      const m = moves[idx];
      if (!m) return;
      const savedMin =
        m.kind === 'bike' || m.kind === 'transit'
          ? d.displayDelayMin
          : m.kind === 'leave-later'
            ? Math.max(0, d.displayDelayMin * 0.65)
            : Math.max(0, d.displayDelayMin - (state.result.alternate?.trafficDelaySeconds || 0) / 60);
      const next = addAvoided(week, session, savedMin, m.idleCo2AvoidedG);
      week = next.week;
      session = next.session;
      saveWeekLedger(week);
      render();
    });
  });

  const receiptBits = () => {
    if (!state.result) return null;
    persistInputsFromDom();
    const d = displayDelayFor(state.result);
    const idleG = idleCo2Grams(d.displayDelayMin, state.co2Factor, state.vehicle);
    const advice = state.result.aqi ? aqiAdvice(state.result.aqi.usAqi) : undefined;
    return buildReceiptPayload(state.result, {
      rushHourMode: state.rushMode,
      displayDelayMin: d.displayDelayMin,
      delayIsEstimate: d.isEstimate,
      idleCo2G: idleG,
      co2Factor: state.co2Factor,
      vehicleClass: state.vehicle,
      aqiAdvice: advice,
    });
  };

  app.querySelector('#dlPng')?.addEventListener('click', () => {
    const p = receiptBits();
    if (p) downloadReceiptPng(p);
  });
  app.querySelector('#dlJson')?.addEventListener('click', () => {
    const p = receiptBits();
    if (p) downloadJson(p);
  });
}

async function run(origin: string, dest: string, stops: string[] = []) {
  state.busy = true;
  state.err = undefined;
  render();
  try {
    const result = await analyzeRoute(origin, dest, stops.filter(Boolean));
    if (!result.city) result.city = detectCityFromLabel(result.destinationLabel, result.originLabel);
    state.result = result;
    state.busy = false;
    render();
  } catch (e) {
    state.busy = false;
    state.err = e instanceof Error ? e.message : String(e);
    render();
  }
}

async function startJudgeTour() {
  if (state.tourRunning) return;
  state.tourRunning = true;
  state.highlightMoves = false;
  const steps: TourStep[] = [
    {
      id: 'preset',
      waitMs: 400,
      label: '1/7 Set LA school-run + stop',
      run: () => {
        state.presetId = 'la-school';
        state.origin = BUILTIN_PRESETS[0].origin;
        state.dest = BUILTIN_PRESETS[0].dest;
        state.stops = ['Dodger Stadium, Los Angeles, CA'];
        state.departure = 'now';
        render();
      },
    },
    {
      id: 'fetch',
      waitMs: 800,
      label: '2/7 Fetch live impact',
      run: async () => {
        await run(state.origin, state.dest, state.stops);
      },
    },
    {
      id: 'rush',
      waitMs: 1200,
      label: '3/7 Time-travel to 8am peak ESTIMATE',
      run: () => {
        state.rushMode = true;
        state.departure = 8;
        render();
      },
    },
    {
      id: 'co2',
      waitMs: 1200,
      label: '4/7 Expand CO₂ + SUV class',
      run: () => {
        state.co2Expanded = true;
        state.vehicle = 'suv';
        render();
        app.querySelector('#co2Card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    },
    {
      id: 'moves',
      waitMs: 1400,
      label: '5/7 Highlight healthier moves',
      run: () => {
        state.highlightMoves = true;
        render();
        app.querySelector('#movesCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    },
    {
      id: 'receipt',
      waitMs: 1400,
      label: '6/7 Download JSON receipt',
      run: () => {
        if (!state.result) return;
        const d = displayDelayFor(state.result);
        downloadJson(
          buildReceiptPayload(state.result, {
            rushHourMode: state.rushMode,
            displayDelayMin: d.displayDelayMin,
            delayIsEstimate: d.isEstimate,
            idleCo2G: idleCo2Grams(d.displayDelayMin, state.co2Factor, state.vehicle),
            co2Factor: state.co2Factor,
            vehicleClass: state.vehicle,
          }),
          'jambreath-demo-receipt.json',
        );
      },
    },
    {
      id: 'ledger',
      waitMs: 1200,
      label: '7/7 Scroll to impact ledger',
      run: () => {
        app.querySelector('#ledgerCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    },
  ];

  const outcome = await runTour(steps, (label) => {
    state.tourStatus = label;
    const banner = app.querySelector('.tour-banner');
    if (banner) banner.textContent = label;
    else render();
  });
  state.tourRunning = false;
  state.highlightMoves = false;
  state.tourStatus = outcome === 'done' ? 'Demo complete — explore freely' : 'Demo cancelled';
  render();
}

render();
