export type TargetPlatform = 'web' | 'windows' | 'macos' | 'ios' | 'android';

export const ALL_TARGET_PLATFORMS: readonly TargetPlatform[] = [
  'web',
  'windows',
  'macos',
  'ios',
  'android',
] as const;

export interface ReaRepoProfile {
  owner: string;
  repo: string;
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
  description: string;
  stars: number | null;
  language: string;
  cliCommand: string;
  mcpPackage: string;
  capabilities: string[];
  topLevelFiles: string[];
  source: 'github-live' | 'github-cached-fallback';
  syncedAt: string;
}

export interface ForgedModuleSpec {
  title: string;
  metric: string;
  value: string;
  actionLabel: string;
}

export interface PlatformDeliverable {
  platform: TargetPlatform;
  label: string;
  artifactFormat: string;
  buildCommand: string;
  entryFiles: string[];
}

export interface MultiPlatformSystemInput {
  slug: string;
  appTitle: string;
  tagline: string;
  prompt: string;
  primaryColorHex?: string;
  modules: ForgedModuleSpec[];
  nativeCapabilities?: string[];
  platforms: TargetPlatform[];
  reaRepo: ReaRepoProfile;
}

export interface MultiPlatformGenerationResult {
  bundleId: string;
  platforms: TargetPlatform[];
  platformDeliverables: PlatformDeliverable[];
  files: Record<string, string>;
}

export const DEFAULT_REA_REPO_URL = 'https://github.com/morluto/rea';

export const DEFAULT_REA_REPO_PROFILE: ReaRepoProfile = {
  owner: 'morluto',
  repo: 'rea',
  fullName: 'morluto/rea',
  htmlUrl: 'https://github.com/morluto/rea',
  cloneUrl: 'https://github.com/morluto/rea.git',
  defaultBranch: 'main',
  description:
    'REA (Reverse Engineer Anything) — MCP server and CLI bridge enabling AI agents to inspect, architect, and rebuild web, Electron, desktop (Windows/macOS), and mobile (iOS/Android) applications.',
  stars: null,
  language: 'TypeScript',
  cliCommand: 'npx rea-agents@latest setup',
  mcpPackage: 'rea-agents@latest',
  capabilities: [
    'Web & SPA DOM/API architecture synthesis',
    'Windows & macOS desktop app packaging (Tauri v2 / Electron)',
    'iOS & Android mobile bridge & binary/APK inspection',
    'MCP stdio agent tool orchestration (Claude, Gemini CLI, Codex, Cursor)',
  ],
  topLevelFiles: ['README.md', 'package.json', 'src', 'scripts'],
  source: 'github-cached-fallback',
  syncedAt: new Date(0).toISOString(),
};

