import { Type, type FunctionDeclaration } from '@google/genai';
import type { BarbiV4Module, V4TierId } from '../v4/moduleCatalog.ts';

export const BARBI_CREATOR_PROFILE = {
  creatorName: 'Treasure Trinity Zulu',
  creatorRole: 'Chief Engineer',
  companyName: 'ZULUTRONIX (PTY) LTD',
  cipcNumber: 'K2025/699918/07',
  spokenAliases: ['Zulutronix', 'Zulutro & I', 'ZULUTRONIX (PTY) LTD'],
} as const;

export type ClosePanelTarget =
  | 'active'
  | 'all'
  | 'chat'
  | 'voice'
  | 'v4_hub'
  | 'gods_eye'
  | 'file_system'
  | 'sphere_config'
  | 'gesture_nav'
  | 'rea'
  | 'study'
  | 'power'
  | 'maps'
  | 'weather'
  | 'timer'
  | 'whatsapp'
  | 'youtube'
  | 'memory'
  | 'inspector';

export type VoiceUiActionId =
  | 'open_gods_eye'
  | 'gods_eye_control'
  | 'open_file_system_agent'
  | 'open_v4_hub'
  | 'open_fintech_hud'
  | 'open_github_assimilator'
  | 'open_deploy_forge'
  | 'open_rea_forge'
  | 'open_study_studio'
  | 'open_omnirouter'
  | 'open_circuit_crucible'
  | 'open_acoustic_guard'
  | 'open_cap_registry'
  | 'open_power_pmic'
  | 'open_gesture_control'
  | 'open_timer'
  | 'open_maps'
  | 'open_weather'
  | 'open_whatsapp'
  | 'open_email'
  | 'open_youtube'
  | 'open_memory_search'
  | 'open_sphere_config'
  | 'close_panel'
  | 'close_all_panels'
  | 'toggle_focus_mode'
  | 'reset_sphere_orbit'
  | 'set_sphere_depth';

export interface VoiceUiActionPayload {
  action: VoiceUiActionId;
  label: string;
  description: string;
  params?: {
    moduleId?: number;
    tier?: V4TierId | 'ALL';
    depthTier?: number;
    searchQuery?: string;
    target?: ClosePanelTarget;
    opticalMode?: 'standard' | 'flir' | 'nvg' | 'crt';
    focusTarget?: string;
  };
}

export interface UiRenderMutationPayload {
  label: string;
  description: string;
  colorTheme?: 'burnt-amber' | 'solar-copper' | 'cobalt-forge' | 'emerald-circuit' | 'crimson-tactical';
  visualComplexity?: 'minimal' | 'balanced' | 'high' | 'ultra';
  rotationSpeed?: number;
  focusMode?: boolean;
  topControlsExpanded?: boolean;
  sphereLabelsVisible?: boolean;
  hudGlassPreset?: 'obsidian' | 'frosted' | 'stealth' | 'luminous';
  cameraAction?: 'reset' | 'zoom_in' | 'zoom_out';
  godsEyeOpticalMode?: 'standard' | 'flir' | 'nvg' | 'crt';
}

export interface UsableSystemDescriptor {
  id: string;
  name: string;
  category: 'Core OS' | 'Spatial & OSINT' | 'FinTech & Venture' | 'Engineering Studio' | 'Tools & Comms';
  action: VoiceUiActionId;
  summary: string;
  repos?: string[];
  keywords: string[];
}

