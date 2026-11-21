export type SphereVisualComplexity = 'minimal' | 'balanced' | 'high' | 'ultra';

export type SphereColorThemeId =
  | 'burnt-amber'
  | 'solar-copper'
  | 'cobalt-forge'
  | 'emerald-circuit'
  | 'crimson-tactical';

export interface SphereConfig {
  rotationSpeed: number;
  visualComplexity: SphereVisualComplexity;
  colorTheme: SphereColorThemeId;
}

export interface ComplexityProfile {
  id: SphereVisualComplexity;
  label: string;
  summary: string;
  outerShellVisible: boolean;
  midLayerVisible: boolean;
  panelRatio: number;
  gyroLineRatio: number;
  floatingTokenRatio: number;
  dustRatio: number;
  starShellCount: number;
  innerGlyphRatio: number;
  bloomScale: number;
  opacityBoost: number;
}

export interface SphereThemePalette {
  id: SphereColorThemeId;
  label: string;
  tagline: string;
  swatchHex: string;
  accentRgb: string;
  accentHex: string;
  accentSoft: string;
  accentMuted: string;
  hudStrokeHex: string;
  pcbColor: string;
  three: {
    bright: number;
    mid: number;
    dim: number;
    faint: number;
    hot: number;
    dust: number;
    starColors: [number, number, number, number, number, number];
  };
  coreGoldLock: {
    coreHex: number;
    brightHex: number;
    paleHex: number;
    cssCore: string;
    cssBright: string;
    cssPale: string;
  };
}

export const SPHERE_CONFIG_STORAGE_KEY = 'barbi_sphere_config_v1';

export const MIN_ROTATION_SPEED = 0;
export const MAX_ROTATION_SPEED = 3.0;

/**
 * Permanent Golden Core invariant — the central 3D sphere core stays golden
 * across all color themes and modes (including Focus Mode).
 */
export const GOLD_CORE_LOCK = Object.freeze({
  coreHex: 0xd96800,
  brightHex: 0xf0820a,
  paleHex: 0xf5b860,
  cssCore: '#D96800',
  cssBright: '#F0820A',
  cssPale: '#F5B860',
});

export const DEFAULT_SPHERE_CONFIG: Readonly<SphereConfig> = Object.freeze({
  rotationSpeed: 1.0,
  visualComplexity: 'high',
  colorTheme: 'burnt-amber',
});

export const SPHERE_COMPLEXITY_PROFILES: Readonly<Record<SphereVisualComplexity, ComplexityProfile>> = Object.freeze({
  minimal: {
    id: 'minimal',
    label: 'Minimal',
    summary: 'Core + sparse gyro rails, 2 star shells, low GPU load',
    outerShellVisible: false,
    midLayerVisible: true,
    panelRatio: 0,
    gyroLineRatio: 0.36,
    floatingTokenRatio: 0.25,
    dustRatio: 0.22,
    starShellCount: 2,
    innerGlyphRatio: 0.42,
    bloomScale: 0.72,
    opacityBoost: 0.88,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    summary: 'Outer shell, half grid panels, 4 star shells',
    outerShellVisible: true,
    midLayerVisible: true,
    panelRatio: 0.48,
    gyroLineRatio: 0.68,
    floatingTokenRatio: 0.62,
    dustRatio: 0.58,
    starShellCount: 4,
    innerGlyphRatio: 0.72,
    bloomScale: 0.90,
    opacityBoost: 0.96,
  },
  high: {
    id: 'high',
    label: 'High',
    summary: 'Full B.A.R.B.I 3.1 architecture, 6 twinkling star shells',
    outerShellVisible: true,
    midLayerVisible: true,
    panelRatio: 1.0,
    gyroLineRatio: 1.0,
    floatingTokenRatio: 1.0,
    dustRatio: 1.0,
    starShellCount: 6,
    innerGlyphRatio: 1.0,
    bloomScale: 1.0,
    opacityBoost: 1.0,
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    summary: 'Maximum luminance, full lattices, enhanced bloom',
    outerShellVisible: true,
    midLayerVisible: true,
    panelRatio: 1.0,
    gyroLineRatio: 1.0,
    floatingTokenRatio: 1.0,
    dustRatio: 1.0,
    starShellCount: 6,
    innerGlyphRatio: 1.0,
    bloomScale: 1.24,
    opacityBoost: 1.22,
  },
});

