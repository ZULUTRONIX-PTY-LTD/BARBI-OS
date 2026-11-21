import fs from 'node:fs';
import path from 'node:path';
import { executePooledAiText } from '../ai/pooledAiExecutor.ts';
import {
  ALL_TARGET_PLATFORMS,
  DEFAULT_REA_REPO_PROFILE,
  DEFAULT_REA_REPO_URL,
  generateMultiPlatformSystemFiles,
  normalizeTargetPlatforms,
  parseGitHubRepoUrl,
  type PlatformDeliverable,
  type ReaRepoProfile,
  type TargetPlatform,
} from './multiPlatformGenerator.ts';

export {
  ALL_TARGET_PLATFORMS,
  DEFAULT_REA_REPO_PROFILE,
  DEFAULT_REA_REPO_URL,
  generateMultiPlatformSystemFiles,
  normalizeTargetPlatforms,
  parseGitHubRepoUrl,
  type PlatformDeliverable,
  type ReaRepoProfile,
  type TargetPlatform,
};

const HOSTED_DIR = path.resolve(process.cwd(), '.barbi-hosted');
const repoCache = new Map<string, { profile: ReaRepoProfile; expiresAt: number }>();

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

export async function syncReaGithubRepo(repoInput?: string): Promise<ReaRepoProfile> {
  const parsed = parseGitHubRepoUrl(repoInput || DEFAULT_REA_REPO_URL);
  const cacheKey = parsed.fullName.toLowerCase();
  const cached = repoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'BARBI-REA-Agent-Forge/3.1',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const [repoRes, contentsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
        signal: ctrl.signal,
        headers,
      }),
      fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents`, {
        signal: ctrl.signal,
        headers,
      }).catch(() => null),
    ]);
    clearTimeout(timer);

    if (repoRes.ok) {
      const repoJson = (await repoRes.json()) as Record<string, unknown>;
      let topLevelFiles: string[] = [];
      if (contentsRes && contentsRes.ok) {
        const items = (await contentsRes.json()) as Array<{ name?: string }>;
        if (Array.isArray(items)) {
          topLevelFiles = items
            .map((i) => String(i?.name || '').trim())
            .filter(Boolean)
            .slice(0, 18);
        }
      }

      const isOfficialRea = cacheKey === 'morluto/rea';
      const profile: ReaRepoProfile = {
        owner: parsed.owner,
        repo: parsed.repo,
        fullName: String(repoJson.full_name || parsed.fullName),
        htmlUrl: String(repoJson.html_url || parsed.htmlUrl),
        cloneUrl: String(repoJson.clone_url || parsed.cloneUrl),
        defaultBranch: String(repoJson.default_branch || 'main'),
        description:
          String(repoJson.description || '').trim() ||
          (isOfficialRea
            ? DEFAULT_REA_REPO_PROFILE.description
            : `GitHub repository ${parsed.fullName} linked to B.A.R.B.I R.E.A Agent Forge.`),
        stars: typeof repoJson.stargazers_count === 'number' ? repoJson.stargazers_count : null,
        language: String(repoJson.language || 'TypeScript'),
        cliCommand: isOfficialRea ? 'npx rea-agents@latest setup' : `git clone ${parsed.cloneUrl}`,
        mcpPackage: isOfficialRea ? 'rea-agents@latest' : `${parsed.owner}/${parsed.repo}`,
        capabilities: DEFAULT_REA_REPO_PROFILE.capabilities,
        topLevelFiles: topLevelFiles.length > 0 ? topLevelFiles : DEFAULT_REA_REPO_PROFILE.topLevelFiles,
        source: 'github-live',
        syncedAt: new Date().toISOString(),
      };
      repoCache.set(cacheKey, { profile, expiresAt: Date.now() + 5 * 60 * 1000 });
      return profile;
    }
  } catch {
    // Graceful fallback below when offline or GitHub API rate-limited
  }

  const fallbackProfile: ReaRepoProfile = {
    ...DEFAULT_REA_REPO_PROFILE,
    owner: parsed.owner,
    repo: parsed.repo,
    fullName: parsed.fullName,
    htmlUrl: parsed.htmlUrl,
    cloneUrl: parsed.cloneUrl,
    cliCommand:
      cacheKey === 'morluto/rea' ? DEFAULT_REA_REPO_PROFILE.cliCommand : `git clone ${parsed.cloneUrl}`,
    mcpPackage:
      cacheKey === 'morluto/rea' ? DEFAULT_REA_REPO_PROFILE.mcpPackage : `${parsed.owner}/${parsed.repo}`,
    source: 'github-cached-fallback',
    syncedAt: new Date().toISOString(),
  };
  return fallbackProfile;
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
        headers: { 'User-Agent': 'BARBI-REA-Platform-Observer/3.1' },
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
      'You are B.A.R.B.I. R.E.A. (Research, Engineer & Agent Architect) powered by the REA GitHub repo (morluto/rea). Analyze software platforms, GUIs, websites, desktop binaries, and mobile apps rigorously.',
    prompt: [
      `Target Platform / GUI / URL: ${targetTrimmed}`,
      scrapedContext ? `Extracted Live DOM Telemetry:\n${scrapedContext}` : '',
      params.notes ? `Engineer Focus Notes: ${params.notes}` : '',
      'Deliver a structured R.E.A. Platform Study Dossier covering:',
      '1) GUI Layout & Navigation Topology',
      '2) Core Interactive State & Agentic Workflows',
      '3) Cross-Platform Rebuild Blueprint (Web/PWA, Windows, macOS, iOS, Android)',
      '4) Recommended REA MCP Automation Agent Specification',
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
    `- **REA GitHub Repo Integration**: Ready to rebuild across Web/PWA, Windows, macOS, iOS, and Android using \`${DEFAULT_REA_REPO_PROFILE.cliCommand}\`.`,
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
  reaRepoUrl?: string;
  platforms?: TargetPlatform[];
  allowAutoFailover?: boolean;
}) {
  const reaRepo = await syncReaGithubRepo(params.reaRepoUrl);
  const platforms = normalizeTargetPlatforms(params.platforms);

  const aiOut = await executePooledAiText({
    userKey: params.userKey,
    allowAutoFailover: params.allowAutoFailover,
    systemInstruction:
      'You are B.A.R.B.I. R.E.A Agent Forge. Design focused, practical autonomous multi-platform engineering agents as strict JSON ONLY with keys: id, name, role, systemPrompt, triggerKeywords (string[]), steps (string[]). No markdown fences.',
    prompt: `Build a custom autonomous REA agent using ${reaRepo.fullName} (${reaRepo.cliCommand}) targeting [${platforms.join(', ')}] for: ${params.prompt}`,
  });

  if (aiOut.switchRecommendation) {
    return { agent: null, reaRepo, ...aiOut };
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
      parsed?.role || `Autonomous multi-platform REA agent built for: ${params.prompt.slice(0, 120)}`
    ),
    systemPrompt: String(
      parsed?.systemPrompt ||
        `You are an autonomous B.A.R.B.I R.E.A sub-agent integrated with ${reaRepo.fullName} (${reaRepo.cliCommand}) specialized in ${params.prompt} across ${platforms.join(', ')}.`
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
          `Connect REA MCP server (${reaRepo.cliCommand}) for target analysis`,
          'Synthesize shared Web/PWA architecture and native platform bindings',
          `Verify end-to-end packaging across ${platforms.join(', ')} and persist to ARCHIVEX`,
        ],
    reaRepo: {
      fullName: reaRepo.fullName,
      htmlUrl: reaRepo.htmlUrl,
      cliCommand: reaRepo.cliCommand,
    },
    platforms,
    createdAt: new Date().toISOString(),
  };

  return { agent, reaRepo, ...aiOut };
}

