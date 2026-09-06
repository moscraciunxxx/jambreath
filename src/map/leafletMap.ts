import type { FlowSample, LatLng } from '../tomtom/types';
import { corridorMapSvg } from './corridorSvg';
import { hasTomTomKey } from '../tomtom/client';

export type MapHandle = {
  destroy: () => void;
  mode: 'leaflet' | 'svg';
};

type MountOpts = {
  container: HTMLElement;
  routePoints: LatLng[];
  flowSamples: FlowSample[];
  origin: LatLng;
  destination: LatLng;
  stopPoints?: LatLng[];
};

/**
 * Try Leaflet + OSM (or TomTom tiles if key). Fall back to SVG corridor map.
 */
export async function mountCorridorMap(opts: MountOpts): Promise<MapHandle> {
  const { container, routePoints, flowSamples, origin, destination, stopPoints = [] } = opts;
  container.innerHTML = '';

  try {
    const L = await import('leaflet');
    await import('leaflet/dist/leaflet.css');

    const pts =
      routePoints.length >= 2
        ? routePoints
        : [origin, ...flowSamples.map((f) => f.point), destination];

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    });

    const key = (import.meta.env.VITE_TOMTOM_API_KEY || '').trim();
    if (hasTomTomKey() && key) {
      L.tileLayer(
        `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
        {
          maxZoom: 19,
          attribution: '&copy; TomTom',
        },
      ).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
    }

    const latlngs = pts.map((p) => [p.lat, p.lon] as [number, number]);
    const line = L.polyline(latlngs, {
      color: '#3dffa8',
      weight: 4,
      opacity: 0.9,
    }).addTo(map);

    L.circleMarker([origin.lat, origin.lon], {
      radius: 7,
      color: '#0b1210',
      weight: 2,
      fillColor: '#ffe6a3',
      fillOpacity: 1,
    })
      .bindTooltip('Origin')
      .addTo(map);

    L.circleMarker([destination.lat, destination.lon], {
      radius: 7,
      color: '#0b1210',
      weight: 2,
      fillColor: '#7eb6ff',
      fillOpacity: 1,
    })
      .bindTooltip('Destination')
      .addTo(map);

    for (const s of stopPoints) {
      L.circleMarker([s.lat, s.lon], {
        radius: 6,
        color: '#0b1210',
        weight: 2,
        fillColor: '#c4a7ff',
        fillOpacity: 1,
      })
        .bindTooltip('Stop')
        .addTo(map);
    }

    for (const f of flowSamples) {
      const jammy = f.relativeSpeed < 0.55;
      L.circleMarker([f.point.lat, f.point.lon], {
        radius: 8,
        color: '#0b1210',
        weight: 2,
        fillColor: jammy ? '#ff6b6b' : '#3dffa8',
        fillOpacity: 1,
      })
        .bindTooltip(
          `${jammy ? 'jammy' : 'ok'}: ${(f.relativeSpeed * 100).toFixed(0)}% free-flow`,
        )
        .addTo(map);
    }

    map.fitBounds(line.getBounds().pad(0.18));
    // Leaflet needs a tick after layout
    setTimeout(() => map.invalidateSize(), 50);

    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Interactive corridor map with route and jammy markers');

    return {
      mode: 'leaflet',
      destroy: () => {
        map.remove();
        container.innerHTML = '';
      },
    };
  } catch (e) {
    console.warn('Leaflet failed; using SVG fallback', e);
    container.innerHTML = corridorMapSvg(routePoints, flowSamples, origin, destination);
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', 'SVG corridor map fallback');
    return {
      mode: 'svg',
      destroy: () => {
        container.innerHTML = '';
      },
    };
  }
}