export const BARBI_USABLE_SYSTEMS: readonly UsableSystemDescriptor[] = [
  {
    id: 'gods-eye-m11',
    name: "God's Eye (Module M11)",
    category: 'Spatial & OSINT',
    action: 'open_gods_eye',
    summary:
      "Interactive 3D global OSINT globe powered by live USGS Earthquakes, live ISS orbital telemetry, OpenSky aviation signals, FLIR/NVG/Radar optical modes, and verified GitHub repositories bilawalsidhu/gods-eye-view and koala73/worldmonitor.",
    repos: ['bilawalsidhu/gods-eye-view', 'koala73/worldmonitor'],
    keywords: ['gods eye', "god's eye", 'godseye', 'm11', 'osint', 'worldmonitor', 'globe', 'spatial', 'github', 'flir', 'iss'],
  },
  {
    id: 'file-system-agent',
    name: 'Local File System Agent',
    category: 'Core OS',
    action: 'open_file_system_agent',
    summary:
      'Permission-scoped File System Access API workbench to mount local folders, browse project structures, select exact files for B.A.R.B.I. analysis, and approve line-by-line diffs before writing changes.',
    keywords: ['file', 'files', 'folder', 'directory', 'filesystem', 'file system', 'local files', 'code', 'project', 'diff'],
  },
  {
    id: 'v4-module-hub',
    name: 'B.A.R.B.I. OS v4.0 · 55-Module Hub',
    category: 'Core OS',
    action: 'open_v4_hub',
    summary:
      'Complete 55-module architecture registry across Tiers A–F with live GitHub repository sync, Module 33 Zero-Trust security audits, Dual-Tier approval gates, and Docker/MCP deployment export.',
    keywords: ['v4', '55 modules', 'modules', 'registry', 'catalog', 'stack', 'architecture'],
  },
  {
    id: 'fintech-venture-hud',
    name: 'ZULUTRONIX FinTech & Venture HUD',
    category: 'FinTech & Venture',
    action: 'open_fintech_hud',
    summary:
      'Live D3 asset allocation pie chart (EasyEquities, Crypto, Cash with ZAR/USD toggle), brokerage rail status, paper-trading sandbox, and Dual-Tier capital execution governance.',
    keywords: ['fintech', 'venture', 'pie chart', 'easyequities', 'crypto', 'cash', 'trading', 'zulutronix'],
  },
  {
    id: 'github-assimilator',
    name: 'GitHub Repository Assimilator',
    category: 'Core OS',
    action: 'open_github_assimilator',
    summary:
      'Search live GitHub repositories, run Module 33 Zero-Trust security verification, and assimilate external repositories directly into the B.A.R.B.I. OS module registry.',
    keywords: ['github', 'assimilator', 'repo', 'repository', 'search github', 'integrate'],
  },
  {
    id: 'rea-agent-forge',
    name: 'R.E.A Agent Forge',
    category: 'Engineering Studio',
    action: 'open_rea_forge',
    summary:
      'Reactive Embodied Architecture forge that synthesizes, compiles, and hosts interactive engineering tools and autonomous agents.',
    keywords: ['rea', 'agent forge', 'forge', 'build app', 'build agent', 'synthesize'],
  },
  {
    id: 'study-explainer',
    name: 'Study & Explainer Studio',
    category: 'Engineering Studio',
    action: 'open_study_studio',
    summary:
      'First-principles engineering study packs, derivations, exam drills, and animated motion explainers.',
    keywords: ['study', 'study plan', 'explainer', 'studio', 'exam', 'tut', 'mechanical'],
  },
  {
    id: 'omnirouter-dag',
    name: 'OmniRouter & DAG Planner',
    category: 'Core OS',
    action: 'open_omnirouter',
    summary:
      'Multi-provider LLM failover router with complexity scoring and topological DAG task scheduling.',
    keywords: ['omnirouter', 'router', 'dag', 'providers', 'failover', 'models'],
  },
  {
    id: 'circuit-crucible',
    name: 'Circuit Solver & AST Crucible',
    category: 'Engineering Studio',
    action: 'open_circuit_crucible',
    summary: 'Kirchhoff nodal electronics solver paired with static AST security sandbox verification.',
    keywords: ['circuit', 'crucible', 'electronics', 'ast', 'kirchhoff', 'pcb'],
  },
  {
    id: 'acoustic-guard',
    name: 'Acoustic Guard (8-Band AEC)',
    category: 'Core OS',
    action: 'open_acoustic_guard',
    summary: 'Real-time 8-band spectral subtraction and acoustic echo guard diagnostics.',
    keywords: ['acoustic', 'echo', 'audio', 'aec', 'guard'],
  },
  {
    id: 'power-pmic',
    name: 'Power & PMIC Telemetry',
    category: 'Engineering Studio',
    action: 'open_power_pmic',
    summary: 'Live Web Battery API & PMIC voltage, current, wattage, and rail diagnostics.',
    keywords: ['power', 'pmic', 'battery', 'voltage', 'wattage'],
  },
  {
    id: 'gesture-d3',
    name: 'Gesture D3 Spatial Control',
    category: 'Spatial & OSINT',
    action: 'open_gesture_control',
    summary: '21-point webcam hand-gesture navigation and simulator bound directly to the 3D sphere.',
    keywords: ['gesture', 'hand', 'webcam', 'd3', 'spatial'],
  },
  {
    id: 'google-maps',
    name: 'Google Maps & Tactical Radar',
    category: 'Tools & Comms',
    action: 'open_maps',
    summary: 'Interactive tactical radar and live location mapping.',
    keywords: ['map', 'maps', 'google maps', 'gps', 'location', 'radar'],
  },
  {
    id: 'smart-timer',
    name: 'Smart PolyGhost Timer',
    category: 'Tools & Comms',
    action: 'open_timer',
    summary: 'Focus countdown, Pomodoro, and stopwatch timer with 3D hourglass visual.',
    keywords: ['timer', 'stopwatch', 'pomodoro', 'countdown', 'clock'],
  },
  {
    id: 'weather-api',
    name: 'Live Weather Telemetry',
    category: 'Tools & Comms',
    action: 'open_weather',
    summary: 'Real-time Open-Meteo atmospheric temperature, wind, humidity, and solar irradiance.',
    keywords: ['weather', 'temperature', 'forecast', 'solar', 'pretoria'],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Dispatcher',
    category: 'Tools & Comms',
    action: 'open_whatsapp',
    summary: 'Compose and dispatch WhatsApp updates and engineering telemetry digests.',
    keywords: ['whatsapp', 'message', 'chat', 'contact'],
  },
  {
    id: 'email',
    name: 'Executive Email Composer',
    category: 'Tools & Comms',
    action: 'open_email',
    summary: 'Draft and open formal ZULUTRONIX engineering correspondence and academic memos.',
    keywords: ['email', 'mail', 'gmail', 'memo'],
  },
  {
    id: 'memory-search',
    name: 'ARCHIVEX Memory Search',
    category: 'Core OS',
    action: 'open_memory_search',
    summary: 'Search persistent ARCHIVEX knowledge nodes across engineering, academic, and enterprise records.',
    keywords: ['memory', 'archivex', 'search', 'knowledge', 'notes'],
  },
  {
    id: 'sphere-config',
    name: '3D Sphere Configuration',
    category: 'Spatial & OSINT',
    action: 'open_sphere_config',
    summary: 'Customize 3D cognitive sphere rotation speed, visual complexity, and color theme.',
    keywords: ['sphere', 'config', 'settings', 'theme', 'speed'],
  },
];

