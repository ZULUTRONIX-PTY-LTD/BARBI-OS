export type V4TierId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type GovernanceTier = 'PRE_AUTHORIZED' | 'CAPITAL_GATE';

export type ModuleExecutionMode = 'PAPER_SANDBOX' | 'LIVE_APPROVED' | 'NATIVE_RUNTIME';

export type IntegrationPackId =
  | 'pack-1-core'
  | 'pack-2-fintech'
  | 'pack-3-spatial'
  | 'pack-4-factory'
  | 'pack-5-embodiment'
  | 'pack-6-intel';

export interface GitHubRepoSpec {
  owner: string;
  repo: string;
  fullName: string;
  url: string;
  role: string;
  installCmd: string;
  mcpReady?: boolean;
  dockerImage?: string;
  defaultPort?: number;
}

export interface LiveGitHubRepoTelemetry {
  fullName: string;
  htmlUrl: string;
  description: string;
  stars: number | null;
  forks: number | null;
  openIssues: number | null;
  language: string;
  license: string;
  defaultBranch: string;
  pushedAt: string | null;
  archived: boolean;
  topics: string[];
  topLevelFiles: string[];
  source: 'github-live' | 'github-search-resolved' | 'github-fallback';
  syncedAt: string;
  securityAudit: {
    status: 'VERIFIED' | 'CAUTION' | 'UNVERIFIED';
    score: number;
    checks: string[];
  };
}

export interface BarbiV4Module {
  id: number;
  code: string;
  tier: V4TierId;
  tierName: string;
  engineLabel: string;
  roleTitle: string;
  summary: string;
  governanceTier: GovernanceTier;
  integrationPack: IntegrationPackId;
  nativeActive: boolean;
  nativeCapabilityNote?: string;
  repos: GitHubRepoSpec[];
  envVars: string[];
}

export interface CustomAssimilatedRepo {
  id: string;
  fullName: string;
  htmlUrl: string;
  description: string;
  stars: number;
  language: string;
  license: string;
  tier: V4TierId;
  governanceTier: GovernanceTier;
  mountedAt: string;
  installCmd: string;
  securityStatus: 'VERIFIED' | 'CAUTION' | 'UNVERIFIED';
}

export interface MountedModuleRecord {
  moduleId: number;
  mountedAt: string;
  executionMode: ModuleExecutionMode;
  approvalSignature?: string;
  approvedBy?: string;
  lastSyncedAt?: string;
}

export interface FinTechRailStatus {
  id: string;
  moduleId: number;
  name: string;
  engine: string;
  category: 'EQUITIES' | 'FOREX' | 'CRYPTO' | 'PAYMENTS' | 'COMMERCE' | 'CONTENT' | 'ACCOUNTING';
  currency: 'ZAR' | 'USD' | 'MULTI';
  sandboxMode: boolean;
  approvalRequiredForLive: boolean;
  paperBalanceLabel: string;
  paperReturnLabel: string;
  riskLimitLabel: string;
  repoFullName: string;
  statusNote: string;
}

export const BARBI_COMPANY_NAME = 'ZULUTRONIX (PTY) LTD';
export const BARBI_OS_VERSION = 'v4.0';

export const V4_TIERS: ReadonlyArray<{
  id: V4TierId;
  label: string;
  shortLabel: string;
  range: string;
  description: string;
}> = [
  {
    id: 'A',
    label: 'Tier A · Core Cognition & Free-Tier Routing',
    shortLabel: 'A · Core',
    range: '01–10',
    description: 'Zero-downtime free-tier LLM routing, metacognition, glassmorphic HUD, WhatsApp VoIP, eye-gaze accessibility, full-duplex voice, live web reflex & GitHub self-mutation.',
  },
  {
    id: 'B',
    label: "Tier B · God's Eye, Spatial 3D & Multimodal Studio",
    shortLabel: 'B · Spatial',
    range: '11–15',
    description: "3D WebGL global OSINT globe, Gaussian splat scene reconstruction, streaming latent visual synthesis, omnidirectional video/audio creation & multimodal perception.",
  },
  {
    id: 'C',
    label: 'Tier C · Autonomous Venture Factory, Cloud Mesh & Lab',
    shortLabel: 'C · Factory',
    range: '16–21',
    description: 'Autonomous SaaS/PaaS/RaaS platform builder, cloud APK/Tauri binary compilers, Playwright/k6 QA lab, ZeroGPU compute mesh, NotebookLM hub & science sandboxes.',
  },
  {
    id: 'D',
    label: 'Tier D · Cross-Platform Embodiment, Memory & Zero-Trust',
    shortLabel: 'D · Embodied',
    range: '22–33',
    description: 'Android & desktop GUI automation, YOLO/SAM2 computer vision, 24/7 Screenpipe memory, 400+ app webhook bus, OpenBB/DocuSeal/Web3, IoT MQTT, Qdrant/Mem0 & security watchdog.',
  },
  {
    id: 'E',
    label: 'Tier E · Institutional Intel, Career & Web Reverse-Eng',
    shortLabel: 'E · Intel',
    range: '34–44',
    description: 'Autonomous web-to-feature extraction, Stats SA / SARB / World Bank telemetry, autonomous career applicant, 250M+ academic graph, symbolic engineering solver & utility suite.',
  },
  {
    id: 'F',
    label: 'Tier F · FinTech, Algo Trading & Digital Entrepreneurship',
    shortLabel: 'F · FinTech',
    range: '45–55',
    description: 'EasyEquities ZAR/USD/TFSA portfolio tracking, multi-agent equity research, MT5/Jesse Forex, Freqtrade/Hummingbot crypto, PayPal MCP, MedusaJS, content/affiliate pipelines & accounting.',
  },
];

export const INTEGRATION_PACKS: ReadonlyArray<{
  id: IntegrationPackId;
  name: string;
  shortName: string;
  description: string;
  moduleIds: number[];
}> = [
  {
    id: 'pack-1-core',
    name: 'Pack 1 · Core Brain Switcher + Glassmorphic HUD + WhatsApp Bridge',
    shortName: 'Pack 1 · Core & Comms',
    description: 'Free-tier LLM failover router, LangGraph/Hermes kernel, AG-UI glassmorphic HUD, WAHA WhatsApp VoIP/messaging, Pipecat voice, SearXNG/Firecrawl live web reflex, OpenHands & Qdrant/Mem0.',
    moduleIds: [1, 2, 3, 4, 6, 7, 8, 10, 32, 33],
  },
  {
    id: 'pack-2-fintech',
    name: 'Pack 2 · FinTech, EasyEquities, PayPal MCP & Trading Command Center',
    shortName: 'Pack 2 · FinTech & Venture',
    description: 'EasyEquities ZAR/USD/TFSA client, FinGPT + TradingAgents, MT5/Jesse Forex sandbox, Freqtrade/Hummingbot crypto bots, PayPal MCP invoicing, MedusaJS store, Firefly III/Actual Budget & Optuna/LangFuse.',
    moduleIds: [29, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55],
  },
  {
    id: 'pack-3-spatial',
    name: "Pack 3 · God's Eye Global OSINT, Spatial 3D & Creative Studio",
    shortName: "Pack 3 · God's Eye & 3D",
    description: "God's Eye 3D globe, World Monitor OSINT, Gaussian splat reconstruction, ComfyUI streaming visuals, Wan 2.2 / Flux / ACE-Step studio & Qwen2.5-VL perception.",
    moduleIds: [11, 12, 13, 14, 15, 41],
  },
  {
    id: 'pack-4-factory',
    name: 'Pack 4 · Autonomous SaaS/APK Factory, ZeroGPU Mesh & Academic Lab',
    shortName: 'Pack 4 · SaaS Factory & Lab',
    description: 'MetaGPT + WebLLM venture architect, Tauri/APK binary compiler, Playwright MCP + k6 QA lab, SkyPilot compute mesh, Open Notebook + RAGFlow & Manim science simulator.',
    moduleIds: [16, 17, 18, 19, 20, 21, 38, 39],
  },
  {
    id: 'pack-5-embodiment',
    name: 'Pack 5 · Cross-Device Embodiment, Vision & Omnichannel Bus',
    shortName: 'Pack 5 · Embodiment & IoT',
    description: 'Eye-cursor accessibility, Droidrun Android MCP, UI-TARS desktop hands, Browser-Use, YOLO/SAM2 vision, Screenpipe photographic memory, OpenClaw/n8n, Home Assistant MQTT & Syncthing.',
    moduleIds: [5, 22, 23, 24, 25, 26, 27, 28, 30, 31],
  },
  {
    id: 'pack-6-intel',
    name: 'Pack 6 · Institutional Feeds, Web Reverse-Engineering & Career Engine',
    shortName: 'Pack 6 · Intel & Career',
    description: 'Web-to-Feature reverse engineering, Stats SA / SARB & World Bank APIs, AIHawk career auto-applicant, GitHub/HF innovation radar, corporate due-diligence & CyberChef/Excalidraw suite.',
    moduleIds: [9, 34, 35, 36, 37, 40, 42, 43, 44],
  },
];