export const SPHERE_COLOR_THEMES: Readonly<Record<SphereColorThemeId, SphereThemePalette>> = Object.freeze({
  'burnt-amber': {
    id: 'burnt-amber',
    label: 'Burnt Amber',
    tagline: 'B.A.R.B.I 3.1 signature warm amber-copper grading',
    swatchHex: '#D96800',
    accentRgb: '217, 104, 8',
    accentHex: '#D96800',
    accentSoft: '#F5B860',
    accentMuted: '#994200',
    hudStrokeHex: '#e08a1e',
    pcbColor: 'rgba(245, 158, 11, 0.94)',
    three: {
      bright: 0xe67300,
      mid: 0xc45100,
      dim: 0x7a2e00,
      faint: 0x331200,
      hot: 0xff9d1a,
      dust: 0xc45100,
      starColors: [0xd96b08, 0xc2540a, 0xe06d10, 0xb84a06, 0xd4610c, 0xa33f05],
    },
    coreGoldLock: GOLD_CORE_LOCK,
  },
  'solar-copper': {
    id: 'solar-copper',
    label: 'Solar Copper',
    tagline: 'High-contrast forged bronze & ember plasma',
    swatchHex: '#EA580C',
    accentRgb: '234, 88, 12',
    accentHex: '#EA580C',
    accentSoft: '#FDBA74',
    accentMuted: '#9A3412',
    hudStrokeHex: '#f97316',
    pcbColor: 'rgba(249, 115, 22, 0.92)',
    three: {
      bright: 0xf97316,
      mid: 0xd94e0a,
      dim: 0x8a2c05,
      faint: 0x3b1102,
      hot: 0xffb347,
      dust: 0xea580c,
      starColors: [0xf97316, 0xdc5008, 0xfb923c, 0xc2410c, 0xea580c, 0x9a3412],
    },
    coreGoldLock: GOLD_CORE_LOCK,
  },
  'cobalt-forge': {
    id: 'cobalt-forge',
    label: 'Cobalt Forge',
    tagline: 'Cryo-cyan telemetry shells orbiting golden core',
    swatchHex: '#0EA5E9',
    accentRgb: '14, 165, 233',
    accentHex: '#0EA5E9',
    accentSoft: '#7DD3FC',
    accentMuted: '#0369A1',
    hudStrokeHex: '#38bdf8',
    pcbColor: 'rgba(56, 189, 248, 0.88)',
    three: {
      bright: 0x38bdf8,
      mid: 0x0284c7,
      dim: 0x075985,
      faint: 0x082f49,
      hot: 0x7dd3fc,
      dust: 0x0ea5e9,
      starColors: [0x38bdf8, 0x0ea5e9, 0x7dd3fc, 0x0284c7, 0x22d3ee, 0x0369a1],
    },
    coreGoldLock: GOLD_CORE_LOCK,
  },
  'emerald-circuit': {
    id: 'emerald-circuit',
    label: 'Emerald Circuit',
    tagline: 'Signal-green PCB matrix with golden heart',
    swatchHex: '#10B981',
    accentRgb: '16, 185, 129',
    accentHex: '#10B981',
    accentSoft: '#6EE7B7',
    accentMuted: '#047857',
    hudStrokeHex: '#34d399',
    pcbColor: 'rgba(52, 211, 153, 0.88)',
    three: {
      bright: 0x34d399,
      mid: 0x10b981,
      dim: 0x047857,
      faint: 0x064e3b,
      hot: 0x6ee7b7,
      dust: 0x10b981,
      starColors: [0x34d399, 0x10b981, 0x6ee7b7, 0x059669, 0x2dd4bf, 0x047857],
    },
    coreGoldLock: GOLD_CORE_LOCK,
  },
  'crimson-tactical': {
    id: 'crimson-tactical',
    label: 'Crimson Tactical',
    tagline: 'Low-glare red-amber optics around golden core',
    swatchHex: '#EF4444',
    accentRgb: '239, 68, 68',
    accentHex: '#EF4444',
    accentSoft: '#FCA5A5',
    accentMuted: '#991B1B',
    hudStrokeHex: '#f87171',
    pcbColor: 'rgba(248, 113, 113, 0.88)',
    three: {
      bright: 0xf87171,
      mid: 0xdc2626,
      dim: 0x991b1b,
      faint: 0x450a0a,
      hot: 0xfca5a5,
      dust: 0xef4444,
      starColors: [0xf87171, 0xef4444, 0xfb7185, 0xdc2626, 0xf97316, 0x991b1b],
    },
    coreGoldLock: GOLD_CORE_LOCK,
  },
});

