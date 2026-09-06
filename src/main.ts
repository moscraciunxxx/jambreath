import './style.css';
import { analyzeRoute, hasTomTomKey } from './tomtom/client';
import type { JamBreathResult } from './tomtom/types';
import {
  CO2_FACTORS,
  CO2_RANGE_NOTE,
  co2RangeGrams,
  idleCo2Grams,
  type Co2FactorLevel,
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
import { buildReceiptPayload, downloadJson, downloadReceiptPng } from './receipt/export';

type UiState = {
  result?: JamBreathResult;
  busy: boolean;
  err?: string;
  rushMode: boolean;
  co2Factor: Co2FactorLevel;
  co2Expanded: boolean;
  origin: string;
  dest: string;
  presetId: string;
};

const app = document.querySelector<HTMLDivElement>('#app')!;

let session = { delayAvoidedMin: 0, co2AvoidedG: 0 };
let week: WeekBucket = loadWeekLedger();
let corridors: Corridor[] = allCorridors();

const state: UiState = {
  busy: false,
  rushMode: false,
  co2Factor: 'mid',
  co2Expanded: false,
  origin: BUILTIN_PRESETS[0].origin,
  dest: BUILTIN_PRESETS[0].dest,
  presetId: BUILTIN_PRESETS[0].id,
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMin(sec: number): string {
  return `${Math.round(sec / 60)} min`;
}

function persistInputsFromDom() {
  const o = app.querySelector<HTMLInputElement>('#origin');
  const d = app.querySelector<HTMLInputElement>('#dest');
  const p = app.querySelector<HTMLSelectElement>('#preset');
  const rush = app.querySelector<HTMLInputElement>('#rushMode');
  const factor = app.querySelector<HTMLSelectElement>('#co2Factor');
  if (o) state.origin = o.value;
  if (d) state.dest = d.value;
  if (p) state.presetId = p.value;
  if (rush) state.rushMode = rush.checked;
  if (factor) state.co2Factor = factor.value as Co2FactorLevel;
}

function render() {
  const live = hasTomTomKey();
  const { result, busy, err } = state;

  app.innerHTML = `
  <div class="wrap">
    <p class="tag">NextStep · Earth Forward</p>
    <h1>JamBreath</h1>
    <p class="thesis">Live traffic jams are an air problem and a climate problem. JamBreath pulls <b>TomTom</b> congestion, estimates idle CO₂ from delay, checks corridor AQI, and helps you pick a healthier move — leave later, bike, transit, or an alternate route.</p>
    ${live ? '' : `<div class="banner"><b>Fixture mode</b> — add <code>VITE_TOMTOM_API_KEY</code> for live TomTom jams. Demo still runs with a realistic LA corridor.</div>`}

    <div class="card">
      <div class="row">
        <label>Origin<input id="origin" value="${escapeHtml(state.origin)}" /></label>
        <label>Destination<input id="dest" value="${escapeHtml(state.dest)}" /></label>
      </div>
      <div class="row" style="margin-top:10px; align-items:flex-end;">
        <label>Corridor
          <select id="preset">
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
      <div class="row toolbar" style="margin-top:12px; align-items:center;">
        <label class="check"><input type="checkbox" id="rushMode" ${state.rushMode ? 'checked' : ''}/> Rush-hour / worst-of-day framing</label>
        <button type="button" id="saveCorridor" class="secondary">Save corridor</button>
        <button type="button" id="deleteCorridor" class="secondary" ${corridors.find((c) => c.id === state.presetId)?.builtin !== false && corridors.find((c) => c.id === state.presetId)?.builtin ? 'disabled' : ''}>Delete saved</button>
      </div>
      <p class="hint">Saved corridors stay in this browser (localStorage). Built-in presets include school-run defaults.</p>
    </div>

    ${err ? `<div class="banner">${escapeHtml(err)}</div>` : ''}
    ${result ? renderResult(result) : ''}

    <div class="card">
      <h3 style="margin:0 0 8px;">Impact ledger</h3>
      <div class="metrics">
        <div class="metric ok"><b>${session.delayAvoidedMin.toFixed(0)}</b><span>session · delay min avoided</span></div>
        <div class="metric ok"><b>${session.co2AvoidedG}</b><span>session · g CO₂ avoided (ESTIMATE)</span></div>
        <div class="metric ok"><b>${week.delayAvoidedMin.toFixed(0)}</b><span>this week (${escapeHtml(week.week)}) · delay min</span></div>
        <div class="metric ok"><b>${week.co2AvoidedG}</b><span>this week · g CO₂ avoided (ESTIMATE)</span></div>
      </div>
    </div>

    <p class="foot">Idle CO₂ uses a selectable 10 / 20 / 40 g/min passenger-car factor — labeled ESTIMATE. AQI via Open-Meteo. Traffic via TomTom Flow Segment + Routing when a key is set. Source: <a href="https://github.com/moscraciunxxx/jambreath">github.com/moscraciunxxx/jambreath</a></p>
  </div>`;

  wireEvents();
}

function renderResult(r: JamBreathResult): string {
  const peak = peakHourEstimate(r.delayMin, state.rushMode);
  const displayDelay = peak.displayDelayMin;
  const idleG = idleCo2Grams(displayDelay, state.co2Factor);
  const range = co2RangeGrams(displayDelay);
  const delayClass = displayDelay >= 12 ? 'bad' : displayDelay >= 5 ? 'warn' : 'ok';
  const advice = r.aqi ? aqiAdvice(r.aqi.usAqi) : undefined;
  const moves = healthierMoves({
    delayMin: displayDelay,
    travelTimeSeconds: r.summary.travelTimeSeconds,
    lengthMeters: r.summary.lengthMeters,
    factor: state.co2Factor,
    alternate: r.alternate,
  });
  const map = corridorMapSvg(r.routePoints || [], r.flowSamples, r.origin, r.destination);

  return `
  <div class="card">
    <div class="row" style="justify-content:space-between; align-items:baseline;">
      <div>
        <div class="tag">${r.mode === 'live' ? 'LIVE TomTom' : 'FIXTURE'}</div>
        ${peak.isEstimate ? `<div class="tag warn-tag">PEAK ESTIMATE</div>` : ''}
        <h2 style="margin:8px 0 0; font-size:1.1rem;">${escapeHtml(r.originLabel)} → ${escapeHtml(r.destinationLabel)}</h2>
      </div>
      <small style="color:var(--muted)">${new Date(r.fetchedAt).toLocaleString()}</small>
    </div>
    ${
      state.rushMode
        ? `<p class="hint" style="margin-top:10px;"><b>${escapeHtml(peak.label)}</b>${
            peak.isEstimate
              ? ` · live delay was ${peak.liveDelayMin.toFixed(1)} min — figures below are framed as rush/worst-of-day <em>ESTIMATE</em>, not fake live data.`
              : ''
          }</p>`
        : ''
    }
    <div class="metrics" style="margin-top:12px;">
      <div class="metric"><b>${fmtMin(r.summary.travelTimeSeconds)}</b><span>travel time</span></div>
      <div class="metric ${delayClass}"><b>${displayDelay.toFixed(1)} min</b><span>${peak.isEstimate ? 'peak delay ESTIMATE' : 'traffic delay'}</span></div>
      <div class="metric ${delayClass}"><b>${idleG} g</b><span>idle CO₂ ESTIMATE (${state.co2Factor})</span></div>
      <div class="metric"><b>${r.jammyCount}/${r.flowSamples.length}</b><span>jammy segments (&lt;55% free-flow)</span></div>
      ${r.aqi ? `<div class="metric"><b>${Math.round(r.aqi.usAqi)}</b><span>US AQI · ${escapeHtml(advice?.category || '')}</span></div>` : ''}
    </div>
  </div>

  <div class="card">
    <h3 style="margin-top:0;">Corridor map</h3>
    <div class="map-wrap">${map}</div>
  </div>

  <div class="card">
    <div class="row" style="justify-content:space-between; align-items:center;">
      <h3 style="margin:0;">Honest CO₂ card</h3>
      <button type="button" id="toggleCo2" class="secondary">${state.co2Expanded ? 'Hide details' : 'Show sources & range'}</button>
    </div>
    <div class="row" style="margin-top:10px; align-items:flex-end;">
      <label>Idle factor
        <select id="co2Factor">
          <option value="low" ${state.co2Factor === 'low' ? 'selected' : ''}>Low · ${CO2_FACTORS.low} g/min</option>
          <option value="mid" ${state.co2Factor === 'mid' ? 'selected' : ''}>Mid · ${CO2_FACTORS.mid} g/min (default)</option>
          <option value="high" ${state.co2Factor === 'high' ? 'selected' : ''}>High · ${CO2_FACTORS.high} g/min</option>
        </select>
      </label>
      <div class="metrics" style="flex:2;">
        <div class="metric"><b>${idleG} g</b><span>with ${state.co2Factor} factor</span></div>
      </div>
    </div>
    ${
      state.co2Expanded
        ? `<div class="co2-panel">
      <p>${escapeHtml(CO2_RANGE_NOTE)}</p>
      <div class="metrics">
        <div class="metric"><b>${range.low} g</b><span>low (10 g/min)</span></div>
        <div class="metric"><b>${range.mid} g</b><span>mid (20 g/min)</span></div>
        <div class="metric"><b>${range.high} g</b><span>high (40 g/min)</span></div>
      </div>
      <p class="hint">Recomputes from ${displayDelay.toFixed(1)} min of ${peak.isEstimate ? 'peak-estimate' : 'current'} delay. Not a lifecycle assessment.</p>
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

  <div class="card">
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
    void run(state.origin, state.dest);
  });

  app.querySelector('#rushMode')?.addEventListener('change', () => {
    persistInputsFromDom();
    render();
  });

  app.querySelector('#co2Factor')?.addEventListener('change', () => {
    persistInputsFromDom();
    render();
  });

  app.querySelector('#toggleCo2')?.addEventListener('click', () => {
    persistInputsFromDom();
    state.co2Expanded = !state.co2Expanded;
    render();
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

  app.querySelectorAll('.take-move').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!state.result) return;
      persistInputsFromDom();
      const peak = peakHourEstimate(state.result.delayMin, state.rushMode);
      const moves = healthierMoves({
        delayMin: peak.displayDelayMin,
        travelTimeSeconds: state.result.summary.travelTimeSeconds,
        lengthMeters: state.result.summary.lengthMeters,
        factor: state.co2Factor,
        alternate: state.result.alternate,
      });
      const idx = Number((btn as HTMLElement).dataset.idx);
      const m = moves[idx];
      if (!m) return;
      const savedMin =
        m.kind === 'bike' || m.kind === 'transit'
          ? peak.displayDelayMin
          : m.kind === 'leave-later'
            ? Math.max(0, peak.displayDelayMin * 0.65)
            : Math.max(0, peak.displayDelayMin - (state.result.alternate?.trafficDelaySeconds || 0) / 60);
      const savedG = m.idleCo2AvoidedG;
      const next = addAvoided(week, session, savedMin, savedG);
      week = next.week;
      session = next.session;
      saveWeekLedger(week);
      render();
    });
  });

  const receiptBits = () => {
    if (!state.result) return null;
    persistInputsFromDom();
    const peak = peakHourEstimate(state.result.delayMin, state.rushMode);
    const idleG = idleCo2Grams(peak.displayDelayMin, state.co2Factor);
    const advice = state.result.aqi ? aqiAdvice(state.result.aqi.usAqi) : undefined;
    return buildReceiptPayload(state.result, {
      rushHourMode: state.rushMode,
      displayDelayMin: peak.displayDelayMin,
      delayIsEstimate: peak.isEstimate,
      idleCo2G: idleG,
      co2Factor: state.co2Factor,
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

async function run(origin: string, dest: string) {
  state.busy = true;
  state.err = undefined;
  render();
  try {
    const result = await analyzeRoute(origin, dest);
    state.result = result;
    state.busy = false;
    render();
  } catch (e) {
    state.busy = false;
    state.err = e instanceof Error ? e.message : String(e);
    render();
  }
}

render();
