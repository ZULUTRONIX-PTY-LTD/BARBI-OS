import fs from 'node:fs';
import path from 'node:path';
import {
  BARBI_COMPANY_NAME,
  BARBI_V4_MODULES,
  DEFAULT_FINTECH_RAILS,
  INTEGRATION_PACKS,
  computeTierStats,
  evaluateGovernanceGate,
  generateDockerComposeYaml,
  generateEnvExampleForModules,
  generateGithubBootstrapScript,
  generateMcpManifestJson,
  getModulesForPack,
  type BarbiV4Module,
  type CustomAssimilatedRepo,
  type FinTechRailStatus,
  type GitHubRepoSpec,
  type GovernanceTier,
  type IntegrationPackId,
  type LiveGitHubRepoTelemetry,
  type ModuleExecutionMode,
  type MountedModuleRecord,
  type V4TierId,
} from '../../v4/moduleCatalog.ts';

export interface GovernanceAuditEntry {
  id: string;
  timestamp: string;
  action: 'MOUNT' | 'UNMOUNT' | 'GITHUB_SYNC' | 'ASSIMILATE_REPO' | 'FINTECH_GATE';
  target: string;
  mode: string;
  note: string;
}

interface PersistedV4State {
  mounted: Record<string, MountedModuleRecord>;
  repoTelemetry: Record<string, LiveGitHubRepoTelemetry>;
  customRepos: CustomAssimilatedRepo[];
  fintechLiveApproved: Record<string, boolean>;
  auditLog: GovernanceAuditEntry[];
}

const STATE_DIR = path.resolve(process.cwd(), '.barbi-hosted');
const STATE_FILE = path.join(STATE_DIR, 'v4-modules-state.json');
const REPO_TTL_MS = 15 * 60 * 1000;

function createInitialState(): PersistedV4State {
  const mounted: Record<string, MountedModuleRecord> = {};
  const now = new Date().toISOString();
  for (const mod of BARBI_V4_MODULES) {
    if (mod.nativeActive) {
      mounted[String(mod.id)] = {
        moduleId: mod.id,
        mountedAt: now,
        executionMode: 'NATIVE_RUNTIME',
        approvedBy: 'BARBI_CORE_BOOT',
      };
    }
  }
  return {
    mounted,
    repoTelemetry: {},
    customRepos: [],
    fintechLiveApproved: {},
    auditLog: [
      {
        id: 'boot-v4',
        timestamp: now,
        action: 'MOUNT',
        target: 'B.A.R.B.I. OS v4.0 Core',
        mode: 'NATIVE_RUNTIME',
        note: `Initialized 55-module sovereign registry for ${BARBI_COMPANY_NAME} with native modules active.`,
      },
    ],
  };
}

let cachedState: PersistedV4State | null = null;

function loadState(): PersistedV4State {
  if (cachedState) return cachedState;
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedV4State>;
      const base = createInitialState();
      cachedState = {
        mounted: { ...base.mounted, ...(parsed.mounted || {}) },
        repoTelemetry: parsed.repoTelemetry || {},
        customRepos: Array.isArray(parsed.customRepos) ? parsed.customRepos : [],
        fintechLiveApproved: parsed.fintechLiveApproved || {},
        auditLog: Array.isArray(parsed.auditLog) && parsed.auditLog.length > 0 ? parsed.auditLog : base.auditLog,
      };
      return cachedState;
    }
  } catch {
    // Recover cleanly with fresh defaults if file is unreadable
  }
  cachedState = createInitialState();
  return cachedState;
}

function saveState(state: PersistedV4State): void {
  cachedState = state;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('Unable to persist v4 module state:', (err as Error)?.message || err);
  }
}