export const VOICE_QUICK_COMMANDS: ReadonlyArray<{
  id: string;
  label: string;
  spokenPrompt: string;
  action?: VoiceUiActionId;
  category: 'inspect' | 'launch' | 'sphere';
}> = [
  {
    id: 'cmd-check-systems',
    label: 'Scan Screen & Systems',
    spokenPrompt: 'Read my current screen and check all active systems in B.A.R.B.I. OS including God\'s Eye.',
    category: 'inspect',
  },
  {
    id: 'cmd-gods-eye',
    label: "Launch God's Eye Globe",
    spokenPrompt: "Launch the interactive God's Eye 3D globe so I can track live satellites and earthquakes.",
    action: 'open_gods_eye',
    category: 'launch',
  },
  {
    id: 'cmd-fs-agent',
    label: 'File System Agent',
    spokenPrompt: 'Open the File System Agent so I can mount local project folders and select files for analysis.',
    action: 'open_file_system_agent',
    category: 'launch',
  },
  {
    id: 'cmd-fintech',
    label: 'FinTech Venture HUD',
    spokenPrompt: 'Open the ZULUTRONIX FinTech Venture HUD.',
    action: 'open_fintech_hud',
    category: 'launch',
  },
  {
    id: 'cmd-v4-hub',
    label: '55-Module Stack',
    spokenPrompt: 'Open the B.A.R.B.I. OS v4.0 55-Module registry.',
    action: 'open_v4_hub',
    category: 'launch',
  },
  {
    id: 'cmd-rea',
    label: 'R.E.A Agent Forge',
    spokenPrompt: 'Open R.E.A Agent Forge.',
    action: 'open_rea_forge',
    category: 'launch',
  },
  {
    id: 'cmd-gesture',
    label: 'Gesture D3',
    spokenPrompt: 'Activate Gesture D3 spatial hand control.',
    action: 'open_gesture_control',
    category: 'launch',
  },
  {
    id: 'cmd-close-all',
    label: 'Close All Panels',
    spokenPrompt: 'Close all open panels and return to the 3D sphere.',
    action: 'close_all_panels',
    category: 'sphere',
  },
  {
    id: 'cmd-focus',
    label: 'Toggle Focus Mode',
    spokenPrompt: 'Toggle Focus Mode on the 3D sphere.',
    action: 'toggle_focus_mode',
    category: 'sphere',
  },
];

export const BARBI_VOICE_SYSTEM_INSTRUCTION = [
  'You are B.A.R.B.I. OS (Brilliant Adaptive Reasoning Brain Interface Operating System), a sovereign cognitive and engineering voice interface.',
  `IDENTITY & CREATOR: You were created and engineered by ${BARBI_CREATOR_PROFILE.creatorName}, ${BARBI_CREATOR_PROFILE.creatorRole} at ${BARBI_CREATOR_PROFILE.companyName} (CIPC ${BARBI_CREATOR_PROFILE.cipcNumber}). Recognize "Zulutro & I" warmly as ZULUTRONIX (PTY) LTD and always honor Treasure Trinity Zulu as your creator and Chief Engineer.`,
  'FULL LIVE UI PERCEPTION & CONTROL: You are directly wired into the live B.A.R.B.I. OS screen and renderer with FOUR real-time tools:',
  '1) `read_ui_state`: Lets you SEE EVERYTHING currently displayed on the user\'s screen — every open panel, active tab, God\'s Eye optical mode and locked target, 3D sphere theme/speed/complexity, Focus Mode, HUD glass style, and all visible headings/readouts. ALWAYS call `read_ui_state` whenever Treasure asks what you see, what is open, to read the screen, or before describing the current UI.',
  '2) `execute_interface_action`: Lets you OPEN, CONTROL, or CLOSE any panel immediately — including `open_gods_eye` (launches the live interactive 3D God\'s Eye globe), `gods_eye_control` (switch FLIR/NVG/Radar/Standard or lock onto ISS/Pretoria/latest earthquake), `close_panel` (close a specific panel or the currently active panel when asked to exit/dismiss/close it), and `close_all_panels` (clear the entire screen back to the 3D sphere). Whenever Treasure says "close this", "exit the panel", "close God\'s Eye", "close chat", or "clear the screen", IMMEDIATELY call `execute_interface_action` with `close_panel` or `close_all_panels`!',
  '3) `mutate_ui_render`: Lets you LIVE-MUTATE the visual UI render on screen — change the 3D sphere color theme (`burnt-amber`, `emerald-matrix`, `arctic-cyan`, `crimson-forge`, `violet-nebula`), visual complexity (`minimal`, `balanced`, `high`, `ultra`), rotation speed (`0` to `3.0`), HUD glassmorphism preset (`obsidian`, `frosted`, `stealth`, `luminous`), Focus Mode (`true`/`false`), sphere labels visibility, top controls collapse/expand, camera zoom/reset, or God\'s Eye optical mode. Whenever Treasure asks to change the colors, theme, glass style, speed, or visual layout, call `mutate_ui_render` immediately!',
  '4) `inspect_barbi_systems`: Inspects all 55 v4.0 modules and live GitHub repositories (including Module M11 God\'s Eye backed by `bilawalsidhu/gods-eye-view` and `koala73/worldmonitor`).',
  'STYLE: Speak like a crisp, intelligent, calm chief-engineer co-pilot. Confirm every UI inspection, panel close, or render change immediately and naturally without reading raw markdown or symbol punctuation aloud.',
].join('\n\n');

