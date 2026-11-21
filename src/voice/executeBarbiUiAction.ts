import type {
  ClosePanelTarget,
  UiRenderMutationPayload,
  VoiceUiActionPayload,
} from './barbiVoiceTools';
import type { V4TierId } from '../v4/moduleCatalog';
import { applyHudGlassPreset, captureBarbiUiSnapshot } from './barbiUiPerception';

interface BarbiRuntimeWindow {
  openBarbiV4Hub?: (
    tab?: 'catalog' | 'assimilator' | 'fintech' | 'deploy',
    options?: { moduleId?: number; tier?: V4TierId | 'ALL'; searchQuery?: string }
  ) => void;
  toggleBarbiV4Hub?: (forceOpen?: boolean) => void;
  openEvoBackendModal?: (tab?: string) => void;
  closeEvoBackendModal?: () => void;
  openPowerTelemetryModal?: () => void;
  closePowerTelemetryModal?: () => void;
  openGestureControlModal?: () => void;
  closeGestureControlModal?: () => void;
  openSmartTimerModal?: () => void;
  closeSmartTimerModal?: () => void;
  openGtaMapModal?: () => void;
  closeGtaMapModal?: () => void;
  openWeatherApiModal?: () => void;
  closeWeatherApiModal?: () => void;
  openWhatsAppModal?: () => void;
  closeWhatsAppModal?: () => void;
  openYouTubeModal?: () => void;
  closeYouTubeModal?: () => void;
  openMemorySearchModal?: () => void;
  closeMemorySearchModal?: () => void;
  closeAllCenterAppModals?: (exceptId?: string) => void;
  closeNodeInspector?: () => void;
  toggleFocusMode?: (force?: boolean) => void;
  toggleTopLeftControls?: (force?: boolean) => void;
  resetSphereView?: () => void;
  setSphereDepthTier?: (tierNum: number) => void;
  selectNode?: (id: string, openInspector?: boolean) => void;
  showToast?: (msg: string, tone?: string) => void;
  __barbiSphereNav?: {
    zoomBy: (deltaZoom: number) => number;
    resetView: () => void;
  };
}

export interface ExecutedUiActionResult {
  ok: boolean;
  label: string;
  description: string;
  shouldMinimizeChat?: boolean;
  shouldCloseChat?: boolean;
}

function closeVanillaModals(win: BarbiRuntimeWindow): void {
  win.closeAllCenterAppModals?.('');
  win.closeEvoBackendModal?.();
  win.closePowerTelemetryModal?.();
  win.closeGestureControlModal?.();
  win.closeSmartTimerModal?.();
  win.closeGtaMapModal?.();
  win.closeWeatherApiModal?.();
  win.closeWhatsAppModal?.();
  win.closeYouTubeModal?.();
  win.closeMemorySearchModal?.();
  win.closeNodeInspector?.();

  // Safety pass on any remaining visible legacy modal containers
  const modalIds = [
    'modal-evo-backend',
    'modal-power-telemetry',
    'modal-gesture-control',
    'modal-smart-timer',
    'modal-gta-map',
    'modal-weather-api',
    'modal-whatsapp',
    'modal-youtube',
    'modal-memory-search',
    'modal-chess',
    'modal-linkedin',
    'node-inspector',
  ];
  for (const id of modalIds) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) {
      el.classList.add('hidden');
      el.classList.remove('flex');
    }
  }
}