function pushAudit(
  state: PersistedV4State,
  entry: Omit<GovernanceAuditEntry, 'id' | 'timestamp'>
): void {
  state.auditLog = [
    {
      id: `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    },
    ...state.auditLog,
  ].slice(0, 60);
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'BARBI-OS-v4-Module-Integrator/4.0',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function computeSecurityAudit(data: {
  htmlUrl: string;
  archived: boolean;
  license: string;
  stars: number | null;
  source: LiveGitHubRepoTelemetry['source'];
}): LiveGitHubRepoTelemetry['securityAudit'] {
  const checks: string[] = [];
  let score = 50;

  if (data.htmlUrl.startsWith('https://github.com/')) {
    score += 20;
    checks.push('HTTPS GitHub origin verified');
  }
  if (!data.archived) {
    score += 10;
    checks.push('Active non-archived repository');
  } else {
    score -= 20;
    checks.push('Repository is archived (read-only)');
  }
  if (data.license && data.license !== 'Unknown' && data.license !== 'NOASSERTION') {
    score += 10;
    checks.push(`License detected: ${data.license}`);
  } else {
    checks.push('License metadata unspecified');
  }
  if (typeof data.stars === 'number' && data.stars >= 100) {
    score += 10;
    checks.push(`Community audited (${data.stars.toLocaleString()} stars)`);
  } else if (data.source === 'github-fallback') {
    checks.push('Offline/rate-limited fallback — sync with GITHUB_TOKEN for live scan');
  }

  const clamped = Math.max(0, Math.min(100, score));
  const status: 'VERIFIED' | 'CAUTION' | 'UNVERIFIED' =
    data.source === 'github-fallback'
      ? 'UNVERIFIED'
      : data.archived || clamped < 70
        ? 'CAUTION'
        : 'VERIFIED';

  return { status, score: clamped, checks };
}

export async function fetchLiveGitHubRepo(
  spec: GitHubRepoSpec,
  forceRefresh = false
): Promise<LiveGitHubRepoTelemetry> {
  const state = loadState();
  const key = spec.fullName.toLowerCase();
  const existing = state.repoTelemetry[key];
  if (
    !forceRefresh &&
    existing &&
    existing.source !== 'github-fallback' &&
    Date.now() - new Date(existing.syncedAt).getTime() < REPO_TTL_MS
  ) {
    return existing;
  }

  const headers = githubHeaders();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const [repoRes, contentsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${spec.owner}/${spec.repo}`, {
        signal: ctrl.signal,
        headers,
      }),
      fetch(`https://api.github.com/repos/${spec.owner}/${spec.repo}/contents`, {
        signal: ctrl.signal,
        headers,
      }).catch(() => null),
    ]);
    clearTimeout(timer);

    if (repoRes.ok) {
      const json = (await repoRes.json()) as Record<string, unknown>;
      let topLevelFiles: string[] = [];
      if (contentsRes && contentsRes.ok) {
        const items = (await contentsRes.json()) as Array<{ name?: string }>;
        if (Array.isArray(items)) {
          topLevelFiles = items
            .map((i) => String(i?.name || '').trim())
            .filter(Boolean)
            .slice(0, 14);
        }
      }
      const licenseObj = json.license as { spdx_id?: string; name?: string } | null | undefined;
      const license = String(licenseObj?.spdx_id || licenseObj?.name || 'Unknown');
      const stars = typeof json.stargazers_count === 'number' ? json.stargazers_count : null;
      const forks = typeof json.forks_count === 'number' ? json.forks_count : null;
      const openIssues = typeof json.open_issues_count === 'number' ? json.open_issues_count : null;
      const htmlUrl = String(json.html_url || spec.url);
      const archived = Boolean(json.archived);

      const telemetry: LiveGitHubRepoTelemetry = {
        fullName: String(json.full_name || spec.fullName),
        htmlUrl,
        description: String(json.description || spec.role),
        stars,
        forks,
        openIssues,
        language: String(json.language || 'Multi'),
        license,
        defaultBranch: String(json.default_branch || 'main'),
        pushedAt: typeof json.pushed_at === 'string' ? json.pushed_at : null,
        archived,
        topics: Array.isArray(json.topics) ? json.topics.map(String).slice(0, 6) : [],
        topLevelFiles,
        source: 'github-live',
        syncedAt: new Date().toISOString(),
        securityAudit: computeSecurityAudit({
          htmlUrl,
          archived,
          license,
          stars,
          source: 'github-live',
        }),
      };

      state.repoTelemetry[key] = telemetry;
      saveState(state);
      return telemetry;
    }

    // If repo moved or renamed (404), auto-resolve via GitHub Search API
    if (repoRes.status === 404) {
      const searchCtrl = new AbortController();
      const searchTimer = setTimeout(() => searchCtrl.abort(), 7000);
      const searchRes = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(spec.repo)}&sort=stars&order=desc&per_page=1`,
        { signal: searchCtrl.signal, headers }
      );
      clearTimeout(searchTimer);

      if (searchRes.ok) {
        const searchJson = (await searchRes.json()) as { items?: Array<Record<string, unknown>> };
        const top = searchJson.items?.[0];
        if (top) {
          const licenseObj = top.license as { spdx_id?: string; name?: string } | null | undefined;
          const license = String(licenseObj?.spdx_id || licenseObj?.name || 'Unknown');
          const stars = typeof top.stargazers_count === 'number' ? top.stargazers_count : null;
          const htmlUrl = String(top.html_url || spec.url);
          const archived = Boolean(top.archived);

          const resolved: LiveGitHubRepoTelemetry = {
            fullName: String(top.full_name || spec.fullName),
            htmlUrl,
            description: String(top.description || spec.role),
            stars,
            forks: typeof top.forks_count === 'number' ? top.forks_count : null,
            openIssues: typeof top.open_issues_count === 'number' ? top.open_issues_count : null,
            language: String(top.language || 'Multi'),
            license,
            defaultBranch: String(top.default_branch || 'main'),
            pushedAt: typeof top.pushed_at === 'string' ? top.pushed_at : null,
            archived,
            topics: Array.isArray(top.topics) ? top.topics.map(String).slice(0, 6) : [],
            topLevelFiles: [],
            source: 'github-search-resolved',
            syncedAt: new Date().toISOString(),
            securityAudit: computeSecurityAudit({
              htmlUrl,
              archived,
              license,
              stars,
              source: 'github-search-resolved',
            }),
          };

          state.repoTelemetry[key] = resolved;
          saveState(state);
          return resolved;
        }
      }
    }
  } catch {
    // Graceful fallback below if GitHub API is rate-limited or unreachable
  }

  if (existing) {
    return existing;
  }

  const fallback: LiveGitHubRepoTelemetry = {
    fullName: spec.fullName,
    htmlUrl: spec.url,
    description: spec.role,
    stars: null,
    forks: null,
    openIssues: null,
    language: 'Open Source',
    license: 'Unknown',
    defaultBranch: 'main',
    pushedAt: null,
    archived: false,
    topics: [],
    topLevelFiles: [],
    source: 'github-fallback',
    syncedAt: new Date().toISOString(),
    securityAudit: computeSecurityAudit({
      htmlUrl: spec.url,
      archived: false,
      license: 'Unknown',
      stars: null,
      source: 'github-fallback',
    }),
  };
  return fallback;
}

export function getV4CatalogSnapshot() {
  const state = loadState();
  const mountedIds = new Set<number>(
    Object.values(state.mounted).map((m) => m.moduleId)
  );
  const syncedRepoCount = Object.values(state.repoTelemetry).filter(
    (r) => r.source !== 'github-fallback'
  ).length;
  const stats = computeTierStats(BARBI_V4_MODULES, mountedIds, syncedRepoCount);

  return {
    companyName: BARBI_COMPANY_NAME,
    version: 'v4.0',
    modules: BARBI_V4_MODULES,
    mounted: state.mounted,
    repoTelemetry: state.repoTelemetry,
    customRepos: state.customRepos,
    stats,
    fintechRails: buildFintechRailsWithState(state),
    auditLog: state.auditLog.slice(0, 25),
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
  };
}

function buildFintechRailsWithState(state: PersistedV4State): FinTechRailStatus[] {
  return DEFAULT_FINTECH_RAILS.map((rail) => {
    const liveApproved = Boolean(state.fintechLiveApproved[rail.id]);
    return {
      ...rail,
      sandboxMode: !liveApproved,
    };
  });
}

export async function syncModuleFromGitHub(moduleId: number, forceRefresh = true) {
  const mod = BARBI_V4_MODULES.find((m) => m.id === moduleId);
  if (!mod) {
    throw new Error(`Module #${moduleId} not found in B.A.R.B.I. OS v4.0 registry.`);
  }

  const results = await Promise.all(
    mod.repos.map((r) => fetchLiveGitHubRepo(r, forceRefresh))
  );

  const state = loadState();
  const liveCount = results.filter((r) => r.source !== 'github-fallback').length;
  if (state.mounted[String(moduleId)]) {
    state.mounted[String(moduleId)] = {
      ...state.mounted[String(moduleId)],
      lastSyncedAt: new Date().toISOString(),
    };
  }
  pushAudit(state, {
    action: 'GITHUB_SYNC',
    target: `${mod.code} · ${mod.engineLabel}`,
    mode: liveCount > 0 ? 'GITHUB_LIVE' : 'FALLBACK',
    note: `Synced ${results.length} GitHub repo(s) (${liveCount} live API responses).`,
  });
  saveState(state);

  return {
    module: mod,
    repos: results,
    snapshot: getV4CatalogSnapshot(),
  };
}

