import fs from 'node:fs';
import path from 'node:path';
import { executePooledAiText } from '../ai/pooledAiExecutor.ts';

const HOSTED_DIR = path.resolve(process.cwd(), '.barbi-hosted');

export function sanitizeSlug(input: string): string {
  const base = String(input || 'barbi-system')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return base || `sys-${Date.now()}`;
}

export function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host === '[::1]' ||
      host === '::1'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function extractDomArchitectureSummary(html: string, url: string) {
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const titleMatch = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim().slice(0, 140) : url;

  const metaDescMatch = clean.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const description = metaDescMatch ? metaDescMatch[1].trim() : '';

  const headings: string[] = [];
  const hRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hRegex.exec(clean)) && headings.length < 14) {
    const text = hm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text && !headings.includes(text)) headings.push(text.slice(0, 100));
  }

  const navCount = (html.match(/<nav\b/gi) || []).length;
  const buttonCount = (html.match(/<button\b/gi) || []).length;
  const formCount = (html.match(/<form\b/gi) || []).length;
  const inputCount = (html.match(/<input\b/gi) || []).length;
  const canvasCount = (html.match(/<canvas\b/gi) || []).length;

  const detectedStack: string[] = [];
  if (/react|__NEXT_DATA__|_next\//i.test(html)) detectedStack.push('React / Next.js');
  if (/vue|nuxt/i.test(html)) detectedStack.push('Vue / Nuxt');
  if (/tailwind|tw-/i.test(html)) detectedStack.push('Tailwind CSS');
  if (/three\.js|webgl/i.test(html)) detectedStack.push('Three.js / WebGL');
  if (/mediapipe|tensorflow/i.test(html)) detectedStack.push('Client ML / Vision');
  if (detectedStack.length === 0) detectedStack.push('HTML5 / CSS3 / Modular JS');

  return {
    url,
    title,
    description,
    headings,
    metrics: { navCount, buttonCount, formCount, inputCount, canvasCount },
    detectedStack,
  };
}

export async function studyExternalPlatform(params: {
  userKey: string;
  target: string;
  notes?: string;
  allowAutoFailover?: boolean;
}) {
  const targetTrimmed = params.target.trim();
  let scrapedContext = '';
  let telemetry: ReturnType<typeof extractDomArchitectureSummary> | null = null;

  if (/^https?:\/\//i.test(targetTrimmed)) {
    if (!isSafePublicHttpUrl(targetTrimmed)) {
      throw new Error('Only public http(s) website URLs are permitted for external platform study.');
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(targetTrimmed, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'BARBI-REA-Platform-Observer/2.0' },
      });
      clearTimeout(timer);
      if (res.ok) {
        const html = (await res.text()).slice(0, 180_000);
        telemetry = extractDomArchitectureSummary(html, targetTrimmed);
        scrapedContext = JSON.stringify(telemetry, null, 2);
      }
    } catch {
      scrapedContext = `Unable to fetch live HTML directly for ${targetTrimmed}; synthesize architecture from known platform patterns and user notes.`;
    }
  }

  const aiOut = await executePooledAiText({
    userKey: params.userKey,
    allowAutoFailover: params.allowAutoFailover,
    systemInstruction:
      'You are B.A.R.B.I. R.E.A. (Research, Engineer & Agent Architect). Analyze software platforms, GUIs, websites, and technical architectures rigorously.',
    prompt: [
      `Target Platform / GUI / URL: ${targetTrimmed}`,
      scrapedContext ? `Extracted Live DOM Telemetry:\n${scrapedContext}` : '',
      params.notes ? `Engineer Focus Notes: ${params.notes}` : '',
      'Deliver a structured R.E.A. Platform Study Dossier covering:',
      '1) GUI Layout & Navigation Topology',
      '2) Core Interactive State & Agentic Workflows',
      '3) Reusable Design & Architecture Patterns for B.A.R.B.I. / Windows PIOS',
      '4) Recommended Automation Agent Specification',
    ]
      .filter(Boolean)
      .join('\n\n'),
  });

  if (aiOut.switchRecommendation) {
    return {
      telemetry,
      dossier: '',
      ...aiOut,
    };
  }

  const fallbackDossier = [
    `### R.E.A. Platform & GUI Study Dossier: ${telemetry?.title || targetTrimmed}`,
    telemetry
      ? `- **Detected Stack**: ${telemetry.detectedStack.join(', ')}\n- **Interactive Footprint**: ${telemetry.metrics.navCount} nav regions, ${telemetry.metrics.buttonCount} controls, ${telemetry.metrics.formCount} forms, ${telemetry.metrics.inputCount} inputs, ${telemetry.metrics.canvasCount} canvases\n- **Primary Sections**: ${telemetry.headings.slice(0, 6).join(' • ') || 'Application Shell'}`
      : `- **Target Architecture**: Analyzed modular component & GUI surface for **${targetTrimmed}**.`,
    `- **Recommended B.A.R.B.I. Integration**: Extract core workflows into an executable Agent Blueprint with ARCHIVEX node indexing and Windows desktop launcher compatibility.`,
  ].join('\n\n');

  return {
    telemetry,
    dossier: aiOut.reply || fallbackDossier,
    ...aiOut,
  };
}