export async function buildAndHostSystemBundle(params: {
  userKey: string;
  systemName: string;
  prompt: string;
  platforms?: TargetPlatform[];
  reaRepoUrl?: string;
  allowAutoFailover?: boolean;
}) {
  const slug = sanitizeSlug(params.systemName || params.prompt);
  const platforms = normalizeTargetPlatforms(params.platforms);
  const reaRepo = await syncReaGithubRepo(params.reaRepoUrl);

  const aiOut = await executePooledAiText({
    userKey: params.userKey,
    allowAutoFailover: params.allowAutoFailover,
    systemInstruction:
      'You are B.A.R.B.I. R.E.A Multi-Platform System Architect. Output JSON ONLY with keys: appTitle (string), tagline (string), primaryColorHex (string), modules (array of {title, metric, value, actionLabel}), nativeCapabilities (string[]), initialNotes (string). Keep it strictly valid JSON with no markdown.',
    prompt: [
      `Design a complete end-to-end application for: "${params.systemName}".`,
      `Target Platforms: ${platforms.join(', ').toUpperCase()}.`,
      `Upstream REA Repository: ${reaRepo.fullName} (${reaRepo.htmlUrl}) — CLI: ${reaRepo.cliCommand}.`,
      `User specification: ${params.prompt}`,
    ].join('\n'),
  });

  if (aiOut.switchRecommendation) {
    return { hostedApp: null, files: null, reaRepo, ...aiOut };
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

  const appTitle = String(spec?.appTitle || params.systemName || 'ZULUTRONIX Multi-Platform System');
  const tagline = String(spec?.tagline || params.prompt.slice(0, 120));
  const primaryColorHex =
    typeof spec?.primaryColorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(spec.primaryColorHex)
      ? spec.primaryColorHex
      : '#f0820a';

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
          { title: 'Core Application Shell', metric: 'RUNTIME', value: 'ONLINE', actionLabel: 'Verify Core' },
          { title: 'Cross-Platform Sync Engine', metric: 'TARGETS', value: `${platforms.length} OS`, actionLabel: 'Sync State' },
          { title: 'REA MCP Inspection Bridge', metric: 'REPO', value: reaRepo.repo.toUpperCase(), actionLabel: 'Run Audit' },
          { title: 'Release Artifact Pipeline', metric: 'CI/CD', value: 'READY', actionLabel: 'Check Matrix' },
        ];

  const nativeCapabilities = Array.isArray(spec?.nativeCapabilities)
    ? spec!.nativeCapabilities.map(String).filter(Boolean).slice(0, 6)
    : undefined;

  const generated = generateMultiPlatformSystemFiles({
    slug,
    appTitle,
    tagline,
    prompt: params.prompt,
    primaryColorHex,
    modules,
    nativeCapabilities,
    platforms,
    reaRepo,
  });

  // Persist live hosted web copy at /hosted/:slug/ AND full multi-platform bundle metadata
  const targetDir = path.join(HOSTED_DIR, slug);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'index.html'), generated.files['web/index.html'], 'utf8');
  fs.writeFileSync(path.join(targetDir, 'styles.css'), generated.files['web/styles.css'], 'utf8');
  fs.writeFileSync(path.join(targetDir, 'app.js'), generated.files['web/app.js'], 'utf8');
  fs.writeFileSync(path.join(targetDir, 'manifest.webmanifest'), generated.files['web/manifest.webmanifest'], 'utf8');
  fs.writeFileSync(path.join(targetDir, 'sw.js'), generated.files['web/sw.js'], 'utf8');

  const createdAt = new Date().toISOString();
  const hostedApp = {
    slug,
    appTitle,
    tagline,
    bundleId: generated.bundleId,
    hostedUrl: `/hosted/${slug}/`,
    platforms: generated.platforms,
    platformDeliverables: generated.platformDeliverables,
    fileCount: Object.keys(generated.files).length,
    reaRepo: {
      fullName: reaRepo.fullName,
      htmlUrl: reaRepo.htmlUrl,
      cliCommand: reaRepo.cliCommand,
      source: reaRepo.source,
    },
    modules,
    createdAt,
  };

  fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(hostedApp, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(targetDir, 'bundle.json'),
    JSON.stringify({ hostedApp, reaRepo, files: generated.files }, null, 2),
    'utf8'
  );

  return {
    hostedApp,
    reaRepo,
    files: generated.files,
    ...aiOut,
  };
}