export async function syncPackOrTierFromGitHub(params: {
  packId?: IntegrationPackId;
  tier?: V4TierId;
  maxModules?: number;
}) {
  let targets: BarbiV4Module[] = [];
  if (params.packId) {
    targets = getModulesForPack(params.packId, new Set());
  } else if (params.tier) {
    targets = BARBI_V4_MODULES.filter((m) => m.tier === params.tier);
  } else {
    targets = getModulesForPack('pack-1-core', new Set());
  }

  const limited = targets.slice(0, params.maxModules ?? 12);
  const allRepos: GitHubRepoSpec[] = [];
  for (const mod of limited) {
    if (mod.repos[0]) allRepos.push(mod.repos[0]);
  }

  // Bounded concurrency (4 at a time) to respect GitHub API nicely
  const synced: LiveGitHubRepoTelemetry[] = [];
  const batchSize = 4;
  for (let i = 0; i < allRepos.length; i += batchSize) {
    const chunk = allRepos.slice(i, i + batchSize);
    const out = await Promise.all(chunk.map((spec) => fetchLiveGitHubRepo(spec, false)));
    synced.push(...out);
  }

  const state = loadState();
  const liveCount = synced.filter((r) => r.source !== 'github-fallback').length;
  pushAudit(state, {
    action: 'GITHUB_SYNC',
    target: params.packId || (params.tier ? `Tier ${params.tier}` : 'Pack 1'),
    mode: liveCount > 0 ? 'GITHUB_LIVE' : 'FALLBACK',
    note: `Batch synced ${synced.length} primary GitHub repositories (${liveCount} live).`,
  });
  saveState(state);

  return {
    syncedCount: synced.length,
    liveCount,
    repos: synced,
    snapshot: getV4CatalogSnapshot(),
  };
}

