export type HudGlassPreset = 'obsidian' | 'frosted' | 'stealth' | 'luminous';

export interface BarbiLiveUiSnapshot {
  capturedAt: string;
  viewport: { width: number; height: number };
  openPanels: string[];
  activePanelsDetail: {
    chatPanel: {
      open: boolean;
      mode: 'text' | 'voice';
      voiceMinimized: boolean;
      voiceConnectionState: string;
      wakeWordArmed: boolean;
    };
    v4Hub: {
      open: boolean;
      activeTab: string;
      selectedTier: string;
      selectedModuleCode: string | null;
      selectedModuleName: string | null;
    };
    godsEye: {
      open: boolean;
      opticalMode: string;
      activeLayers: string[];
      lockedTargetName: string | null;
      trackedCount: number;
    };
    sphereConfig: {
      open: boolean;
      colorTheme: string;
      visualComplexity: string;
      rotationSpeed: number;
    };
    gestureNav: {
      open: boolean;
    };
    fileSystemAgent: {
      open: boolean;
      rootName: string | null;
      mountKind: string | null;
      accessMode: string;
      totalFiles: number;
      selectedFilesCount: number;
      activeFilePath: string | null;
      pendingEditsCount: number;
    };
  };
  renderState: {
    focusMode: boolean;
    topControlsExpanded: boolean;
    sphereLabelsVisible: boolean;
    hudGlassPreset: HudGlassPreset;
    accentHex: string;
    colorTheme: string;
    visualComplexity: string;
    rotationSpeed: number;
  };
  visibleHeadings: string[];
  visibleSummaryText: string;
}

interface BarbiPerceptionWindow {
  __barbiChatPanelOpen?: boolean;
  __barbiChatUiState?: {
    open: boolean;
    mode: 'text' | 'voice';
    voiceMinimized: boolean;
    voiceConnectionState: string;
    wakeWordArmed: boolean;
  };
  __barbiV4HubState?: {
    open: boolean;
    activeTab: string;
    selectedTier: string;
    selectedModuleCode: string | null;
    selectedModuleName: string | null;
  };
  __barbiGodsEyeState?: {
    open: boolean;
    opticalMode: string;
    activeLayers: string[];
    lockedTargetName: string | null;
    trackedCount: number;
  };
  __barbiSphereConfig?: {
    config?: {
      colorTheme?: string;
      visualComplexity?: string;
      rotationSpeed?: number;
    };
  };
  __gestureNavOpen?: boolean;
  __barbiFsAgentState?: {
    open: boolean;
    rootName: string | null;
    mountKind: string | null;
    accessMode: string;
    totalFiles: number;
    selectedFilesCount: number;
    activeFilePath: string | null;
    pendingEditsCount: number;
  };
  __barbiHudGlassPreset?: HudGlassPreset;
  __barbiCaptureUiSnapshot?: () => BarbiLiveUiSnapshot;
}

const VANILLA_MODAL_IDS: ReadonlyArray<{ id: string; key: string }> = [
  { id: 'modal-evo-backend', key: 'evo_engineering_studio' },
  { id: 'modal-power-telemetry', key: 'power_pmic' },
  { id: 'modal-gesture-control', key: 'gesture_calibration' },
  { id: 'modal-smart-timer', key: 'smart_timer' },
  { id: 'modal-gta-map', key: 'maps_radar' },
  { id: 'modal-weather-api', key: 'weather_telemetry' },
  { id: 'modal-whatsapp', key: 'whatsapp_dispatcher' },
  { id: 'modal-youtube', key: 'youtube_media' },
  { id: 'modal-memory-search', key: 'memory_search' },
  { id: 'modal-chess', key: 'chess_arena' },
  { id: 'modal-linkedin', key: 'linkedin_intel' },
  { id: 'node-inspector', key: 'node_inspector' },
  { id: 'command-sidebar', key: 'command_sidebar' },
];

function isElementVisible(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.classList.contains('hidden')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 4 && rect.height > 4;
}

export function applyHudGlassPreset(preset: HudGlassPreset): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const win = window as unknown as BarbiPerceptionWindow;
  win.__barbiHudGlassPreset = preset;

  const presets: Record<
    HudGlassPreset,
    { bg: string; blur: string; borderAlpha: string; glowAlpha: string }
  > = {
    obsidian: {
      bg: 'rgba(8, 6, 4, 0.86)',
      blur: '22px',
      borderAlpha: '0.36',
      glowAlpha: '0.22',
    },
    frosted: {
      bg: 'rgba(18, 15, 13, 0.64)',
      blur: '30px',
      borderAlpha: '0.52',
      glowAlpha: '0.32',
    },
    stealth: {
      bg: 'rgba(4, 3, 2, 0.94)',
      blur: '12px',
      borderAlpha: '0.18',
      glowAlpha: '0.08',
    },
    luminous: {
      bg: 'rgba(16, 11, 7, 0.72)',
      blur: '26px',
      borderAlpha: '0.68',
      glowAlpha: '0.44',
    },
  };

  const chosen = presets[preset] || presets.obsidian;
  root.style.setProperty('--barbi-glass-bg', chosen.bg);
  root.style.setProperty('--barbi-glass-blur', chosen.blur);
  root.style.setProperty('--barbi-border-alpha', chosen.borderAlpha);
  root.style.setProperty('--barbi-glow-alpha', chosen.glowAlpha);
  root.dataset.hudGlassPreset = preset;
}

