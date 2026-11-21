import { useCallback, useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, RotateCcw, X, Sparkles, Gauge, Palette, Layers } from 'lucide-react';
import {
  COLOR_THEME_ORDER,
  COMPLEXITY_ORDER,
  DEFAULT_SPHERE_CONFIG,
  GOLD_CORE_LOCK,
  MAX_ROTATION_SPEED,
  MIN_ROTATION_SPEED,
  SPHERE_COLOR_THEMES,
  SPHERE_COMPLEXITY_PROFILES,
  type ComplexityProfile,
  type SphereColorThemeId,
  type SphereConfig,
  type SphereThemePalette,
  type SphereVisualComplexity,
  clampRotationSpeed,
  getComplexityProfile,
  getThemePalette,
  loadSphereConfig,
  saveSphereConfig,
} from '../barbi/sphereConfigLogic';

export interface AppliedSphereConfigPayload {
  config: SphereConfig;
  complexityProfile: ComplexityProfile;
  themePalette: SphereThemePalette;
}

declare global {
  interface Window {
    __barbiSphereConfig?: AppliedSphereConfigPayload;
    applyBarbiSphereConfig?: (payload: AppliedSphereConfigPayload) => void;
    toggleSphereConfigPanel?: (forceOpen?: boolean) => void;
  }
}

const SPEED_PRESETS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '0×', value: 0 },
  { label: '0.5×', value: 0.5 },
  { label: '1.0×', value: 1.0 },
  { label: '2.0×', value: 2.0 },
  { label: '3.0×', value: 3.0 },
];

function applyCssThemeVariables(palette: SphereThemePalette) {
  const root = document.documentElement;
  if (!root) return;
  // Central 3D sphere core tokens remain permanently golden across all modes & themes
  root.style.setProperty('--gold-core', GOLD_CORE_LOCK.cssCore);
  root.style.setProperty('--gold-bright', GOLD_CORE_LOCK.cssBright);
  root.style.setProperty('--gold-pale', GOLD_CORE_LOCK.cssPale);

  // Only set custom accent overrides on :root; body.focus-mode-active overrides these cleanly when active
  if (palette.id === 'burnt-amber') {
    root.style.removeProperty('--accent-rgb');
    root.style.removeProperty('--accent-hex');
    root.style.removeProperty('--accent-soft');
    root.style.removeProperty('--accent-muted');
    root.style.removeProperty('--hud-stroke-hex');
    root.style.removeProperty('--pcb-edge-color');
  } else {
    root.style.setProperty('--accent-rgb', palette.accentRgb);
    root.style.setProperty('--accent-hex', palette.accentHex);
    root.style.setProperty('--accent-soft', palette.accentSoft);
    root.style.setProperty('--accent-muted', palette.accentMuted);
    root.style.setProperty('--hud-stroke-hex', palette.hudStrokeHex);
    root.style.setProperty('--pcb-edge-color', palette.pcbColor);
  }
}