export function getHostedSystemBundle(slug: string): {
  hostedApp: Record<string, unknown>;
  reaRepo: ReaRepoProfile | null;
  files: Record<string, string>;
} | null {
  const safeSlug = String(slug || '').trim();
  if (!/^[a-z0-9-]+$/.test(safeSlug)) return null;
  const bundlePath = path.join(HOSTED_DIR, safeSlug, 'bundle.json');
  if (!fs.existsSync(bundlePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  } catch {
    return null;
  }
}

export function listHostedSystems(): Array<{
  slug: string;
  appTitle: string;
  tagline: string;
  hostedUrl: string;
  platforms: TargetPlatform[];
  fileCount: number;
  reaRepoFullName: string;
  createdAt: string;
}> {
  if (!fs.existsSync(HOSTED_DIR)) return [];
  const dirs = fs.readdirSync(HOSTED_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const out: Array<{
    slug: string;
    appTitle: string;
    tagline: string;
    hostedUrl: string;
    platforms: TargetPlatform[];
    fileCount: number;
    reaRepoFullName: string;
    createdAt: string;
  }> = [];
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
          platforms: Array.isArray(meta.platforms) ? meta.platforms : ['web', 'windows'],
          fileCount: typeof meta.fileCount === 'number' ? meta.fileCount : 8,
          reaRepoFullName: meta.reaRepo?.fullName || DEFAULT_REA_REPO_PROFILE.fullName,
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
