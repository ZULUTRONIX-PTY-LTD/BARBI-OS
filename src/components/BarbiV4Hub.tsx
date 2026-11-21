import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import JSZip from 'jszip';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderGit2,
  Globe,
  Layers,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { barbiApi, type V4CatalogSnapshotResponse } from '../api/barbiClient';
import {
  BARBI_COMPANY_NAME,
  INTEGRATION_PACKS,
  V4_TIERS,
  filterModules,
  type BarbiV4Module,
  type IntegrationPackId,
  type LiveGitHubRepoTelemetry,
  type ModuleExecutionMode,
  type V4TierId,
} from '../v4/moduleCatalog';
import {
  classifyRailAssetBucket,
  type VentureAssetKey,
} from '../v4/ventureAllocation';
import { VentureAllocationPieChart } from './VentureAllocationPieChart';

type HubTabId = 'catalog' | 'assimilator' | 'fintech' | 'deploy';
type DeployFileKey =
  | 'docker-compose.yml'
  | 'barbi-v4-mcp.json'
  | 'integrate-github-repos.sh'
  | '.env.v4.example';

interface GitHubSearchItem {
  fullName: string;
  htmlUrl: string;
  description: string;
  stars: number;
  forks: number;
  language: string;
  license: string;
  pushedAt: string | null;
  archived: boolean;
  topics: string[];
  securityAudit: { status: 'VERIFIED' | 'CAUTION' | 'UNVERIFIED'; score: number; checks: string[] };
}

interface OpenV4HubOptions {
  moduleId?: number;
  tier?: V4TierId | 'ALL';
  searchQuery?: string;
}

declare global {
  interface Window {
    openBarbiV4Hub?: (tab?: HubTabId, options?: OpenV4HubOptions) => void;
    toggleBarbiV4Hub?: (forceOpen?: boolean, tab?: HubTabId, options?: OpenV4HubOptions) => void;
  }
}