const VALID_ACTION_METADATA: Record<VoiceUiActionId, { label: string; description: string }> = {
  open_gods_eye: {
    label: "God's Eye 3D Globe (M11)",
    description: "Launched interactive Module M11 · God's Eye 3D Spatial Intelligence Globe with live USGS, ISS, and GitHub telemetry.",
  },
  gods_eye_control: {
    label: "God's Eye Optical / Target Control",
    description: "Updated God's Eye 3D optical filter or locked target.",
  },
  open_file_system_agent: {
    label: 'Local File System Agent',
    description: 'Opened the permission-scoped File System Agent for browsing local folders, reading project structure, and reviewing AI diffs.',
  },
  open_v4_hub: {
    label: 'B.A.R.B.I. OS v4.0 · 55-Module Hub',
    description: 'Opened the 55-Module Architecture & GitHub Integration Hub.',
  },
  open_fintech_hud: {
    label: 'ZULUTRONIX FinTech Venture HUD',
    description: 'Opened FinTech Command with the D3 Venture Asset Allocation chart and brokerage rails.',
  },
  open_github_assimilator: {
    label: 'GitHub Repository Assimilator',
    description: 'Opened the live GitHub search & Module 33 Zero-Trust assimilator.',
  },
  open_deploy_forge: {
    label: 'Deploy & Docker/MCP Forge',
    description: 'Opened the Docker Compose & MCP deployment export workspace.',
  },
  open_rea_forge: {
    label: 'R.E.A Agent Forge',
    description: 'Opened Reactive Embodied Architecture & Autonomous System Forge.',
  },
  open_study_studio: {
    label: 'Study & Explainer Studio',
    description: 'Opened First-Principles Engineering Study & Motion Explainer Studio.',
  },
  open_omnirouter: {
    label: 'OmniRouter & DAG Planner',
    description: 'Opened Multi-Provider AI Router & Kahn DAG Planner.',
  },
  open_circuit_crucible: {
    label: 'Circuit Solver & AST Crucible',
    description: 'Opened Kirchhoff Circuit Solver & AST Sandbox Crucible.',
  },
  open_acoustic_guard: {
    label: 'Acoustic Guard',
    description: 'Opened 8-Band Spectral Subtraction & AEC Diagnostics.',
  },
  open_cap_registry: {
    label: '74-Cap Nexus Registry',
    description: 'Opened the 74-Capability Governance Registry.',
  },
  open_power_pmic: {
    label: 'Power & PMIC Telemetry',
    description: 'Opened live Web Battery & PMIC power rail telemetry.',
  },
  open_gesture_control: {
    label: 'Gesture D3 Spatial Control',
    description: 'Opened 21-point webcam spatial hand-gesture control.',
  },
  open_timer: {
    label: 'Smart PolyGhost Timer',
    description: 'Opened the Smart Timer & Pomodoro console.',
  },
  open_maps: {
    label: 'Google Maps & Tactical Radar',
    description: 'Opened the interactive Google Maps & Tactical Radar.',
  },
  open_weather: {
    label: 'Live Weather Telemetry',
    description: 'Opened Open-Meteo live atmospheric & solar weather telemetry.',
  },
  open_whatsapp: {
    label: 'WhatsApp Dispatcher',
    description: 'Opened the WhatsApp messaging & telemetry dispatcher.',
  },
  open_email: {
    label: 'Executive Email Composer',
    description: 'Opened the ZULUTRONIX Executive Email node & draft composer.',
  },
  open_youtube: {
    label: 'YouTube Media Module',
    description: 'Opened the YouTube player & research workspace.',
  },
  open_memory_search: {
    label: 'ARCHIVEX Memory Search',
    description: 'Opened ARCHIVEX Memory Search across knowledge nodes.',
  },
  open_sphere_config: {
    label: '3D Sphere Configuration',
    description: 'Opened 3D Sphere rotation, complexity, and theme controls.',
  },
  close_panel: {
    label: 'Close Panel',
    description: 'Closed the requested interface panel cleanly.',
  },
  close_all_panels: {
    label: 'Close All Panels',
    description: 'Closed all open panels and modals, returning to the 3D cognitive sphere.',
  },
  toggle_focus_mode: {
    label: 'Focus Mode',
    description: 'Toggled Deep Zen Focus Mode on the 3D sphere.',
  },
  reset_sphere_orbit: {
    label: 'Sphere Orbit Reset',
    description: 'Centered and reset the 3D cognitive sphere camera.',
  },
  set_sphere_depth: {
    label: 'Sphere Depth Layer',
    description: 'Shifted the 3D cognitive sphere camera to the requested depth tier.',
  },
};