export function mountV4Module(params: {
  moduleId: number;
  requestedMode?: ModuleExecutionMode;
  approvalConfirmed?: boolean;
  approvedBy?: string;
}) {
  const mod = BARBI_V4_MODULES.find((m) => m.id === params.moduleId);
  if (!mod) {
    throw new Error(`Module #${params.moduleId} not found.`);
  }

  const decision = evaluateGovernanceGate(mod, {
    requestedMode: params.requestedMode || 'PAPER_SANDBOX',
    approvalConfirmed: Boolean(params.approvalConfirmed),
  });

  if (!decision.allowed) {
    return {
      ok: false,
      requiresApproval: true,
      decision,
      snapshot: getV4CatalogSnapshot(),
    };
  }

  const state = loadState();
  const now = new Date().toISOString();
  state.mounted[String(mod.id)] = {
    moduleId: mod.id,
    mountedAt: now,
    executionMode: decision.resolvedMode,
    approvalSignature: params.approvalConfirmed ? `HUD-GATE-${Date.now().toString(36).toUpperCase()}` : undefined,
    approvedBy: params.approvedBy || 'Chief Engineer (HUD)',
    lastSyncedAt: now,
  };

  pushAudit(state, {
    action: 'MOUNT',
    target: `${mod.code} · ${mod.engineLabel}`,
    mode: decision.resolvedMode,
    note: decision.reason,
  });
  saveState(state);

  return {
    ok: true,
    requiresApproval: false,
    decision,
    snapshot: getV4CatalogSnapshot(),
  };
}

