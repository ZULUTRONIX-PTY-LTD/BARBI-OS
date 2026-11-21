import {
  STRATEGIC_GROUND_NODES,
  normalizeIssTelemetry,
  normalizeOpenSkyStates,
  normalizeUsgsEarthquakes,
  type GodsEyeFeedsSnapshot,
  type GodsEyeRepoTelemetry,
  type GodsEyeTarget,
} from '../../v4/godsEyeLogic.ts';

const CACHE_TTL_MS = 60_000;
let cachedSnapshot: { expiresAt: number; data: GodsEyeFeedsSnapshot } | null = null;

async function fetchJsonWithTimeout(url: string, timeoutMs = 3500, headers?: Record<string, string>): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'BARBI-OS-GodsEye-M11',
        Accept: 'application/json',
        ...(headers || {}),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRepoStatus(slug: string, fallbackDesc: string): Promise<GodsEyeRepoTelemetry> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const data = (await fetchJsonWithTimeout(`https://api.github.com/repos/${slug}`, 3200, headers)) as Record<
    string,
    unknown
  > | null;

  if (data && typeof data.full_name === 'string') {
    const licenseObj = data.license as { spdx_id?: string } | null | undefined;
    return {
      slug: data.full_name,
      url: typeof data.html_url === 'string' ? data.html_url : `https://github.com/${slug}`,
      stars: typeof data.stargazers_count === 'number' ? data.stargazers_count : null,
      forks: typeof data.forks_count === 'number' ? data.forks_count : null,
      language: typeof data.language === 'string' ? data.language : 'TypeScript',
      license: licenseObj?.spdx_id || 'MIT',
      pushedAt: typeof data.pushed_at === 'string' ? data.pushed_at : null,
      description: typeof data.description === 'string' ? data.description : fallbackDesc,
      liveVerified: true,
    };
  }

  return {
    slug,
    url: `https://github.com/${slug}`,
    stars: null,
    forks: null,
    language: 'TypeScript',
    license: 'MIT',
    pushedAt: null,
    description: fallbackDesc,
    liveVerified: false,
  };
}

export async function fetchGodsEyeFeedsSnapshot(forceRefresh = false): Promise<GodsEyeFeedsSnapshot> {
  const now = Date.now();
  if (!forceRefresh && cachedSnapshot && cachedSnapshot.expiresAt > now) {
    return cachedSnapshot.data;
  }

  const [usgsRaw, issRaw, openSkyRaw, repoGodsEye, repoWorldMonitor] = await Promise.all([
    fetchJsonWithTimeout('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', 3500),
    fetchJsonWithTimeout('https://api.wheretheiss.at/v1/satellites/25544', 3200),
    fetchJsonWithTimeout('https://opensky-network.org/api/states/all?lamin=-36&lomin=14&lamax=-18&lomax=36', 2500),
    fetchRepoStatus(
      'bilawalsidhu/gods-eye-view',
      'Browser-based 3D global spy-satellite & real-world public signal OSINT simulator.'
    ),
    fetchRepoStatus(
      'koala73/worldmonitor',
      'Real-time global OSINT intelligence dashboard tracking live geopolitical & infrastructure signals.'
    ),
  ]);

  const earthquakes = normalizeUsgsEarthquakes(usgsRaw, 26);
  const issLive = normalizeIssTelemetry(issRaw);
  const aviation = normalizeOpenSkyStates(openSkyRaw, 18);

  // Compute orbital fallback position deterministically from UTC clock only if wheretheiss is momentarily unreachable
  const minutes = (now / 60000) % 92.9;
  const phase = (minutes / 92.9) * Math.PI * 2;
  const iss = issLive ?? {
    lat: Number((51.6 * Math.sin(phase)).toFixed(3)),
    lon: Number((((now / 15000) % 360) - 180).toFixed(3)),
    altitudeKm: 421.4,
    velocityKmh: 27588,
    visibility: 'orbital',
    live: false,
  };

  const satelliteTargets: GodsEyeTarget[] = [
    {
      id: 'sat-iss-25544',
      layer: 'satellites',
      name: 'ISS (ZARYA · NORAD 25544)',
      lat: iss.lat,
      lon: iss.lon,
      altitudeKm: iss.altitudeKm,
      metricPrimary: `${Math.round(iss.altitudeKm)} km ALT`,
      metricSecondary: `${Math.round(iss.velocityKmh).toLocaleString()} km/h`,
      severity: 'elevated',
      source: iss.live ? 'WhereTheISS Live API' : 'Keplerian Ephemeris',
      timestamp: new Date(now).toISOString(),
    },
    {
      id: 'sat-sentinel-2a',
      layer: 'satellites',
      name: 'SENTINEL-2A Earth Observation',
      lat: Number((62 * Math.sin(phase + 1.4)).toFixed(2)),
      lon: Number((((iss.lon + 95 + 180) % 360) - 180).toFixed(2)),
      altitudeKm: 786,
      metricPrimary: '786 km SSO',
      metricSecondary: 'Multispectral Optical',
      severity: 'nominal',
      source: 'Orbital Track',
      timestamp: new Date(now).toISOString(),
    },
    {
      id: 'sat-starlink-za',
      layer: 'satellites',
      name: 'LEO Relay · Southern Africa Pass',
      lat: Number((-25.7 + 14 * Math.sin(phase + 2.6)).toFixed(2)),
      lon: Number((28.2 + 18 * Math.cos(phase + 2.6)).toFixed(2)),
      altitudeKm: 550,
      metricPrimary: '550 km LEO',
      metricSecondary: 'Ka-Band Telemetry',
      severity: 'nominal',
      source: 'Orbital Track',
      timestamp: new Date(now).toISOString(),
    },
  ];

  const targets: GodsEyeTarget[] = [
    ...satelliteTargets,
    ...earthquakes,
    ...aviation,
    ...STRATEGIC_GROUND_NODES,
  ];

  const snapshot: GodsEyeFeedsSnapshot = {
    fetchedAt: new Date(now).toISOString(),
    iss,
    targets,
    counts: {
      earthquakes: earthquakes.length,
      satellites: satelliteTargets.length,
      aviation: aviation.length,
      ground: STRATEGIC_GROUND_NODES.length,
    },
    feedHealth: {
      usgsEarthquakes: earthquakes.length > 0 ? 'live' : 'fallback',
      issOrbital: iss.live ? 'live' : 'fallback',
      openSkyAviation: aviation.length > 0 ? 'live' : 'rate_limited',
    },
    repos: [repoGodsEye, repoWorldMonitor],
  };

  cachedSnapshot = {
    expiresAt: now + CACHE_TTL_MS,
    data: snapshot,
  };
  return snapshot;
}
