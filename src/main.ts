import './style.css';
import { analyzeRoute, hasTomTomKey } from './tomtom/client';
import type { JamBreathResult } from './tomtom/types';
import { idleCo2Grams } from './impact/co2';

const PRESETS = [
  { id: 'la-school', origin: 'Downtown Los Angeles, CA', dest: 'Echo Park, Los Angeles, CA', label: 'LA downtown → Echo Park' },
  { id: 'sf', origin: 'Financial District, San Francisco, CA', dest: 'Mission District, San Francisco, CA', label: 'SF Financial → Mission' },
  { id: 'seattle', origin: 'Downtown Seattle, WA', dest: 'University District, Seattle, WA', label: 'Seattle downtown → U-District' },
];

type Ledger = { delayAvoidedMin: number; co2AvoidedG: number };

const ledger: Ledger = loadLedger();

const app = document.querySelector<HTMLDivElement>('#app')!;

function loadLedger(): Ledger {
  try {
    return JSON.parse(localStorage.getItem('jambreath-ledger') || '{"delayAvoidedMin":0,"co2AvoidedG":0}');
  } catch {
    return { delayAvoidedMin: 0, co2AvoidedG: 0 };
  }
}
function saveLedger() {
  localStorage.setItem('jambreath-ledger', JSON.stringify(ledger));
}