export function unmountV4Module(moduleId: number) {
  const mod = BARBI_V4_MODULES.find((m) => m.id === moduleId);
  if (!mod) {
    throw new Error(`Module #${moduleId} not found.`);
  }

  const state = loadState();
  delete state.mounted[String(moduleId)];
  pushAudit(state, {
    action: 'UNMOUNT',
    target: `${mod.code} · ${mod.engineLabel}`,
    mode: 'ROLLED_BACK',
    note: 'Module unmounted cleanly via Module 33 Watchdog rollback.',
  });
  saveState(state);

  return {
    ok: true,
    snapshot: getV4CatalogSnapshot(),
  };
}

export function mountStarterPack(packId: IntegrationPackId, approvalConfirmed: boolean) {
  const pack = INTEGRATION_PACKS.find((p) => p.id === packId);
  if (!pack) {
    throw new Error(`Unknown starter pack: ${packId}`);
  }

  const state = loadState();
  const now = new Date().toISOString();
  let mountedCount = 0;
  let skippedCapitalGated = 0;

  for (const moduleId of pack.moduleIds) {
    const mod = BARBI_V4_MODULES.find((m) => m.id === moduleId);
    if (!mod) continue;
    const decision = evaluateGovernanceGate(mod, {
      requestedMode: 'PAPER_SANDBOX',
      approvalConfirmed,
    });
    if (!decision.allowed) {
      skippedCapitalGated += 1;
      continue;
    }
    state.mounted[String(mod.id)] = {
      moduleId: mod.id,
      mountedAt: now,
      executionMode: decision.resolvedMode,
      approvalSignature: approvalConfirmed ? `PACK-GATE-${Date.now().toString(36).toUpperCase()}` : undefined,
      approvedBy: 'Chief Engineer (HUD)',
      lastSyncedAt: now,
    };
    mountedCount += 1;
  }

  pushAudit(state, {
    action: 'MOUNT',
    target: pack.shortName,
    mode: 'PAPER_SANDBOX',
    note: `Mounted ${mountedCount} modules from ${pack.shortName}${skippedCapitalGated > 0 ? ` (${skippedCapitalGated} held at Capital Gate)` : ''}.`,
  });
  saveState(state);

  return {
    ok: true,
    mountedCount,
    skippedCapitalGated,
    snapshot: getV4CatalogSnapshot(),
  };
}