export function captureBarbiUiSnapshot(): BarbiLiveUiSnapshot {
  const win = window as unknown as BarbiPerceptionWindow;
  const openPanels: string[] = [];

  const chatState = win.__barbiChatUiState ?? {
    open: Boolean(win.__barbiChatPanelOpen || isElementVisible(document.getElementById('barbi-llm-chat-panel'))),
    mode: isElementVisible(document.getElementById('barbi-live-voice-panel')) ? ('voice' as const) : ('text' as const),
    voiceMinimized: false,
    voiceConnectionState: 'idle',
    wakeWordArmed: false,
  };
  if (chatState.open) {
    openPanels.push(chatState.mode === 'voice' ? 'voice_command_deck' : 'chat_panel');
  }

  const v4State = win.__barbiV4HubState ?? {
    open: isElementVisible(document.getElementById('barbi-v4-hub-modal')),
    activeTab: 'catalog',
    selectedTier: 'ALL',
    selectedModuleCode: null,
    selectedModuleName: null,
  };
  if (v4State.open) openPanels.push('v4_hub');

  const godsEyeState = win.__barbiGodsEyeState ?? {
    open: isElementVisible(document.getElementById('barbi-gods-eye-viewport')),
    opticalMode: 'standard',
    activeLayers: ['earthquakes', 'satellites', 'aviation', 'ground'],
    lockedTargetName: null,
    trackedCount: 0,
  };
  if (godsEyeState.open) openPanels.push('gods_eye_m11');

  const sphereConfigOpen = isElementVisible(document.getElementById('sphere-config-panel'));
  if (sphereConfigOpen) openPanels.push('sphere_config');

  const gestureNavOpen = Boolean(
    win.__gestureNavOpen || isElementVisible(document.getElementById('mediapipe-gesture-hud'))
  );
  if (gestureNavOpen) openPanels.push('gesture_nav');

  const fsAgentState = win.__barbiFsAgentState ?? {
    open: isElementVisible(document.getElementById('barbi-fs-agent-panel')),
    rootName: null,
    mountKind: null,
    accessMode: 'readwrite',
    totalFiles: 0,
    selectedFilesCount: 0,
    activeFilePath: null,
    pendingEditsCount: 0,
  };
  if (fsAgentState.open) openPanels.push('file_system_agent');

  for (const modal of VANILLA_MODAL_IDS) {
    if (isElementVisible(document.getElementById(modal.id))) {
      openPanels.push(modal.key);
    }
  }

  const sphereCfg = win.__barbiSphereConfig?.config;
  const colorTheme = sphereCfg?.colorTheme || 'burnt-amber';
  const visualComplexity = sphereCfg?.visualComplexity || 'balanced';
  const rotationSpeed = typeof sphereCfg?.rotationSpeed === 'number' ? sphereCfg.rotationSpeed : 1;

  const focusMode = document.body.classList.contains('focus-mode-active');
  const topControlsEl = document.getElementById('top-left-controls-items');
  const topControlsExpanded = topControlsEl ? !topControlsEl.classList.contains('hidden') : true;
  const labelOverlay = document.getElementById('label-overlay');
  const sphereLabelsVisible = labelOverlay ? !labelOverlay.classList.contains('hidden') && labelOverlay.style.display !== 'none' : true;
  const rootStyle = window.getComputedStyle(document.documentElement);
  const accentHex = rootStyle.getPropertyValue('--accent-hex').trim() || '#D96B08';
  const hudGlassPreset: HudGlassPreset = win.__barbiHudGlassPreset || 'obsidian';

  // Read visible headings and key readouts across visible dialogs/panels
  const visibleHeadings: string[] = [];
  const seen = new Set<string>();
  const headingCandidates = document.querySelectorAll<HTMLElement>(
    'h1, h2, h3, h4, [role="dialog"] [data-testid], #barbi-gods-eye-viewport h2, #barbi-gods-eye-viewport h3'
  );
  for (const el of headingCandidates) {
    if (visibleHeadings.length >= 18) break;
    if (!isElementVisible(el)) continue;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2 || text.length > 90) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    visibleHeadings.push(text);
  }

  const summaryParts: string[] = [];
  if (openPanels.length === 0) {
    summaryParts.push('Main 3D Cognitive Sphere desktop (no overlays open)');
  } else {
    summaryParts.push(`Open panels: ${openPanels.join(', ')}`);
  }
  summaryParts.push(`Sphere theme: ${colorTheme}, complexity: ${visualComplexity}, speed: ${rotationSpeed}x`);
  if (focusMode) summaryParts.push('Focus Mode ON');
  if (godsEyeState.open) {
    summaryParts.push(
      `God's Eye active (${godsEyeState.opticalMode.toUpperCase()} mode, ${godsEyeState.trackedCount} tracked targets${godsEyeState.lockedTargetName ? `, locked on ${godsEyeState.lockedTargetName}` : ''})`
    );
  }
  if (v4State.open) {
    summaryParts.push(
      `v4.0 Hub open on "${v4State.activeTab}" tab${v4State.selectedModuleCode ? ` viewing ${v4State.selectedModuleCode} ${v4State.selectedModuleName || ''}` : ''}`
    );
  }

  const snapshot: BarbiLiveUiSnapshot = {
    capturedAt: new Date().toISOString(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    openPanels,
    activePanelsDetail: {
      chatPanel: chatState,
      v4Hub: v4State,
      godsEye: godsEyeState,
      sphereConfig: {
        open: sphereConfigOpen,
        colorTheme,
        visualComplexity,
        rotationSpeed,
      },
      gestureNav: { open: gestureNavOpen },
      fileSystemAgent: fsAgentState,
    },
    renderState: {
      focusMode,
      topControlsExpanded,
      sphereLabelsVisible,
      hudGlassPreset,
      accentHex,
      colorTheme,
      visualComplexity,
      rotationSpeed,
    },
    visibleHeadings,
    visibleSummaryText: summaryParts.join(' | '),
  };

  return snapshot;
}