function fmtMin(sec: number): string {
  return `${Math.round(sec / 60)} min`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render(result?: JamBreathResult, busy = false, err?: string) {
  const live = hasTomTomKey();
  const originVal = (document.querySelector('#origin') as HTMLInputElement | null)?.value || PRESETS[0].origin;
  const destVal = (document.querySelector('#dest') as HTMLInputElement | null)?.value || PRESETS[0].dest;
  const presetVal = (document.querySelector('#preset') as HTMLSelectElement | null)?.value || PRESETS[0].id;

  app.innerHTML = `
  <div class="wrap">
    <p class="tag">NextStep · Earth Forward</p>
    <h1>JamBreath</h1>
    <p class="thesis">Live traffic jams are an air problem and a climate problem. JamBreath pulls <b>TomTom</b> congestion, estimates idle CO₂ from delay, checks corridor AQI, and helps you pick a healthier move — leave later, alternate route, or don’t sit in the queue.</p>
    ${live ? '' : `<div class="banner"><b>Fixture mode</b> — add <code>VITE_TOMTOM_API_KEY</code> for live TomTom jams. Demo still runs with a realistic LA corridor.</div>`}
    <div class="card">
      <div class="row">
        <label>Origin<input id="origin" value="${escapeHtml(originVal)}" /></label>
        <label>Destination<input id="dest" value="${escapeHtml(destVal)}" /></label>
      </div>
      <div class="row" style="margin-top:10px; align-items:center;">
        <label>Preset
          <select id="preset">
            ${PRESETS.map((p) => `<option value="${p.id}" ${p.id === presetVal ? 'selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </label>
        <button id="go" ${busy ? 'disabled' : ''}>${busy ? 'Listening to jams…' : 'Fetch live impact'}</button>
      </div>
    </div>
    ${err ? `<div class="banner">${escapeHtml(err)}</div>` : ''}
    ${result ? renderResult(result) : ''}
    <div class="card">
      <h3 style="margin:0 0 8px;">Your session impact ledger</h3>
      <div class="metrics">
        <div class="metric ok"><b>${ledger.delayAvoidedMin.toFixed(0)}</b><span>delay minutes avoided</span></div>
        <div class="metric ok"><b>${ledger.co2AvoidedG}</b><span>g CO₂ avoided (ESTIMATE)</span></div>
      </div>
    </div>
    <p class="foot">Idle CO₂ uses 20 g/min passenger-car mid estimate — labeled ESTIMATE. AQI via Open-Meteo. Traffic via TomTom Flow Segment + Routing when a key is set. Source: <a href="https://github.com/moscraciunxxx/jambreath">github.com/moscraciunxxx/jambreath</a></p>
  </div>`;

  const preset = app.querySelector<HTMLSelectElement>('#preset')!;
  const origin = app.querySelector<HTMLInputElement>('#origin')!;
  const dest = app.querySelector<HTMLInputElement>('#dest')!;
  preset.addEventListener('change', () => {
    const p = PRESETS.find((x) => x.id === preset.value)!;
    origin.value = p.origin;
    dest.value = p.dest;
  });
  app.querySelector('#go')!.addEventListener('click', () => void run(origin.value, dest.value));
  app.querySelector('#takeAlt')?.addEventListener('click', () => {
    if (!result?.alternate) return;
    const savedMin = Math.max(0, result.delayMin - result.alternate.trafficDelaySeconds / 60);
    const savedG = idleCo2Grams(savedMin);
    ledger.delayAvoidedMin += savedMin;
    ledger.co2AvoidedG += savedG;
    saveLedger();
    render(result);
  });
}

function renderResult(r: JamBreathResult): string {
  const delayClass = r.delayMin >= 12 ? 'bad' : r.delayMin >= 5 ? 'warn' : 'ok';
  return `
  <div class="card">
    <div class="row" style="justify-content:space-between; align-items:baseline;">
      <div>
        <div class="tag">${r.mode === 'live' ? 'LIVE TomTom' : 'FIXTURE'}</div>
        <h2 style="margin:8px 0 0; font-size:1.1rem;">${escapeHtml(r.originLabel)} → ${escapeHtml(r.destinationLabel)}</h2>
      </div>
      <small style="color:var(--muted)">${new Date(r.fetchedAt).toLocaleString()}</small>
    </div>
    <div class="metrics" style="margin-top:12px;">
      <div class="metric"><b>${fmtMin(r.summary.travelTimeSeconds)}</b><span>travel time</span></div>
      <div class="metric ${delayClass}"><b>${r.delayMin.toFixed(1)} min</b><span>traffic delay</span></div>
      <div class="metric ${delayClass}"><b>${r.idleCo2G} g</b><span>idle CO₂ ESTIMATE</span></div>
      <div class="metric"><b>${r.jammyCount}/${r.flowSamples.length}</b><span>jammy segments (&lt;55% free-flow)</span></div>
      ${r.aqi ? `<div class="metric"><b>${Math.round(r.aqi.usAqi)}</b><span>US AQI near corridor (PM2.5 ${r.aqi.pm25})</span></div>` : ''}
    </div>
  </div>
  <div class="card">
    <h3 style="margin-top:0;">Flow samples (TomTom)</h3>
    <ul class="list">
      ${r.flowSamples.map((f) => `<li>${f.currentSpeed.toFixed(0)}/${f.freeFlowSpeed.toFixed(0)} km/h · ${(f.relativeSpeed * 100).toFixed(0)}% of free-flow · confidence ${(f.confidence * 100).toFixed(0)}%</li>`).join('') || '<li>No flow samples</li>'}
    </ul>
  </div>
  ${r.alternate ? `
  <div class="card">
    <h3 style="margin-top:0;">Healthier move</h3>
    <p style="margin-top:0;color:var(--muted)">${escapeHtml(r.alternate.note)}</p>
    <div class="metrics">
      <div class="metric ok"><b>${fmtMin(r.alternate.travelTimeSeconds)}</b><span>alt travel</span></div>
      <div class="metric ok"><b>${(r.alternate.trafficDelaySeconds / 60).toFixed(1)} min</b><span>alt delay</span></div>
    </div>
    <button id="takeAlt" class="secondary" style="margin-top:10px;">I take this move — log avoided impact</button>
  </div>` : ''}
  `;
}

async function run(origin: string, dest: string) {
  render(undefined, true);
  try {
    const result = await analyzeRoute(origin, dest);
    render(result);
  } catch (e) {
    render(undefined, false, e instanceof Error ? e.message : String(e));
  }
}

render();