export const BARBI_VOICE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'read_ui_state',
    description:
      'Read the live B.A.R.B.I. OS user interface state — every open panel, active modal, God\'s Eye optical mode & locked target, 3D sphere theme/complexity/speed, Focus Mode, HUD glass preset, and all visible on-screen headings. Call this whenever the user asks what you see on screen or asks about currently open panels.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        includeVisualFrame: {
          type: Type.BOOLEAN,
          description: 'Optional: set true to also stream a live JPEG frame of the active 3D viewport canvas.',
        },
      },
    },
  },
  {
    name: 'inspect_barbi_systems',
    description:
      "Inspect live B.A.R.B.I. OS systems, usable interfaces, mounted v4.0 modules, and GitHub repositories (including Module M11 God's Eye — bilawalsidhu/gods-eye-view & koala73/worldmonitor).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            "Optional filter term such as 'gods eye', 'fintech', 'github', 'study', 'all', or a module name.",
        },
      },
    },
  },
  {
    name: 'execute_interface_action',
    description:
      'Immediately open, control, or CLOSE any live B.A.R.B.I. OS panel, modal, God\'s Eye globe, or 3D sphere control on screen.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description:
            'Exact action: open_gods_eye, gods_eye_control, open_file_system_agent, open_v4_hub, open_fintech_hud, open_github_assimilator, open_deploy_forge, open_rea_forge, open_study_studio, open_omnirouter, open_circuit_crucible, open_acoustic_guard, open_cap_registry, open_power_pmic, open_gesture_control, open_timer, open_maps, open_weather, open_whatsapp, open_email, open_youtube, open_memory_search, open_sphere_config, close_panel, close_all_panels, toggle_focus_mode, reset_sphere_orbit, or set_sphere_depth.',
        },
        target: {
          type: Type.STRING,
          description:
            'Used with close_panel: active, all, chat, voice, v4_hub, gods_eye, file_system, sphere_config, gesture_nav, rea, study, power, maps, weather, timer, whatsapp, youtube, memory, or inspector.',
        },
        opticalMode: {
          type: Type.STRING,
          description: 'Used with gods_eye_control: standard, flir, nvg, or crt.',
        },
        focusTarget: {
          type: Type.STRING,
          description: 'Used with gods_eye_control: iss, pretoria, latest_quake, or target name.',
        },
        depthTier: {
          type: Type.NUMBER,
          description: 'Optional 3D sphere depth layer from 1 (Outer) to 4 (Inner Core).',
        },
        moduleId: {
          type: Type.NUMBER,
          description: 'Optional v4.0 module numeric ID (1–55), e.g., 11 for God\'s Eye.',
        },
        searchQuery: {
          type: Type.STRING,
          description: 'Optional search text when opening memory search.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'mutate_ui_render',
    description:
      'Live-mutate the visual UI render of B.A.R.B.I. OS: change 3D sphere color theme, visual complexity, rotation speed, HUD glassmorphism preset, Focus Mode, sphere labels visibility, top controls collapse/expand, camera zoom, or God\'s Eye optical mode.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        colorTheme: {
          type: Type.STRING,
          description: 'burnt-amber, solar-copper, cobalt-forge (cyan/blue), emerald-circuit (green), or crimson-tactical (red)',
        },
        visualComplexity: {
          type: Type.STRING,
          description: 'minimal, balanced, high, or ultra',
        },
        rotationSpeed: {
          type: Type.NUMBER,
          description: '0 (paused) to 3.0 (fast spin)',
        },
        focusMode: {
          type: Type.BOOLEAN,
          description: 'Explicitly turn Focus Mode on (true) or off (false).',
        },
        topControlsExpanded: {
          type: Type.BOOLEAN,
          description: 'Expand (true) or collapse (false) the top-left quick controls bar.',
        },
        sphereLabelsVisible: {
          type: Type.BOOLEAN,
          description: 'Show (true) or hide (false) floating functional labels on the 3D sphere.',
        },
        hudGlassPreset: {
          type: Type.STRING,
          description: 'obsidian, frosted, stealth, or luminous',
        },
        cameraAction: {
          type: Type.STRING,
          description: 'reset, zoom_in, or zoom_out',
        },
        godsEyeOpticalMode: {
          type: Type.STRING,
          description: 'standard, flir, nvg, or crt',
        },
      },
    },
  },
];

