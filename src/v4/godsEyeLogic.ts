export type GodsEyeOpticalMode = 'standard' | 'flir' | 'nvg' | 'crt';
export type GodsEyeLayerId = 'earthquakes' | 'satellites' | 'aviation' | 'ground';

export interface GodsEyeTarget {
  id: string;
  layer: GodsEyeLayerId;
  name: string;
  lat: number;
  lon: number;
  altitudeKm: number;
  metricPrimary: string;
  metricSecondary: string;
  severity: 'nominal' | 'elevated' | 'critical';
  source: string;
  timestamp: string;
}

export interface GodsEyeRepoTelemetry {
  slug: string;
  url: string;
  stars: number | null;
  forks: number | null;
  language: string;
  license: string;
  pushedAt: string | null;
  description: string;
  liveVerified: boolean;
}

export interface GodsEyeFeedsSnapshot {
  fetchedAt: string;
  iss: {
    lat: number;
    lon: number;
    altitudeKm: number;
    velocityKmh: number;
    visibility: string;
    live: boolean;
  };
  targets: GodsEyeTarget[];
  counts: {
    earthquakes: number;
    satellites: number;
    aviation: number;
    ground: number;
  };
  feedHealth: {
    usgsEarthquakes: 'live' | 'fallback';
    issOrbital: 'live' | 'fallback';
    openSkyAviation: 'live' | 'rate_limited';
  };
  repos: GodsEyeRepoTelemetry[];
}

export const STRATEGIC_GROUND_NODES: ReadonlyArray<GodsEyeTarget> = [
  {
    id: 'ground-zulutronix-hq',
    layer: 'ground',
    name: 'ZULUTRONIX HQ · Pretoria',
    lat: -25.7479,
    lon: 28.2293,
    altitudeKm: 1.33,
    metricPrimary: 'Command Node',
    metricSecondary: 'TUT / Gauteng Sector',
    severity: 'nominal',
    source: 'B.A.R.B.I. Sovereign Grid',
    timestamp: 'LIVE',
  },
  {
    id: 'ground-jhb-sandton',
    layer: 'ground',
    name: 'JSE / Sandton FinTech Exchange',
    lat: -26.1076,
    lon: 28.0567,
    altitudeKm: 1.54,
    metricPrimary: 'Market Relay',
    metricSecondary: 'ZA Financial Hub',
    severity: 'nominal',
    source: 'B.A.R.B.I. Sovereign Grid',
    timestamp: 'LIVE',
  },
  {
    id: 'ground-cape-town',
    layer: 'ground',
    name: 'Cape Town Maritime & Cable Landing',
    lat: -33.9249,
    lon: 18.4241,
    altitudeKm: 0.02,
    metricPrimary: 'Subsea Telemetry',
    metricSecondary: 'WACS / Equiano Hub',
    severity: 'nominal',
    source: 'B.A.R.B.I. Sovereign Grid',
    timestamp: 'LIVE',
  },
  {
    id: 'ground-cape-canaveral',
    layer: 'ground',
    name: 'Cape Canaveral Spaceport',
    lat: 28.3922,
    lon: -80.6077,
    altitudeKm: 0.01,
    metricPrimary: 'Launch Corridor',
    metricSecondary: 'Orbital Tracking',
    severity: 'nominal',
    source: 'Global Telemetry Grid',
    timestamp: 'LIVE',
  },
  {
    id: 'ground-cern',
    layer: 'ground',
    name: 'CERN Geneva Sensor Node',
    lat: 46.233,
    lon: 6.0557,
    altitudeKm: 0.43,
    metricPrimary: 'Physics Grid',
    metricSecondary: 'EU Telemetry Anchor',
    severity: 'nominal',
    source: 'Global Telemetry Grid',
    timestamp: 'LIVE',
  },
];

export const OPTICAL_MODE_CONFIG: Record<
  GodsEyeOpticalMode,
  {
    label: string;
    shortLabel: string;
    globeColor: number;
    wireColor: number;
    atmosphereColor: number;
    accentHex: string;
    canvasFilter: string;
  }
> = {
  standard: {
    label: 'Tactical Obsidian',
    shortLabel: 'STD',
    globeColor: 0x0b1018,
    wireColor: 0xd97706,
    atmosphereColor: 0xf59e0b,
    accentHex: '#f59e0b',
    canvasFilter: 'none',
  },
  flir: {
    label: 'FLIR Thermal',
    shortLabel: 'FLIR',
    globeColor: 0x1a0814,
    wireColor: 0xf97316,
    atmosphereColor: 0xef4444,
    accentHex: '#fb923c',
    canvasFilter: 'contrast(1.28) saturate(1.55) hue-rotate(-14deg)',
  },
  nvg: {
    label: 'NVG Night Vision',
    shortLabel: 'NVG',
    globeColor: 0x04160b,
    wireColor: 0x22c55e,
    atmosphereColor: 0x4ade80,
    accentHex: '#4ade80',
    canvasFilter: 'contrast(1.18) saturate(1.35)',
  },
  crt: {
    label: 'CRT Orbital Radar',
    shortLabel: 'RADAR',
    globeColor: 0x06131a,
    wireColor: 0x38bdf8,
    atmosphereColor: 0x0ea5e9,
    accentHex: '#38bdf8',
    canvasFilter: 'contrast(1.15) saturate(1.15)',
  },
};