function closeSpecificPanel(win: BarbiRuntimeWindow, target: ClosePanelTarget): { closed: string[]; shouldCloseChat: boolean } {
  const closed: string[] = [];
  let shouldCloseChat = false;

  if (target === 'all') {
    window.dispatchEvent(new CustomEvent('barbi:toggle-gods-eye', { detail: { open: false } }));
    window.dispatchEvent(new CustomEvent('barbi:toggle-fs-agent', { detail: { open: false } }));
    window.dispatchEvent(new CustomEvent('barbi:toggle-v4-hub', { detail: { open: false } }));
    window.dispatchEvent(new CustomEvent('barbi:toggle-sphere-config', { detail: { open: false } }));
    window.dispatchEvent(new CustomEvent('barbi:toggle-gesture-nav', { detail: { open: false } }));
    window.dispatchEvent(new CustomEvent('barbi:toggle-chat-panel', { detail: { open: false } }));
    closeVanillaModals(win);
    closed.push('all open panels');
    shouldCloseChat = true;
    return { closed, shouldCloseChat };
  }

  if (target === 'active') {
    // Close top-most non-voice overlay first; if none are open, close chat/voice panel
    const snap = captureBarbiUiSnapshot();
    const nonChatPanels = snap.openPanels.filter((p) => p !== 'chat_panel' && p !== 'voice_command_deck');
    if (nonChatPanels.length > 0) {
      if (nonChatPanels.includes('gods_eye_m11')) {
        window.dispatchEvent(new CustomEvent('barbi:toggle-gods-eye', { detail: { open: false } }));
        closed.push("God's Eye Globe");
      }
      if (nonChatPanels.includes('file_system_agent')) {
        window.dispatchEvent(new CustomEvent('barbi:toggle-fs-agent', { detail: { open: false } }));
        closed.push('File System Agent');
      }
      if (nonChatPanels.includes('v4_hub')) {
        window.dispatchEvent(new CustomEvent('barbi:toggle-v4-hub', { detail: { open: false } }));
        closed.push('v4.0 Module Hub');
      }
      if (nonChatPanels.includes('sphere_config')) {
        window.dispatchEvent(new CustomEvent('barbi:toggle-sphere-config', { detail: { open: false } }));
        closed.push('Sphere Config');
      }
      if (nonChatPanels.includes('gesture_nav')) {
        window.dispatchEvent(new CustomEvent('barbi:toggle-gesture-nav', { detail: { open: false } }));
        closed.push('Hand Navigation');
      }
      closeVanillaModals(win);
      if (closed.length === 0) closed.push(nonChatPanels.join(', '));
      return { closed, shouldCloseChat: false };
    }
    window.dispatchEvent(new CustomEvent('barbi:toggle-chat-panel', { detail: { open: false } }));
    closed.push('Chat / Voice Panel');
    return { closed, shouldCloseChat: true };
  }

  switch (target) {
    case 'gods_eye':
      window.dispatchEvent(new CustomEvent('barbi:toggle-gods-eye', { detail: { open: false } }));
      closed.push("God's Eye Globe");
      break;
    case 'file_system':
      window.dispatchEvent(new CustomEvent('barbi:toggle-fs-agent', { detail: { open: false } }));
      closed.push('File System Agent');
      break;
    case 'v4_hub':
      window.dispatchEvent(new CustomEvent('barbi:toggle-v4-hub', { detail: { open: false } }));
      closed.push('v4.0 Module Hub');
      break;
    case 'sphere_config':
      window.dispatchEvent(new CustomEvent('barbi:toggle-sphere-config', { detail: { open: false } }));
      closed.push('Sphere Config');
      break;
    case 'gesture_nav':
      window.dispatchEvent(new CustomEvent('barbi:toggle-gesture-nav', { detail: { open: false } }));
      win.closeGestureControlModal?.();
      closed.push('Gesture Navigation');
      break;
    case 'chat':
    case 'voice':
      window.dispatchEvent(new CustomEvent('barbi:toggle-chat-panel', { detail: { open: false } }));
      closed.push(target === 'voice' ? 'Voice Command Deck' : 'Chat Panel');
      shouldCloseChat = true;
      break;
    case 'rea':
    case 'study':
      win.closeEvoBackendModal?.();
      closed.push(target === 'rea' ? 'R.E.A Agent Forge' : 'Study Studio');
      break;
    case 'power':
      win.closePowerTelemetryModal?.();
      closed.push('Power & PMIC Telemetry');
      break;
    case 'maps':
      win.closeGtaMapModal?.();
      closed.push('Maps & Radar');
      break;
    case 'weather':
      win.closeWeatherApiModal?.();
      closed.push('Weather Telemetry');
      break;
    case 'timer':
      win.closeSmartTimerModal?.();
      closed.push('Smart Timer');
      break;
    case 'whatsapp':
      win.closeWhatsAppModal?.();
      closed.push('WhatsApp Dispatcher');
      break;
    case 'youtube':
      win.closeYouTubeModal?.();
      closed.push('YouTube Module');
      break;
    case 'memory':
      win.closeMemorySearchModal?.();
      closed.push('Memory Search');
      break;
    case 'inspector':
      win.closeNodeInspector?.();
      closed.push('Node Inspector');
      break;
  }

  return { closed, shouldCloseChat };
}