export async function searchGitHubForAssimilation(query: string) {
  const q = query.trim().slice(0, 120);
  if (!q) throw new Error('Search query is required.');

  const headers = githubHeaders();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`,
    { signal: ctrl.signal, headers }
  );
  clearTimeout(timer);

  if (!res.ok) {
    throw new Error(`GitHub search returned HTTP ${res.status}. Configure GITHUB_TOKEN for higher limits.`);
  }

  const json = (await res.json()) as {
    total_count?: number;
    items?: Array<Record<string, unknown>>;
  };

  const items = (json.items || []).map((repo) => {
    const licenseObj = repo.license as { spdx_id?: string; name?: string } | null | undefined;
    const license = String(licenseObj?.spdx_id || licenseObj?.name || 'Unknown');
    const stars = typeof repo.stargazers_count === 'number' ? repo.stargazers_count : 0;
    const htmlUrl = String(repo.html_url || '');
    const archived = Boolean(repo.archived);
    const fullName = String(repo.full_name || '');

    return {
      fullName,
      htmlUrl,
      description: String(repo.description || 'No description provided.'),
      stars,
      forks: typeof repo.forks_count === 'number' ? repo.forks_count : 0,
      language: String(repo.language || 'Unknown'),
      license,
      pushedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : null,
      archived,
      topics: Array.isArray(repo.topics) ? repo.topics.map(String).slice(0, 6) : [],
      securityAudit: computeSecurityAudit({
        htmlUrl,
        archived,
        license,
        stars,
        source: 'github-live',
      }),
    };
  });

  return {
    query: q,
    totalCount: json.total_count ?? items.length,
    items,
  };
}

export function assimilateCustomGitHubRepo(params: {
  fullName: string;
  htmlUrl: string;
  description: string;
  stars: number;
  language: string;
  license: string;
  tier: V4TierId;
  governanceTier: GovernanceTier;
  securityStatus: 'VERIFIED' | 'CAUTION' | 'UNVERIFIED';
}) {
  const cleanFullName = params.fullName.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cleanFullName)) {
    throw new Error('Invalid GitHub repository slug (expected owner/repo).');
  }
  const safeUrl = `https://github.com/${cleanFullName}`;
  const state = loadState();
  const existingIdx = state.customRepos.findIndex(
    (r) => r.fullName.toLowerCase() === cleanFullName.toLowerCase()
  );

  const record: CustomAssimilatedRepo = {
    id: `custom-${cleanFullName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    fullName: cleanFullName,
    htmlUrl: safeUrl,
    description: params.description.slice(0, 400),
    stars: Math.max(0, Math.round(params.stars || 0)),
    language: params.language || 'Unknown',
    license: params.license || 'Unknown',
    tier: params.tier,
    governanceTier: params.governanceTier,
    mountedAt: new Date().toISOString(),
    installCmd: `git clone --depth 1 ${safeUrl}.git`,
    securityStatus: params.securityStatus,
  };

  if (existingIdx >= 0) {
    state.customRepos[existingIdx] = record;
  } else {
    state.customRepos = [record, ...state.customRepos].slice(0, 40);
  }

  pushAudit(state, {
    action: 'ASSIMILATE_REPO',
    target: cleanFullName,
    mode: params.governanceTier,
    note: `Assimilated GitHub repository into Tier ${params.tier} (${params.securityStatus}).`,
  });
  saveState(state);

  return {
    ok: true,
    repo: record,
    snapshot: getV4CatalogSnapshot(),
  };
}

export function removeAssimilatedRepo(repoId: string) {
  const state = loadState();
  state.customRepos = state.customRepos.filter((r) => r.id !== repoId);
  saveState(state);
  return {
    ok: true,
    snapshot: getV4CatalogSnapshot(),
  };
}

export function setFinTechRailMode(params: {
  railId: string;
  targetMode: 'PAPER_SANDBOX' | 'LIVE_APPROVED';
  approvalConfirmed: boolean;
  riskCapNote?: string;
}) {
  const rail = DEFAULT_FINTECH_RAILS.find((r) => r.id === params.railId);
  if (!rail) {
    throw new Error(`Unknown FinTech rail: ${params.railId}`);
  }
  if (params.targetMode === 'LIVE_APPROVED' && rail.approvalRequiredForLive && !params.approvalConfirmed) {
    return {
      ok: false,
      requiresApproval: true,
      reason: `Dual-Tier Capital Gate: explicit FSCA compliance & risk-cap confirmation is required before enabling live execution on ${rail.name}.`,
      snapshot: getV4CatalogSnapshot(),
    };
  }

  const state = loadState();
  state.fintechLiveApproved[rail.id] = params.targetMode === 'LIVE_APPROVED';
  pushAudit(state, {
    action: 'FINTECH_GATE',
    target: rail.name,
    mode: params.targetMode,
    note:
      params.targetMode === 'LIVE_APPROVED'
        ? `Live execution gate armed (${params.riskCapNote || rail.riskLimitLabel}).`
        : 'Returned to Paper-Trading / Sandbox Mode.',
  });
  saveState(state);

  return {
    ok: true,
    requiresApproval: false,
    snapshot: getV4CatalogSnapshot(),
  };
}

export function exportDeploymentStack(params: {
  pack: IntegrationPackId | 'mounted' | 'all';
  companyName?: string;
}) {
  const state = loadState();
  const mountedIds = new Set<number>(Object.values(state.mounted).map((m) => m.moduleId));
  const selected = getModulesForPack(params.pack, mountedIds);
  const company = (params.companyName || BARBI_COMPANY_NAME).trim() || BARBI_COMPANY_NAME;

  const dockerCompose = generateDockerComposeYaml(selected, company);
  const mcpManifest = generateMcpManifestJson(selected, company);
  const bootstrapScript = generateGithubBootstrapScript(selected, company);
  const envTemplate = generateEnvExampleForModules(selected);

  return {
    pack: params.pack,
    companyName: company,
    moduleCount: selected.length,
    repoCount: selected.reduce((acc, m) => acc + m.repos.length, 0),
    files: {
      'docker-compose.yml': dockerCompose,
      'barbi-v4-mcp.json': mcpManifest,
      'integrate-github-repos.sh': bootstrapScript,
      '.env.v4.example': envTemplate,
    },
  };
}