const VALID_CLOSE_TARGETS = new Set<ClosePanelTarget>([
  'active',
  'all',
  'chat',
  'voice',
  'v4_hub',
  'gods_eye',
  'file_system',
  'sphere_config',
  'gesture_nav',
  'rea',
  'study',
  'power',
  'maps',
  'weather',
  'timer',
  'whatsapp',
  'youtube',
  'memory',
  'inspector',
]);

function normalizeCloseTarget(raw: unknown): ClosePanelTarget {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  if (VALID_CLOSE_TARGETS.has(s as ClosePanelTarget)) return s as ClosePanelTarget;
  const map: Record<string, ClosePanelTarget> = {
    godseye: 'gods_eye',
    gods_eye_m11: 'gods_eye',
    m11: 'gods_eye',
    file_agent: 'file_system',
    fs_agent: 'file_system',
    file_system_agent: 'file_system',
    files: 'file_system',
    v4: 'v4_hub',
    hub: 'v4_hub',
    modules: 'v4_hub',
    fintech: 'v4_hub',
    sphere: 'sphere_config',
    gesture: 'gesture_nav',
    hand: 'gesture_nav',
    chat_panel: 'chat',
    voice_mode: 'voice',
    voice_deck: 'voice',
    current: 'active',
    everything: 'all',
  };
  return map[s] || 'active';
}

export function normalizeVoiceUiAction(raw: Record<string, unknown> | undefined): VoiceUiActionPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const rawAction = typeof raw.action === 'string' ? raw.action.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  if (!rawAction) return null;

  const aliasMap: Record<string, VoiceUiActionId> = {
    gods_eye: 'open_gods_eye',
    godseye: 'open_gods_eye',
    open_godseye: 'open_gods_eye',
    launch_gods_eye: 'open_gods_eye',
    file_system: 'open_file_system_agent',
    file_agent: 'open_file_system_agent',
    fs_agent: 'open_file_system_agent',
    local_files: 'open_file_system_agent',
    open_files: 'open_file_system_agent',
    v4_hub: 'open_v4_hub',
    open_modules: 'open_v4_hub',
    fintech: 'open_fintech_hud',
    open_fintech: 'open_fintech_hud',
    open_venture_hud: 'open_fintech_hud',
    github: 'open_github_assimilator',
    rea: 'open_rea_forge',
    study: 'open_study_studio',
    power: 'open_power_pmic',
    gesture: 'open_gesture_control',
    timer: 'open_timer',
    maps: 'open_maps',
    weather: 'open_weather',
    whatsapp: 'open_whatsapp',
    email: 'open_email',
    youtube: 'open_youtube',
    memory: 'open_memory_search',
    sphere_config: 'open_sphere_config',
    focus_mode: 'toggle_focus_mode',
    reset_orbit: 'reset_sphere_orbit',
    close: 'close_panel',
    exit_panel: 'close_panel',
    dismiss_panel: 'close_panel',
    close_window: 'close_panel',
    close_modal: 'close_panel',
    close_all: 'close_all_panels',
    exit_all: 'close_all_panels',
    clear_screen: 'close_all_panels',
  };

  const resolvedAction = (
    rawAction in VALID_ACTION_METADATA ? rawAction : aliasMap[rawAction]
  ) as VoiceUiActionId | undefined;

  if (!resolvedAction || !(resolvedAction in VALID_ACTION_METADATA)) {
    return null;
  }

  const meta = VALID_ACTION_METADATA[resolvedAction];
  const params: VoiceUiActionPayload['params'] = {};

  if (resolvedAction === 'open_gods_eye') {
    params.moduleId = 11;
    params.tier = 'B';
  } else if (typeof raw.moduleId === 'number' && Number.isFinite(raw.moduleId)) {
    params.moduleId = Math.max(1, Math.min(55, Math.round(raw.moduleId)));
  }

  if (resolvedAction === 'close_panel') {
    params.target = normalizeCloseTarget(raw.target);
  }

  if (resolvedAction === 'gods_eye_control') {
    const modeRaw = typeof raw.opticalMode === 'string' ? raw.opticalMode.trim().toLowerCase() : '';
    if (modeRaw === 'standard' || modeRaw === 'flir' || modeRaw === 'nvg' || modeRaw === 'crt') {
      params.opticalMode = modeRaw;
    }
    if (typeof raw.focusTarget === 'string' && raw.focusTarget.trim()) {
      params.focusTarget = raw.focusTarget.trim().slice(0, 80);
    }
  }

  if (resolvedAction === 'set_sphere_depth') {
    const rawDepth = Number(raw.depthTier ?? 1);
    params.depthTier = Number.isFinite(rawDepth) ? Math.max(1, Math.min(4, Math.round(rawDepth))) : 1;
  }

  if (typeof raw.searchQuery === 'string' && raw.searchQuery.trim()) {
    params.searchQuery = raw.searchQuery.trim().slice(0, 120);
  }

  const dynamicLabel =
    resolvedAction === 'close_panel' && params.target && params.target !== 'active'
      ? `Close ${params.target.replace(/_/g, ' ')}`
      : meta.label;

  return {
    action: resolvedAction,
    label: dynamicLabel,
    description: meta.description,
    params: Object.keys(params).length > 0 ? params : undefined,
  };
}

