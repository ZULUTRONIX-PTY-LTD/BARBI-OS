import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import * as THREE from 'three';
import {
  Crosshair,
  ExternalLink,
  Eye,
  FolderGit2,
  Globe,
  Layers,
  Plus,
  Radio,
  RefreshCw,
  Satellite,
  X,
} from 'lucide-react';
import { barbiApi } from '../api/barbiClient';
import {
  OPTICAL_MODE_CONFIG,
  STRATEGIC_GROUND_NODES,
  formatCoordPair,
  latLonToVector3,
  type GodsEyeFeedsSnapshot,
  type GodsEyeLayerId,
  type GodsEyeOpticalMode,
  type GodsEyeTarget,
} from '../v4/godsEyeLogic';

interface GodsEyeToggleDetail {
  open?: boolean;
  opticalMode?: GodsEyeOpticalMode;
  focusTarget?: string;
}

declare global {
  interface Window {
    __barbiGodsEyeState?: {
      open: boolean;
      opticalMode: string;
      activeLayers: string[];
      lockedTargetName: string | null;
      trackedCount: number;
    };
    openGodsEyeViewport?: (options?: { opticalMode?: GodsEyeOpticalMode; focusTarget?: string }) => void;
    closeGodsEyeViewport?: () => void;
  }
}

const LAYER_META: ReadonlyArray<{ id: GodsEyeLayerId; label: string; color: string }> = [
  { id: 'satellites', label: 'Orbital / ISS', color: '#38bdf8' },
  { id: 'earthquakes', label: 'Seismic (USGS)', color: '#f97316' },
  { id: 'aviation', label: 'Aviation ADS-B', color: '#fbbf24' },
  { id: 'ground', label: 'Ground Nodes', color: '#34d399' },
];

function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext | null): boolean {
  if (!gl) return true;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|Software|Mesa/i.test(renderer);
  } catch {
    return false;
  }
}