export function executeBarbiUiAction(payload: VoiceUiActionPayload): ExecutedUiActionResult {
  const win = window as unknown as BarbiRuntimeWindow;

  const emitV4Hub = (
    tab: 'catalog' | 'assimilator' | 'fintech' | 'deploy',
    options?: { moduleId?: number; tier?: V4TierId | 'ALL'; searchQuery?: string }
  ) => {
    if (typeof win.openBarbiV4Hub === 'function') {
      win.openBarbiV4Hub(tab, options);
    } else {
      window.dispatchEvent(
        new CustomEvent('barbi:toggle-v4-hub', {
          detail: {
            open: true,
            tab,
            moduleId: options?.moduleId,
            tier: options?.tier,
            searchQuery: options?.searchQuery,
          },
        })
      );
    }
  };

  switch (payload.action) {
    case 'open_gods_eye':
      window.dispatchEvent(
        new CustomEvent('barbi:toggle-gods-eye', {
          detail: {
            open: true,
            opticalMode: payload.params?.opticalMode,
            focusTarget: payload.params?.focusTarget,
          },
        })
      );
      win.showToast?.("Launched Module M11 · God's Eye 3D Spatial Globe", 'accent');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'gods_eye_control':
      window.dispatchEvent(
        new CustomEvent('barbi:gods-eye-control', {
          detail: {
            open: true,
            opticalMode: payload.params?.opticalMode,
            focusTarget: payload.params?.focusTarget,
          },
        })
      );
      win.showToast?.("Updated God's Eye 3D Globe view", 'accent');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: false };

    case 'open_file_system_agent':
      window.dispatchEvent(new CustomEvent('barbi:toggle-fs-agent', { detail: { open: true } }));
      win.showToast?.('Opened B.A.R.B.I. File System Agent', 'accent');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'close_panel': {
      const target = payload.params?.target || 'active';
      const { closed, shouldCloseChat } = closeSpecificPanel(win, target);
      const summary = closed.length > 0 ? `Closed ${closed.join(', ')}.` : 'Closed active panel.';
      win.showToast?.(summary, 'accent');
      return {
        ok: true,
        label: payload.label,
        description: summary,
        shouldCloseChat,
        shouldMinimizeChat: false,
      };
    }

    case 'close_all_panels': {
      closeSpecificPanel(win, 'all');
      win.showToast?.('Closed all panels — returned to 3D sphere', 'accent');
      return {
        ok: true,
        label: payload.label,
        description: 'Closed all open panels and overlays.',
        shouldCloseChat: true,
        shouldMinimizeChat: false,
      };
    }

    case 'open_v4_hub':
      emitV4Hub('catalog', {
        moduleId: payload.params?.moduleId,
        tier: payload.params?.tier || 'ALL',
      });
      win.showToast?.('Opened B.A.R.B.I. OS v4.0 · 55-Module Registry', 'accent');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_fintech_hud':
      emitV4Hub('fintech');
      win.showToast?.('Opened ZULUTRONIX FinTech & Venture HUD', 'accent');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_github_assimilator':
      emitV4Hub('assimilator');
      win.showToast?.('Opened GitHub Repository Assimilator', 'accent');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_deploy_forge':
      emitV4Hub('deploy');
      win.showToast?.('Opened Deploy & Docker/MCP Forge', 'accent');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_rea_forge':
      win.openEvoBackendModal?.('rea');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_study_studio':
      win.openEvoBackendModal?.('studio');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_omnirouter':
      win.openEvoBackendModal?.('router');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_circuit_crucible':
      win.openEvoBackendModal?.('circuit');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_acoustic_guard':
      win.openEvoBackendModal?.('echo');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_cap_registry':
      win.openEvoBackendModal?.('registry');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_power_pmic':
      win.openPowerTelemetryModal?.();
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_gesture_control':
      window.dispatchEvent(new CustomEvent('barbi:toggle-gesture-nav', { detail: { open: true } }));
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_timer':
      win.openSmartTimerModal?.();
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_maps':
      win.openGtaMapModal?.();
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_weather':
      win.openWeatherApiModal?.();
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_whatsapp':
      win.openWhatsAppModal?.();
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_email':
      win.selectNode?.('app-email', true);
      win.showToast?.('Opened Executive Email Composer Node', 'accent');
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_youtube':
      win.openYouTubeModal?.();
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_memory_search':
      win.openMemorySearchModal?.();
      if (payload.params?.searchQuery) {
        const inputEl = document.getElementById('memory-search-input') as HTMLInputElement | null;
        if (inputEl) {
          inputEl.value = payload.params.searchQuery;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'open_sphere_config':
      window.dispatchEvent(new CustomEvent('barbi:toggle-sphere-config', { detail: { open: true } }));
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: true };

    case 'toggle_focus_mode':
      win.toggleFocusMode?.();
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: false };

    case 'reset_sphere_orbit':
      win.resetSphereView?.();
      return { ok: true, label: payload.label, description: payload.description, shouldMinimizeChat: false };

    case 'set_sphere_depth': {
      const depth = payload.params?.depthTier ?? 1;
      win.setSphereDepthTier?.(depth);
      return {
        ok: true,
        label: `Sphere Depth Tier ${depth}`,
        description: `Moved 3D cognitive sphere camera to depth layer ${depth}.`,
        shouldMinimizeChat: false,
      };
    }

    default:
      return { ok: false, label: payload.label, description: 'Action not supported.' };
  }
}