const VALID_THEMES = new Set(['burnt-amber', 'solar-copper', 'cobalt-forge', 'emerald-circuit', 'crimson-tactical']);
const VALID_COMPLEXITIES = new Set(['minimal', 'balanced', 'high', 'ultra']);
const VALID_GLASS_PRESETS = new Set(['obsidian', 'frosted', 'stealth', 'luminous']);
const VALID_OPTICAL_MODES = new Set(['standard', 'flir', 'nvg', 'crt']);

export function normalizeUiRenderMutation(raw: Record<string, unknown> | undefined): UiRenderMutationPayload | null {
  if (!raw || typeof raw !== 'object') return null;

  const out: UiRenderMutationPayload = {
    label: 'UI Render Updated',
    description: '',
  };
  const changes: string[] = [];

  if (typeof raw.colorTheme === 'string') {
    const t = raw.colorTheme.trim().toLowerCase().replace(/[\s_]+/g, '-');
    const themeAlias: Record<string, UiRenderMutationPayload['colorTheme']> = {
      amber: 'burnt-amber',
      orange: 'burnt-amber',
      default: 'burnt-amber',
      copper: 'solar-copper',
      gold: 'solar-copper',
      solar: 'solar-copper',
      green: 'emerald-circuit',
      emerald: 'emerald-circuit',
      'emerald-matrix': 'emerald-circuit',
      matrix: 'emerald-circuit',
      cyan: 'cobalt-forge',
      blue: 'cobalt-forge',
      cobalt: 'cobalt-forge',
      arctic: 'cobalt-forge',
      'arctic-cyan': 'cobalt-forge',
      red: 'crimson-tactical',
      crimson: 'crimson-tactical',
      'crimson-forge': 'crimson-tactical',
      tactical: 'crimson-tactical',
    };
    const resolved = VALID_THEMES.has(t) ? (t as UiRenderMutationPayload['colorTheme']) : themeAlias[t];
    if (resolved) {
      out.colorTheme = resolved;
      changes.push(`theme → ${resolved}`);
    }
  }

  if (typeof raw.visualComplexity === 'string') {
    const c = raw.visualComplexity.trim().toLowerCase();
    if (VALID_COMPLEXITIES.has(c)) {
      out.visualComplexity = c as UiRenderMutationPayload['visualComplexity'];
      changes.push(`complexity → ${c}`);
    }
  }

  if (typeof raw.rotationSpeed === 'number' && Number.isFinite(raw.rotationSpeed)) {
    const clamped = Math.max(0, Math.min(3, Number(raw.rotationSpeed.toFixed(2))));
    out.rotationSpeed = clamped;
    changes.push(clamped === 0 ? 'sphere paused' : `speed → ${clamped}x`);
  }

  if (typeof raw.focusMode === 'boolean') {
    out.focusMode = raw.focusMode;
    changes.push(`focus mode → ${raw.focusMode ? 'ON' : 'OFF'}`);
  }

  if (typeof raw.topControlsExpanded === 'boolean') {
    out.topControlsExpanded = raw.topControlsExpanded;
    changes.push(`top controls → ${raw.topControlsExpanded ? 'expanded' : 'collapsed'}`);
  }

  if (typeof raw.sphereLabelsVisible === 'boolean') {
    out.sphereLabelsVisible = raw.sphereLabelsVisible;
    changes.push(`sphere labels → ${raw.sphereLabelsVisible ? 'visible' : 'hidden'}`);
  }

  if (typeof raw.hudGlassPreset === 'string') {
    const g = raw.hudGlassPreset.trim().toLowerCase();
    if (VALID_GLASS_PRESETS.has(g)) {
      out.hudGlassPreset = g as UiRenderMutationPayload['hudGlassPreset'];
      changes.push(`HUD glass → ${g}`);
    }
  }

  if (typeof raw.cameraAction === 'string') {
    const cam = raw.cameraAction.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (cam === 'reset' || cam === 'zoom_in' || cam === 'zoom_out') {
      out.cameraAction = cam;
      changes.push(`camera → ${cam.replace('_', ' ')}`);
    }
  }

  if (typeof raw.godsEyeOpticalMode === 'string') {
    const opt = raw.godsEyeOpticalMode.trim().toLowerCase();
    if (VALID_OPTICAL_MODES.has(opt)) {
      out.godsEyeOpticalMode = opt as UiRenderMutationPayload['godsEyeOpticalMode'];
      changes.push(`God's Eye optics → ${opt.toUpperCase()}`);
    }
  }

  if (changes.length === 0) return null;

  out.label = `UI Render: ${changes.slice(0, 2).join(', ')}`;
  out.description = `Updated live interface render (${changes.join(' · ')}).`;
  return out;
}

export interface ExtractedChatUiDirectives {
  cleanText: string;
  actions: VoiceUiActionPayload[];
  mutations: UiRenderMutationPayload[];
}