function repoSpec(
  owner: string,
  repo: string,
  role: string,
  installCmd: string,
  extras?: { mcpReady?: boolean; dockerImage?: string; defaultPort?: number }
): GitHubRepoSpec {
  const fullName = `${owner}/${repo}`;
  return {
    owner,
    repo,
    fullName,
    url: `https://github.com/${fullName}`,
    role,
    installCmd,
    ...(extras || {}),
  };
}

export const BARBI_V4_MODULES: ReadonlyArray<BarbiV4Module> = [
  // ======================== TIER A (1-10) ========================
  {
    id: 1,
    code: 'M01',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'quantum-free-router + FreeLLM',
    roleTitle: 'Zero-Downtime Free-Tier Brain Switcher',
    summary: 'Tracks real-time RPM/TPM quotas across Google AI Studio, Groq, Cerebras, OpenRouter :free, GitHub Models, and Ollama to hot-swap inference slots mid-stream before 429 interruptions.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-1-core',
    nativeActive: true,
    nativeCapabilityNote: 'Natively active in B.A.R.B.I. Provider Registry & Pooled Executor',
    repos: [
      repoSpec('BerriAI', 'litellm', 'Multi-provider OpenAI-compatible router & free-tier fallback proxy', 'pip install "litellm[proxy]"', { dockerImage: 'ghcr.io/berriai/litellm:main-latest', defaultPort: 4000 }),
      repoSpec('openrouter-team', 'openrouter-examples', 'OpenRouter :free pool failover patterns', 'git clone https://github.com/openrouter-team/openrouter-examples.git'),
    ],
    envVars: ['GEMINI_API_KEY', 'GROQ_API_KEY', 'CEREBRAS_API_KEY', 'OPENROUTER_API_KEY'],
  },
  {
    id: 2,
    code: 'M02',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'Hermes Agent + LangGraph',
    roleTitle: 'Core Reasoning Kernel & Metacognitive Gate',
    summary: '24/7 central brain with persistent state checkpointing, reusable skill learning loop, and uncertainty detection that triggers live verification before answering.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-1-core',
    nativeActive: true,
    nativeCapabilityNote: 'Paired with B.A.R.B.I. Server-Side Gemini Reasoning & Complexity Router',
    repos: [
      repoSpec('NousResearch', 'hermes-agent', 'Self-improving autonomous agent with skill refinement loop', 'git clone https://github.com/NousResearch/hermes-agent.git && cd hermes-agent && pip install -e .', { mcpReady: true }),
      repoSpec('langchain-ai', 'langgraph', 'Stateful cyclic multi-agent orchestration & checkpointing graph', 'pip install langgraph'),
    ],
    envVars: ['GEMINI_API_KEY', 'LANGCHAIN_TRACING_V2'],
  },
  {
    id: 3,
    code: 'M03',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'DESIGN:OS Generative UI + AG-UI',
    roleTitle: 'Futuristic Glassmorphic HUD & Reactive Pop-Ups',
    summary: 'Renders translucent frosted-glass windows, dynamic UI mutations, and live scanning wireframe/polygon construction overlays connected via Agent User Interaction protocol.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-1-core',
    nativeActive: true,
    nativeCapabilityNote: 'Natively active in B.A.R.B.I. 3D Cognitive Sphere & Glassmorphic HUD',
    repos: [
      repoSpec('ag-ui-protocol', 'ag-ui', 'Open wire protocol connecting AI agents to live reactive frontends', 'npm install @ag-ui/core @ag-ui/client'),
      repoSpec('CopilotKit', 'CopilotKit', 'Generative UI components & shared agent state hooks', 'npm install @copilotkit/react-core'),
    ],
    envVars: [],
  },
  {
    id: 4,
    code: 'M04',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'Whatomate + WAHA',
    roleTitle: 'WhatsApp Voice Calling & Contact Identity',
    summary: 'Gives B.A.R.B.I. its own WhatsApp session and webhook bridge to place/receive voice alerts, send proactive summaries, and request approval gates over WhatsApp.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-1-core',
    nativeActive: false,
    repos: [
      repoSpec('devlikeapro', 'waha', 'Self-hosted WhatsApp HTTP API with webhooks & multi-session engine', 'docker pull devlikeapro/waha', { dockerImage: 'devlikeapro/waha:latest', defaultPort: 3001 }),
    ],
    envVars: ['WAHA_API_KEY', 'WAHA_WEBHOOK_URL'],
  },
  {
    id: 5,
    code: 'M05',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'Eye-Controlled-Cursor-System + Eye-Cursor',
    roleTitle: 'Quadriplegic Gaze & Blink OS Control',
    summary: 'Uses a standard webcam and iris landmark tracking to steer the pointer, trigger blink clicks, and scroll via gaze zones without invasive hardware.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-5-embodiment',
    nativeActive: true,
    nativeCapabilityNote: 'MediaPipe Vision WASM runtime already installed in B.A.R.B.I. Gesture Engine',
    repos: [
      repoSpec('google-ai-edge', 'mediapipe', 'Real-time iris, face mesh & hand landmark tracking', 'npm install @mediapipe/tasks-vision'),
      repoSpec('antoinelame', 'GazeTracking', 'Webcam iris & pupil gaze tracking library in Python/OpenCV', 'git clone https://github.com/antoinelame/GazeTracking.git'),
    ],
    envVars: [],
  },
  {
    id: 6,
    code: 'M06',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'Fish Audio S2 Pro + Pipecat',
    roleTitle: 'Expressive Full-Duplex Voice Cortex',
    summary: 'Sub-second speech recognition and expressive synthesis with natural pauses, emotional cadence, and instant barge-in interruption.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-1-core',
    nativeActive: true,
    nativeCapabilityNote: 'Natively wired via B.A.R.B.I. Gemini Live WebSocket Voice Bridge',
    repos: [
      repoSpec('fishaudio', 'fish-speech', 'Expressive open-source neural TTS & zero-shot voice cloning', 'git clone https://github.com/fishaudio/fish-speech.git'),
      repoSpec('pipecat-ai', 'pipecat', 'Real-time voice & multimodal conversational pipeline with barge-in', 'pip install pipecat-ai'),
    ],
    envVars: ['FISH_AUDIO_API_KEY', 'DAILY_API_KEY'],
  },
  {
    id: 7,
    code: 'M07',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'SearXNG MCP + Firecrawl MCP',
    roleTitle: 'Live Internet Reflex & Deep Web Scraper',
    summary: 'Meta-searches 70+ search engines privately and converts live web pages into clean LLM-ready Markdown or structured JSON via MCP.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-1-core',
    nativeActive: false,
    repos: [
      repoSpec('searxng', 'searxng', 'Privacy-respecting metasearch engine aggregating 70+ sources', 'docker pull searxng/searxng', { dockerImage: 'searxng/searxng:latest', defaultPort: 8080 }),
      repoSpec('firecrawl', 'firecrawl-mcp-server', 'Official Firecrawl MCP server for Markdown/JSON web extraction', 'npx -y firecrawl-mcp', { mcpReady: true }),
    ],
    envVars: ['FIRECRAWL_API_KEY', 'SEARXNG_BASE_URL'],
  },
  {
    id: 8,
    code: 'M08',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'Discovery Agent + OpenHands',
    roleTitle: 'GitHub Repo Replicator & Self-Mutator',
    summary: 'Inspects and clones external GitHub repositories, adapts modules to B.A.R.B.I. specs, and mounts them inside the glassmorphic HUD.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-1-core',
    nativeActive: true,
    nativeCapabilityNote: 'Connected to B.A.R.B.I. R.E.A. Agent Forge & Live GitHub Assimilator',
    repos: [
      repoSpec('OpenHands', 'OpenHands', 'Autonomous software engineering agent platform for planning & shipping code', 'docker pull docker.all-hands.dev/all-hands-ai/openhands:latest', { dockerImage: 'docker.all-hands.dev/all-hands-ai/openhands:latest', defaultPort: 3005 }),
    ],
    envVars: ['GITHUB_TOKEN'],
  },
  {
    id: 9,
    code: 'M09',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'TrendsAgents + auto-deep-researcher-24x7',
    roleTitle: '24/7 GitHub & Tech Scout',
    summary: 'Continuously scans GitHub releases, papers, and emerging AI tools for breakthroughs and queues verified repos for one-click assimilation.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-6-intel',
    nativeActive: false,
    repos: [
      repoSpec('assafelovic', 'gpt-researcher', 'Autonomous deep research agent generating cited reports from live web & repos', 'pip install gpt-researcher'),
    ],
    envVars: ['GITHUB_TOKEN', 'TAVILY_API_KEY'],
  },
  {
    id: 10,
    code: 'M10',
    tier: 'A',
    tierName: 'Core Cognition & Free-Tier Routing',
    engineLabel: 'ECC + Superpowers + Skills Aggregator',
    roleTitle: 'Universal Skills Aggregator',
    summary: 'Indexes modular SKILL.md playbooks across engineering, OSINT, design, science, and marketing and injects domain instructions on demand.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-1-core',
    nativeActive: false,
    repos: [
      repoSpec('obra', 'superpowers', 'Modular agentic engineering skills & workflow playbooks', 'git clone https://github.com/obra/superpowers.git'),
      repoSpec('anthropics', 'skills', 'Reference SKILL.md library for domain-specific agent capabilities', 'git clone https://github.com/anthropics/skills.git'),
    ],
    envVars: [],
  },

  // ======================== TIER B (11-15) ========================
  {
    id: 11,
    code: 'M11',
    tier: 'B',
    tierName: "God's Eye, Spatial 3D & Multimodal Studio",
    engineLabel: 'bilawalsidhu/gods-eye-view + World Monitor',
    roleTitle: "God's Eye Global OSINT Globe",
    summary: '3D WebGL Earth unifying public CCTV streams, ADS-B flight transponders, AIS marine beacons, orbital satellites, and 150+ real-time global feeds.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-3-spatial',
    nativeActive: false,
    repos: [
      repoSpec('bilawalsidhu', 'gods-eye-view', 'Browser-based 3D geospatial satellite & spatial intelligence globe', 'git clone https://github.com/bilawalsidhu/gods-eye-view.git'),
      repoSpec('koala73', 'worldmonitor', 'Global OSINT dashboard & MCP server for aviation, shipping & geopolitics', 'git clone https://github.com/koala73/worldmonitor.git', { mcpReady: true }),
    ],
    envVars: ['CESIUM_ION_TOKEN', 'OPENSKY_USERNAME'],
  },
  {
    id: 12,
    code: 'M12',
    tier: 'B',
    tierName: "God's Eye, Spatial 3D & Multimodal Studio",
    engineLabel: 'SpatialScene3D + Splatline',
    roleTitle: '3D Event & Scene Reconstruction',
    summary: 'Reconstructs navigable 3D Gaussian Splat scenes from live camera feeds or offline video inside interactive Three.js pop-up viewports.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-3-spatial',
    nativeActive: false,
    repos: [
      repoSpec('nerfstudio-project', 'gsplat', 'CUDA-accelerated 3D Gaussian Splatting rasterization library', 'pip install gsplat'),
      repoSpec('mkkellogg', 'GaussianSplats3D', 'Three.js WebGL Gaussian Splat viewer for browser HUDs', 'npm install @mkkellogg/gaussian-splats-3d'),
    ],
    envVars: [],
  },
  {
    id: 13,
    code: 'M13',
    tier: 'B',
    tierName: "God's Eye, Spatial 3D & Multimodal Studio",
    engineLabel: 'ComfyUI + ComfyUI-Stream-Pack',
    roleTitle: 'Real-Time Image & Video Materialization',
    summary: 'Streams step-by-step latent denoising frames via WebSocket directly into B.A.R.B.I. HUD pop-ups as visuals materialize live.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-3-spatial',
    nativeActive: false,
    repos: [
      repoSpec('comfyanonymous', 'ComfyUI', 'Node-based diffusion & video generation engine with WebSocket preview API', 'git clone https://github.com/comfyanonymous/ComfyUI.git', { defaultPort: 8188 }),
    ],
    envVars: ['COMFYUI_API_URL'],
  },
  {
    id: 14,
    code: 'M14',
    tier: 'B',
    tierName: "God's Eye, Spatial 3D & Multimodal Studio",
    engineLabel: 'Wan 2.2 + Flux.1/2 + ACE-Step',
    roleTitle: 'Omnimodal Creative Studio',
    summary: 'Cloud-offloaded generation of cinematic video (Wan 2.2 MoE), high-resolution imagery (FLUX), and full-song music synthesis (ACE-Step).',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-3-spatial',
    nativeActive: false,
    repos: [
      repoSpec('Wan-Video', 'Wan2.2', 'Open-source MoE text-to-video and image-to-video foundation model', 'git clone https://github.com/Wan-Video/Wan2.2.git'),
      repoSpec('black-forest-labs', 'flux', 'High-fidelity FLUX image generation models & inference pipeline', 'git clone https://github.com/black-forest-labs/flux.git'),
      repoSpec('ace-step', 'ACE-Step-1.5', 'Open-source full-song music & audio generation foundation model', 'git clone https://github.com/ace-step/ACE-Step-1.5.git'),
    ],
    envVars: ['HF_TOKEN', 'FAL_KEY'],
  },
  {
    id: 15,
    code: 'M15',
    tier: 'B',
    tierName: "God's Eye, Spatial 3D & Multimodal Studio",
    engineLabel: 'Qwen2.5-VL + Qwen2-Audio + Faster-Whisper',
    roleTitle: 'Deep Video, Image & Audio Analyzer',
    summary: 'Inspects uploaded or live video streams, transcribes speech with CTranslate2 acceleration, detects acoustic events, and extracts structured JSON insights.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-3-spatial',
    nativeActive: true,
    nativeCapabilityNote: 'Audio transcription & image analysis active via B.A.R.B.I. Multimodal API',
    repos: [
      repoSpec('QwenLM', 'Qwen2.5-VL', 'Multimodal vision-language model for video, charts & document reasoning', 'git clone https://github.com/QwenLM/Qwen2.5-VL.git'),
      repoSpec('SYSTRAN', 'faster-whisper', 'High-speed Whisper speech-to-text inference powered by CTranslate2', 'pip install faster-whisper'),
    ],
    envVars: ['HF_TOKEN'],
  },

  // ======================== TIER C (16-21) ========================
  {
    id: 16,
    code: 'M16',
    tier: 'C',
    tierName: 'Autonomous Venture Factory, Cloud Mesh & Lab',
    engineLabel: 'MetaGPT + WebLLM',
    roleTitle: 'Autonomous SaaS / PaaS / RaaS Venture Architect',
    summary: 'Co-designs multi-platform client systems, generates full-stack source bundles, and embeds browser-local quantized WebGPU models directly inside client apps.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-4-factory',
    nativeActive: true,
    nativeCapabilityNote: 'Natively active in B.A.R.B.I. R.E.A. Multi-Platform System Forge',
    repos: [
      repoSpec('geekan', 'MetaGPT', 'Multi-agent software company framework (PM, Architect, Engineer, QA)', 'pip install metagpt'),
      repoSpec('mlc-ai', 'web-llm', 'In-browser WebGPU LLM inference engine for zero-cost offline AI', 'npm install @mlc-ai/web-llm'),
    ],
    envVars: [],
  },
  {
    id: 17,
    code: 'M17',
    tier: 'C',
    tierName: 'Autonomous Venture Factory, Cloud Mesh & Lab',
    engineLabel: 'AndroidAutoBuildAPK + Tauri',
    roleTitle: 'Cloud Binary & APK Compiler',
    summary: 'Packages generated software into native Android .apk, Windows .exe, macOS .dmg, and Linux .deb binaries using Tauri & Capacitor CI pipelines.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-4-factory',
    nativeActive: true,
    nativeCapabilityNote: 'Tauri (src-tauri/) & Capacitor (capacitor.config.ts) already scaffolded in this repo',
    repos: [
      repoSpec('tauri-apps', 'tauri', 'Lightweight Rust-backed desktop & mobile binary packager', 'npm install -D @tauri-apps/cli'),
      repoSpec('ionic-team', 'capacitor', 'Cross-platform native Android/iOS runtime bridge for web apps', 'npm install @capacitor/core @capacitor/cli'),
    ],
    envVars: [],
  },
  {
    id: 18,
    code: 'M18',
    tier: 'C',
    tierName: 'Autonomous Venture Factory, Cloud Mesh & Lab',
    engineLabel: 'Playwright MCP + Grafana k6',
    roleTitle: 'Autonomous QA & Load Testing Lab',
    summary: 'Navigates newly forged web applications via accessibility snapshots, verifies UI states, and executes k6 load/stress benchmarks.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-4-factory',
    nativeActive: false,
    repos: [
      repoSpec('microsoft', 'playwright-mcp', 'Official Playwright Model Context Protocol server for browser automation', 'npx @playwright/mcp@latest', { mcpReady: true }),
      repoSpec('grafana', 'k6', 'Modern load testing & performance benchmarking engine', 'docker pull grafana/k6', { dockerImage: 'grafana/k6:latest' }),
    ],
    envVars: [],
  },
  {
    id: 19,
    code: 'M19',
    tier: 'C',
    tierName: 'Autonomous Venture Factory, Cloud Mesh & Lab',
    engineLabel: 'SkyPilot + Hugging Face ZeroGPU',
    roleTitle: 'Zero-Hardware Cloud Compute Mesh',
    summary: 'Dispatches heavy builds, 3D splatting, and GPU inference bursts to remote cloud runners and spot GPUs so local devices stay cool and responsive.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-4-factory',
    nativeActive: false,
    repos: [
      repoSpec('skypilot-org', 'skypilot', 'Multi-cloud AI & batch compute broker optimizing cost & GPU availability', 'pip install skypilot'),
    ],
    envVars: ['HF_TOKEN'],
  },
  {
    id: 20,
    code: 'M20',
    tier: 'C',
    tierName: 'Autonomous Venture Factory, Cloud Mesh & Lab',
    engineLabel: 'Open Notebook + RAGFlow',
    roleTitle: 'Academic & NotebookLM Research Hub',
    summary: 'Ingests textbooks, engineering papers, and lectures to generate cited answers, structured study guides, mind maps, flashcards, quizzes, and audio explainers.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-4-factory',
    nativeActive: true,
    nativeCapabilityNote: 'Natively active in B.A.R.B.I. Study & Explainer Studio',
    repos: [
      repoSpec('lfnovo', 'open-notebook', 'Privacy-first open-source NotebookLM alternative with podcasts & citations', 'git clone https://github.com/lfnovo/open-notebook.git', { dockerImage: 'lfnovo/open_notebook:latest', defaultPort: 8502 }),
      repoSpec('infiniflow', 'ragflow', 'Deep document understanding RAG engine with grounded citations', 'git clone https://github.com/infiniflow/ragflow.git'),
    ],
    envVars: ['GEMINI_API_KEY'],
  },
  {
    id: 21,
    code: 'M21',
    tier: 'C',
    tierName: 'Autonomous Venture Factory, Cloud Mesh & Lab',
    engineLabel: 'Virtual Lab + Physics-Chemistry Sandbox + Manim',
    roleTitle: 'Interactive Science & Dynamics Simulator',
    summary: 'Generates programmable mathematics animations (Manim) and interactive browser simulations for physics, chemistry, and control dynamics.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-4-factory',
    nativeActive: false,
    repos: [
      repoSpec('ManimCommunity', 'manim', 'Mathematical animation & physics visualization engine', 'pip install manim'),
      repoSpec('liabru', 'matter-js', '2D rigid-body physics simulation engine for interactive web labs', 'npm install matter-js'),
    ],
    envVars: [],
  },

  // ======================== TIER D (22-33) ========================
  {
    id: 22,
    code: 'M22',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'Mobilerun / Droidrun',
    roleTitle: 'Native Android Embodiment',
    summary: 'Gives B.A.R.B.I. live screen observation, notification reading, and natural-language touch/swipe control over connected Android phones via MCP.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-5-embodiment',
    nativeActive: false,
    repos: [
      repoSpec('droidrun', 'droidrun', 'Open-source framework letting AI agents automate real Android & iOS apps', 'pip install droidrun', { mcpReady: true }),
    ],
    envVars: ['ADB_DEVICE_SERIAL'],
  },
  {
    id: 23,
    code: 'M23',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'UI-TARS + c/ua + Windows-Use',
    roleTitle: 'Desktop & macOS GUI Hands',
    summary: 'Pixel-accurate clicking, dragging, multi-select, and keyboard automation across Windows, macOS, and Linux inside isolated sandboxed VMs.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-5-embodiment',
    nativeActive: false,
    repos: [
      repoSpec('bytedance', 'UI-TARS-desktop', 'Multimodal GUI agent desktop app for native OS control', 'git clone https://github.com/bytedance/UI-TARS-desktop.git'),
      repoSpec('trycua', 'cua', 'Sandboxed computer-use VMs and cross-OS agent SDK', 'pip install cua-computer cua-agent'),
    ],
    envVars: [],
  },
  {
    id: 24,
    code: 'M24',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'Browser-Use + Agent-Reach',
    roleTitle: 'Web App & Social Automation',
    summary: 'Full DOM browser control combined with zero-API-fee web extraction across YouTube, Reddit, GitHub, and web SaaS consoles.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-5-embodiment',
    nativeActive: false,
    repos: [
      repoSpec('browser-use', 'browser-use', 'Make websites accessible and controllable by autonomous LLM agents', 'pip install browser-use', { mcpReady: true }),
    ],
    envVars: [],
  },
  {
    id: 25,
    code: 'M25',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'Ultralytics YOLO + Meta SAM 2 + Supervision',
    roleTitle: 'Real-Time Computer Vision & Tracking',
    summary: 'Live object detection, pixel-accurate segmentation, and multi-object ByteTrack telemetry feeding spatial coordinates into the HUD.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-5-embodiment',
    nativeActive: true,
    nativeCapabilityNote: 'Real-time MediaPipe webcam gesture tracking active in GestureNavHud',
    repos: [
      repoSpec('ultralytics', 'ultralytics', 'Real-time YOLO object detection, pose & instance segmentation', 'pip install ultralytics'),
      repoSpec('facebookresearch', 'sam2', 'Segment Anything Model 2 for real-time image & video segmentation', 'git clone https://github.com/facebookresearch/sam2.git'),
      repoSpec('roboflow', 'supervision', 'Computer vision tracking, ByteTrack & annotation utilities', 'pip install supervision'),
    ],
    envVars: [],
  },
  {
    id: 26,
    code: 'M26',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'Screenpipe',
    roleTitle: '24/7 Screen & Audio Photographic Memory',
    summary: 'Continuously indexes local screen OCR and audio transcripts so B.A.R.B.I. retrieves instant working context without repetitive explanation.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-5-embodiment',
    nativeActive: false,
    repos: [
      repoSpec('screenpipe', 'screenpipe', 'Local-first 24/7 screen & audio capture engine with AI search API', 'git clone https://github.com/screenpipe/screenpipe.git', { mcpReady: true, defaultPort: 3030 }),
    ],
    envVars: ['SCREENPIPE_API_URL'],
  },
  {
    id: 27,
    code: 'M27',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'OpenClaw + n8n',
    roleTitle: 'Omnichannel Comms & 400+ App Bus',
    summary: 'Connects Telegram, Discord, Slack, WhatsApp, Email, and 400+ SaaS web applications via event-driven webhook automations.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-5-embodiment',
    nativeActive: true,
    nativeCapabilityNote: 'Telegram server relay active at /api/integrations/telegram/send',
    repos: [
      repoSpec('openclaw', 'openclaw', 'Local-first personal AI assistant gateway linking messaging channels to tools', 'git clone https://github.com/openclaw/openclaw.git'),
      repoSpec('n8n-io', 'n8n', 'Fair-code workflow automation bus with 400+ integrations & MCP triggers', 'docker pull n8nio/n8n', { dockerImage: 'n8nio/n8n:latest', defaultPort: 5678, mcpReady: true }),
    ],
    envVars: ['N8N_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
  },
  {
    id: 28,
    code: 'M28',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'MarketingOS AI / Twenty CRM',
    roleTitle: 'Autonomous Growth & CRM Engine',
    summary: 'Manages lead discovery, pipeline segmentation, and approval-gated outreach campaigns inside an open-source sovereign CRM.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-5-embodiment',
    nativeActive: false,
    repos: [
      repoSpec('twentyhq', 'twenty', 'Modern open-source CRM & growth pipeline platform', 'git clone https://github.com/twentyhq/twenty.git', { dockerImage: 'twentycrm/twenty:latest', defaultPort: 3002 }),
    ],
    envVars: ['TWENTY_CRM_API_KEY'],
  },
  {
    id: 29,
    code: 'M29',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'OpenBB + DocuSeal + Coinbase AgentKit',
    roleTitle: 'Market Terminal, Contracts & Crypto Wallets',
    summary: 'Unifies live institutional market analytics (OpenBB), self-hosted contract e-signatures (DocuSeal), and approval-gated Web3 wallet operations (AgentKit).',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('OpenBB-finance', 'OpenBB', 'Open-source financial research & market analytics platform', 'pip install openbb'),
      repoSpec('docusealco', 'docuseal', 'Open-source automated client contract e-signature platform', 'docker pull docuseal/docuseal', { dockerImage: 'docuseal/docuseal:latest', defaultPort: 3003 }),
      repoSpec('coinbase', 'agentkit', 'Framework-agnostic crypto wallet toolkit for AI agents', 'npm install @coinbase/agentkit'),
    ],
    envVars: ['OPENBB_PAT', 'DOCUSEAL_API_KEY', 'CDP_API_KEY_NAME'],
  },
  {
    id: 30,
    code: 'M30',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'Home Assistant + MQTT MCP',
    roleTitle: 'Physical World & IoT Control',
    summary: 'Links B.A.R.B.I. and ZULUTRONIX ESP32/edge nodes directly to smart cameras, telemetry sensors, relays, and home/lab hardware over MQTT.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-5-embodiment',
    nativeActive: false,
    repos: [
      repoSpec('home-assistant', 'core', 'Open-source smart hardware & IoT automation hub', 'docker pull ghcr.io/home-assistant/home-assistant:stable', { dockerImage: 'ghcr.io/home-assistant/home-assistant:stable', defaultPort: 8123 }),
      repoSpec('eclipse-mosquitto', 'mosquitto', 'Lightweight MQTT broker for ESP32-S3 & edge telemetry nodes', 'docker pull eclipse-mosquitto', { dockerImage: 'eclipse-mosquitto:2', defaultPort: 1883 }),
    ],
    envVars: ['HOME_ASSISTANT_TOKEN', 'MQTT_BROKER_URL'],
  },
  {
    id: 31,
    code: 'M31',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'Syncthing + KDE Connect',
    roleTitle: 'Cross-Device Teleportation Mesh',
    summary: 'Continuously synchronizes project files, snapshots, and clipboards between Android, Windows/macOS desktop, and cloud workspaces peer-to-peer.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-5-embodiment',
    nativeActive: true,
    nativeCapabilityNote: 'Local folder snapshot sync & offline mutation queue active in B.A.R.B.I.',
    repos: [
      repoSpec('syncthing', 'syncthing', 'Encrypted peer-to-peer continuous file synchronization mesh', 'docker pull syncthing/syncthing', { dockerImage: 'syncthing/syncthing:latest', defaultPort: 8384 }),
      repoSpec('KDE', 'kdeconnect-kde', 'Cross-device clipboard, notifications & file teleportation', 'git clone https://github.com/KDE/kdeconnect-kde.git'),
    ],
    envVars: [],
  },
  {
    id: 32,
    code: 'M32',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'Qdrant + Mem0 + Claude-Mem',
    roleTitle: 'Unified Episodic & Knowledge-Graph Memory',
    summary: 'Guarantees seamless episodic and semantic memory continuity across every device, modality, and free-tier LLM slot switch.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-1-core',
    nativeActive: true,
    nativeCapabilityNote: 'Natively active via ARCHIVEX PostgreSQL + pgvector Semantic Memory Graph',
    repos: [
      repoSpec('qdrant', 'qdrant', 'High-performance Rust vector search engine for semantic memory', 'docker pull qdrant/qdrant', { dockerImage: 'qdrant/qdrant:latest', defaultPort: 6333 }),
      repoSpec('mem0ai', 'mem0', 'Universal persistent memory layer for personalized AI agents', 'pip install mem0ai', { mcpReady: true }),
      repoSpec('thedotmack', 'claude-mem', 'Session compression & persistent coding memory plugin', 'git clone https://github.com/thedotmack/claude-mem.git'),
    ],
    envVars: ['QDRANT_URL', 'DATABASE_URL'],
  },
  {
    id: 33,
    code: 'M33',
    tier: 'D',
    tierName: 'Cross-Platform Embodiment, Memory & Zero-Trust',
    engineLabel: 'AgentDiscover Scanner + Git Worktrees Watchdog',
    roleTitle: 'Zero-Trust Security & Self-Healing Immune System',
    summary: 'Audits every external GitHub repository before integration (license, activity, secrets, static analysis) and auto-rolls back UI/module faults.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-1-core',
    nativeActive: true,
    nativeCapabilityNote: 'Active on all v4.0 GitHub syncs & System Health Diagnostics',
    repos: [
      repoSpec('semgrep', 'semgrep', 'Fast static security & vulnerability scanner for external repos', 'pip install semgrep'),
      repoSpec('gitleaks', 'gitleaks', 'Secret & credential leak scanner for zero-trust repo assimilation', 'docker pull zricethezav/gitleaks'),
    ],
    envVars: [],
  },

  // ======================== TIER E (34-44) ========================
  {
    id: 34,
    code: 'M34',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'Playwright Network Sniffer + OpenHands + Web2MCP',
    roleTitle: 'Autonomous Website Cloner & Feature Extractor',
    summary: 'Inspects target websites via DOM & network analysis, reverse-engineers core workflows, and mounts glassmorphic rebuilds directly into B.A.R.B.I.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-6-intel',
    nativeActive: true,
    nativeCapabilityNote: 'Active in B.A.R.B.I. R.E.A. Platform Study & Multi-Platform Forge (/api/rea/study-url)',
    repos: [
      repoSpec('morluto', 'rea', 'R.E.A. Research, Engineer & Agent Forge MCP toolkit', 'npx rea-agents@latest setup', { mcpReady: true }),
      repoSpec('microsoft', 'playwright', 'Headless browser DOM & network traffic analyzer', 'npm install playwright'),
    ],
    envVars: [],
  },
  {
    id: 35,
    code: 'M35',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'Stats SA + SA Open Data + SARB Web API',
    roleTitle: 'South African National Intelligence Feed',
    summary: 'Ingests official South African datasets covering QLFS employment, CPI inflation, GDP, provincial demographics, and SARB interest/ZAR exchange rates.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-6-intel',
    nativeActive: false,
    repos: [
      repoSpec('OpenUpSA', 'municipal-data-api', 'South African civic & national public open-data APIs', 'git clone https://github.com/OpenUpSA/municipal-data-api.git'),
    ],
    envVars: ['SARB_API_KEY'],
  },
  {
    id: 36,
    code: 'M36',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'World Bank Open Data + UN Data + OWID',
    roleTitle: 'Global Macro & Socioeconomic Telemetry',
    summary: 'Queries verified country-by-country indicators (labor, energy, trade, health, GDP) across 200+ nations using Our World in Data & World Bank APIs.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-6-intel',
    nativeActive: false,
    repos: [
      repoSpec('owid', 'owid-grapher', 'Our World in Data global socioeconomic charts & datasets', 'git clone https://github.com/owid/owid-grapher.git'),
      repoSpec('tgherzog', 'wbgapi', 'Python client for World Bank Open Data v2 indicators', 'pip install wbgapi'),
    ],
    envVars: [],
  },
  {
    id: 37,
    code: 'M37',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'AIHawk + Browser-Use + OpenResume',
    roleTitle: 'End-to-End Job Hunter & Auto-Applicant',
    summary: 'Scans LinkedIn, Indeed, PNet, CareerJunction, and RemoteOK, tailors ATS-friendly resumes via OpenResume, and prepares approval-gated applications.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-6-intel',
    nativeActive: false,
    repos: [
      repoSpec('feder-cr', 'Jobs_Applier_AI_Agent', 'AIHawk autonomous job matching, cover letter & application agent', 'git clone https://github.com/feder-cr/Jobs_Applier_AI_Agent.git'),
      repoSpec('xitanggg', 'open-resume', 'Open-source ATS resume builder and parser', 'git clone https://github.com/xitanggg/open-resume.git'),
    ],
    envVars: ['LINKEDIN_SESSION_COOKIE'],
  },
  {
    id: 38,
    code: 'M38',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'OpenAlex + Semantic Scholar + arXiv + PubMed',
    roleTitle: 'Global Scientific & Academic Knowledge Graph',
    summary: 'Queries 250M+ scholarly papers, citation graphs, patent trajectories, and peer-reviewed engineering literature with instant synthesis.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-4-factory',
    nativeActive: false,
    repos: [
      repoSpec('ourresearch', 'openalex-guts', 'OpenAlex open catalog of 250M+ scholarly works & citations', 'git clone https://github.com/ourresearch/openalex-guts.git'),
      repoSpec('J535D165', 'pyalex', 'Lightweight Python interface to the OpenAlex scientific graph API', 'pip install pyalex'),
    ],
    envVars: ['OPENALEX_MAILTO'],
  },
  {
    id: 39,
    code: 'M39',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'Wolfram Alpha API + SymPy + GeoGebra/Desmos',
    roleTitle: 'Computational Knowledge & Exact Engineering Solver',
    summary: 'Executes symbolic calculus, differential equations, control-systems transfer functions, and exact mechanical/electrical engineering derivations.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-4-factory',
    nativeActive: false,
    repos: [
      repoSpec('sympy', 'sympy', 'Python symbolic mathematics, calculus & ODE/PDE solver', 'pip install sympy'),
    ],
    envVars: ['WOLFRAM_APP_ID'],
  },
  {
    id: 40,
    code: 'M40',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'GitHub + Hugging Face + PapersWithCode + ProductHunt',
    roleTitle: 'Global Innovation & Model Registry',
    summary: 'Tracks newly published open-weights checkpoints, datasets, SOTA benchmarks, and developer launches the moment they drop.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-6-intel',
    nativeActive: true,
    nativeCapabilityNote: 'Live GitHub search & repo sync active in B.A.R.B.I. API',
    repos: [
      repoSpec('huggingface', 'huggingface_hub', 'Official Hugging Face models, datasets & Spaces API client', 'pip install huggingface-hub'),
    ],
    envVars: ['GITHUB_TOKEN', 'HF_TOKEN'],
  },
  {
    id: 41,
    code: 'M41',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'OpenStreetMap Overpass + Earth Engine + Sentinel Hub',
    roleTitle: 'Geospatial, Terrain & Satellite Intelligence',
    summary: 'Queries global road/grid infrastructure, land-use telemetry, weather radar, and multispectral Sentinel satellite imagery for God’s Eye.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-3-spatial',
    nativeActive: false,
    repos: [
      repoSpec('drolbr', 'Overpass-API', 'OpenStreetMap query engine for global infrastructure & terrain', 'git clone https://github.com/drolbr/Overpass-API.git'),
      repoSpec('sentinel-hub', 'sentinelhub-py', 'Multispectral satellite imagery & Earth observation SDK', 'pip install sentinelhub'),
    ],
    envVars: ['SENTINELHUB_CLIENT_ID', 'SENTINELHUB_CLIENT_SECRET'],
  },
  {
    id: 42,
    code: 'M42',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'SEC EDGAR + OpenCorporates + CIPC Registries',
    roleTitle: 'Global Corporate & Due-Diligence Registry',
    summary: 'Verifies company registrations, directors, financial filings, and ownership structures before B.A.R.B.I. drafts client contracts or investments.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-6-intel',
    nativeActive: false,
    repos: [
      repoSpec('dgunning', 'edgartools', 'Python library for querying SEC EDGAR filings & XBRL financials', 'pip install edgartools'),
    ],
    envVars: ['EDGAR_USER_AGENT', 'OPENCORPORATES_API_TOKEN'],
  },
  {
    id: 43,
    code: 'M43',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'Wappalyzer + Common Crawl + Shodan API',
    roleTitle: 'Competitive Web, Tech-Stack & Infrastructure Intel',
    summary: 'Fingerprints competitor tech stacks, SEO footprints, and public infrastructure metadata to inform SaaS positioning and security hardening.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-6-intel',
    nativeActive: false,
    repos: [
      repoSpec('enthec', 'webappanalyzer', 'Open-source web technology stack fingerprinter', 'git clone https://github.com/enthec/webappanalyzer.git'),
      repoSpec('achillean', 'shodan-python', 'Official Shodan infrastructure intelligence API client', 'pip install shodan'),
    ],
    envVars: ['SHODAN_API_KEY'],
  },
  {
    id: 44,
    code: 'M44',
    tier: 'E',
    tierName: 'Institutional Intel, Career & Web Reverse-Eng',
    engineLabel: 'CyberChef + Photopea / FFmpeg WASM + Excalidraw',
    roleTitle: 'Embedded Swiss-Army Utility Suite',
    summary: 'Embeds browser-native cryptography/decoding (CyberChef), client-side media transcoding (FFmpeg WASM), and architectural whiteboarding (Excalidraw).',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-6-intel',
    nativeActive: false,
    repos: [
      repoSpec('gchq', 'CyberChef', 'Browser-native cyber swiss-army knife for encoding, crypto & parsing', 'docker pull ghcr.io/gchq/cyberchef:latest', { dockerImage: 'ghcr.io/gchq/cyberchef:latest', defaultPort: 8088 }),
      repoSpec('excalidraw', 'excalidraw', 'Virtual collaborative whiteboard & system architecture sketching', 'npm install @excalidraw/excalidraw'),
      repoSpec('ffmpegwasm', 'ffmpeg.wasm', 'Pure WebAssembly FFmpeg media transcoding inside the browser', 'npm install @ffmpeg/ffmpeg'),
    ],
    envVars: [],
  },

  // ======================== TIER F (45-55) ========================
  {
    id: 45,
    code: 'M45',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'EasyEquities Client (deanmalan) + Scraper',
    roleTitle: 'South African & Global Retail Equity Portfolio Tracker',
    summary: 'Connects programmatically to EasyEquities & Satrix accounts to track ZAR, USD, and TFSA holdings, historical performance, dividend yields, and rebalancing alerts.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('deanmalan', 'easy-equities-client', 'Programmatic Python client for EasyEquities & Satrix ZAR/USD/TFSA holdings', 'pip install easy-equities-client'),
    ],
    envVars: ['EASYEQUITIES_USERNAME', 'EASYEQUITIES_PASSWORD'],
  },
  {
    id: 46,
    code: 'M46',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'FinGPT + TradingAgents',
    roleTitle: 'Multi-Agent Equity & Macro Analyst',
    summary: 'Deploys specialized Bull, Bear, Sentiment, Technical, and Risk-Manager agents over JSE/NYSE filings and macro news to produce risk-adjusted theses.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('TauricResearch', 'TradingAgents', 'Multi-agent LLM hedge-fund debate & risk management framework', 'git clone https://github.com/TauricResearch/TradingAgents.git'),
      repoSpec('AI4Finance-Foundation', 'FinGPT', 'Open-source financial LLM & sentiment analysis toolkit', 'git clone https://github.com/AI4Finance-Foundation/FinGPT.git'),
    ],
    envVars: ['FINNHUB_API_KEY', 'ALPHAVANTAGE_API_KEY'],
  },
  {
    id: 47,
    code: 'M47',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'MetaTrader 5 Bridge + OANDA v20 + Jesse',
    roleTitle: 'Algorithmic Forex Trading & Backtesting Engine',
    summary: 'Backtests and paper-trades technical & ML Forex strategies across USD/ZAR, EUR/USD, and GBP/JPY with Monte Carlo validation and stop-loss gates.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('jesse-ai', 'jesse', 'Advanced Python algorithmic trading & backtesting framework', 'pip install jesse'),
      repoSpec('oanda', 'v20-python', 'Official OANDA v20 Forex REST & streaming execution client', 'pip install v20'),
    ],
    envVars: ['OANDA_API_TOKEN', 'OANDA_ACCOUNT_ID', 'MT5_BRIDGE_URL'],
  },
  {
    id: 48,
    code: 'M48',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'Freqtrade + Hummingbot',
    roleTitle: '24/7 Autonomous Crypto & Market-Making Bots',
    summary: 'Runs FreqAI adaptive ML prediction models and cross-exchange market-making bots starting in dry-run paper mode with HUD/WhatsApp risk controls.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('freqtrade', 'freqtrade', 'Open-source crypto algorithmic trading bot with FreqAI & dry-run sandbox', 'docker pull freqtradeorg/freqtrade:stable', { dockerImage: 'freqtradeorg/freqtrade:stable', defaultPort: 8081 }),
      repoSpec('hummingbot', 'hummingbot', 'High-frequency market-making & cross-exchange arbitrage bot', 'docker pull hummingbot/hummingbot:latest', { dockerImage: 'hummingbot/hummingbot:latest' }),
    ],
    envVars: ['FREQTRADE_API_USER', 'FREQTRADE_API_PASSWORD'],
  },
  {
    id: 49,
    code: 'M49',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'PayPal MCP Server + PayPal Agent Toolkit',
    roleTitle: 'Direct PayPal Treasury, Invoicing & Payout Engine',
    summary: 'Creates and dispatches client invoices, monitors incoming merchant settlements, manages SaaS subscriptions, and audits cashflow directly via MCP.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('paypal', 'agent-toolkit', 'Official PayPal Agent Toolkit & MCP server for invoicing & commerce', 'npx -y @paypal/mcp --tools=all', { mcpReady: true }),
    ],
    envVars: ['PAYPAL_ACCESS_TOKEN', 'PAYPAL_ENVIRONMENT'],
  },
  {
    id: 50,
    code: 'M50',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'MedusaJS + Saleor + Printful / Supplier APIs',
    roleTitle: 'Autonomous Headless E-Commerce & Dropshipping Factory',
    summary: 'Launches headless e-commerce storefronts, generates structured product catalogs, synchronizes print-on-demand suppliers, and automates fulfillment.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('medusajs', 'medusa', 'Open-source TypeScript headless commerce engine with modular APIs', 'npx create-medusa-app@latest', { defaultPort: 9000 }),
      repoSpec('saleor', 'saleor', 'High-performance GraphQL headless e-commerce platform', 'git clone https://github.com/saleor/saleor.git'),
    ],
    envVars: ['MEDUSA_ADMIN_TOKEN', 'PRINTFUL_API_KEY'],
  },
  {
    id: 51,
    code: 'M51',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'MoneyPrinterTurbo + ShortGPT + Upload APIs',
    roleTitle: 'Automated Faceless Content & Video Monetization Pipeline',
    summary: 'Researches high-RPM niches, drafts scripts, synthesizes voiceovers, renders vertical/long-form videos, and schedules uploads for review.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('harry0703', 'MoneyPrinterTurbo', 'Automated AI short-video script, voice, subtitle & render pipeline', 'git clone https://github.com/harry0703/MoneyPrinterTurbo.git', { defaultPort: 8501 }),
      repoSpec('RayVentura', 'ShortGPT', 'Autonomous AI video creation & editing orchestration framework', 'git clone https://github.com/RayVentura/ShortGPT.git'),
    ],
    envVars: ['PEXELS_API_KEY', 'YOUTUBE_UPLOAD_CLIENT_ID'],
  },
  {
    id: 52,
    code: 'M52',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'Postiz + Mixpost + Affiliate Network APIs',
    roleTitle: 'Autonomous Affiliate Marketing & Commission Engine',
    summary: 'Schedules cross-channel social threads, builds comparison guides with tracked affiliate links, and optimizes campaigns on click/commission telemetry.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('gitroomhq', 'postiz-app', 'Open-source AI social scheduling & affiliate distribution platform', 'git clone https://github.com/gitroomhq/postiz-app.git', { dockerImage: 'ghcr.io/gitroomhq/postiz-app:latest', defaultPort: 5000 }),
      repoSpec('inovector', 'mixpost', 'Self-hosted social media management & analytics suite', 'git clone https://github.com/inovector/mixpost.git'),
    ],
    envVars: ['POSTIZ_API_KEY', 'IMPACT_ACCOUNT_SID'],
  },
  {
    id: 53,
    code: 'M53',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'Freelance Scout + Auto-Proposal & Delivery Pipeline',
    roleTitle: 'Autonomous Digital Agency & Gig Fulfillment Engine',
    summary: 'Monitors freelance & contract marketplaces for engineering/AI gigs, drafts tailored technical proposals for approval, and accelerates delivery.',
    governanceTier: 'CAPITAL_GATE',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('crewAIInc', 'crewAI', 'Role-playing multi-agent orchestration for agency scoping & fulfillment', 'pip install crewai'),
    ],
    envVars: ['UPWORK_CLIENT_ID'],
  },
  {
    id: 54,
    code: 'M54',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'Actual Budget + Firefly III + Invoice Ninja',
    roleTitle: 'Sovereign Accounting, Multi-Currency Ledger & Tax Engine',
    summary: 'Consolidates ZAR & USD cashflow from PayPal, EasyEquities, trading bots, and MedusaJS into real-time P&L dashboards and SARS/tax-ready ledgers.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('actualbudget', 'actual', 'Local-first privacy-focused budgeting & multi-account ledger', 'docker pull actualbudget/actual-server:latest', { dockerImage: 'actualbudget/actual-server:latest', defaultPort: 5006 }),
      repoSpec('firefly-iii', 'firefly-iii', 'Self-hosted multi-currency personal & venture financial manager', 'docker pull fireflyiii/core:latest', { dockerImage: 'fireflyiii/core:latest', defaultPort: 8082 }),
      repoSpec('invoiceninja', 'invoiceninja', 'Open-source client invoicing, quotes & payment ledger', 'git clone https://github.com/invoiceninja/invoiceninja.git'),
    ],
    envVars: ['FIREFLY_PAT', 'ACTUAL_SERVER_PASSWORD'],
  },
  {
    id: 55,
    code: 'M55',
    tier: 'F',
    tierName: 'FinTech, Algo Trading & Digital Entrepreneurship',
    engineLabel: 'Optuna + MLflow + LangFuse',
    roleTitle: 'Continuous Model & Strategy Evolution Daemon',
    summary: 'Tracks live win-rates, ROI, and LLM slot accuracy across every bot and workflow—tuning parameters with Optuna and pruning underperforming models.',
    governanceTier: 'PRE_AUTHORIZED',
    integrationPack: 'pack-2-fintech',
    nativeActive: false,
    repos: [
      repoSpec('optuna', 'optuna', 'Hyperparameter & trading-strategy optimization framework', 'pip install optuna'),
      repoSpec('mlflow', 'mlflow', 'Experiment tracking, model registry & backtest reproducibility', 'pip install mlflow', { defaultPort: 5050 }),
      repoSpec('langfuse', 'langfuse', 'Open-source LLM observability, cost & prompt evaluation telemetry', 'docker pull langfuse/langfuse:2', { dockerImage: 'langfuse/langfuse:2', defaultPort: 3004 }),
    ],
    envVars: ['LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'MLFLOW_TRACKING_URI'],
  },
];

