#!/usr/bin/env bash
# Generate ≤60s JamBreath narration (macOS `say`) + optional narrated mp4.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/demo-assets"
mkdir -p "$OUT"

SCRIPT=$(cat <<'EOF'
JamBreath turns live traffic jams into air and climate impact.
Fetch a school-run corridor with optional stops, see Leaflet map tiles and jammy markers.
Time-travel the departure hour for peak and off-peak estimates — always labeled honestly.
Calibrate idle CO2 by vehicle class: compact, mid, SUV, hybrid, or EV.
Play the sixty-second judge demo, then download a shareable impact receipt.
EOF
)

AIFF="$OUT/narration.aiff"
WAV="$OUT/narration.wav"
echo "Speaking narration → $AIFF"
say -v Samantha -r 180 -o "$AIFF" "$SCRIPT"

if command -v afconvert >/dev/null 2>&1; then
  afconvert -f WAVE -d LEI16 "$AIFF" "$WAV"
  echo "Wrote $WAV"
fi

DEMO_MP4="$OUT/jambreath-demo-v2.mp4"
MUXED="$OUT/jambreath-demo-narrated.mp4"
if command -v ffmpeg >/dev/null 2>&1 && [[ -f "$DEMO_MP4" ]]; then
  AUDIO_IN="$AIFF"
  [[ -f "$WAV" ]] && AUDIO_IN="$WAV"
  echo "Muxing → $MUXED"
  ffmpeg -y -i "$DEMO_MP4" -i "$AUDIO_IN" -c:v copy -c:a aac -shortest -map 0:v:0 -map 1:a:0 "$MUXED" </dev/null
  echo "Wrote $MUXED"
else
  echo "Skip mp4 mux (need ffmpeg + existing demo mp4). Audio ready."
fi
echo "Done. Parent handles any video upload separately."