export function latLonToVector3(latDeg: number, lonDeg: number, radius: number): { x: number; y: number; z: number } {
  const clampedLat = Math.max(-89.9, Math.min(89.9, latDeg));
  const phi = ((90 - clampedLat) * Math.PI) / 180;
  const theta = ((lonDeg + 180) * Math.PI) / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return { x, y, z };
}

export function normalizeUsgsEarthquakes(geojson: unknown, limit = 28): GodsEyeTarget[] {
  if (!geojson || typeof geojson !== 'object') return [];
  const features = (geojson as { features?: unknown[] }).features;
  if (!Array.isArray(features)) return [];

  const parsed: GodsEyeTarget[] = [];
  for (const item of features) {
    if (!item || typeof item !== 'object') continue;
    const f = item as {
      id?: string;
      properties?: { mag?: number | null; place?: string | null; time?: number | null };
      geometry?: { coordinates?: number[] };
    };
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    const depthKm = Number(coords[2] ?? 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const mag = typeof f.properties?.mag === 'number' && Number.isFinite(f.properties.mag) ? f.properties.mag : 0;

    parsed.push({
      id: `eq-${String(f.id || parsed.length)}`,
      layer: 'earthquakes',
      name: String(f.properties?.place || `Seismic Event (${lat.toFixed(1)}, ${lon.toFixed(1)})`),
      lat,
      lon,
      altitudeKm: 0,
      metricPrimary: `M ${mag.toFixed(1)}`,
      metricSecondary: `Depth ${Math.max(0, depthKm).toFixed(1)} km`,
      severity: mag >= 5.0 ? 'critical' : mag >= 3.5 ? 'elevated' : 'nominal',
      source: 'USGS Live GeoJSON',
      timestamp: f.properties?.time ? new Date(f.properties.time).toISOString() : new Date().toISOString(),
    });
  }

  return parsed
    .sort((a, b) => parseFloat(b.metricPrimary.replace(/[^0-9.-]/g, '')) - parseFloat(a.metricPrimary.replace(/[^0-9.-]/g, '')))
    .slice(0, limit);
}

export function normalizeIssTelemetry(raw: unknown): GodsEyeFeedsSnapshot['iss'] | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lat = Number(r.latitude);
  const lon = Number(r.longitude);
  const altitudeKm = Number(r.altitude ?? 420);
  const velocityKmh = Number(r.velocity ?? 27580);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    lat,
    lon,
    altitudeKm: Number.isFinite(altitudeKm) ? altitudeKm : 420,
    velocityKmh: Number.isFinite(velocityKmh) ? velocityKmh : 27580,
    visibility: typeof r.visibility === 'string' ? r.visibility : 'daylight',
    live: true,
  };
}

export function normalizeOpenSkyStates(raw: unknown, limit = 18): GodsEyeTarget[] {
  if (!raw || typeof raw !== 'object') return [];
  const states = (raw as { states?: unknown[] }).states;
  if (!Array.isArray(states)) return [];

  const targets: GodsEyeTarget[] = [];
  for (const row of states) {
    if (!Array.isArray(row) || row.length < 10) continue;
    const icao = String(row[0] || '').trim();
    const callsign = String(row[1] || icao || 'AIRCRAFT').trim();
    const origin = String(row[2] || 'INTL').trim();
    const lon = Number(row[5]);
    const lat = Number(row[6]);
    const baroAltM = Number(row[7] ?? 10000);
    const velocityMs = Number(row[9] ?? 220);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    targets.push({
      id: `adsb-${icao || targets.length}`,
      layer: 'aviation',
      name: `${callsign} (${origin})`,
      lat,
      lon,
      altitudeKm: Number.isFinite(baroAltM) ? Math.max(0.2, baroAltM / 1000) : 10,
      metricPrimary: `FL${Math.round((Number.isFinite(baroAltM) ? baroAltM : 10000) * 0.0328084)}`,
      metricSecondary: `${Math.round((Number.isFinite(velocityMs) ? velocityMs : 220) * 3.6)} km/h`,
      severity: 'nominal',
      source: 'OpenSky ADS-B Live',
      timestamp: new Date().toISOString(),
    });
    if (targets.length >= limit) break;
  }
  return targets;
}

export function formatCoordPair(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}