export const DEFAULT_FINTECH_RAILS: ReadonlyArray<FinTechRailStatus> = [
  {
    id: 'ee-portfolio',
    moduleId: 45,
    name: 'EasyEquities & Satrix Portfolio',
    engine: 'deanmalan/easy-equities-client',
    category: 'EQUITIES',
    currency: 'ZAR',
    sandboxMode: true,
    approvalRequiredForLive: true,
    paperBalanceLabel: 'R 125,000.00 (Paper)',
    paperReturnLabel: '+6.4% 90d Sim',
    riskLimitLabel: 'Max 5% single-equity rebalance',
    repoFullName: 'deanmalan/easy-equities-client',
    statusNote: 'Read-only ZAR / USD / TFSA holdings sync; rebalance requires explicit approval.',
  },
  {
    id: 'mt5-forex',
    moduleId: 47,
    name: 'MT5 / OANDA / Jesse Forex Engine',
    engine: 'jesse-ai/jesse + OANDA v20',
    category: 'FOREX',
    currency: 'MULTI',
    sandboxMode: true,
    approvalRequiredForLive: true,
    paperBalanceLabel: '$ 10,000.00 (Demo)',
    paperReturnLabel: '+3.8% Backtest',
    riskLimitLabel: '1.0% stop-loss cap / pair (USD/ZAR, EUR/USD)',
    repoFullName: 'jesse-ai/jesse',
    statusNote: 'Monte Carlo validation active; live execution hard-locked behind Dual-Tier Gate.',
  },
  {
    id: 'freqtrade-crypto',
    moduleId: 48,
    name: 'Freqtrade FreqAI + Hummingbot',
    engine: 'freqtrade/freqtrade',
    category: 'CRYPTO',
    currency: 'USD',
    sandboxMode: true,
    approvalRequiredForLive: true,
    paperBalanceLabel: '$ 5,000.00 (Dry-Run)',
    paperReturnLabel: '+4.9% 30d Dry-Run',
    riskLimitLabel: 'Max 3 concurrent pairs · 2% drawdown halt',
    repoFullName: 'freqtrade/freqtrade',
    statusNote: 'Dry-run simulation mode enforced until Optuna Sharpe > 1.5 & manual unlock.',
  },
  {
    id: 'paypal-mcp',
    moduleId: 49,
    name: 'PayPal MCP Treasury & Invoicing',
    engine: 'paypal/agent-toolkit (@paypal/mcp)',
    category: 'PAYMENTS',
    currency: 'USD',
    sandboxMode: true,
    approvalRequiredForLive: true,
    paperBalanceLabel: '$ 0.00 (Sandbox)',
    paperReturnLabel: '0 pending payouts',
    riskLimitLabel: 'Payouts > $0 require biometric/WhatsApp gate',
    repoFullName: 'paypal/agent-toolkit',
    statusNote: 'Invoice drafting pre-authorized; outbound payouts & refunds require explicit sign-off.',
  },
  {
    id: 'medusa-commerce',
    moduleId: 50,
    name: 'MedusaJS Headless Storefront',
    engine: 'medusajs/medusa',
    category: 'COMMERCE',
    currency: 'MULTI',
    sandboxMode: true,
    approvalRequiredForLive: true,
    paperBalanceLabel: 'Staging Catalog',
    paperReturnLabel: 'Draft SKU Pipeline',
    riskLimitLabel: 'Ad-spend & live supplier orders approval-gated',
    repoFullName: 'medusajs/medusa',
    statusNote: 'Headless catalog & print-on-demand sync ready for Pack 2 Docker deployment.',
  },
  {
    id: 'firefly-ledger',
    moduleId: 54,
    name: 'Firefly III & Actual Budget Ledger',
    engine: 'firefly-iii/firefly-iii + actualbudget/actual',
    category: 'ACCOUNTING',
    currency: 'ZAR',
    sandboxMode: true,
    approvalRequiredForLive: false,
    paperBalanceLabel: 'Multi-Currency Ready',
    paperReturnLabel: 'ZAR / USD Reconciled',
    riskLimitLabel: 'Read/Audit Ledger (Non-custodial)',
    repoFullName: 'firefly-iii/firefly-iii',
    statusNote: 'Consolidates P&L and SARS tax-ready ledger entries across all venture modules.',
  },
];