export function captureActiveCanvasJpeg(maxWidth = 640): string | null {
  if (typeof document === 'undefined') return null;
  const preferredCanvas =
    (document.getElementById('gods-eye-webgl-canvas') as HTMLCanvasElement | null) ||
    (document.getElementById('sphere-canvas') as HTMLCanvasElement | null);
  if (!preferredCanvas || preferredCanvas.width === 0 || preferredCanvas.height === 0) {
    return null;
  }

  try {
    const scale = Math.min(1, maxWidth / preferredCanvas.width);
    const out = document.createElement('canvas');
    out.width = Math.max(160, Math.round(preferredCanvas.width * scale));
    out.height = Math.max(90, Math.round(preferredCanvas.height * scale));
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(preferredCanvas, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL('image/jpeg', 0.65);
    const idx = dataUrl.indexOf(',');
    return idx >= 0 ? dataUrl.slice(idx + 1) : null;
  } catch {
    return null;
  }
}

export function formatUiSnapshotForPrompt(snapshot: BarbiLiveUiSnapshot): string {
  return [
    `Summary: ${snapshot.visibleSummaryText}`,
    `Open Panels: ${snapshot.openPanels.length > 0 ? snapshot.openPanels.join(', ') : 'None (3D Sphere Desktop)'}`,
    `Render State: theme=${snapshot.renderState.colorTheme}, complexity=${snapshot.renderState.visualComplexity}, rotationSpeed=${snapshot.renderState.rotationSpeed}x, glassPreset=${snapshot.renderState.hudGlassPreset}, focusMode=${snapshot.renderState.focusMode}, sphereLabelsVisible=${snapshot.renderState.sphereLabelsVisible}, topControlsExpanded=${snapshot.renderState.topControlsExpanded}`,
    snapshot.activePanelsDetail.godsEye.open
      ? `God's Eye M11: OPEN, opticalMode=${snapshot.activePanelsDetail.godsEye.opticalMode}, layers=[${snapshot.activePanelsDetail.godsEye.activeLayers.join(',')}], tracked=${snapshot.activePanelsDetail.godsEye.trackedCount}, lockedTarget=${snapshot.activePanelsDetail.godsEye.lockedTargetName || 'None'}`
      : `God's Eye M11: CLOSED`,
    snapshot.activePanelsDetail.v4Hub.open
      ? `v4.0 Hub: OPEN, tab=${snapshot.activePanelsDetail.v4Hub.activeTab}, tier=${snapshot.activePanelsDetail.v4Hub.selectedTier}, selectedModule=${snapshot.activePanelsDetail.v4Hub.selectedModuleCode || 'None'}`
      : `v4.0 Hub: CLOSED`,
    snapshot.activePanelsDetail.fileSystemAgent.open
      ? `File System Agent: OPEN, workspace=${snapshot.activePanelsDetail.fileSystemAgent.rootName || 'None'}, accessMode=${snapshot.activePanelsDetail.fileSystemAgent.accessMode}, selectedFiles=${snapshot.activePanelsDetail.fileSystemAgent.selectedFilesCount}/${snapshot.activePanelsDetail.fileSystemAgent.totalFiles}, activeFile=${snapshot.activePanelsDetail.fileSystemAgent.activeFilePath || 'None'}, pendingEdits=${snapshot.activePanelsDetail.fileSystemAgent.pendingEditsCount}`
      : `File System Agent: CLOSED`,
    snapshot.visibleHeadings.length > 0 ? `Visible Screen Headings/Labels: ${snapshot.visibleHeadings.join(' · ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function installUiPerceptionGlobal(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as BarbiPerceptionWindow).__barbiCaptureUiSnapshot = captureBarbiUiSnapshot;
}
