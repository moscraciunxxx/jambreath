# JamBreath

Live traffic jams to idle CO2 estimates and healthier move suggestions (leave later, alternate route, or skip the queue). Built for NextStep / Earth Forward with TomTom traffic + Open-Meteo AQI.

## Live demo

https://moscraciunxxx.github.io/jambreath/

## Judge path (2 minutes)

1. Open the demo (fixture mode works with no API key).
2. Pick a preset (e.g. LA downtown to Echo Park) and click Fetch live impact.
3. Read delay minutes, idle CO2 (ESTIMATE), jammy segments, and AQI.
4. Mark a healthier action to add avoided delay/CO2 to the session ledger.
5. Optional: set a TomTom key locally for live Flow Segment + Routing.

## Setup

Copy .env.example to .env and set VITE_TOMTOM_API_KEY if you have a TomTom key.

    cp .env.example .env
    npm install
    npm run dev

Without a key the app runs in fixture mode (realistic LA corridor demo).

## Scripts

- `npm run dev` — Vite dev server
- `npm test` — Vitest (impact math + fixture)
- `npm run typecheck` — tsc --noEmit
- `npm run build` — Typecheck + production build
- `GH_PAGES=1 npm run build` — Build with /jambreath/ base for GitHub Pages

## Honesty note

Idle CO2 uses **20 g/min** as a mid passenger-car idle factor (common cites about 10-40 g/min). This is an **ESTIMATE**, not a lifecycle assessment — the UI labels it as such.

## Stack

TypeScript, Vite, Vitest, TomTom (optional), Open-Meteo AQI, GitHub Pages.

## Repo

https://github.com/moscraciunxxx/jambreath