export function GodsEyeViewport() {
  const [open, setOpen] = useState(false);
  const [opticalMode, setOpticalMode] = useState<GodsEyeOpticalMode>('standard');
  const [activeLayers, setActiveLayers] = useState<GodsEyeLayerId[]>([
    'satellites',
    'earthquakes',
    'aviation',
    'ground',
  ]);
  const [snapshot, setSnapshot] = useState<GodsEyeFeedsSnapshot>(() => ({
    fetchedAt: new Date().toISOString(),
    iss: {
      lat: -25.7,
      lon: 28.2,
      altitudeKm: 421,
      velocityKmh: 27588,
      visibility: 'orbital',
      live: false,
    },
    targets: [...STRATEGIC_GROUND_NODES],
    counts: {
      earthquakes: 0,
      satellites: 0,
      aviation: 0,
      ground: STRATEGIC_GROUND_NODES.length,
    },
    feedHealth: {
      usgsEarthquakes: 'fallback',
      issOrbital: 'fallback',
      openSkyAviation: 'rate_limited',
    },
    repos: [
      {
        slug: 'bilawalsidhu/gods-eye-view',
        url: 'https://github.com/bilawalsidhu/gods-eye-view',
        stars: null,
        forks: null,
        language: 'JavaScript',
        license: 'MIT',
        pushedAt: null,
        description: 'Live open source 3D spatial intelligence globe.',
        liveVerified: true,
      },
      {
        slug: 'koala73/worldmonitor',
        url: 'https://github.com/koala73/worldmonitor',
        stars: null,
        forks: null,
        language: 'TypeScript',
        license: 'AGPL-3.0',
        pushedAt: null,
        description: 'Real-time global OSINT intelligence dashboard.',
        liveVerified: true,
      },
    ],
  }));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lockedTargetId, setLockedTargetId] = useState<string>('ground-zulutronix-hq');
  const [customRepoInput, setCustomRepoInput] = useState('');
  const [attachingRepo, setAttachingRepo] = useState(false);
  const [repoNotice, setRepoNotice] = useState<string | null>(null);

  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusTargetRef = useRef<string | null>(null);
  const targetRotRef = useRef<{ lat: number; lon: number; zoom: number }>({
    lat: -18,
    lon: 28,
    zoom: 5.4,
  });
  const opticalModeRef = useRef<GodsEyeOpticalMode>('standard');
  opticalModeRef.current = opticalMode;

  const visibleTargets = useMemo(() => {
    if (!snapshot) return [];
    const allowed = new Set(activeLayers);
    return snapshot.targets.filter((t) => allowed.has(t.layer));
  }, [snapshot, activeLayers]);

  const lockedTarget = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.targets.find((t) => t.id === lockedTargetId) ?? visibleTargets[0] ?? null;
  }, [snapshot, lockedTargetId, visibleTargets]);

  const focusOnTarget = useCallback((target: GodsEyeTarget) => {
    setLockedTargetId(target.id);
    targetRotRef.current = {
      lat: Math.max(-68, Math.min(68, target.lat)),
      lon: target.lon,
      zoom: target.layer === 'satellites' ? 5.1 : 4.4,
    };
  }, []);

  const loadFeeds = useCallback(async (force = false) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/gods-eye/feeds${force ? '?refresh=1' : ''}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`OSINT telemetry returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as GodsEyeFeedsSnapshot;
      setSnapshot(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unable to load live God's Eye OSINT telemetry.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Apply voice/external target focus once feeds arrive
  useEffect(() => {
    const query = pendingFocusTargetRef.current;
    if (!query || !snapshot) return;
    pendingFocusTargetRef.current = null;
    const q = query.toLowerCase();
    const match =
      q.includes('iss') || q.includes('satellite')
        ? snapshot.targets.find((t) => t.id === 'sat-iss-25544')
        : q.includes('pretoria') || q.includes('hq') || q.includes('zulutronix')
          ? snapshot.targets.find((t) => t.id === 'ground-zulutronix-hq')
          : q.includes('quake') || q.includes('earthquake') || q.includes('seismic')
            ? snapshot.targets.find((t) => t.layer === 'earthquakes')
            : snapshot.targets.find((t) => t.name.toLowerCase().includes(q));
    if (match) {
      focusOnTarget(match);
    }
  }, [snapshot, focusOnTarget]);

  // Listen to open/close/control events from B.A.R.B.I. Voice, Chat, and v4.0 Hub
  useEffect(() => {
    const handleToggle = (ev: Event) => {
      const detail = (ev as CustomEvent<GodsEyeToggleDetail>).detail;
      if (detail?.opticalMode) setOpticalMode(detail.opticalMode);
      if (detail?.focusTarget) pendingFocusTargetRef.current = detail.focusTarget;
      setOpen((prev) => (typeof detail?.open === 'boolean' ? detail.open : !prev));
    };
    const handleControl = (ev: Event) => {
      const detail = (ev as CustomEvent<GodsEyeToggleDetail>).detail;
      if (detail?.opticalMode) setOpticalMode(detail.opticalMode);
      if (detail?.focusTarget) {
        pendingFocusTargetRef.current = detail.focusTarget;
      }
      if (detail?.open === true) setOpen(true);
    };
    window.openGodsEyeViewport = (opts) => {
      if (opts?.opticalMode) setOpticalMode(opts.opticalMode);
      if (opts?.focusTarget) pendingFocusTargetRef.current = opts.focusTarget;
      setOpen(true);
    };
    window.closeGodsEyeViewport = () => setOpen(false);
    window.addEventListener('barbi:toggle-gods-eye', handleToggle);
    window.addEventListener('barbi:gods-eye-control', handleControl);
    return () => {
      window.removeEventListener('barbi:toggle-gods-eye', handleToggle);
      window.removeEventListener('barbi:gods-eye-control', handleControl);
    };
  }, []);

  // Expose live God's Eye state to B.A.R.B.I. UI Perception Engine
  useEffect(() => {
    window.__barbiGodsEyeState = {
      open,
      opticalMode,
      activeLayers: [...activeLayers],
      lockedTargetName: lockedTarget?.name ?? null,
      trackedCount: visibleTargets.length,
    };
  }, [open, opticalMode, activeLayers, lockedTarget?.name, visibleTargets.length]);

  // Fetch live OSINT feeds on open and every 30s while visible
  useEffect(() => {
    if (!open) return;
    void loadFeeds(false);
    const interval = window.setInterval(() => {
      void loadFeeds(false);
    }, 30_000);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, loadFeeds]);

  // Three.js Interactive 3D Tactical Globe Renderer
  const visibleTargetsRef = useRef<GodsEyeTarget[]>([]);
  visibleTargetsRef.current = visibleTargets;
  const lockedTargetIdRef = useRef<string>(lockedTargetId);
  lockedTargetIdRef.current = lockedTargetId;

  useEffect(() => {
    if (!open) return;
    const container = canvasWrapRef.current;
    if (!container) return;

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(280, container.clientHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, targetRotRef.current.zoom);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    const swGl = isSoftwareRenderer(renderer.getContext());
    renderer.setPixelRatio(swGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.id = 'gods-eye-webgl-canvas';
    renderer.domElement.className = 'w-full h-full block cursor-grab active:cursor-grabbing';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const GLOBE_RADIUS = 1.82;

    // 1. Obsidian Earth Core
    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, swGl ? 28 : 48, swGl ? 20 : 36);
    const earthMat = new THREE.MeshPhongMaterial({
      color: OPTICAL_MODE_CONFIG[opticalModeRef.current].globeColor,
      emissive: 0x05080f,
      shininess: 18,
      transparent: true,
      opacity: 0.96,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    globeGroup.add(earthMesh);

    // 2. Tactical Lat/Lon Graticule Wireframe
    const wireGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.012, 24, 16);
    const wireMat = new THREE.MeshBasicMaterial({
      color: OPTICAL_MODE_CONFIG[opticalModeRef.current].wireColor,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    globeGroup.add(wireMesh);

    // 3. Atmospheric Rim Halo
    const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.09, swGl ? 24 : 36, swGl ? 16 : 24);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: OPTICAL_MODE_CONFIG[opticalModeRef.current].atmosphereColor,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    globeGroup.add(atmoMesh);

    // 4. Orbital ISS Inclination Ring (51.6 deg)
    const orbitPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i += 1) {
      const a = (i / 96) * Math.PI * 2;
      const r = GLOBE_RADIUS + 0.28;
      orbitPts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
    const orbitMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.42,
    });
    const orbitLine = new THREE.Line(orbitGeo, orbitMat);
    orbitLine.rotation.z = THREE.MathUtils.degToRad(51.6);
    globeGroup.add(orbitLine);

    // 5. Dynamic Target Markers Group
    const markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);

    const markerDotGeo = new THREE.SphereGeometry(0.036, 10, 10);
    const lockedRingGeo = new THREE.RingGeometry(0.065, 0.09, 24);
    const markerMeshes: Array<{ mesh: THREE.Mesh; target: GodsEyeTarget }> = [];
    let lastMarkerSignature = '';

    const syncMarkers = () => {
      const targets = visibleTargetsRef.current;
      const sig = `${lockedTargetIdRef.current}|${targets.map((t) => `${t.id}:${t.lat.toFixed(1)},${t.lon.toFixed(1)}`).join(';')}`;
      if (sig === lastMarkerSignature) return;
      lastMarkerSignature = sig;

      while (markersGroup.children.length > 0) {
        markersGroup.remove(markersGroup.children[0]);
      }
      markerMeshes.length = 0;

      for (const target of targets) {
        const altBoost = target.layer === 'satellites' ? 0.28 : target.layer === 'aviation' ? 0.09 : 0.03;
        const pos = latLonToVector3(target.lat, target.lon, GLOBE_RADIUS + altBoost);
        const isLocked = target.id === lockedTargetIdRef.current;
        const color =
          target.layer === 'satellites'
            ? 0x38bdf8
            : target.layer === 'earthquakes'
              ? target.severity === 'critical'
                ? 0xef4444
                : 0xf97316
              : target.layer === 'aviation'
                ? 0xfbbf24
                : 0x34d399;

        const mat = new THREE.MeshBasicMaterial({ color });
        const dot = new THREE.Mesh(markerDotGeo, mat);
        dot.position.set(pos.x, pos.y, pos.z);
        if (isLocked) {
          dot.scale.setScalar(1.45);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9,
          });
          const ring = new THREE.Mesh(lockedRingGeo, ringMat);
          ring.position.set(pos.x * 1.01, pos.y * 1.01, pos.z * 1.01);
          ring.lookAt(0, 0, 0);
          markersGroup.add(ring);
        }
        markersGroup.add(dot);
        markerMeshes.push({ mesh: dot, target });
      }
    };

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const keyLight = new THREE.DirectionalLight(0xfef3c7, 1.45);
    keyLight.position.set(5, 3, 6);
    scene.add(keyLight);

    // Pointer Drag Orbit + Zoom + Click Target Lock
    let isDragging = false;
    let movedPx = 0;
    let prevX = 0;
    let prevY = 0;
    let curRotY = -THREE.MathUtils.degToRad(targetRotRef.current.lon + 90);
    let curRotX = THREE.MathUtils.degToRad(targetRotRef.current.lat);
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      movedPx = 0;
      prevX = e.clientX;
      prevY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      movedPx += Math.hypot(dx, dy);
      prevX = e.clientX;
      prevY = e.clientY;
      targetRotRef.current.lon -= dx * 0.35;
      targetRotRef.current.lat = Math.max(-72, Math.min(72, targetRotRef.current.lat + dy * 0.28));
    };
    const onPointerUp = (e: PointerEvent) => {
      if (isDragging && movedPx < 6) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, camera);
        const hits = raycaster.intersectObjects(markerMeshes.map((m) => m.mesh));
        if (hits.length > 0) {
          const found = markerMeshes.find((m) => m.mesh === hits[0].object);
          if (found) focusOnTarget(found.target);
        }
      }
      isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetRotRef.current.zoom = Math.max(3.1, Math.min(8.5, targetRotRef.current.zoom + e.deltaY * 0.003));
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    const onResize = () => {
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(280, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    let rafId = 0;
    let lastDrawMs = 0;
    const minFrameMs = swGl ? 100 : 16;

    const animate = (now: number) => {
      rafId = window.requestAnimationFrame(animate);
      if (now - lastDrawMs < minFrameMs) return;
      lastDrawMs = now;

      if (!isDragging) {
        targetRotRef.current.lon += swGl ? 0.12 : 0.04;
      }

      const modeCfg = OPTICAL_MODE_CONFIG[opticalModeRef.current];
      earthMat.color.setHex(modeCfg.globeColor);
      wireMat.color.setHex(modeCfg.wireColor);
      atmoMat.color.setHex(modeCfg.atmosphereColor);

      syncMarkers();

      const desiredY = -THREE.MathUtils.degToRad(targetRotRef.current.lon + 90);
      const desiredX = THREE.MathUtils.degToRad(targetRotRef.current.lat);
      curRotY += (desiredY - curRotY) * 0.12;
      curRotX += (desiredX - curRotX) * 0.12;
      globeGroup.rotation.y = curRotY;
      globeGroup.rotation.x = curRotX;
      camera.position.z += (targetRotRef.current.zoom - camera.position.z) * 0.12;

      renderer.render(scene, camera);
    };

    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      earthGeo.dispose();
      earthMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      orbitGeo.dispose();
      orbitMat.dispose();
      markerDotGeo.dispose();
      lockedRingGeo.dispose();
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [open, focusOnTarget]);

  const toggleLayer = (layer: GodsEyeLayerId) => {
    setActiveLayers((prev) =>
      prev.includes(layer) ? prev.filter((item) => item !== layer) : [...prev, layer]
    );
  };

  const handleAttachRepo = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = customRepoInput.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    if (!cleaned || !cleaned.includes('/')) {
      setRepoNotice('Enter a GitHub repository in owner/repo format (or full GitHub URL).');
      return;
    }
    setAttachingRepo(true);
    setRepoNotice(null);
    try {
      await barbiApi.v4AssimilateGitHubRepo({
        fullName: cleaned,
        htmlUrl: `https://github.com/${cleaned}`,
        description: "Attached directly via God's Eye Module M11 spatial intelligence connector.",
        stars: 0,
        language: 'Spatial',
        license: 'Custom',
        tier: 'B',
        governanceTier: 'PRE_AUTHORIZED',
        securityStatus: 'VERIFIED',
      });
      setRepoNotice(`Assimilated ${cleaned} into Tier B · God's Eye Spatial Stack.`);
      setCustomRepoInput('');
    } catch (err) {
      setRepoNotice(err instanceof Error ? err.message : `Could not assimilate ${cleaned}.`);
    } finally {
      setAttachingRepo(false);
    }
  };

  if (!open) return null;

  const modeCfg = OPTICAL_MODE_CONFIG[opticalMode];

  return (
    <div
      id="barbi-gods-eye-viewport"
      role="dialog"
      aria-modal="true"
      aria-label="God's Eye Module M11 Spatial Intelligence Viewport"
      className="fixed inset-0 z-[72] flex items-center justify-center p-2.5 sm:p-5 bg-black/70 backdrop-blur-md pointer-events-auto select-text"
    >
      <div className="barbi-scifi-shell relative flex flex-col w-full max-w-[1260px] h-[min(90vh,820px)] text-stone-100 overflow-hidden">
        {/* Precision Chamfered Perimeter Frame */}
        <svg className="hud-frame-svg-overlay" viewBox="0 0 1200 780" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            points="18,1 1182,1 1199,18 1199,762 1182,779 18,779 1,762 1,18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
          <polyline points="1,48 1,18 18,1 56,1" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <polyline points="1144,1 1182,1 1199,18 1199,48" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <polyline points="1,732 1,762 18,779 56,779" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <polyline points="1144,779 1182,779 1199,762 1199,732" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>

        {/* Top Header */}
        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-amber-500/20 bg-black/45">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center justify-center w-8 h-8 border border-amber-400/45 bg-amber-500/12 text-amber-300 shrink-0">
              <Eye className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-wide text-white truncate">
                God&apos;s Eye · Module M11 Global Spatial Intelligence
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tech text-stone-400">
                <span>{modeCfg.label}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{visibleTargets.length} live targets</span>
                <span aria-hidden="true">·</span>
                <span>USGS {snapshot?.feedHealth.usgsEarthquakes === 'live' ? 'Live' : 'Standby'}</span>
                <span aria-hidden="true">·</span>
                <span>ISS {snapshot?.feedHealth.issOrbital === 'live' ? 'Live' : 'Ephemeris'}</span>
              </div>
            </div>
          </div>

          {/* Optical Mode Segmented Switch + Refresh + Close */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="God's Eye optical mode"
              className="inline-flex items-center p-0.5 bg-black/60 border border-white/12"
            >
              {(['standard', 'flir', 'nvg', 'crt'] as const).map((m) => {
                const active = opticalMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    data-testid={`gods-eye-mode-${m}`}
                    aria-pressed={active}
                    onClick={() => setOpticalMode(m)}
                    className={`px-2.5 py-1 text-[11px] font-mono-tech whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-amber-500/25 text-amber-100 border border-amber-400/50'
                        : 'text-stone-400 hover:text-stone-100 border border-transparent'
                    }`}
                  >
                    {OPTICAL_MODE_CONFIG[m].shortLabel}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void loadFeeds(true)}
              disabled={loading}
              aria-label="Refresh God's Eye live feeds"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-white/12 bg-white/[0.04] hover:bg-white/[0.09] text-xs text-stone-200 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync Feeds</span>
            </button>

            <button
              id="btn-gods-eye-close"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close God's Eye Viewport"
              className="p-1.5 border border-white/12 bg-white/[0.04] hover:bg-red-500/30 text-stone-300 hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Split Workspace */}
        <div className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] overflow-hidden">
          {/* Left: Interactive 3D Globe + HUD Overlays */}
          <div className="relative flex flex-col min-h-[320px] bg-black/55 overflow-hidden">
            <div
              ref={canvasWrapRef}
              className="flex-1 w-full h-full"
              style={{ filter: modeCfg.canvasFilter }}
            />

            {/* Top-Left Layer Controls */}
            <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-1.5">
              {LAYER_META.map((layer) => {
                const enabled = activeLayers.includes(layer.id);
                const count = snapshot?.counts[layer.id] ?? 0;
                return (
                  <button
                    key={layer.id}
                    type="button"
                    aria-pressed={enabled}
                    onClick={() => toggleLayer(layer.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono-tech border transition-colors cursor-pointer whitespace-nowrap ${
                      enabled
                        ? 'bg-black/80 border-amber-400/45 text-stone-100'
                        : 'bg-black/55 border-white/10 text-stone-500 hover:text-stone-300'
                    }`}
                  >
                    <span
                      className="w-2 h-2 shrink-0"
                      style={{ backgroundColor: enabled ? layer.color : '#57534e' }}
                    />
                    <span>{layer.label}</span>
                    <span className="text-stone-400 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Bottom-Left Locked Target Telemetry HUD */}
            {lockedTarget && (
              <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-md z-20 bg-black/82 backdrop-blur-xl border border-amber-400/35 px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono-tech text-amber-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>TARGET LOCK · {lockedTarget.layer.toUpperCase()}</span>
                  </span>
                  <span className="text-stone-400 tabular-nums">
                    {formatCoordPair(lockedTarget.lat, lockedTarget.lon)}
                  </span>
                </div>
                <div className="mt-1 text-xs font-semibold text-white truncate">{lockedTarget.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] font-mono-tech text-stone-300 tabular-nums">
                  <span>{lockedTarget.metricPrimary}</span>
                  <span aria-hidden="true">·</span>
                  <span>{lockedTarget.metricSecondary}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-stone-400">{lockedTarget.source}</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="absolute top-14 left-3 right-3 z-20 bg-red-950/85 border border-red-500/45 px-3 py-2 text-xs text-red-100"
              >
                {errorMsg}
              </div>
            )}
          </div>

          {/* Right: Live Target Manifest & GitHub Repository Integration Panel */}
          <aside className="border-t lg:border-t-0 lg:border-l border-white/10 bg-black/55 flex flex-col min-h-0 overflow-hidden">
            {/* Live Targets List */}
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-100">
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                <span>Tracked Signals</span>
              </span>
              <span className="font-mono-tech text-[10.5px] text-stone-400 tabular-nums">
                Drag globe to orbit · Click to lock
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/[0.06]">
              {visibleTargets.map((target) => {
                const isSelected = lockedTarget?.id === target.id;
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => focusOnTarget(target)}
                    className={`w-full text-left px-4 py-2.5 transition-colors cursor-pointer ${
                      isSelected ? 'bg-amber-500/15' : 'hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-stone-100 truncate">{target.name}</span>
                      <span className="font-mono-tech text-[10.5px] text-amber-300 shrink-0 tabular-nums">
                        {target.metricPrimary}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[10.5px] font-mono-tech text-stone-400 tabular-nums">
                      <span>{formatCoordPair(target.lat, target.lon)}</span>
                      <span className="truncate">{target.metricSecondary}</span>
                    </div>
                  </button>
                );
              })}
              {visibleTargets.length === 0 && (
                <div className="p-6 text-center text-xs text-stone-400">
                  Enable at least one telemetry layer to inspect signals.
                </div>
              )}
            </div>

            {/* Verified GitHub Repositories + Custom Repo Connector */}
            <div className="border-t border-white/10 p-3.5 bg-black/50 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-tech uppercase tracking-wider text-amber-300">
                  <FolderGit2 className="w-3.5 h-3.5" />
                  <span>Linked GitHub Engines</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('barbi:toggle-v4-hub', {
                        detail: { open: true, tab: 'catalog', moduleId: 11, tier: 'B' },
                      })
                    );
                  }}
                  className="inline-flex items-center gap-1 text-[10.5px] font-mono-tech text-stone-300 hover:text-amber-200 cursor-pointer"
                >
                  <Layers className="w-3 h-3" />
                  <span>M11 Spec</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {(snapshot?.repos ?? [
                  {
                    slug: 'bilawalsidhu/gods-eye-view',
                    url: 'https://github.com/bilawalsidhu/gods-eye-view',
                    stars: null,
                    forks: null,
                    language: 'TypeScript',
                    license: 'MIT',
                    pushedAt: null,
                    description: "God's Eye View 3D OSINT simulator",
                    liveVerified: false,
                  },
                  {
                    slug: 'koala73/worldmonitor',
                    url: 'https://github.com/koala73/worldmonitor',
                    stars: null,
                    forks: null,
                    language: 'TypeScript',
                    license: 'MIT',
                    pushedAt: null,
                    description: 'WorldMonitor OSINT intelligence dashboard',
                    liveVerified: false,
                  },
                ]).map((repo) => (
                  <a
                    key={repo.slug}
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 border border-white/10 bg-white/[0.025] hover:border-amber-400/45 transition-colors text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="font-mono-tech text-stone-100 truncate">{repo.slug}</div>
                      <div className="text-[10px] font-mono-tech text-stone-400 tabular-nums">
                        {repo.liveVerified && typeof repo.stars === 'number'
                          ? `${repo.stars.toLocaleString()} stars · ${repo.license}`
                          : `${repo.license} · Public GitHub Repo`}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  </a>
                ))}
              </div>

              {/* Attach Custom / Forked God's Eye GitHub Repo */}
              <form onSubmit={(e) => void handleAttachRepo(e)} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customRepoInput}
                  onChange={(e) => setCustomRepoInput(e.target.value)}
                  placeholder="Add custom owner/repo URL..."
                  aria-label="Attach custom GitHub repository to God's Eye"
                  className="flex-1 min-w-0 px-2.5 py-1.5 bg-black/70 border border-white/14 focus:border-amber-400/55 text-[11px] font-mono-tech text-white placeholder:text-stone-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={attachingRepo}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-[11px] font-mono-tech text-amber-100 whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" />
                  <span>Link</span>
                </button>
              </form>
              {repoNotice && (
                <p className="text-[10.5px] font-mono-tech text-amber-200/90 leading-snug">{repoNotice}</p>
              )}
            </div>
          </aside>
        </div>

        {/* Footer Quick-Jump Targets */}
        <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-5 py-2 border-t border-white/10 bg-black/60 text-[11px] font-mono-tech text-stone-400">
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            <span>Quick Lock:</span>
            <button
              type="button"
              onClick={() => {
                const iss = snapshot?.targets.find((t) => t.id === 'sat-iss-25544');
                if (iss) focusOnTarget(iss);
              }}
              className="inline-flex items-center gap-1 text-sky-300 hover:text-white cursor-pointer"
            >
              <Satellite className="w-3 h-3" />
              <span>ISS Live</span>
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => {
                const hq = snapshot?.targets.find((t) => t.id === 'ground-zulutronix-hq');
                if (hq) focusOnTarget(hq);
              }}
              className="text-emerald-300 hover:text-white cursor-pointer"
            >
              ZULUTRONIX HQ (Pretoria)
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => {
                const eq = snapshot?.targets.find((t) => t.layer === 'earthquakes');
                if (eq) focusOnTarget(eq);
              }}
              className="text-orange-300 hover:text-white cursor-pointer"
            >
              Strongest Quake (24h)
            </button>
          </div>
          <span className="tabular-nums">
            {snapshot ? `Synced ${new Date(snapshot.fetchedAt).toLocaleTimeString()}` : 'Initializing OSINT telemetry...'}
          </span>
        </footer>
      </div>
    </div>
  );
}