export async function buildCustomAgentBlueprint(params: {
  userKey: string;
  prompt: string;
  allowAutoFailover?: boolean;
}) {
  const aiOut = await executePooledAiText({
    userKey: params.userKey,
    allowAutoFailover: params.allowAutoFailover,
    systemInstruction:
      'You are B.A.R.B.I. Agent Forge. Design focused, practical autonomous agent blueprints as strict JSON ONLY with keys: id, name, role, systemPrompt, triggerKeywords (string[]), steps (string[]). No markdown fences.',
    prompt: `Build a custom autonomous agent for: ${params.prompt}`,
  });

  if (aiOut.switchRecommendation) {
    return { agent: null, ...aiOut };
  }

  let parsed: Record<string, unknown> | null = null;
  if (aiOut.reply) {
    try {
      const jsonMatch = aiOut.reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = null;
    }
  }

  const slug = sanitizeSlug(String(parsed?.id || params.prompt.slice(0, 28)));
  const agent = {
    id: `agent-${slug}`,
    name: String(parsed?.name || `REA • ${params.prompt.slice(0, 34)}`),
    role: String(
      parsed?.role ||
        `Autonomous agent built for: ${params.prompt.slice(0, 120)}`
    ),
    systemPrompt: String(
      parsed?.systemPrompt ||
        `You are an autonomous B.A.R.B.I sub-agent specialized in ${params.prompt}. Always produce verified, actionable outputs.`
    ),
    triggerKeywords: Array.isArray(parsed?.triggerKeywords)
      ? parsed!.triggerKeywords.map(String).slice(0, 8)
      : params.prompt
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 3)
          .slice(0, 6),
    steps: Array.isArray(parsed?.steps)
      ? parsed!.steps.map(String).slice(0, 6)
      : [
          'Retrieve relevant ARCHIVEX memory nodes via semantic search',
          'Analyze task parameters with quota-guarded free-tier routing',
          'Execute deterministic verification & persist output to Windows/Cloud',
        ],
    createdAt: new Date().toISOString(),
  };

  return { agent, ...aiOut };
}

