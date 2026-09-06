# JamBreath

Live traffic jams to idle CO2 estimates and healthier move suggestions (leave later, bike, transit, alternate route). Built for NextStep / Earth Forward with TomTom traffic + Open-Meteo AQI.

## Live demo

https://moscraciunxxx.github.io/jambreath/

## Judge path (2 minutes)

1. Open the demo (fixture mode works with no API key).
2. Pick a preset (e.g. LA school-run) and click Fetch live impact.
3. Read the corridor map, delay, idle CO2 (ESTIMATE), jammy segments, and AQH asthma lens.
4. Toggle Rush-hour / worst-of-day to frame a peak ESTIMATE shen live delay is low.
5. Expand the honest CO2 card and switch low/mid/high factors; try healthier moves and log impact.
6. Download a PNG/JSON receipt; check session + this-week ledger.
7. Optional: set a TomTom key locally (or as a GitHub Actions secret) for live Flow + Routing.

## Setup

Copy .env.example to .env and set VITE_TOMTOM_API_KEY if you have a TomTom key.

    cp .env.example .env
    npm install
    npm run dev

Without a key the app runs in fixture mode (realistic LA corridor demo).

### GitHub Pages + live key

1. Add repository secret VITE_TOMTOM_API_KEY (Settings — Secrets and variables — Actions).
2. In the TomTom developer portal, whitelist https://moscraciunxxx.github.io
3. The workflow .github/workflows/pages.yml passes the secret into the Vite build when present.
4. Never commit the key; .env stays gitignored. Without the secret, Pages stays in fixture mode.

## Features (upgrades)

- Corridor SVG map with route polyline + jammy flow markers (<5#% free-flow)
- Rush-hour / worst-of-day ESTIMATE framing (never claimed as fake live data)
- Healthier moves: alternate route, leave-later, bike, transit
- Asthma / sensitive-group AQI plain-language lens
- Honest CO2 card: 20 g/min mid, 10-40 range, low/mid/high toggle
- Shareable impact receipt (PNG + JSON)
- Saved corridors in localStorage (+ built-in school-run presets)
- Weekly cross-session ledger (ISO week) alongside session totals

## Scripts

- npm run dev – Vite dev server
- npm test – Vitest
- npm run typecheck – tsc --noEmit
- npm run build – Typecheck + production build
- GH_PAGES=1 npm run build – Build with /jambreath/ base for GitHub Pages

## Honesty note

Idle CO2 uses 20 g/min as the default mid passenger-car idle factor (common cites about 10-40 g/min). The UI exposes low/mid/high and labels everything as an ESTIMATE. Peak/rush framing is also labeled ESTIMATE when applied.

## Stack

TypeScript, Vite, Vitest, TomTom (optional), Open-Meteo AQH, GitHub Pages. Map is a lightweight SVG (no map SDK).

## Repo

https://github.com/moscraciunxxx/jambreath