export function executeBarbiUiRenderMutation(payload: UiRenderMutationPayload): ExecutedUiActionResult {
  const win = window as unknown as BarbiRuntimeWindow;

  if (
    payload.colorTheme !== undefined ||
    payload.visualComplexity !== undefined ||
    payload.rotationSpeed !== undefined
  ) {
    window.dispatchEvent(
      new CustomEvent('barbi:update-sphere-config', {
        detail: {
          colorTheme: payload.colorTheme,
          visualComplexity: payload.visualComplexity,
          rotationSpeed: payload.rotationSpeed,
        },
      })
    );
  }

  if (typeof payload.focusMode === 'boolean') {
    const currentlyFocused = document.body.classList.contains('focus-mode-active');
    if (currentlyFocused !== payload.focusMode) {
      win.toggleFocusMode?.();
    }
  }

  if (typeof payload.topControlsExpanded === 'boolean') {
    const items = document.getElementById('top-left-controls-items');
    const currentlyExpanded = items ? !items.classList.contains('hidden') : true;
    if (currentlyExpanded !== payload.topControlsExpanded) {
      win.toggleTopLeftControls?.();
    }
  }

  if (typeof payload.sphereLabelsVisible === 'boolean') {
    const overlay = document.getElementById('label-overlay');
    if (overlay) {
      overlay.style.display = payload.sphereLabelsVisible ? '' : 'none';
    }
  }

  if (payload.hudGlassPreset) {
    applyHudGlassPreset(payload.hudGlassPreset);
  }

  if (payload.cameraAction === 'reset') {
    win.__barbiSphereNav?.resetView();
    win.resetSphereView?.();
  } else if (payload.cameraAction === 'zoom_in') {
    win.__barbiSphereNav?.zoomBy(0.28);
  } else if (payload.cameraAction === 'zoom_out') {
    win.__barbiSphereNav?.zoomBy(-0.28);
  }

  if (payload.godsEyeOpticalMode) {
    window.dispatchEvent(
      new CustomEvent('barbi:gods-eye-control', {
        detail: { opticalMode: payload.godsEyeOpticalMode },
      })
    );
  }

  win.showToast?.(payload.label, 'accent');
  return {
    ok: true,
    label: payload.label,
    description: payload.description,
    shouldMinimizeChat: false,
  };
}