function formatStars(stars: number | null | undefined): string {
  if (typeof stars !== 'number') return 'Not synced';
  if (stars >= 1000) return `${(stars / 1000).toFixed(1)}k stars`;
  return `${stars} stars`;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function openExternalLink(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function BarbiV4Hub() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTabId>('catalog');
  const [snapshot, setSnapshot] = useState<V4CatalogSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  // Catalog state
  const [selectedTier, setSelectedTier] = useState<V4TierId | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyMounted, setOnlyMounted] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<number>(1);
  const [syncingModuleId, setSyncingModuleId] = useState<number | null>(null);
  const [batchSyncingPack, setBatchSyncingPack] = useState<string | null>(null);
  const [mountingModuleId, setMountingModuleId] = useState<number | null>(null);

  // Dual-tier approval gate state (for CAPITAL_GATE module mount)
  const [pendingGateModule, setPendingGateModule] = useState<BarbiV4Module | null>(null);
  const [gateRequestedMode, setGateRequestedMode] = useState<ModuleExecutionMode>('PAPER_SANDBOX');
  const [gateCheckConfirmed, setGateCheckConfirmed] = useState(false);

  // GitHub Assimilator state
  const [ghSearchQuery, setGhSearchQuery] = useState('');
  const [ghSearching, setGhSearching] = useState(false);
  const [ghResults, setGhResults] = useState<GitHubSearchItem[]>([]);
  const [ghSearchError, setGhSearchError] = useState<string | null>(null);
  const [assimilateTier, setAssimilateTier] = useState<V4TierId>('A');
  const [assimilatingSlug, setAssimilatingSlug] = useState<string | null>(null);

  // FinTech Command state
  const [pendingFinTechRailId, setPendingFinTechRailId] = useState<string | null>(null);
  const [fintechGateChecked, setFintechGateChecked] = useState(false);
  const [fintechUpdatingId, setFintechUpdatingId] = useState<string | null>(null);
  const [selectedFinTechAsset, setSelectedFinTechAsset] = useState<VentureAssetKey | null>(null);

  // Deployment & Docker export state
  const [deployPack, setDeployPack] = useState<IntegrationPackId | 'mounted' | 'all'>('pack-1-core');
  const [companyName, setCompanyName] = useState(BARBI_COMPANY_NAME);
  const [deployFiles, setDeployFiles] = useState<Record<string, string> | null>(null);
  const [deployMeta, setDeployMeta] = useState<{ moduleCount: number; repoCount: number } | null>(null);
  const [activeDeployFile, setActiveDeployFile] = useState<DeployFileKey>('docker-compose.yml');
  const [loadingDeploy, setLoadingDeploy] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await barbiApi.v4GetModules();
      setSnapshot(data);
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Unable to load B.A.R.B.I. OS v4.0 registry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const applyHubOptions = (options?: OpenV4HubOptions) => {
      if (!options) return;
      if (typeof options.moduleId === 'number') {
        setSelectedModuleId(options.moduleId);
        setOnlyMounted(false);
        setSearchQuery('');
      }
      if (options.tier) {
        setSelectedTier(options.tier);
      }
      if (typeof options.searchQuery === 'string') {
        setSearchQuery(options.searchQuery);
      }
    };

    const handleToggle = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          open?: boolean;
          tab?: HubTabId;
          moduleId?: number;
          tier?: V4TierId | 'ALL';
          searchQuery?: string;
        }>
      ).detail;
      if (detail?.tab) setActiveTab(detail.tab);
      applyHubOptions(detail);
      setOpen((prev) => (typeof detail?.open === 'boolean' ? detail.open : !prev));
    };

    window.openBarbiV4Hub = (tab?: HubTabId, options?: OpenV4HubOptions) => {
      if (tab) setActiveTab(tab);
      applyHubOptions(options);
      setOpen(true);
    };
    window.toggleBarbiV4Hub = (forceOpen?: boolean, tab?: HubTabId, options?: OpenV4HubOptions) => {
      if (tab) setActiveTab(tab);
      applyHubOptions(options);
      setOpen((prev) => (typeof forceOpen === 'boolean' ? forceOpen : !prev));
    };

    window.addEventListener('barbi:toggle-v4-hub', handleToggle);
    return () => window.removeEventListener('barbi:toggle-v4-hub', handleToggle);
  }, []);

  useEffect(() => {
    const btn = document.getElementById('btn-v4-stack-hub');
    if (btn) {
      btn.setAttribute('aria-expanded', String(open));
      btn.classList.toggle('bg-amber-500/25', open);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadSnapshot();
  }, [open, loadSnapshot]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingGateModule) {
          setPendingGateModule(null);
        } else if (pendingFinTechRailId) {
          setPendingFinTechRailId(null);
        } else {
          setOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, pendingGateModule, pendingFinTechRailId]);

  const loadDeploymentPreview = useCallback(
    async (pack: IntegrationPackId | 'mounted' | 'all', org: string) => {
      setLoadingDeploy(true);
      try {
        const res = await barbiApi.v4ExportStack({ pack, companyName: org });
        setDeployFiles(res.files);
        setDeployMeta({ moduleCount: res.moduleCount, repoCount: res.repoCount });
      } catch (err) {
        setErrorMsg((err as Error)?.message || 'Failed to generate deployment manifests.');
      } finally {
        setLoadingDeploy(false);
      }
    },
    []
  );

  useEffect(() => {
    if (open && activeTab === 'deploy') {
      void loadDeploymentPreview(deployPack, companyName);
    }
  }, [open, activeTab, deployPack, companyName, loadDeploymentPreview]);

  const mountedIds = useMemo(() => {
    const ids = new Set<number>();
    if (!snapshot) return ids;
    for (const rec of Object.values(snapshot.mounted)) {
      ids.add(rec.moduleId);
    }
    return ids;
  }, [snapshot]);

  const filteredModules = useMemo(() => {
    if (!snapshot) return [];
    return filterModules(snapshot.modules, {
      tier: selectedTier,
      search: searchQuery,
      onlyMounted,
      mountedIds,
    });
  }, [snapshot, selectedTier, searchQuery, onlyMounted, mountedIds]);

  const selectedModule = useMemo(() => {
    if (!snapshot) return null;
    return (
      snapshot.modules.find((m) => m.id === selectedModuleId) ||
      filteredModules[0] ||
      snapshot.modules[0] ||
      null
    );
  }, [snapshot, selectedModuleId, filteredModules]);

  useEffect(() => {
    (window as unknown as { __barbiV4HubState?: Record<string, unknown> }).__barbiV4HubState = {
      open,
      activeTab,
      selectedTier,
      selectedModuleCode: selectedModule?.code ?? null,
      selectedModuleName: selectedModule?.engineLabel ?? null,
    };
  }, [open, activeTab, selectedTier, selectedModule?.code, selectedModule?.engineLabel]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Clipboard blocked in sandbox
    }
  };

  const handleSyncModule = async (moduleId: number) => {
    setSyncingModuleId(moduleId);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await barbiApi.v4SyncModuleGitHub(moduleId, true);
      setSnapshot(res.snapshot);
      const liveCount = res.repos.filter((r) => r.source !== 'github-fallback').length;
      setNoticeMsg(
        `Synced ${res.module.code} (${res.repos.length} GitHub ${res.repos.length === 1 ? 'repo' : 'repos'}, ${liveCount} live API responses).`
      );
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'GitHub sync failed.');
    } finally {
      setSyncingModuleId(null);
    }
  };

  const handleBatchSyncPack = async (packId: IntegrationPackId) => {
    setBatchSyncingPack(packId);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await barbiApi.v4SyncPackGitHub({ packId, maxModules: 12 });
      setSnapshot(res.snapshot);
      setNoticeMsg(
        `GitHub batch sync complete: ${res.liveCount}/${res.syncedCount} live repositories audited for ${packId}.`
      );
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Batch GitHub sync failed.');
    } finally {
      setBatchSyncingPack(null);
    }
  };

  const handleRequestMount = async (mod: BarbiV4Module) => {
    if (mod.governanceTier === 'CAPITAL_GATE') {
      setPendingGateModule(mod);
      setGateRequestedMode('PAPER_SANDBOX');
      setGateCheckConfirmed(false);
      return;
    }

    setMountingModuleId(mod.id);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await barbiApi.v4MountModule(mod.id, {
        requestedMode: mod.nativeActive ? 'NATIVE_RUNTIME' : 'PAPER_SANDBOX',
        approvalConfirmed: false,
      });
      setSnapshot(res.snapshot);
      setNoticeMsg(`${mod.code} (${mod.engineLabel}) mounted into B.A.R.B.I. OS.`);
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Failed to mount module.');
    } finally {
      setMountingModuleId(null);
    }
  };

  const handleConfirmCapitalGateMount = async () => {
    if (!pendingGateModule || !gateCheckConfirmed) return;
    const target = pendingGateModule;
    setMountingModuleId(target.id);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await barbiApi.v4MountModule(target.id, {
        requestedMode: gateRequestedMode,
        approvalConfirmed: true,
        approvedBy: 'Chief Engineer (HUD Gate)',
      });
      setSnapshot(res.snapshot);
      setPendingGateModule(null);
      setGateCheckConfirmed(false);
      setNoticeMsg(res.decision.reason);
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Approval-gated mount failed.');
    } finally {
      setMountingModuleId(null);
    }
  };

  const handleUnmountModule = async (mod: BarbiV4Module) => {
    setMountingModuleId(mod.id);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await barbiApi.v4UnmountModule(mod.id);
      setSnapshot(res.snapshot);
      setNoticeMsg(`${mod.code} unmounted cleanly via Module 33 Watchdog.`);
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Unmount failed.');
    } finally {
      setMountingModuleId(null);
    }
  };

  const handleGitHubSearch = async (e?: FormEvent, presetQuery?: string) => {
    if (e) e.preventDefault();
    const q = (presetQuery ?? ghSearchQuery).trim();
    if (q.length < 2) {
      setGhSearchError('Enter at least 2 characters to search GitHub repositories.');
      return;
    }
    if (presetQuery) setGhSearchQuery(presetQuery);
    setGhSearching(true);
    setGhSearchError(null);
    try {
      const res = await barbiApi.v4SearchGitHub(q);
      setGhResults(res.items);
    } catch (err) {
      setGhSearchError((err as Error)?.message || 'GitHub search failed.');
    } finally {
      setGhSearching(false);
    }
  };

  const handleAssimilateRepo = async (item: GitHubSearchItem) => {
    setAssimilatingSlug(item.fullName);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await barbiApi.v4AssimilateGitHubRepo({
        fullName: item.fullName,
        htmlUrl: item.htmlUrl,
        description: item.description,
        stars: item.stars,
        language: item.language,
        license: item.license,
        tier: assimilateTier,
        governanceTier: assimilateTier === 'F' ? 'CAPITAL_GATE' : 'PRE_AUTHORIZED',
        securityStatus: item.securityAudit.status,
      });
      setSnapshot(res.snapshot);
      setNoticeMsg(`Assimilated ${item.fullName} into Tier ${assimilateTier}.`);
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Repository assimilation failed.');
    } finally {
      setAssimilatingSlug(null);
    }
  };

  const handleRemoveAssimilated = async (repoId: string) => {
    try {
      const res = await barbiApi.v4RemoveAssimilatedRepo(repoId);
      setSnapshot(res.snapshot);
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Failed to remove assimilated repo.');
    }
  };

  const handleFinTechModeChange = async (
    railId: string,
    targetMode: 'PAPER_SANDBOX' | 'LIVE_APPROVED',
    approvalConfirmed: boolean
  ) => {
    setFintechUpdatingId(railId);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await barbiApi.v4SetFinTechMode({
        railId,
        targetMode,
        approvalConfirmed,
      });
      setSnapshot(res.snapshot);
      setPendingFinTechRailId(null);
      setFintechGateChecked(false);
      if (res.ok) {
        setNoticeMsg(
          targetMode === 'LIVE_APPROVED'
            ? 'Dual-Tier Capital Gate verified — live execution armed with risk caps.'
            : 'FinTech rail returned to Paper-Trading Sandbox Mode.'
        );
      } else if (res.reason) {
        setErrorMsg(res.reason);
      }
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Failed to update FinTech execution gate.');
    } finally {
      setFintechUpdatingId(null);
    }
  };

  const handleMountPack = async (packId: IntegrationPackId) => {
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      const res = await barbiApi.v4MountPack(packId, true);
      setSnapshot(res.snapshot);
      setNoticeMsg(`Mounted ${res.mountedCount} modules from ${packId} in safe sandbox mode.`);
    } catch (err) {
      setErrorMsg((err as Error)?.message || 'Pack mount failed.');
    }
  };

  const handleDownloadDeployZip = async () => {
    if (!deployFiles) return;
    const zip = new JSZip();
    for (const [name, content] of Object.entries(deployFiles)) {
      zip.file(name, content);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barbi-os-v4-${deployPack}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setNoticeMsg(`Downloaded barbi-os-v4-${deployPack}.zip bundle.`);
  };

  if (!open) return null;

  const stats = snapshot?.stats;
  const selectedMountRecord = selectedModule ? snapshot?.mounted[String(selectedModule.id)] : undefined;

  return (
    <div
      id="barbi-v4-hub-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 select-text"
    >
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className="fixed inset-0 bg-black/65 backdrop-blur-sm"
      />

      <section
        id="barbi-v4-hub-dialog"
        data-testid="barbi-v4-hub"
        role="dialog"
        aria-modal="true"
        aria-label="B.A.R.B.I. OS v4.0 55-Module GitHub Integration Hub"
        className="relative z-10 flex flex-col w-full max-w-[1160px] h-[min(88vh,780px)] rounded-xl overflow-hidden bg-[#0a0705]/96 backdrop-blur-2xl border border-amber-500/35 shadow-[0_28px_90px_rgba(0,0,0,0.92)] text-stone-100"
      >
        {/* Top Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-white/[0.08] bg-black/40 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Layers className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-semibold tracking-tight text-amber-50 truncate">
                B.A.R.B.I. OS v4.0 Architecture &amp; GitHub Integration Hub
              </h2>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-mono-tech text-stone-400 tabular-nums">
              <span>{snapshot?.companyName || BARBI_COMPANY_NAME}</span>
              <span aria-hidden="true">·</span>
              <span>{stats ? `${stats.totalModules} Modules` : '55 Modules'}</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300">
                {stats ? `${stats.mountedCount} Mounted` : 'Loading'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {stats ? `${stats.syncedRepoCount}/${stats.totalRepos} GitHub Synced` : 'GitHub Ready'}
              </span>
            </div>
          </div>

          {/* Primary Tab Switcher + Close */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end min-w-0">
            <div
              role="tablist"
              aria-label="B.A.R.B.I. OS v4.0 Workspaces"
              className="flex items-center gap-1 p-0.5 rounded-lg bg-black/60 border border-white/[0.09] overflow-x-auto min-w-0 flex-1 sm:flex-initial"
            >
              {(
                [
                  { id: 'catalog', label: '55-Module Stack', shortLabel: '55 Modules' },
                  { id: 'assimilator', label: 'GitHub Assimilator', shortLabel: 'GitHub' },
                  { id: 'fintech', label: 'FinTech Command', shortLabel: 'FinTech' },
                  { id: 'deploy', label: 'Deploy & Docker', shortLabel: 'Deploy' },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11.5px] sm:text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500/22 text-amber-50 border border-amber-400/45'
                        : 'text-stone-400 hover:text-stone-100 border border-transparent'
                    }`}
                  >
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close v4.0 Integration Hub"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.1] text-stone-300 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Feedback Banner */}
        {(errorMsg || noticeMsg) && (
          <div
            role={errorMsg ? 'alert' : 'status'}
            className={`flex items-center justify-between gap-3 px-4 sm:px-5 py-2 text-xs border-b shrink-0 ${
              errorMsg
                ? 'bg-red-950/45 border-red-500/30 text-red-200'
                : 'bg-emerald-950/35 border-emerald-500/25 text-emerald-200'
            }`}
          >
            <span className="truncate">{errorMsg || noticeMsg}</span>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setNoticeMsg(null);
              }}
              aria-label="Dismiss notification"
              className="text-current opacity-70 hover:opacity-100 cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Workspace Body */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* ========================================================== */}
          {/* TAB 1: 55-MODULE STACK & LIVE GITHUB REPO INSPECTOR        */}
          {/* ========================================================== */}
          {activeTab === 'catalog' && (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Filter & Batch Sync Toolbar */}
              <div className="px-4 sm:px-5 py-2.5 border-b border-white/[0.08] bg-black/25 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                <div
                  role="group"
                  aria-label="Filter modules by architectural tier"
                  className="flex items-center gap-1 overflow-x-auto"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedTier('ALL')}
                    aria-pressed={selectedTier === 'ALL'}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      selectedTier === 'ALL'
                        ? 'bg-amber-500/24 text-amber-50 border border-amber-400/50'
                        : 'text-stone-400 hover:text-stone-100 border border-transparent'
                    }`}
                  >
                    All 55
                  </button>
                  {V4_TIERS.map((tier) => {
                    const active = selectedTier === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setSelectedTier(tier.id)}
                        aria-pressed={active}
                        className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          active
                            ? 'bg-amber-500/24 text-amber-50 border border-amber-400/50'
                            : 'text-stone-400 hover:text-stone-100 border border-transparent'
                        }`}
                      >
                        {tier.shortLabel}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search
                      className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter 55 modules or GitHub repos..."
                      aria-label="Filter 55 modules or GitHub repos"
                      className="w-52 sm:w-60 pl-8 pr-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.1] text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/55"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setOnlyMounted((prev) => !prev)}
                    aria-pressed={onlyMounted}
                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      onlyMounted
                        ? 'bg-amber-500/22 border-amber-400/50 text-amber-100'
                        : 'bg-white/[0.03] border-white/[0.09] text-stone-300 hover:text-white'
                    }`}
                  >
                    Mounted Only
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleBatchSyncPack('pack-1-core')}
                    disabled={batchSyncingPack !== null}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-amber-500/18 hover:bg-amber-500/28 border border-amber-400/40 text-amber-100 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${batchSyncingPack === 'pack-1-core' ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>Sync Pack 1 GitHub</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleBatchSyncPack('pack-2-fintech')}
                    disabled={batchSyncingPack !== null}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.12] text-stone-200 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${batchSyncingPack === 'pack-2-fintech' ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    <span>Sync Pack 2 GitHub</span>
                  </button>
                </div>
              </div>

              {/* Split Content: Module List + Right Inspector */}
              {loading && !snapshot ? (
                <div className="p-6 space-y-3">
                  <div className="h-10 rounded bg-white/[0.05] animate-pulse" />
                  <div className="h-10 rounded bg-white/[0.05] animate-pulse" />
                  <div className="h-10 rounded bg-white/[0.05] animate-pulse" />
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1.15fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]">
                  {/* Left: Scrollable 55-Module Table */}
                  <div
                    className="max-h-[36vh] lg:max-h-none overflow-y-auto hud-scroll-inner divide-y divide-white/[0.06]"
                    data-testid="v4-module-list"
                  >
                    {filteredModules.length === 0 ? (
                      <div className="p-8 text-center space-y-2">
                        <p className="text-sm text-stone-300">No modules match your current filter.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTier('ALL');
                            setSearchQuery('');
                            setOnlyMounted(false);
                          }}
                          className="px-3 py-1.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-xs text-amber-100 cursor-pointer"
                        >
                          Reset Filters
                        </button>
                      </div>
                    ) : (
                      filteredModules.map((mod) => {
                        const isSelected = selectedModule?.id === mod.id;
                        const mountRec = snapshot?.mounted[String(mod.id)];
                        const primaryRepo = mod.repos[0];
                        const liveMeta = primaryRepo
                          ? snapshot?.repoTelemetry[primaryRepo.fullName.toLowerCase()]
                          : undefined;

                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => {
                              setSelectedModuleId(mod.id);
                              setPendingGateModule(null);
                            }}
                            className={`w-full text-left px-4 py-3 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                              isSelected
                                ? 'bg-amber-500/12'
                                : 'hover:bg-white/[0.03]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-2">
                                <span className="font-mono-tech text-[11px] font-semibold text-amber-400 tabular-nums shrink-0">
                                  {mod.code}
                                </span>
                                <span className="text-[13px] font-medium text-stone-100 truncate">
                                  {mod.roleTitle}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-stone-400 truncate">
                                {mod.engineLabel}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[10.5px] font-mono-tech text-stone-500 tabular-nums">
                                <span className="shrink-0">Tier {mod.tier}</span>
                                <span className="shrink-0" aria-hidden="true">·</span>
                                <span className="text-stone-300 truncate min-w-0">
                                  {liveMeta?.fullName || primaryRepo?.fullName}
                                </span>
                                {liveMeta && liveMeta.stars !== null && (
                                  <>
                                    <span className="shrink-0" aria-hidden="true">·</span>
                                    <span className="text-amber-300/90 shrink-0 whitespace-nowrap">
                                      {formatStars(liveMeta.stars)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 text-right font-mono-tech text-[10.5px] space-y-0.5">
                              <div
                                className={
                                  mountRec
                                    ? 'text-emerald-400 font-medium'
                                    : 'text-stone-400'
                                }
                              >
                                {mountRec
                                  ? mountRec.executionMode === 'NATIVE_RUNTIME'
                                    ? 'Native Active'
                                    : mountRec.executionMode === 'LIVE_APPROVED'
                                      ? 'Mounted · Live'
                                      : 'Mounted · Sandbox'
                                  : 'Available'}
                              </div>
                              <div
                                className={
                                  mod.governanceTier === 'CAPITAL_GATE'
                                    ? 'text-amber-300/85'
                                    : 'text-stone-500'
                                }
                              >
                                {mod.governanceTier === 'CAPITAL_GATE' ? 'Approval Gate' : 'Pre-Authorized'}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Right: Selected Module Inspector & GitHub Integration */}
                  <div
                    className="flex-1 min-h-0 overflow-y-auto hud-scroll-inner p-4 sm:p-5 bg-black/25 space-y-4"
                    data-testid="v4-module-inspector"
                  >
                    {selectedModule ? (
                      <>
                        {/* Title & Primary Actions */}
                        <div className="space-y-2 pb-3 border-b border-white/[0.08]">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-mono-tech text-amber-300 truncate min-w-0">
                              {selectedModule.code} · Tier {selectedModule.tier} · {selectedModule.tierName}
                            </div>
                            <span
                              className={`text-[11px] font-mono-tech whitespace-nowrap shrink-0 ${
                                selectedModule.governanceTier === 'CAPITAL_GATE'
                                  ? 'text-amber-300'
                                  : 'text-emerald-400'
                              }`}
                            >
                              {selectedModule.governanceTier === 'CAPITAL_GATE'
                                ? 'Capital Gate'
                                : 'Pre-Authorized'}
                            </span>
                          </div>

                          <h3 className="text-base font-semibold text-white">
                            {selectedModule.roleTitle}
                          </h3>
                          <p className="text-xs text-stone-300 leading-relaxed">
                            {selectedModule.summary}
                          </p>

                          {selectedModule.nativeCapabilityNote && (
                            <p className="text-[11px] font-mono-tech text-emerald-300/90">
                              Native Integration: {selectedModule.nativeCapabilityNote}
                            </p>
                          )}

                          <div className="pt-2 flex flex-wrap items-center gap-2">
                            {selectedModule.id === 11 && (
                              <button
                                type="button"
                                data-testid="v4-launch-gods-eye-btn"
                                onClick={() => {
                                  setOpen(false);
                                  window.dispatchEvent(
                                    new CustomEvent('barbi:toggle-gods-eye', { detail: { open: true } })
                                  );
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/22 hover:bg-cyan-500/34 border border-cyan-400/55 text-xs font-semibold text-cyan-100 whitespace-nowrap cursor-pointer"
                              >
                                <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Launch God&apos;s Eye 3D Globe</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleSyncModule(selectedModule.id)}
                              disabled={syncingModuleId === selectedModule.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/22 hover:bg-amber-500/32 border border-amber-400/50 text-xs font-medium text-amber-50 whitespace-nowrap cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw
                                className={`w-3.5 h-3.5 ${
                                  syncingModuleId === selectedModule.id ? 'animate-spin' : ''
                                }`}
                                aria-hidden="true"
                              />
                              <span>
                                {syncingModuleId === selectedModule.id
                                  ? 'Syncing GitHub...'
                                  : 'Sync GitHub'}
                              </span>
                            </button>

                            {selectedMountRecord ? (
                              <button
                                type="button"
                                onClick={() => void handleUnmountModule(selectedModule)}
                                disabled={mountingModuleId === selectedModule.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.04] hover:bg-red-500/20 border border-white/[0.12] hover:border-red-400/45 text-xs font-medium text-stone-200 hover:text-red-100 whitespace-nowrap cursor-pointer disabled:opacity-50"
                              >
                                <span>Unmount Module</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleRequestMount(selectedModule)}
                                disabled={mountingModuleId === selectedModule.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-xs font-medium text-emerald-100 whitespace-nowrap cursor-pointer disabled:opacity-50"
                              >
                                {selectedModule.governanceTier === 'CAPITAL_GATE' ? (
                                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                                ) : (
                                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                                )}
                                <span>Mount Module</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline Dual-Tier Approval Gate (for CAPITAL_GATE modules) */}
                        {pendingGateModule && pendingGateModule.id === selectedModule.id && (
                          <div
                            data-testid="v4-capital-gate-prompt"
                            className="p-3.5 rounded-lg bg-amber-950/35 border border-amber-400/45 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-amber-200">
                                Dual-Tier Approval Gate · {pendingGateModule.code}
                              </div>
                              <button
                                type="button"
                                onClick={() => setPendingGateModule(null)}
                                className="text-xs text-stone-400 hover:text-white cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                            <p className="text-[11px] text-stone-300 leading-relaxed">
                              This module touches external messaging, OS automation, or financial capital rails.
                              Select initial execution mode and confirm operator governance authorization.
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setGateRequestedMode('PAPER_SANDBOX')}
                                className={`px-2.5 py-1 rounded text-[11px] font-medium border cursor-pointer ${
                                  gateRequestedMode === 'PAPER_SANDBOX'
                                    ? 'bg-amber-500/25 border-amber-400/55 text-amber-50'
                                    : 'bg-black/40 border-white/15 text-stone-400'
                                }`}
                              >
                                Paper / Sandbox Mode (Recommended)
                              </button>
                              <button
                                type="button"
                                onClick={() => setGateRequestedMode('LIVE_APPROVED')}
                                className={`px-2.5 py-1 rounded text-[11px] font-medium border cursor-pointer ${
                                  gateRequestedMode === 'LIVE_APPROVED'
                                    ? 'bg-red-500/25 border-red-400/55 text-red-100'
                                    : 'bg-black/40 border-white/15 text-stone-400'
                                }`}
                              >
                                Live Execution Gate
                              </button>
                            </div>
                            <label className="flex items-start gap-2 text-[11px] text-stone-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={gateCheckConfirmed}
                                onChange={(e) => setGateCheckConfirmed(e.target.checked)}
                                className="mt-0.5 accent-amber-500"
                              />
                              <span>
                                I authorize mounting {pendingGateModule.code} under {BARBI_COMPANY_NAME} risk limits and FSCA/regulatory compliance controls.
                              </span>
                            </label>
                            <button
                              type="button"
                              disabled={!gateCheckConfirmed || mountingModuleId === pendingGateModule.id}
                              onClick={() => void handleConfirmCapitalGateMount()}
                              className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold cursor-pointer disabled:opacity-40"
                            >
                              Approve &amp; Mount Module
                            </button>
                          </div>
                        )}

                        {/* Linked GitHub Repositories */}
                        <div className="space-y-2.5">
                          <div className="text-xs font-semibold text-stone-200">
                            Linked GitHub Repositories ({selectedModule.repos.length})
                          </div>
                          <div className="divide-y divide-white/[0.08] border border-white/[0.09] rounded-lg bg-black/35">
                            {selectedModule.repos.map((repo) => {
                              const live: LiveGitHubRepoTelemetry | undefined =
                                snapshot?.repoTelemetry[repo.fullName.toLowerCase()];
                              const copyId = `cmd-${selectedModule.id}-${repo.fullName}`;
                              return (
                                <div key={repo.fullName} className="p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <FolderGit2
                                          className="w-3.5 h-3.5 text-amber-400 shrink-0"
                                          aria-hidden="true"
                                        />
                                        <span className="font-mono-tech text-xs font-semibold text-amber-100 truncate">
                                          {live?.fullName || repo.fullName}
                                        </span>
                                      </div>
                                      <p className="mt-0.5 text-[11px] text-stone-400 leading-snug">
                                        {live?.description || repo.role}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => openExternalLink(live?.htmlUrl || repo.url)}
                                      className="inline-flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
                                    >
                                      <span>GitHub</span>
                                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                    </button>
                                  </div>

                                  {/* Unboxed Live Metadata Row */}
                                  <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono-tech text-stone-400 tabular-nums">
                                    <span className={live?.stars !== null && live ? 'text-amber-200' : ''}>
                                      {formatStars(live?.stars)}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span>{live?.language || 'Open Source'}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>License: {live?.license || 'Pending sync'}</span>
                                    {live?.pushedAt && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span>Updated {formatShortDate(live.pushedAt)}</span>
                                      </>
                                    )}
                                    {repo.mcpReady && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="text-sky-300">MCP Ready</span>
                                      </>
                                    )}
                                    {repo.dockerImage && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="text-sky-300">Docker</span>
                                      </>
                                    )}
                                  </div>

                                  {/* Module 33 Security Audit Result */}
                                  {live && (
                                    <div className="text-[10.5px] font-mono-tech text-stone-400">
                                      <span
                                        className={
                                          live.securityAudit.status === 'VERIFIED'
                                            ? 'text-emerald-400 font-semibold'
                                            : live.securityAudit.status === 'CAUTION'
                                              ? 'text-amber-300 font-semibold'
                                              : 'text-stone-400'
                                        }
                                      >
                                        Security Scan: {live.securityAudit.status}
                                      </span>
                                      <span className="mx-1.5 text-stone-600" aria-hidden="true">
                                        ·
                                      </span>
                                      <span>{live.securityAudit.checks.slice(0, 2).join(' · ')}</span>
                                    </div>
                                  )}

                                  {/* Install / Assimilation Command */}
                                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-black/60 border border-white/[0.08] font-mono-tech text-[11px] text-amber-100/90">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Terminal className="w-3 h-3 text-stone-500 shrink-0" aria-hidden="true" />
                                      <code className="truncate">{repo.installCmd}</code>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void copyText(copyId, repo.installCmd)}
                                      className="inline-flex items-center gap-1 text-[10.5px] text-stone-400 hover:text-white shrink-0 cursor-pointer"
                                    >
                                      {copiedKey === copyId ? (
                                        <Check className="w-3 h-3 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                      <span>{copiedKey === copyId ? 'Copied' : 'Copy'}</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Environment Keys */}
                        {selectedModule.envVars.length > 0 && (
                          <div className="pt-2 border-t border-white/[0.08] space-y-1">
                            <div className="text-[11px] font-medium text-stone-300">
                              Server Environment Keys (configured in server .env, never client-side)
                            </div>
                            <div className="font-mono-tech text-[11px] text-stone-400">
                              {selectedModule.envVars.join(' · ')}
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* TAB 2: LIVE GITHUB REPO ASSIMILATOR (MODULES 8 & 34)       */}
          {/* ========================================================== */}
          {activeTab === 'assimilator' && (
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]">
              {/* Search & Results */}
              <div className="flex flex-col min-h-0">
                <form
                  onSubmit={(e) => void handleGitHubSearch(e)}
                  className="p-4 border-b border-white/[0.08] bg-black/25 space-y-2.5 shrink-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search
                        className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        type="text"
                        value={ghSearchQuery}
                        onChange={(e) => setGhSearchQuery(e.target.value)}
                        placeholder="Search GitHub repos to audit & assimilate (e.g. langgraph, freqtrade, waha)..."
                        aria-label="Search GitHub repositories"
                        className="w-full pl-9 pr-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.12] text-xs text-white placeholder:text-stone-500 focus:outline-none focus:border-amber-400/55"
                      />
                    </div>
                    <select
                      aria-label="Target architectural tier"
                      value={assimilateTier}
                      onChange={(e) => setAssimilateTier(e.target.value as V4TierId)}
                      className="px-2.5 py-2 rounded-md bg-black/70 border border-white/[0.12] text-xs text-stone-200 focus:outline-none focus:border-amber-400/55"
                    >
                      {V4_TIERS.map((t) => (
                        <option key={t.id} value={t.id}>
                          Target Tier {t.id}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={ghSearching}
                      className="px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      {ghSearching ? 'Searching...' : 'Search GitHub'}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                    <span>Quick lookups:</span>
                    {['langgraph', 'easy-equities', 'freqtrade', 'playwright-mcp', 'firecrawl'].map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => void handleGitHubSearch(undefined, term)}
                        className="text-amber-300 hover:text-amber-100 underline underline-offset-2 cursor-pointer"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </form>

                <div className="flex-1 overflow-y-auto hud-scroll-inner divide-y divide-white/[0.07]">
                  {ghSearchError && (
                    <div className="p-4 text-xs text-red-300 bg-red-950/30">{ghSearchError}</div>
                  )}
                  {ghResults.length === 0 && !ghSearching ? (
                    <div className="p-8 text-center space-y-1.5">
                      <p className="text-sm text-stone-200">
                        Live GitHub Discovery &amp; Security Assimilator
                      </p>
                      <p className="text-xs text-stone-400 max-w-md mx-auto">
                        Search any public GitHub repository, inspect live stars, license, and Module 33
                        Zero-Trust security audit results, and assimilate it directly into B.A.R.B.I. OS v4.0.
                      </p>
                    </div>
                  ) : (
                    ghResults.map((item) => {
                      const alreadyAdded = snapshot?.customRepos.some(
                        (r) => r.fullName.toLowerCase() === item.fullName.toLowerCase()
                      );
                      return (
                        <div key={item.fullName} className="p-4 flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono-tech text-xs font-semibold text-amber-100 truncate">
                                {item.fullName}
                              </span>
                              <button
                                type="button"
                                onClick={() => openExternalLink(item.htmlUrl)}
                                aria-label={`Open ${item.fullName} on GitHub`}
                                className="text-stone-400 hover:text-amber-300 cursor-pointer shrink-0"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="text-xs text-stone-300 leading-snug line-clamp-2">
                              {item.description}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono-tech text-stone-400 tabular-nums">
                              <span className="text-amber-300">{formatStars(item.stars)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{item.language}</span>
                              <span aria-hidden="true">·</span>
                              <span>{item.license}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  item.securityAudit.status === 'VERIFIED'
                                    ? 'text-emerald-400'
                                    : 'text-amber-300'
                                }
                              >
                                Audit: {item.securityAudit.status}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={assimilatingSlug === item.fullName || alreadyAdded}
                            onClick={() => void handleAssimilateRepo(item)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer border ${
                              alreadyAdded
                                ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                                : 'bg-amber-500/20 hover:bg-amber-500/32 border-amber-400/45 text-amber-50'
                            }`}
                          >
                            {alreadyAdded
                              ? 'Assimilated'
                              : assimilatingSlug === item.fullName
                                ? 'Mounting...'
                                : 'Assimilate'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right: Assimilated Custom GitHub Modules */}
              <div className="flex flex-col min-h-0 bg-black/25">
                <div className="px-4 py-3 border-b border-white/[0.08] shrink-0">
                  <h3 className="text-xs font-semibold text-stone-100">
                    Assimilated Custom GitHub Repos ({snapshot?.customRepos.length || 0})
                  </h3>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Persisted repositories added beyond the core 55-module specification.
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto hud-scroll-inner divide-y divide-white/[0.07]">
                  {!snapshot || snapshot.customRepos.length === 0 ? (
                    <div className="p-6 text-xs text-stone-400">
                      No custom repositories assimilated yet. Search GitHub on the left to add any extra tool or MCP server.
                    </div>
                  ) : (
                    snapshot.customRepos.map((repo) => (
                      <div key={repo.id} className="p-3.5 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-mono-tech text-xs font-semibold text-amber-100 truncate">
                              {repo.fullName}
                            </div>
                            <div className="text-[10.5px] font-mono-tech text-stone-400 tabular-nums">
                              Tier {repo.tier} · {formatStars(repo.stars)} · {repo.securityStatus}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRemoveAssimilated(repo.id)}
                            aria-label={`Remove ${repo.fullName}`}
                            className="p-1 text-stone-400 hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[11px] text-stone-300 line-clamp-2">{repo.description}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* TAB 3: FINTECH & DIGITAL ENTREPRENEURSHIP COMMAND CENTER   */}
          {/* ========================================================== */}
          {activeTab === 'fintech' && (
            <div className="flex-1 min-h-0 overflow-y-auto hud-scroll-inner p-4 sm:p-5 space-y-5">
              {/* Header & Compliance Strip */}
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-white/[0.08]">
                <div className="space-y-1 max-w-2xl">
                  <h3 className="text-sm font-semibold text-white">
                    Tier F · Venture, Treasury &amp; Algorithmic Trading Command Center (Modules 45–55)
                  </h3>
                  <p className="text-xs text-stone-300 leading-relaxed">
                    Every equity, Forex, crypto, and payment rail initializes in Paper-Trading / Sandbox Mode.
                    Moving real capital requires explicit Dual-Tier Governance authorization and local FSCA regulatory verification.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleBatchSyncPack('pack-2-fintech')}
                  disabled={batchSyncingPack !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/45 text-xs font-medium text-amber-100 whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${batchSyncingPack === 'pack-2-fintech' ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Sync FinTech Repos on GitHub</span>
                </button>
              </div>

              {/* D3 Venture Asset Allocation Pie Chart (EasyEquities, Crypto, Cash) */}
              <VentureAllocationPieChart
                rails={snapshot?.fintechRails || []}
                selectedAsset={selectedFinTechAsset}
                onSelectAsset={setSelectedFinTechAsset}
              />

              {/* Rails Table */}
              <div className="border border-white/[0.09] rounded-lg divide-y divide-white/[0.08] bg-black/30">
                {(snapshot?.fintechRails || []).map((rail) => {
                  const isPendingGate = pendingFinTechRailId === rail.id;
                  const railAssetKey = classifyRailAssetBucket(rail);
                  const isAssetMatched =
                    selectedFinTechAsset !== null && railAssetKey === selectedFinTechAsset;
                  const isAssetDimmed =
                    selectedFinTechAsset !== null && railAssetKey !== selectedFinTechAsset;
                  return (
                    <div
                      key={rail.id}
                      data-asset-match={isAssetMatched ? 'true' : 'false'}
                      className={`p-4 space-y-2.5 transition-colors ${
                        isAssetMatched
                          ? 'bg-amber-500/10 border-l-2 border-l-amber-400'
                          : isAssetDimmed
                            ? 'opacity-50'
                            : ''
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono-tech text-[11px] text-amber-400">
                              M{rail.moduleId}
                            </span>
                            <span className="text-sm font-medium text-white">{rail.name}</span>
                            <span className="text-stone-600" aria-hidden="true">
                              ·
                            </span>
                            <span
                              className={`font-mono-tech text-[11px] font-semibold ${
                                rail.sandboxMode ? 'text-sky-300' : 'text-amber-300'
                              }`}
                            >
                              {rail.sandboxMode ? 'Paper Sandbox' : 'Live Gate Armed'}
                            </span>
                          </div>
                          <div className="text-xs text-stone-400">{rail.statusNote}</div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono-tech text-stone-400 tabular-nums pt-0.5">
                            <span className="text-stone-200">{rail.paperBalanceLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400">{rail.paperReturnLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span>{rail.riskLimitLabel}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {rail.sandboxMode ? (
                            rail.approvalRequiredForLive ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingFinTechRailId(rail.id);
                                  setFintechGateChecked(false);
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.04] hover:bg-amber-500/20 border border-white/[0.12] hover:border-amber-400/45 text-xs text-stone-200 hover:text-amber-100 whitespace-nowrap cursor-pointer"
                              >
                                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Request Live Gate</span>
                              </button>
                            ) : (
                              <span className="font-mono-tech text-[11px] text-emerald-400">
                                Non-Custodial Active
                              </span>
                            )
                          ) : (
                            <button
                              type="button"
                              disabled={fintechUpdatingId === rail.id}
                              onClick={() => void handleFinTechModeChange(rail.id, 'PAPER_SANDBOX', false)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-xs text-amber-100 whitespace-nowrap cursor-pointer"
                            >
                              <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Revert to Paper Sandbox</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isPendingGate && (
                        <div className="p-3 rounded-md bg-amber-950/35 border border-amber-400/40 space-y-2">
                          <div className="text-xs font-semibold text-amber-200">
                            Capital Execution Approval Gate · {rail.name}
                          </div>
                          <label className="flex items-start gap-2 text-[11px] text-stone-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={fintechGateChecked}
                              onChange={(e) => setFintechGateChecked(e.target.checked)}
                              className="mt-0.5 accent-amber-500"
                            />
                            <span>
                              I confirm paper-trading backtests have been reviewed, risk limits ({rail.riskLimitLabel}) are configured, and execution complies with FSCA / local regulations.
                            </span>
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!fintechGateChecked || fintechUpdatingId === rail.id}
                              onClick={() => void handleFinTechModeChange(rail.id, 'LIVE_APPROVED', true)}
                              className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold cursor-pointer disabled:opacity-40"
                            >
                              Arm Live Execution Gate
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingFinTechRailId(null)}
                              className="px-2.5 py-1.5 text-xs text-stone-400 hover:text-white cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Governance Audit Trail */}
              {snapshot && snapshot.auditLog.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-stone-200">
                    Governance &amp; GitHub Integration Audit Trail
                  </h4>
                  <div className="border border-white/[0.08] rounded-lg divide-y divide-white/[0.06] bg-black/25">
                    {snapshot.auditLog.slice(0, 8).map((entry) => (
                      <div
                        key={entry.id}
                        className="px-3.5 py-2 flex flex-wrap items-baseline justify-between gap-2 text-[11px]"
                      >
                        <div className="min-w-0">
                          <span className="font-mono-tech text-amber-300">{entry.action}</span>
                          <span className="mx-1.5 text-stone-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-stone-100 font-medium">{entry.target}</span>
                          <span className="mx-1.5 text-stone-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-stone-400">{entry.note}</span>
                        </div>
                        <span className="font-mono-tech text-[10px] text-stone-500 tabular-nums shrink-0">
                          {formatShortDate(entry.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* TAB 4: STARTER PACKS, DOCKER-COMPOSE & MCP EXPORT FORGE    */}
          {/* ========================================================== */}
          {activeTab === 'deploy' && (
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[320px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]">
              {/* Left: Starter Pack & Entity Selector */}
              <div className="flex flex-col min-h-0 bg-black/25">
                <div className="flex-1 overflow-y-auto hud-scroll-inner p-3.5 space-y-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="v4-company-input"
                      className="block text-[11px] font-medium text-stone-300"
                    >
                      Registered Company Name
                    </label>
                    <input
                      id="v4-company-input"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.12] text-xs text-white focus:outline-none focus:border-amber-400/55"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-stone-300">
                      Starter Integration Pack
                    </div>
                    <div className="space-y-1">
                      {[
                        ...INTEGRATION_PACKS.map((p) => ({
                          id: p.id as IntegrationPackId | 'mounted' | 'all',
                          title: p.shortName,
                          desc: p.description,
                        })),
                        {
                          id: 'mounted' as const,
                          title: 'Currently Mounted Stack',
                          desc: 'Generates configs strictly for modules currently mounted in your B.A.R.B.I. OS.',
                        },
                        {
                          id: 'all' as const,
                          title: 'Complete 55-Module Stack',
                          desc: 'Full v4.0 architecture across all 6 tiers (A–F).',
                        },
                      ].map((opt) => {
                        const active = deployPack === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setDeployPack(opt.id)}
                            className={`w-full text-left px-3 py-1.5 rounded-md border transition-colors cursor-pointer ${
                              active
                                ? 'bg-amber-500/18 border-amber-400/50 text-amber-50'
                                : 'bg-white/[0.02] border-white/[0.08] text-stone-300 hover:bg-white/[0.05]'
                            }`}
                          >
                            <div className="text-xs font-medium truncate">{opt.title}</div>
                            <div className="mt-0.5 text-[10.5px] text-stone-400 truncate">
                              {opt.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {deployPack !== 'mounted' && deployPack !== 'all' && (
                  <div className="p-3 border-t border-white/[0.08] bg-black/45 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleMountPack(deployPack)}
                      className="w-full px-3 py-2 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/45 text-xs font-medium text-emerald-100 whitespace-nowrap cursor-pointer"
                    >
                      Mount All Modules in This Pack
                    </button>
                  </div>
                )}
              </div>

              {/* Right: Live Generated Manifests & Download ZIP */}
              <div className="flex flex-col min-h-0">
                <div className="px-4 py-2.5 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 bg-black/30 shrink-0">
                  <div className="flex items-center gap-1 overflow-x-auto">
                    {(
                      [
                        'docker-compose.yml',
                        'barbi-v4-mcp.json',
                        'integrate-github-repos.sh',
                        '.env.v4.example',
                      ] as const
                    ).map((fileKey) => (
                      <button
                        key={fileKey}
                        type="button"
                        onClick={() => setActiveDeployFile(fileKey)}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono-tech whitespace-nowrap shrink-0 cursor-pointer ${
                          activeDeployFile === fileKey
                            ? 'bg-amber-500/22 text-amber-100 border border-amber-400/45'
                            : 'text-stone-400 hover:text-stone-100 border border-transparent'
                        }`}
                      >
                        {fileKey}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {deployMeta && (
                      <span className="hidden sm:inline font-mono-tech text-[10.5px] text-stone-400 tabular-nums">
                        {deployMeta.moduleCount} modules · {deployMeta.repoCount} repos
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={!deployFiles}
                      onClick={() =>
                        deployFiles && void copyText(`file-${activeDeployFile}`, deployFiles[activeDeployFile] || '')
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.1] text-xs text-stone-200 cursor-pointer disabled:opacity-40"
                    >
                      {copiedKey === `file-${activeDeployFile}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedKey === `file-${activeDeployFile}` ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={!deployFiles}
                      onClick={() => void handleDownloadDeployZip()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold cursor-pointer disabled:opacity-40"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Download ZIP</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto hud-scroll-inner p-4 bg-black/55">
                  {loadingDeploy ? (
                    <div className="text-xs font-mono-tech text-stone-400">
                      Generating deployment manifests...
                    </div>
                  ) : (
                    <pre
                      data-testid="v4-deploy-preview"
                      className="font-mono-tech text-[12px] leading-relaxed text-amber-50/95 whitespace-pre"
                    >
                      {deployFiles?.[activeDeployFile] || ''}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