export async function buildAndHostSystemBundle(params: {
  userKey: string;
  systemName: string;
  prompt: string;
  allowAutoFailover?: boolean;
}) {
  const slug = sanitizeSlug(params.systemName || params.prompt);

  const aiOut = await executePooledAiText({
    userKey: params.userKey,
    allowAutoFailover: params.allowAutoFailover,
    systemInstruction:
      'You are B.A.R.B.I. System Forge. Output JSON ONLY with keys: appTitle (string), tagline (string), primaryColorHex (string), modules (array of {title, metric, value, actionLabel}), initialNotes (string). Keep it strictly valid JSON with no markdown.',
    prompt: `Design a complete web & Windows desktop application for: "${params.systemName}". User specification: ${params.prompt}`,
  });

  if (aiOut.switchRecommendation) {
    return { hostedApp: null, files: null, ...aiOut };
  }

  let spec: Record<string, unknown> | null = null;
  if (aiOut.reply) {
    try {
      const m = aiOut.reply.match(/\{[\s\S]*\}/);
      if (m) spec = JSON.parse(m[0]);
    } catch {
      spec = null;
    }
  }

  const appTitle = String(spec?.appTitle || params.systemName || 'ZULUTRONIX System');
  const tagline = String(spec?.tagline || params.prompt.slice(0, 110));
  const rawModules = Array.isArray(spec?.modules) ? spec!.modules : null;
  const modules =
    rawModules && rawModules.length > 0
      ? rawModules.slice(0, 6).map((m: Record<string, unknown>, idx: number) => ({
          title: String(m.title || `Module ${idx + 1}`),
          metric: String(m.metric || 'STATUS'),
          value: String(m.value || 'NOMINAL'),
          actionLabel: String(m.actionLabel || 'Run Action'),
        }))
      : [
          { title: 'Telemetry & Monitoring Core', metric: 'STATE', value: 'ONLINE', actionLabel: 'Poll Metrics' },
          { title: 'Interactive Data Workspace', metric: 'RECORDS', value: 'READY', actionLabel: 'Add Record' },
          { title: 'Automated Execution Engine', metric: 'LATENCY', value: '12 ms', actionLabel: 'Execute Cycle' },
          { title: 'Windows & Cloud Export', metric: 'TARGET', value: 'EXE / PWA', actionLabel: 'Export State' },
        ];

  const htmlFile = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(appTitle)}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="topbar">
    <div>
      <div class="badge">FORGED BY B.A.R.B.I 2.0 • R.E.A SYSTEM BUILDER</div>
      <h1>${escapeHtml(appTitle)}</h1>
      <p class="tagline">${escapeHtml(tagline)}</p>
    </div>
    <div class="actions">
      <button id="btn-export-json" class="btn">Export Local Data (.json)</button>
      <button id="btn-add-item" class="btn btn-primary">+ New Operation</button>
    </div>
  </header>
  <main class="grid">
    ${modules
      .map(
        (mod, i) => `
    <section class="card" data-idx="${i}">
      <div class="card-head">
        <span>${escapeHtml(mod.title)}</span>
        <span class="pill">${escapeHtml(mod.metric)}</span>
      </div>
      <div class="metric-val" id="metric-val-${i}">${escapeHtml(mod.value)}</div>
      <button class="btn card-btn" onclick="triggerModuleAction(${i}, '${escapeAttr(mod.title)}')">${escapeHtml(mod.actionLabel)}</button>
    </section>`
      )
      .join('\n')}
  </main>
  <section class="panel">
    <h2>Interactive Command &amp; Log Console</h2>
    <div class="input-row">
      <input id="op-input" type="text" placeholder="Enter task, telemetry note, or operational rule..." />
      <button class="btn btn-primary" onclick="appendUserOperation()">Persist to Local &amp; Sync</button>
    </div>
    <ul id="op-log" class="log-list"></ul>
  </section>
  <script src="./app.js"></script>