export interface ModuleFilterParams {
  tier?: V4TierId | 'ALL';
  search?: string;
  pack?: IntegrationPackId | 'ALL';
  governance?: GovernanceTier | 'ALL';
  onlyMounted?: boolean;
  mountedIds?: Set<number>;
}

export function filterModules(
  modules: ReadonlyArray<BarbiV4Module>,
  params: ModuleFilterParams
): BarbiV4Module[] {
  const q = (params.search || '').trim().toLowerCase();
  return modules.filter((m) => {
    if (params.tier && params.tier !== 'ALL' && m.tier !== params.tier) return false;
    if (params.pack && params.pack !== 'ALL' && m.integrationPack !== params.pack) return false;
    if (params.governance && params.governance !== 'ALL' && m.governanceTier !== params.governance) return false;
    if (params.onlyMounted && params.mountedIds && !params.mountedIds.has(m.id)) return false;
    if (!q) return true;

    const haystack = [
      m.code,
      String(m.id),
      m.engineLabel,
      m.roleTitle,
      m.summary,
      m.tierName,
      ...m.repos.map((r) => `${r.fullName} ${r.role}`),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function computeTierStats(
  modules: ReadonlyArray<BarbiV4Module>,
  mountedIds: Set<number>,
  syncedRepoCount: number
) {
  const byTier: Record<V4TierId, { total: number; mounted: number; native: number }> = {
    A: { total: 0, mounted: 0, native: 0 },
    B: { total: 0, mounted: 0, native: 0 },
    C: { total: 0, mounted: 0, native: 0 },
    D: { total: 0, mounted: 0, native: 0 },
    E: { total: 0, mounted: 0, native: 0 },
    F: { total: 0, mounted: 0, native: 0 },
  };

  let totalRepos = 0;
  let nativeActiveCount = 0;
  let capitalGatedCount = 0;

  for (const m of modules) {
    byTier[m.tier].total += 1;
    if (mountedIds.has(m.id)) byTier[m.tier].mounted += 1;
    if (m.nativeActive) {
      byTier[m.tier].native += 1;
      nativeActiveCount += 1;
    }
    if (m.governanceTier === 'CAPITAL_GATE') {
      capitalGatedCount += 1;
    }
    totalRepos += m.repos.length;
  }

  return {
    totalModules: modules.length,
    mountedCount: mountedIds.size,
    nativeActiveCount,
    capitalGatedCount,
    totalRepos,
    syncedRepoCount,
    byTier,
  };
}

export function evaluateGovernanceGate(
  module: BarbiV4Module,
  options: {
    requestedMode: ModuleExecutionMode;
    approvalConfirmed: boolean;
  }
): {
  allowed: boolean;
  resolvedMode: ModuleExecutionMode;
  requiresApproval: boolean;
  reason: string;
} {
  if (module.governanceTier === 'PRE_AUTHORIZED') {
    return {
      allowed: true,
      resolvedMode: module.nativeActive ? 'NATIVE_RUNTIME' : 'PAPER_SANDBOX',
      requiresApproval: false,
      reason: 'Pre-authorized utility/cognitive module: sandbox-tested and eligible for automatic hot-mount.',
    };
  }

  if (!options.approvalConfirmed) {
    return {
      allowed: false,
      resolvedMode: 'PAPER_SANDBOX',
      requiresApproval: true,
      reason: `High-impact / capital-execution gate active on ${module.code} (${module.engineLabel}). Explicit operator approval is required before mounting or modifying execution mode.`,
    };
  }

  return {
    allowed: true,
    resolvedMode: options.requestedMode === 'LIVE_APPROVED' ? 'LIVE_APPROVED' : 'PAPER_SANDBOX',
    requiresApproval: false,
    reason:
      options.requestedMode === 'LIVE_APPROVED'
        ? `Operator approval verified. Live execution armed under FSCA/risk-limit compliance for ${module.code}.`
        : `Operator approval verified. Mounted safely in Paper-Trading / Sandbox Mode for ${module.code}.`,
  };
}

export function getModulesForPack(
  pack: IntegrationPackId | 'mounted' | 'all',
  mountedIds: Set<number>
): BarbiV4Module[] {
  if (pack === 'all') return [...BARBI_V4_MODULES];
  if (pack === 'mounted') {
    const selected = BARBI_V4_MODULES.filter((m) => mountedIds.has(m.id));
    return selected.length > 0 ? selected : BARBI_V4_MODULES.filter((m) => m.nativeActive);
  }
  const found = INTEGRATION_PACKS.find((p) => p.id === pack);
  if (!found) return [];
  const idSet = new Set(found.moduleIds);
  return BARBI_V4_MODULES.filter((m) => idSet.has(m.id));
}

export function generateDockerComposeYaml(
  selectedModules: ReadonlyArray<BarbiV4Module>,
  companyName: string = BARBI_COMPANY_NAME
): string {
  const lines: string[] = [
    `# B.A.R.B.I. OS ${BARBI_OS_VERSION} — Sovereign Architecture Stack`,
    `# Entity: ${companyName}`,
    `# Modules Included: ${selectedModules.map((m) => m.code).join(', ') || 'Core Base'}`,
    `services:`,
    `  barbi-os-core:`,
    `    build: .`,
    `    container_name: barbi-os-v4-core`,
    `    ports:`,
    `      - "3000:3000"`,
    `    env_file:`,
    `      - .env`,
    `    restart: unless-stopped`,
  ];

  const addedServices = new Set<string>(['barbi-os-core']);

  for (const mod of selectedModules) {
    for (const repo of mod.repos) {
      if (!repo.dockerImage) continue;
      const serviceName = `barbi-${mod.code.toLowerCase()}-${repo.repo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      if (addedServices.has(serviceName)) continue;
      addedServices.add(serviceName);
      lines.push('');
      lines.push(`  ${serviceName}:`);
      lines.push(`    # ${mod.code}: ${mod.roleTitle} (${repo.fullName})`);
      lines.push(`    image: ${repo.dockerImage}`);
      lines.push(`    container_name: ${serviceName}`);
      if (repo.defaultPort) {
        lines.push(`    ports:`);
        lines.push(`      - "${repo.defaultPort}:${repo.defaultPort}"`);
      }
      if (mod.envVars.length > 0) {
        lines.push(`    environment:`);
        for (const key of mod.envVars.slice(0, 4)) {
          lines.push(`      - ${key}=\${${key}:-}`);
        }
      }
      lines.push(`    restart: unless-stopped`);
    }
  }

  lines.push('');
  lines.push('networks:');
  lines.push('  default:');
  lines.push('    name: barbi-os-v4-mesh');
  return lines.join('\n');
}

export function generateMcpManifestJson(
  selectedModules: ReadonlyArray<BarbiV4Module>,
  companyName: string = BARBI_COMPANY_NAME
): string {
  const mcpServers: Record<string, Record<string, unknown>> = {};

  for (const mod of selectedModules) {
    for (const repo of mod.repos) {
      if (!repo.mcpReady) continue;
      const key = `${mod.code.toLowerCase()}_${repo.repo.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      const isNpx = repo.installCmd.startsWith('npx ');
      mcpServers[key] = {
        module: `${mod.code} · ${mod.roleTitle}`,
        repository: repo.url,
        governanceTier: mod.governanceTier,
        command: isNpx ? 'npx' : 'sh',
        args: isNpx ? repo.installCmd.replace(/^npx\s+/, '').split(/\s+/) : ['-c', repo.installCmd],
        env: Object.fromEntries(mod.envVars.map((v) => [v, `\${${v}}`])),
      };
    }
  }

  return JSON.stringify(
    {
      schemaVersion: 'barbi.mcp.v4',
      organization: companyName,
      system: `B.A.R.B.I. OS ${BARBI_OS_VERSION}`,
      moduleCount: selectedModules.length,
      mcpServers,
    },
    null,
    2
  );
}

export function generateGithubBootstrapScript(
  selectedModules: ReadonlyArray<BarbiV4Module>,
  companyName: string = BARBI_COMPANY_NAME
): string {
  const lines: string[] = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `# B.A.R.B.I. OS ${BARBI_OS_VERSION} — Seamless GitHub Repository Assimilation Script`,
    `# Registered Entity: ${companyName}`,
    'mkdir -p ./barbi-modules',
    'cd ./barbi-modules',
    '',
  ];

  const seenRepos = new Set<string>();
  for (const mod of selectedModules) {
    lines.push(`echo ">>> [${mod.code}] ${mod.roleTitle} (${mod.governanceTier})"`);
    for (const repo of mod.repos) {
      if (seenRepos.has(repo.fullName)) continue;
      seenRepos.add(repo.fullName);
      const targetDir = `${mod.code.toLowerCase()}-${repo.repo.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
      lines.push(`if [ ! -d "${targetDir}" ]; then`);
      lines.push(`  git clone --depth 1 "${repo.url}.git" "${targetDir}"`);
      lines.push(`fi`);
    }
    lines.push('');
  }

  lines.push('echo "All selected B.A.R.B.I. OS v4.0 GitHub repositories synced cleanly."');
  return lines.join('\n');
}

export function generateEnvExampleForModules(selectedModules: ReadonlyArray<BarbiV4Module>): string {
  const vars = new Set<string>(['GEMINI_API_KEY', 'GITHUB_TOKEN']);
  for (const mod of selectedModules) {
    for (const v of mod.envVars) {
      vars.add(v);
    }
  }
  const header = [
    `# B.A.R.B.I. OS ${BARBI_OS_VERSION} — Environment Keys Template (${BARBI_COMPANY_NAME})`,
    '# Never commit live secrets. Configure via server environment.',
    '',
  ];
  return [...header, ...Array.from(vars).sort().map((v) => `${v}=`)].join('\n');
}