export function SphereConfigPanel() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<SphereConfig>(() => loadSphereConfig());

  const complexityProfile = useMemo(
    () => getComplexityProfile(config.visualComplexity),
    [config.visualComplexity]
  );

  const themePalette = useMemo(
    () => getThemePalette(config.colorTheme),
    [config.colorTheme]
  );

  const publishConfig = useCallback((nextConfig: SphereConfig) => {
    const normalized = saveSphereConfig(nextConfig);
    const payload: AppliedSphereConfigPayload = {
      config: normalized,
      complexityProfile: getComplexityProfile(normalized.visualComplexity),
      themePalette: getThemePalette(normalized.colorTheme),
    };
    window.__barbiSphereConfig = payload;
    applyCssThemeVariables(payload.themePalette);
    if (typeof window.applyBarbiSphereConfig === 'function') {
      window.applyBarbiSphereConfig(payload);
    }
    window.dispatchEvent(new CustomEvent('barbi:sphere-config-changed', { detail: payload }));
  }, []);

  useEffect(() => {
    publishConfig(config);
  }, [config, publishConfig]);

  useEffect(() => {
    const handleRuntimeReady = () => {
      publishConfig(config);
    };
    window.addEventListener('barbi:sphere-runtime-ready', handleRuntimeReady);
    return () => window.removeEventListener('barbi:sphere-runtime-ready', handleRuntimeReady);
  }, [config, publishConfig]);

  useEffect(() => {
    const handleToggle = (ev: Event) => {
      const detail = (ev as CustomEvent<{ open?: boolean }>).detail;
      if (detail && typeof detail.open === 'boolean') {
        setOpen(detail.open);
      } else {
        setOpen((prev) => !prev);
      }
    };
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleUpdateConfig = (ev: Event) => {
      const detail = (ev as CustomEvent<Partial<SphereConfig>>).detail;
      if (!detail || typeof detail !== 'object') return;
      setConfig((prev) => ({
        colorTheme: detail.colorTheme && detail.colorTheme in SPHERE_COLOR_THEMES ? detail.colorTheme : prev.colorTheme,
        visualComplexity:
          detail.visualComplexity && detail.visualComplexity in SPHERE_COMPLEXITY_PROFILES
            ? detail.visualComplexity
            : prev.visualComplexity,
        rotationSpeed:
          typeof detail.rotationSpeed === 'number' && Number.isFinite(detail.rotationSpeed)
            ? clampRotationSpeed(detail.rotationSpeed)
            : prev.rotationSpeed,
      }));
    };

    window.toggleSphereConfigPanel = (forceOpen?: boolean) => {
      setOpen((prev) => (typeof forceOpen === 'boolean' ? forceOpen : !prev));
    };
    window.addEventListener('barbi:toggle-sphere-config', handleToggle);
    window.addEventListener('barbi:update-sphere-config', handleUpdateConfig);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('barbi:toggle-sphere-config', handleToggle);
      window.removeEventListener('barbi:update-sphere-config', handleUpdateConfig);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const triggerBtn = document.getElementById('btn-sphere-config');
    if (triggerBtn) {
      triggerBtn.setAttribute('aria-expanded', String(open));
      triggerBtn.classList.toggle('bg-amber-500/25', open);
    }
  }, [open]);

  const handleSpeedChange = (val: number) => {
    setConfig((prev) => ({ ...prev, rotationSpeed: clampRotationSpeed(val) }));
  };

  const handleComplexityChange = (next: SphereVisualComplexity) => {
    setConfig((prev) => ({ ...prev, visualComplexity: next }));
  };

  const handleThemeChange = (next: SphereColorThemeId) => {
    setConfig((prev) => ({ ...prev, colorTheme: next }));
  };

  const handleReset = () => {
    setConfig({ ...DEFAULT_SPHERE_CONFIG });
  };

  if (!open) return null;

  return (
    <aside
      id="sphere-config-panel"
      data-testid="sphere-config-panel"
      data-hud-template="4"
      data-hud-fixed="true"
      role="dialog"
      aria-label="3D Cognitive Sphere Configuration"
      className="hud-popup-surface fixed bottom-20 left-3.5 z-50 w-[352px] max-w-[92vw] text-slate-100 pointer-events-auto overflow-hidden shadow-[0_20px_55px_rgba(0,0,0,0.86)]"
      style={{ padding: '20px 22px' }}
    >
      {/* Ultra-thin non-scaling chamfered HUD hairline frame */}
      <svg
        className="hud-frame-svg-overlay"
        viewBox="0 0 360 460"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon
          points="12,1 348,1 359,12 359,448 348,459 12,459 1,448 1,12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <polyline
          points="1,34 1,12 12,1 38,1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.95"
        />
        <polyline
          points="322,1 348,1 359,12 359,34"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.95"
        />
        <polyline
          points="1,426 1,448 12,459 38,459"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.95"
        />
        <polyline
          points="322,459 348,459 359,448 359,426"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.95"
        />
      </svg>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-white/15">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-6 h-6 flex items-center justify-center border border-white/25 bg-black/40 shrink-0"
            style={{ color: themePalette.accentSoft }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <div className="font-mono-tech text-[11px] font-bold tracking-[0.14em] uppercase text-amber-100 truncate">
              3D Sphere Config
            </div>
            <div className="font-mono-tech text-[9px] text-slate-400 truncate">
              Live WebGL Optics, Orbit &amp; Grading
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="sphere-config-reset"
            onClick={handleReset}
            title="Reset Sphere Configuration to B.A.R.B.I 3.1 Defaults"
            className="px-2 py-1 text-[9.5px] font-mono-tech uppercase tracking-wider border border-white/20 bg-black/40 hover:bg-white/10 text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer transition"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            data-testid="sphere-config-close"
            onClick={() => setOpen(false)}
            aria-label="Close Sphere Configuration Panel"
            title="Close (Esc)"
            className="w-6 h-6 border border-white/20 bg-black/40 hover:bg-red-500/35 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 1. Rotation Speed */}
      <div className="mb-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="sphere-rotation-speed-slider"
            className="flex items-center gap-1.5 font-mono-tech text-[10px] font-semibold uppercase tracking-wider text-slate-200"
          >
            <Gauge className="w-3.5 h-3.5 accent-soft-text" />
            <span>Rotation Speed</span>
          </label>
          <span
            data-testid="sphere-speed-readout"
            className="font-mono-tech text-[11px] font-bold tabular-nums px-1.5 py-0.5 bg-black/55 border border-white/20 accent-soft-text"
          >
            {config.rotationSpeed === 0 ? 'PAUSED' : `${config.rotationSpeed.toFixed(2)}×`}
          </span>
        </div>

        <input
          id="sphere-rotation-speed-slider"
          data-testid="sphere-speed-slider"
          type="range"
          min={MIN_ROTATION_SPEED}
          max={MAX_ROTATION_SPEED}
          step={0.05}
          value={config.rotationSpeed}
          onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
          className="time-slider w-full cursor-pointer"
        />

        <div className="grid grid-cols-5 gap-1 mt-2">
          {SPEED_PRESETS.map((preset) => {
            const active = Math.abs(config.rotationSpeed - preset.value) < 0.01;
            return (
              <button
                key={preset.label}
                type="button"
                data-testid={`sphere-speed-preset-${preset.value}`}
                onClick={() => handleSpeedChange(preset.value)}
                className={`py-1 font-mono-tech text-[9.5px] border transition cursor-pointer ${
                  active
                    ? 'accent-solid-btn font-bold border-transparent'
                    : 'bg-black/45 border-white/15 text-slate-300 hover:text-white hover:border-white/40'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Visual Complexity */}
      <div className="mb-3.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="flex items-center gap-1.5 font-mono-tech text-[10px] font-semibold uppercase tracking-wider text-slate-200">
            <Layers className="w-3.5 h-3.5 accent-soft-text" />
            <span>Visual Complexity</span>
          </span>
          <span
            data-testid="sphere-complexity-readout"
            className="font-mono-tech text-[9.5px] uppercase tracking-wider accent-soft-text"
          >
            {complexityProfile.starShellCount} Star Shells · {Math.round(complexityProfile.panelRatio * 100)}% Grid
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {COMPLEXITY_ORDER.map((levelId) => {
            const profile = SPHERE_COMPLEXITY_PROFILES[levelId];
            const active = config.visualComplexity === levelId;
            return (
              <button
                key={levelId}
                type="button"
                data-testid={`sphere-complexity-${levelId}`}
                aria-pressed={active}
                onClick={() => handleComplexityChange(levelId)}
                className={`py-1.5 px-1 font-mono-tech text-[9.5px] uppercase tracking-wider border transition cursor-pointer ${
                  active
                    ? 'accent-solid-btn font-bold border-transparent'
                    : 'bg-black/45 border-white/15 text-slate-300 hover:text-white hover:border-white/40'
                }`}
              >
                {profile.label}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 font-mono-tech text-[9px] text-slate-400 leading-snug">
          {complexityProfile.summary}
        </div>
      </div>

      {/* 3. Color Themes */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="flex items-center gap-1.5 font-mono-tech text-[10px] font-semibold uppercase tracking-wider text-slate-200">
            <Palette className="w-3.5 h-3.5 accent-soft-text" />
            <span>Color Theme</span>
          </span>
          <span
            data-testid="sphere-theme-readout"
            className="font-mono-tech text-[9.5px] uppercase tracking-wider accent-soft-text"
          >
            {themePalette.label}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-1.5">
          {COLOR_THEME_ORDER.map((themeId) => {
            const t = SPHERE_COLOR_THEMES[themeId];
            const active = config.colorTheme === themeId;
            return (
              <button
                key={themeId}
                type="button"
                data-testid={`sphere-theme-${themeId}`}
                aria-pressed={active}
                onClick={() => handleThemeChange(themeId)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left border transition cursor-pointer ${
                  active
                    ? 'bg-white/[0.08] border-white/60 text-white'
                    : 'bg-black/40 border-white/15 text-slate-300 hover:bg-white/[0.04] hover:border-white/35'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3.5 h-3.5 shrink-0 border border-black/70"
                    style={{
                      background: `linear-gradient(135deg, ${t.accentSoft} 0%, ${t.swatchHex} 65%, ${t.accentMuted} 100%)`,
                      boxShadow: `0 0 8px rgba(${t.accentRgb}, 0.65)`,
                    }}
                  />
                  <div className="min-w-0">
                    <div className="font-mono-tech text-[10px] font-semibold tracking-wider leading-none">
                      {t.label}
                    </div>
                    <div className="text-[8.5px] text-slate-400 truncate mt-0.5">
                      {t.tagline}
                    </div>
                  </div>
                </div>
                {active && (
                  <span className="font-mono-tech text-[8.5px] uppercase tracking-widest accent-soft-text shrink-0">
                    ACTIVE
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Permanent Golden Core Notice */}
        <div className="mt-2.5 pt-2 border-t border-white/15 flex items-center gap-1.5 text-[9px] font-mono-tech text-amber-200/85">
          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
          <span>
            Central 3D Core permanently golden ({GOLD_CORE_LOCK.cssCore}) across all themes &amp; Focus Mode
          </span>
        </div>
      </div>
    </aside>
  );
}