export const COMPLEXITY_ORDER: readonly SphereVisualComplexity[] = [
  'minimal',
  'balanced',
  'high',
  'ultra',
];

export const COLOR_THEME_ORDER: readonly SphereColorThemeId[] = [
  'burnt-amber',
  'solar-copper',
  'cobalt-forge',
  'emerald-circuit',
  'crimson-tactical',
];

export function clampRotationSpeed(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_SPHERE_CONFIG.rotationSpeed;
  const clamped = Math.max(MIN_ROTATION_SPEED, Math.min(MAX_ROTATION_SPEED, num));
  return Math.round(clamped * 100) / 100;
}

export function isValidComplexity(value: unknown): value is SphereVisualComplexity {
  return typeof value === 'string' && value in SPHERE_COMPLEXITY_PROFILES;
}

export function isValidColorTheme(value: unknown): value is SphereColorThemeId {
  return typeof value === 'string' && value in SPHERE_COLOR_THEMES;
}

export function normalizeSphereConfig(raw: Partial<SphereConfig> | null | undefined): SphereConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SPHERE_CONFIG };
  }
  return {
    rotationSpeed: clampRotationSpeed(raw.rotationSpeed),
    visualComplexity: isValidComplexity(raw.visualComplexity)
      ? raw.visualComplexity
      : DEFAULT_SPHERE_CONFIG.visualComplexity,
    colorTheme: isValidColorTheme(raw.colorTheme)
      ? raw.colorTheme
      : DEFAULT_SPHERE_CONFIG.colorTheme,
  };
}

export function getComplexityProfile(complexity: SphereVisualComplexity): ComplexityProfile {
  return SPHERE_COMPLEXITY_PROFILES[complexity] ?? SPHERE_COMPLEXITY_PROFILES.high;
}

export function getThemePalette(themeId: SphereColorThemeId): SphereThemePalette {
  return SPHERE_COLOR_THEMES[themeId] ?? SPHERE_COLOR_THEMES['burnt-amber'];
}

export function loadSphereConfig(storage?: Pick<Storage, 'getItem'> | null): SphereConfig {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (!store) return { ...DEFAULT_SPHERE_CONFIG };
    const raw = store.getItem(SPHERE_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SPHERE_CONFIG };
    return normalizeSphereConfig(JSON.parse(raw) as Partial<SphereConfig>);
  } catch {
    return { ...DEFAULT_SPHERE_CONFIG };
  }
}

export function saveSphereConfig(
  config: SphereConfig,
  storage?: Pick<Storage, 'setItem'> | null
): SphereConfig {
  const normalized = normalizeSphereConfig(config);
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    store?.setItem(SPHERE_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore private-browsing / quota errors
  }
  return normalized;
}