</body>
</html>`;

  const cssFile = `:root { color-scheme: dark; --bg: #050301; --panel: rgba(24,14,4,0.86); --accent: #f0820a; --text: #fef3c7; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
body { margin: 0; padding: 24px; background: radial-gradient(circle at top, #1f0e02, var(--bg)); color: var(--text); min-height: 100vh; }
.topbar { display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(240,130,10,0.35); padding-bottom: 16px; margin-bottom: 22px; }
.badge { font-size: 11px; letter-spacing: 0.14em; color: var(--accent); font-weight: 700; }
h1 { margin: 4px 0; font-size: 24px; }
.tagline { margin: 0; font-size: 13px; color: #cbd5e1; max-width: 700px; }
.actions { display: flex; gap: 8px; }
.btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(240,130,10,0.45); color: #fff; padding: 8px 14px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 12px; }
.btn:hover { background: rgba(240,130,10,0.22); }
.btn-primary { background: rgba(240,130,10,0.28); border-color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 22px; }
.card, .panel { background: var(--panel); border: 1px solid rgba(240,130,10,0.3); border-radius: 16px; padding: 16px; }
.card-head { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; }
.pill { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: rgba(240,130,10,0.2); color: var(--accent); }
.metric-val { font-size: 22px; font-weight: 800; margin: 14px 0; color: #fff; }
.input-row { display: flex; gap: 8px; margin-bottom: 12px; }
input { flex: 1; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); border-radius: 10px; padding: 10px; color: #fff; }
.log-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; font-size: 13px; }
.log-list li { background: rgba(0,0,0,0.45); padding: 10px 12px; border-radius: 10px; border-left: 3px solid var(--accent); display: flex; justify-content: space-between; }`;

  const jsFile = `const STORE_KEY = 'barbi_forged_${slug}';
let records = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
if (!records.length) {
  records.push({ id: Date.now(), text: 'Initialized ${escapeAttr(appTitle)} runtime cleanly.', at: new Date().toLocaleTimeString() });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
}
function renderLogs() {
  const ul = document.getElementById('op-log');
  if (!ul) return;
  ul.innerHTML = records.map(r => '<li><span>' + r.text.replace(/</g,'&lt;') + '</span><small>' + r.at + '</small></li>').join('');
}
window.triggerModuleAction = function(idx, title) {
  const el = document.getElementById('metric-val-' + idx);
  if (el) el.textContent = 'ACTIVE (' + new Date().toLocaleTimeString() + ')';
  records.unshift({ id: Date.now(), text: 'Executed module: ' + title, at: new Date().toLocaleTimeString() });
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
};
window.appendUserOperation = function() {
  const inp = document.getElementById('op-input');
  if (!inp || !inp.value.trim()) return;
  records.unshift({ id: Date.now(), text: inp.value.trim(), at: new Date().toLocaleTimeString() });
  inp.value = '';
  localStorage.setItem(STORE_KEY, JSON.stringify(records));
  renderLogs();
};
document.getElementById('btn-add-item')?.addEventListener('click', () => {
  const inp = document.getElementById('op-input');
  if (inp) inp.focus();
});
document.getElementById('btn-export-json')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: '${escapeAttr(appTitle)}', records }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '${slug}-data.json';
  a.click();
});
renderLogs();`;

  const pkgJson = JSON.stringify(
    {
      name: slug,
      version: '1.0.0',
      private: true,
      scripts: { start: 'node server.js' },
      dependencies: { express: '^4.21.2' },
    },
    null,
    2
  );

  const nodeServerJs = `const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 4000;
app.use(express.static(__dirname));
app.listen(PORT, () => console.log('${escapeAttr(appTitle)} running at http://localhost:' + PORT));`;

  const tauriConfJson = JSON.stringify(
    {
      $schema: 'https://schema.tauri.app/config/2',
      productName: appTitle.slice(0, 48),
      version: '1.0.0',
      identifier: `co.za.zulutronix.${slug.replace(/[^a-z0-9]/g, '') || 'app'}`,
      build: { frontendDist: './dist' },
      app: {
        windows: [{ title: appTitle, width: 1280, height: 840, resizable: true }],
      },
      bundle: { active: true, targets: ['nsis', 'msi'] },
    },
    null,
    2
  );

  const windowsInstallerPs1 = `# B.A.R.B.I Automated Windows Installer Builder for ${appTitle}
Write-Host "1. Installing dependencies & preparing ./dist..."
New-Item -ItemType Directory -Force -Path ./dist | Out-Null
Copy-Item index.html, styles.css, app.js ./dist/ -Force
Write-Host "2. Building native Windows .exe (NSIS) & .msi installer via Tauri v2..."
npx @tauri-apps/cli@latest build --target x86_64-pc-windows-msvc
`;

  const windowsBatLauncher = `@echo off
title ${appTitle}
start "" msedge --app="http://localhost:3000/hosted/${slug}/" || start "" "index.html"
`;

  // Persist live hosted copy so it is immediately reachable at /hosted/:slug/
  const targetDir = path.join(HOSTED_DIR, slug);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'index.html'), htmlFile, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'styles.css'), cssFile, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'app.js'), jsFile, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify({ slug, appTitle, tagline, createdAt: new Date().toISOString() }, null, 2), 'utf8');

  return {
    hostedApp: {
      slug,
      appTitle,
      tagline,
      hostedUrl: `/hosted/${slug}/`,
      modules,
    },
    files: {
      'index.html': htmlFile,
      'styles.css': cssFile,
      'app.js': jsFile,
      'package.json': pkgJson,
      'server.js': nodeServerJs,
      'src-tauri/tauri.conf.json': tauriConfJson,
      'build-windows-installer.ps1': windowsInstallerPs1,
      'launch-windows-app.bat': windowsBatLauncher,
    },
    ...aiOut,
  };
}

export function listHostedSystems(): Array<{ slug: string; appTitle: string; tagline: string; hostedUrl: string; createdAt: string }> {
  if (!fs.existsSync(HOSTED_DIR)) return [];
  const dirs = fs.readdirSync(HOSTED_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const out: Array<{ slug: string; appTitle: string; tagline: string; hostedUrl: string; createdAt: string }> = [];
  for (const d of dirs) {
    const manifestPath = path.join(HOSTED_DIR, d.name, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        out.push({
          slug: d.name,
          appTitle: meta.appTitle || d.name,
          tagline: meta.tagline || '',
          hostedUrl: `/hosted/${d.name}/`,
          createdAt: meta.createdAt || '',
        });
      } catch {
        // skip corrupt manifest
      }
    }
  }
  return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export function getHostedSystemsRootDir(): string {
  fs.mkdirSync(HOSTED_DIR, { recursive: true });
  return HOSTED_DIR;
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