export function parseGitHubRepoUrl(rawInput?: string): {
  owner: string;
  repo: string;
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
} {
  const cleaned = String(rawInput || '').trim();
  if (!cleaned) {
    return {
      owner: DEFAULT_REA_REPO_PROFILE.owner,
      repo: DEFAULT_REA_REPO_PROFILE.repo,
      fullName: DEFAULT_REA_REPO_PROFILE.fullName,
      htmlUrl: DEFAULT_REA_REPO_PROFILE.htmlUrl,
      cloneUrl: DEFAULT_REA_REPO_PROFILE.cloneUrl,
    };
  }

  // Allow owner/repo shorthand
  const shorthand = cleaned.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (shorthand) {
    const owner = shorthand[1];
    const repo = shorthand[2];
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      htmlUrl: `https://github.com/${owner}/${repo}`,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error('Invalid GitHub repository URL. Expected https://github.com/<owner>/<repo> or <owner>/<repo>.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('GitHub repository URL must use https://.');
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    throw new Error('Only github.com repositories are supported for REA repo integration.');
  }

  const segments = parsed.pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (segments.length < 2) {
    throw new Error('GitHub URL must include both owner and repository name.');
  }
  const owner = segments[0].replace(/[^A-Za-z0-9_.-]/g, '');
  const repo = segments[1].replace(/\.git$/i, '').replace(/[^A-Za-z0-9_.-]/g, '');
  if (!owner || !repo) {
    throw new Error('Invalid GitHub owner or repository name.');
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    htmlUrl: `https://github.com/${owner}/${repo}`,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

export function normalizeTargetPlatforms(input?: unknown): TargetPlatform[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [...ALL_TARGET_PLATFORMS];
  }
  const valid = new Set<TargetPlatform>();
  for (const item of input) {
    const norm = String(item || '').trim().toLowerCase() as TargetPlatform;
    if ((ALL_TARGET_PLATFORMS as readonly string[]).includes(norm)) {
      valid.add(norm);
    }
  }
  if (valid.size === 0) {
    return [...ALL_TARGET_PLATFORMS];
  }
  // Preserve canonical ordering and always include 'web' as the shared UI/PWA core
  valid.add('web');
  return ALL_TARGET_PLATFORMS.filter((p) => valid.has(p));
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return String(s || '').replace(/['"\\]/g, '');
}

function sanitizeBundleIdSegment(slug: string): string {
  const clean = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return 'reaapp';
  return /^[0-9]/.test(clean) ? `app${clean}` : clean;
}

export function generateMultiPlatformSystemFiles(
  input: MultiPlatformSystemInput
): MultiPlatformGenerationResult {
  const platforms = normalizeTargetPlatforms(input.platforms);
  const slug = input.slug;
  const appTitle = input.appTitle;
  const tagline = input.tagline;
  const accentHex = /^#[0-9a-fA-F]{6}$/.test(input.primaryColorHex || '')
    ? String(input.primaryColorHex)
    : '#f0820a';
  const bundleSegment = sanitizeBundleIdSegment(slug);
  const bundleId = `co.za.zulutronix.${bundleSegment}`;
  const nativeCaps =
    input.nativeCapabilities && input.nativeCapabilities.length > 0
      ? input.nativeCapabilities.slice(0, 6)
      : [
          'Offline-first local persistence + JSON state export',
          'Cross-platform responsive shell (Desktop / Tablet / Mobile Safe-Area)',
          'REA MCP automation hook for live reverse-engineering & CI diagnostics',
        ];

  const hasWindows = platforms.includes('windows');
  const hasMacos = platforms.includes('macos');
  const hasIos = platforms.includes('ios');
  const hasAndroid = platforms.includes('android');
  const hasDesktop = hasWindows || hasMacos;
  const hasMobile = hasIos || hasAndroid;

  const platformBadgesHtml = platforms
    .map((p) => `<span class="platform-chip" data-platform="${p}">${p.toUpperCase()}</span>`)
    .join('');

  // 1. Web / PWA Core (Shared across Web, Tauri Windows/macOS, and Capacitor iOS/Android)
  const htmlFile = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#050301" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <title>${escapeHtml(appTitle)}</title>
  <link rel="manifest" href="./manifest.webmanifest" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="topbar">
    <div>
      <div class="badge">FORGED BY B.A.R.B.I • R.E.A AGENT FORGE (${escapeHtml(input.reaRepo.fullName)})</div>
      <h1>${escapeHtml(appTitle)}</h1>
      <p class="tagline">${escapeHtml(tagline)}</p>
      <div class="platform-row">${platformBadgesHtml}</div>
    </div>
    <div class="actions">
      <button id="btn-runtime-info" class="btn" type="button">Runtime Target</button>
      <button id="btn-export-json" class="btn" type="button">Export Data (.json)</button>
      <button id="btn-add-item" class="btn btn-primary" type="button">+ New Operation</button>
    </div>
  </header>

  <section class="runtime-banner" id="runtime-banner">
    <span><strong>Target Host:</strong> <span id="detected-host">Detecting platform...</span></span>
    <span><strong>Bundle ID:</strong> <code>${escapeHtml(bundleId)}</code></span>
    <span><strong>REA MCP:</strong> <code>${escapeHtml(input.reaRepo.cliCommand)}</code></span>
  </section>

  <main class="grid">
    ${input.modules
      .map(
        (mod, i) => `
    <section class="card" data-idx="${i}">
      <div class="card-head">
        <span>${escapeHtml(mod.title)}</span>
        <span class="pill">${escapeHtml(mod.metric)}</span>
      </div>
      <div class="metric-val" id="metric-val-${i}">${escapeHtml(mod.value)}</div>
      <button class="btn card-btn" type="button" onclick="triggerModuleAction(${i}, '${escapeAttr(mod.title)}')">${escapeHtml(mod.actionLabel)}</button>
    </section>`
      )
      .join('\n')}
  </main>

  <section class="panel">
    <h2>Interactive Command, Telemetry &amp; Sync Console</h2>
    <div class="input-row">
      <input id="op-input" type="text" placeholder="Enter operational task, telemetry note, or REA automation command..." />
      <button class="btn btn-primary" type="button" onclick="appendUserOperation()">Persist &amp; Sync</button>
    </div>
    <ul id="op-log" class="log-list"></ul>
  </section>

  <section class="panel caps-panel">
    <h2>Bundled Cross-Platform Capabilities</h2>
    <ul class="caps-list">
      ${nativeCaps.map((c) => `<li>${escapeHtml(c)}</li>`).join('\n      ')}
    </ul>
  </section>

  <script src="./app.js"></script>
</body>
</html>`;

  const cssFile = `:root {
  color-scheme: dark;
  --bg: #050301;
  --panel: rgba(24, 14, 4, 0.88);
  --accent: ${accentHex};
  --text: #fef3c7;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body {
  margin: 0;
  padding: calc(20px + var(--safe-top)) 20px calc(24px + var(--safe-bottom));
  background: radial-gradient(circle at top, #1f0e02, var(--bg));
  color: var(--text);
  min-height: 100vh;
}
.topbar { display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(240,130,10,0.35); padding-bottom: 16px; margin-bottom: 16px; }
.badge { font-size: 11px; letter-spacing: 0.12em; color: var(--accent); font-weight: 700; }
h1 { margin: 4px 0; font-size: 24px; }
h2 { margin: 0 0 12px; font-size: 15px; letter-spacing: 0.04em; color: var(--accent); }
.tagline { margin: 0 0 8px; font-size: 13px; color: #cbd5e1; max-width: 720px; }
.platform-row { display: flex; flex-wrap: wrap; gap: 6px; }
.platform-chip { font-size: 10px; font-family: ui-monospace, monospace; padding: 2px 8px; border: 1px solid rgba(240,130,10,0.45); background: rgba(240,130,10,0.14); color: #fde68a; }
.runtime-banner { display: flex; flex-wrap: wrap; gap: 14px; justify-content: space-between; padding: 10px 14px; margin-bottom: 18px; background: rgba(0,0,0,0.55); border: 1px solid rgba(240,130,10,0.28); font-size: 12px; color: #e2e8f0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(240,130,10,0.45); color: #fff; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px; }
.btn:hover { background: rgba(240,130,10,0.22); }
.btn-primary { background: rgba(240,130,10,0.28); border-color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 18px; }
.card, .panel { background: var(--panel); border: 1px solid rgba(240,130,10,0.3); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.card-head { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 700; }
.pill { font-size: 10px; padding: 2px 8px; border-radius: 4px; background: rgba(240,130,10,0.2); color: var(--accent); }
.metric-val { font-size: 20px; font-weight: 800; margin: 14px 0; color: #fff; }
.input-row { display: flex; gap: 8px; margin-bottom: 12px; }
input { flex: 1; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 10px; color: #fff; }
.log-list, .caps-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; font-size: 12.5px; }
.log-list li, .caps-list li { background: rgba(0,0,0,0.45); padding: 10px 12px; border-radius: 8px; border-left: 3px solid var(--accent); display: flex; justify-content: space-between; gap: 12px; }
code { font-family: ui-monospace, monospace; color: #fde68a; }`;

  const jsFile = `const STORE_KEY = 'barbi_forged_${slug}';
let records = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
if (!records.length) {
  records.push({
    id: Date.now(),
    text: 'Initialized ${escapeAttr(appTitle)} (${platforms.join(' / ').toUpperCase()}) via R.E.A Agent Forge.',
    at: new Date().toLocaleTimeString(),
  });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
}

function detectPlatformRuntime() {
  const isTauri = Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
  const isCapacitor = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const ua = navigator.userAgent || '';
  if (isTauri) {
    if (/Mac/i.test(ua)) return 'macOS Native (Tauri v2)';
    if (/Win/i.test(ua)) return 'Windows Native (Tauri v2)';
    return 'Desktop Native (Tauri v2)';
  }
  if (isCapacitor) {
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Native (Capacitor)';
    if (/Android/i.test(ua)) return 'Android Native (Capacitor)';
    return 'Mobile Native (Capacitor)';
  }
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS Web / PWA';
  if (/Android/i.test(ua)) return 'Android Web / PWA';
  if (/Mac/i.test(ua)) return 'macOS Web / PWA';
  if (/Win/i.test(ua)) return 'Windows Web / PWA';
  return 'Web / PWA Runtime';
}

const hostEl = document.getElementById('detected-host');
if (hostEl) hostEl.textContent = detectPlatformRuntime();

if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

function renderLogs() {
  const ul = document.getElementById('op-log');
  if (!ul) return;
  ul.innerHTML = records
    .map((r) => '<li><span>' + String(r.text).replace(/</g, '&lt;') + '</span><small>' + r.at + '</small></li>')
    .join('');
}

window.triggerModuleAction = function (idx, title) {
  const el = document.getElementById('metric-val-' + idx);
  if (el) el.textContent = 'ACTIVE (' + new Date().toLocaleTimeString() + ')';
  records.unshift({ id: Date.now(), text: '[' + detectPlatformRuntime() + '] Executed: ' + title, at: new Date().toLocaleTimeString() });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
};

window.appendUserOperation = function () {
  const inp = document.getElementById('op-input');
  if (!inp || !inp.value.trim()) return;
  records.unshift({ id: Date.now(), text: inp.value.trim(), at: new Date().toLocaleTimeString() });
  inp.value = '';
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
};

document.getElementById('btn-runtime-info')?.addEventListener('click', () => {
  records.unshift({
    id: Date.now(),
    text: 'Runtime Probe: ' + detectPlatformRuntime() + ' • Bundle ${bundleId}',
    at: new Date().toLocaleTimeString(),
  });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
});

document.getElementById('btn-add-item')?.addEventListener('click', () => {
  const inp = document.getElementById('op-input');
  if (inp) inp.focus();
});

document.getElementById('btn-export-json')?.addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify({ app: '${escapeAttr(appTitle)}', bundleId: '${bundleId}', runtime: detectPlatformRuntime(), records }, null, 2)],
    { type: 'application/json' }
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '${slug}-state.json';
  a.click();
});

renderLogs();`;

  const webManifest = JSON.stringify(
    {
      name: appTitle,
      short_name: appTitle.slice(0, 18),
      description: tagline,
      start_url: './index.html',
      display: 'standalone',
      background_color: '#050301',
      theme_color: accentHex,
      orientation: 'any',
      categories: ['productivity', 'utilities', 'developer'],
    },
    null,
    2
  );

  const serviceWorkerJs = `const CACHE_NAME = '${slug}-v1';
const CORE_ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => caches.match('./index.html')))
  );
});
`;

  const nodeServerJs = `const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: '${escapeAttr(appTitle)}',
    bundleId: '${bundleId}',
    platforms: ${JSON.stringify(platforms)},
    reaRepo: '${escapeAttr(input.reaRepo.htmlUrl)}',
  });
});

app.listen(PORT, () => {
  console.log('${escapeAttr(appTitle)} Web & API server listening on http://localhost:' + PORT);
});
`;

  const scripts: Record<string, string> = {
    start: 'node server.js',
    'build:web': 'node -e "const fs=require(\'fs\');fs.mkdirSync(\'dist\',{recursive:true});for(const f of [\'index.html\',\'styles.css\',\'app.js\',\'manifest.webmanifest\',\'sw.js\']){if(fs.existsSync(\'web/\'+f))fs.copyFileSync(\'web/\'+f,\'dist/\'+f);}"',
    'rea:setup': input.reaRepo.cliCommand,
    'rea:analyze': `npx -y ${input.reaRepo.mcpPackage} analyze-javascript-application ./dist --json`,
  };

  const devDependencies: Record<string, string> = {};
  const dependencies: Record<string, string> = {
    express: '^4.21.2',
  };

  if (hasDesktop) {
    devDependencies['@tauri-apps/cli'] = '^2.2.0';
    dependencies['@tauri-apps/api'] = '^2.2.0';
  }
  if (hasWindows) {
    scripts['build:windows'] = 'npm run build:web && npx tauri build --target x86_64-pc-windows-msvc';
  }
  if (hasMacos) {
    scripts['build:macos'] = 'npm run build:web && npx tauri build --target universal-apple-darwin --config src-tauri/tauri.macos.conf.json';
  }
  if (hasMobile) {
    dependencies['@capacitor/core'] = '^6.2.0';
    devDependencies['@capacitor/cli'] = '^6.2.0';
    scripts['mobile:sync'] = 'npm run build:web && npx cap sync';
  }
  if (hasIos) {
    dependencies['@capacitor/ios'] = '^6.2.0';
    scripts['build:ios'] = 'bash scripts/build-ios.sh';
  }
  if (hasAndroid) {
    dependencies['@capacitor/android'] = '^6.2.0';
    scripts['build:android'] = 'bash scripts/build-android.sh';
  }

  const pkgJson = JSON.stringify(
    {
      name: slug,
      version: '1.0.0',
      private: true,
      description: tagline,
      scripts,
      dependencies,
      devDependencies,
      reaForge: {
        upstreamRepo: input.reaRepo.htmlUrl,
        bundleId,
        targets: platforms,
      },
    },
    null,
    2
  );

  const files: Record<string, string> = {
    'web/index.html': htmlFile,
    'web/styles.css': cssFile,
    'web/app.js': jsFile,
    'web/manifest.webmanifest': webManifest,
    'web/sw.js': serviceWorkerJs,
    'package.json': pkgJson,
    'server.js': nodeServerJs,
  };

  const platformDeliverables: PlatformDeliverable[] = [
    {
      platform: 'web',
      label: 'Web App & PWA',
      artifactFormat: 'Live Hosted SPA + Express API + Service Worker',
      buildCommand: 'npm install && npm run build:web && npm start',
      entryFiles: ['web/index.html', 'web/app.js', 'web/manifest.webmanifest', 'web/sw.js', 'server.js'],
    },
  ];

  // 2. Desktop Native (Tauri v2 for Windows & macOS)
  if (hasDesktop) {
    const bundleTargets: string[] = [];
    if (hasWindows) bundleTargets.push('nsis', 'msi');
    if (hasMacos) bundleTargets.push('dmg', 'app');

    files['src-tauri/tauri.conf.json'] = JSON.stringify(
      {
        $schema: 'https://schema.tauri.app/config/2',
        productName: appTitle.slice(0, 48),
        version: '1.0.0',
        identifier: bundleId,
        build: {
          beforeBuildCommand: 'npm run build:web',
          frontendDist: '../dist',
        },
        app: {
          windows: [
            {
              title: appTitle,
              width: 1280,
              height: 840,
              minWidth: 960,
              minHeight: 640,
              resizable: true,
            },
          ],
          security: {
            csp: null,
          },
        },
        bundle: {
          active: true,
          targets: bundleTargets,
          windows: hasWindows
            ? {
                nsis: { installMode: 'currentUser' },
                webviewInstallMode: { type: 'downloadBootstrapper' },
              }
            : undefined,
          macOS: hasMacos
            ? {
                minimumSystemVersion: '11.0',
                signingIdentity: null,
              }
            : undefined,
        },
      },
      null,
      2
    );

    files['src-tauri/Cargo.toml'] = `[package]
name = "${bundleSegment}"
version = "1.0.0"
description = "${escapeAttr(tagline.slice(0, 120))}"
authors = ["B.A.R.B.I R.E.A Agent Forge"]
edition = "2021"

[lib]
name = "${bundleSegment}_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`;

    files['src-tauri/build.rs'] = `fn main() {
    tauri_build::build()
}
`;

    files['src-tauri/src/lib.rs'] = `#[tauri::command]
fn get_system_metadata() -> serde_json::Value {
    serde_json::json!({
        "app": "${escapeAttr(appTitle)}",
        "bundleId": "${bundleId}",
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "reaRepo": "${escapeAttr(input.reaRepo.htmlUrl)}"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_system_metadata])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
`;

    files['src-tauri/src/main.rs'] = `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ${bundleSegment}_lib::run()
}
`;
  }

  // Windows-specific build & launch scripts
  if (hasWindows) {
    files['scripts/build-windows.ps1'] = `# B.A.R.B.I R.E.A Agent Forge — End-to-End Windows Native Builder (.exe NSIS + .msi)
$ErrorActionPreference = "Stop"
Write-Host "[1/4] Installing Node.js dependencies..."
npm install
Write-Host "[2/4] Building shared web/PWA assets into ./dist..."
npm run build:web
Write-Host "[3/4] Optional REA static verification via ${input.reaRepo.fullName}..."
npx -y ${input.reaRepo.mcpPackage} --version 2>$null | Out-Null
Write-Host "[4/4] Compiling native Windows x64 installer (.exe & .msi) via Tauri v2..."
npx tauri build --target x86_64-pc-windows-msvc
Write-Host "Artifacts written to src-tauri/target/x86_64-pc-windows-msvc/release/bundle/"
`;

    files['launch-windows-app.bat'] = `@echo off
title ${appTitle}
start "" msedge --app="http://localhost:3000/hosted/${slug}/" || start "" "web\\index.html"
`;

    platformDeliverables.push({
      platform: 'windows',
      label: 'Windows Native',
      artifactFormat: 'Tauri v2 x64 Installer (.exe NSIS + .msi) + Edge App Launcher',
      buildCommand: 'powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1',
      entryFiles: [
        'src-tauri/tauri.conf.json',
        'src-tauri/Cargo.toml',
        'src-tauri/src/main.rs',
        'scripts/build-windows.ps1',
        'launch-windows-app.bat',
      ],
    });
  }

  // macOS-specific build config, Info.plist & universal binary builder
  if (hasMacos) {
    files['src-tauri/tauri.macos.conf.json'] = JSON.stringify(
      {
        $schema: 'https://schema.tauri.app/config/2',
        bundle: {
          active: true,
          targets: ['dmg', 'app'],
          macOS: {
            minimumSystemVersion: '11.0',
            frameworks: [],
          },
        },
      },
      null,
      2
    );

    files['macos/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${escapeHtml(appTitle)}</string>
  <key>CFBundleDisplayName</key>
  <string>${escapeHtml(appTitle)}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;

    files['scripts/build-macos.sh'] = `#!/usr/bin/env bash
set -euo pipefail
echo "[1/4] Installing Node dependencies..."
npm install
echo "[2/4] Building shared web/PWA bundle into ./dist..."
npm run build:web
echo "[3/4] Ensuring Apple Silicon + Intel Rust targets..."
rustup target add aarch64-apple-darwin x86_64-apple-darwin
echo "[4/4] Building Universal macOS .app & .dmg via Tauri v2..."
npx tauri build --target universal-apple-darwin --config src-tauri/tauri.macos.conf.json
echo "Artifacts written to src-tauri/target/universal-apple-darwin/release/bundle/dmg/"
`;

    platformDeliverables.push({
      platform: 'macos',
      label: 'macOS Native',
      artifactFormat: 'Universal Apple Silicon + Intel (.dmg & .app)',
      buildCommand: 'bash scripts/build-macos.sh',
      entryFiles: [
        'src-tauri/tauri.macos.conf.json',
        'macos/Info.plist',
        'scripts/build-macos.sh',
      ],
    });
  }

  // 3. Mobile Native Shared Capacitor Config (iOS & Android)
  if (hasMobile) {
    files['capacitor.config.ts'] = `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${bundleId}',
  appName: '${escapeAttr(appTitle)}',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
};

export default config;
`;
  }

  // iOS deliverables
  if (hasIos) {
    files['ios/App/App/Info.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${escapeHtml(appTitle)}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSRequiresIPhoneOS</key>
  <true/>
  <key>UIRequiredDeviceCapabilities</key>
  <array>
    <string>arm64</string>
  </array>
  <key>UISupportedInterfaceOrientations</key>
  <array>
    <string>UIInterfaceOrientationPortrait</string>
    <string>UIInterfaceOrientationLandscapeLeft</string>
    <string>UIInterfaceOrientationLandscapeRight</string>
  </array>
</dict>
</plist>
`;

    files['ios/ExportOptions.plist'] = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>compileBitcode</key>
  <false/>
  <key>stripSwiftSymbols</key>
  <true/>
</dict>
</plist>
`;

    files['scripts/build-ios.sh'] = `#!/usr/bin/env bash
set -euo pipefail
echo "[1/4] Installing dependencies & building shared dist..."
npm install
npm run build:web
echo "[2/4] Initializing & syncing Capacitor iOS project..."
if [ ! -d "ios/App/App.xcodeproj" ] && [ ! -d "ios/App/App.xcworkspace" ]; then
  npx cap add ios
fi
npx cap sync ios
echo "[3/4] Installing CocoaPods..."
if [ -f "ios/App/Podfile" ]; then
  (cd ios/App && pod install)
fi
echo "[4/4] Archiving iOS App via xcodebuild..."
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release -sdk iphoneos -archivePath build/${slug}.xcarchive archive CODE_SIGNING_ALLOWED=NO
echo "iOS XCArchive generated at build/${slug}.xcarchive (export .ipa using ios/ExportOptions.plist)"
`;

    platformDeliverables.push({
      platform: 'ios',
      label: 'iOS Native',
      artifactFormat: 'Capacitor Xcode Project + XCArchive / .ipa Export',
      buildCommand: 'bash scripts/build-ios.sh',
      entryFiles: [
        'capacitor.config.ts',
        'ios/App/App/Info.plist',
        'ios/ExportOptions.plist',
        'scripts/build-ios.sh',
      ],
    });
  }

  // Android deliverables
  if (hasAndroid) {
    files['android/app/src/main/AndroidManifest.xml'] = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${bundleId}">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:label="${escapeHtml(appTitle)}"
        android:supportsRtl="true"
        android:usesCleartextTraffic="false">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTask"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;

    files['android/app/build.gradle'] = `apply plugin: 'com.android.application'

android {
    namespace "${bundleId}"
    compileSdk 35

    defaultConfig {
        applicationId "${bundleId}"
        minSdk 24
        targetSdk 35
        versionCode 1
        versionName "1.0.0"
    }

    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.7.0'
    implementation 'androidx.webkit:webkit:1.12.1'
}
`;

    files['scripts/build-android.sh'] = `#!/usr/bin/env bash
set -euo pipefail
echo "[1/4] Installing dependencies & building shared dist..."
npm install
npm run build:web
echo "[2/4] Initializing & syncing Capacitor Android project..."
if [ ! -f "android/gradlew" ]; then
  npx cap add android
fi
npx cap sync android
echo "[3/4] Compiling Android Release APK & AAB via Gradle..."
(cd android && ./gradlew assembleRelease bundleRelease)
echo "[4/4] Optional REA APK inspection via ${input.reaRepo.fullName}..."
echo "Artifacts: android/app/build/outputs/apk/release/app-release-unsigned.apk & bundle/release/app-release.aab"
`;

    platformDeliverables.push({
      platform: 'android',
      label: 'Android Native',
      artifactFormat: 'Capacitor Gradle Project (.apk + Play Store .aab)',
      buildCommand: 'bash scripts/build-android.sh',
      entryFiles: [
        'capacitor.config.ts',
        'android/app/src/main/AndroidManifest.xml',
        'android/app/build.gradle',
        'scripts/build-android.sh',
      ],
    });
  }

  // 4. REA GitHub Repo MCP Bridge & Multi-Platform CI/CD Workflow
  files['.rea/rea-mcp.json'] = JSON.stringify(
    {
      schema: 'barbi.rea.mcp/v1',
      upstreamRepository: input.reaRepo.htmlUrl,
      cloneUrl: input.reaRepo.cloneUrl,
      setupCommand: input.reaRepo.cliCommand,
      mcpServers: {
        rea: {
          command: 'npx',
          args: ['-y', input.reaRepo.mcpPackage],
          env: {
            REA_TARGET_BUNDLE_ID: bundleId,
            REA_TARGET_PLATFORMS: platforms.join(','),
          },
        },
      },
      agentWorkflows: [
        'Inspect existing target binary/web bundle using REA MCP tools',
        'Map recovered routes, state stores, and UI topology into ./web/',
        'Build native Windows, macOS, iOS, and Android bundles from unified ./dist',
      ],
    },
    null,
    2
  );

  files['.rea/system-blueprint.json'] = JSON.stringify(
    {
      slug,
      appTitle,
      tagline,
      bundleId,
      platforms,
      reaRepo: {
        fullName: input.reaRepo.fullName,
        htmlUrl: input.reaRepo.htmlUrl,
        defaultBranch: input.reaRepo.defaultBranch,
        cliCommand: input.reaRepo.cliCommand,
        source: input.reaRepo.source,
      },
      modules: input.modules,
      nativeCapabilities: nativeCaps,
      generatedAt: new Date().toISOString(),
    },
    null,
    2
  );

  // Build real GitHub Actions multi-OS CI workflow covering every selected platform
  const workflowJobs: string[] = [
    `  build-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install && npm run build:web
      - uses: actions/upload-artifact@v4
        with:
          name: ${slug}-web-pwa
          path: dist/`,
  ];

  if (hasWindows) {
    workflowJobs.push(`  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: dtolnay/rust-toolchain@stable
      - run: npm install && npm run build:windows
      - uses: actions/upload-artifact@v4
        with:
          name: ${slug}-windows-installer
          path: src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`);
  }

  if (hasMacos) {
    workflowJobs.push(`  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin
      - run: bash scripts/build-macos.sh
      - uses: actions/upload-artifact@v4
        with:
          name: ${slug}-macos-universal-dmg
          path: src-tauri/target/universal-apple-darwin/release/bundle/`);
  }

  if (hasIos) {
    workflowJobs.push(`  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: bash scripts/build-ios.sh
      - uses: actions/upload-artifact@v4
        with:
          name: ${slug}-ios-xcarchive
          path: build/${slug}.xcarchive`);
  }

  if (hasAndroid) {
    workflowJobs.push(`  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - run: bash scripts/build-android.sh
      - uses: actions/upload-artifact@v4
        with:
          name: ${slug}-android-apk-aab
          path: android/app/build/outputs/`);
  }

  files['.github/workflows/rea-multiplatform-release.yml'] = `name: R.E.A Multi-Platform End-to-End Build (${appTitle})

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
${workflowJobs.join('\n\n')}
`;

  files['README.md'] = `# ${appTitle}

> Forged end-to-end by **B.A.R.B.I R.E.A Agent Forge** integrated with **${input.reaRepo.fullName}** (${input.reaRepo.htmlUrl}).

${tagline}

## Target Platforms Included
${platformDeliverables
  .map((d) => `- **${d.label}** (\`${d.artifactFormat}\`) — \`${d.buildCommand}\``)
  .join('\n')}

## REA GitHub Repo MCP Setup
\`\`\`bash
${input.reaRepo.cliCommand}
\`\`\`

The \`.rea/rea-mcp.json\` file configures the \`${input.reaRepo.mcpPackage}\` MCP server for automated inspection, reverse-engineering verification, and rebuild workflows.

## Automated Multi-OS Release Pipeline
Push this repository to GitHub to run \`.github/workflows/rea-multiplatform-release.yml\`, which builds artifacts for all selected platforms (${platforms.join(', ')}).
`;

  return {
    bundleId,
    platforms,
    platformDeliverables,
    files,
  };
}