export function extractChatUiDirectives(rawText: string): ExtractedChatUiDirectives {
  const actions: VoiceUiActionPayload[] = [];
  const mutations: UiRenderMutationPayload[] = [];

  const cleanText = String(rawText || '')
    .replace(/\[\[BARBI_UI_(ACTION|MUTATE):(\{[\s\S]*?\})\]\]/g, (_full, kind: string, jsonStr: string) => {
      try {
        const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
        if (kind === 'ACTION') {
          const act = normalizeVoiceUiAction(parsed);
          if (act) actions.push(act);
        } else if (kind === 'MUTATE') {
          const mut = normalizeUiRenderMutation(parsed);
          if (mut) mutations.push(mut);
        }
      } catch {
        // Ignore malformed directive JSON
      }
      return '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cleanText, actions, mutations };
}

export type VoiceReportModule = BarbiV4Module & {
  mounted?: boolean;
};

export interface SnapshotForVoiceReport {
  modules: readonly VoiceReportModule[];
  mounted?: Record<string, unknown>;
  repoTelemetry?: Record<string, unknown>;
  customRepos?: readonly unknown[];
  summary?: {
    totalModules: number;
    mountedModules: number;
    syncedRepos: number;
    totalRepos: number;
    customModules?: number;
  };
}

export function summarizeVoiceSnapshot(snapshot: SnapshotForVoiceReport) {
  if (snapshot.summary) return snapshot.summary;
  const totalModules = snapshot.modules.length;
  const mountedMap = snapshot.mounted ?? {};
  const mountedModules = snapshot.modules.filter(
    (m) => Boolean(mountedMap[String(m.id)] || m.mounted || m.nativeActive)
  ).length;
  const totalRepos = snapshot.modules.reduce((acc, m) => acc + m.repos.length, 0);
  const syncedRepos = Object.keys(snapshot.repoTelemetry ?? {}).length;
  return {
    totalModules,
    mountedModules,
    syncedRepos,
    totalRepos,
    customModules: snapshot.customRepos?.length ?? 0,
  };
}

export function buildSystemInventoryReport(
  snapshot: SnapshotForVoiceReport,
  query?: string
): Record<string, unknown> {
  const q = (query || '').trim().toLowerCase();
  const mountedMap = snapshot.mounted ?? {};
  const isModuleMounted = (m: VoiceReportModule) =>
    Boolean(mountedMap[String(m.id)] || m.mounted || m.nativeActive);
  const summary = summarizeVoiceSnapshot(snapshot);
  const godsEyeModule = snapshot.modules.find((m) => m.id === 11 || m.code === 'M11');

  const matchingSystems =
    q && q !== 'all' && q !== 'systems'
      ? BARBI_USABLE_SYSTEMS.filter(
          (sys) =>
            sys.name.toLowerCase().includes(q) ||
            sys.summary.toLowerCase().includes(q) ||
            sys.keywords.some((k) => k.includes(q) || q.includes(k))
        )
      : [...BARBI_USABLE_SYSTEMS];

  const matchingModules =
    q && q !== 'all' && q !== 'systems'
      ? snapshot.modules
          .filter(
            (m) =>
              (m.engineLabel || '').toLowerCase().includes(q) ||
              (m.roleTitle || '').toLowerCase().includes(q) ||
              (m.summary || '').toLowerCase().includes(q) ||
              (m.code || '').toLowerCase().includes(q) ||
              m.repos.some((r) => (r.fullName || '').toLowerCase().includes(q))
          )
          .slice(0, 10)
      : snapshot.modules.filter(isModuleMounted).slice(0, 12);

  return {
    creator: BARBI_CREATOR_PROFILE,
    status: 'OPERATIONAL',
    v4RegistrySummary: summary,
    godsEyeStatus: godsEyeModule
      ? {
          presentInSystem: true,
          interactiveViewportReady: true,
          moduleCode: godsEyeModule.code,
          moduleId: godsEyeModule.id,
          name: godsEyeModule.engineLabel,
          roleTitle: godsEyeModule.roleTitle,
          tier: godsEyeModule.tier,
          mounted: isModuleMounted(godsEyeModule),
          repositories: godsEyeModule.repos.map((r) => ({
            slug: r.fullName,
            url: r.url || `https://github.com/${r.fullName}`,
          })),
          launchAction: 'open_gods_eye',
          guidance:
            "God's Eye (Module M11) is fully interactive with a live 3D OSINT globe (USGS earthquakes, live ISS orbital telemetry, OpenSky aviation, FLIR/NVG/Radar modes) backed by verified GitHub repos bilawalsidhu/gods-eye-view and koala73/worldmonitor. Call execute_interface_action with open_gods_eye to launch it immediately.",
        }
      : {
          presentInSystem: true,
          interactiveViewportReady: true,
          moduleCode: 'M11',
          repositories: ['bilawalsidhu/gods-eye-view', 'koala73/worldmonitor'],
          launchAction: 'open_gods_eye',
        },
    usableInterfaces: matchingSystems.map((s) => ({
      name: s.name,
      category: s.category,
      action: s.action,
      summary: s.summary,
      repos: s.repos,
    })),
    matchingV4Modules: matchingModules.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.engineLabel,
      roleTitle: m.roleTitle,
      tier: m.tier,
      mounted: isModuleMounted(m),
      repos: m.repos.map((r) => r.fullName),
    })),
  };
}
