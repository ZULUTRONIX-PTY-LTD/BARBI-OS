import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  HeartPulse,
  RefreshCw,
} from 'lucide-react';
import { barbiApi, syncPendingOfflineMutations } from '../api/barbiClient';
import {
  appendTelemetrySample,
  buildSparklinePath,
  formatUptimeCompact,
  getHealthStatusLabel,
  type EdgeControlHealthSummary,
  type HealthStatusLevel,
  type HealthSubsystemCategory,
  type TelemetryHistoryPoint,
} from '../health/edgeHealthLogic';
import { readOfflineQueue } from '../sync/offlineQueue';

type FilterTab = 'all' | HealthSubsystemCategory;
type PollIntervalMs = 5000 | 15000 | 0;

const FILTER_TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'compute', label: 'Compute' },
  { id: 'storage', label: 'Storage' },
  { id: 'ai', label: 'AI Mesh' },
  { id: 'edge', label: 'Edge' },
];

const POLL_OPTIONS: Array<{ value: PollIntervalMs; label: string }> = [
  { value: 5000, label: '5s' },
  { value: 15000, label: '15s' },
  { value: 0, label: 'Off' },
];

function statusToneClasses(status: HealthStatusLevel): {
  text: string;
  accent: string;
  dot: string;
} {
  if (status === 'CRITICAL') {
    return {
      text: 'text-red-400',
      accent: 'text-red-400',
      dot: 'bg-red-400',
    };
  }
  if (status === 'DEGRADED') {
    return {
      text: 'text-amber-300',
      accent: 'text-amber-400',
      dot: 'bg-amber-400',
    };
  }
  return {
    text: 'text-emerald-400',
    accent: 'text-emerald-400',
    dot: 'bg-emerald-400',
  };
}

function formatClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

declare global {
  interface Window {
    openEvoBackendModal?: () => void;
    openPowerTelemetryModal?: () => void;
  }
}

export function SystemHealthDashboard() {
  const [summary, setSummary] = useState<EdgeControlHealthSummary | null>(null);
  const [history, setHistory] = useState<TelemetryHistoryPoint[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [pollIntervalMs, setPollIntervalMs] = useState<PollIntervalMs>(15000);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [queuedSyncCount, setQueuedSyncCount] = useState(() => readOfflineQueue().length);
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);
  const inFlightRef = useRef(false);

  const fetchHealth = useCallback(async (manual = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (manual) setIsRefreshing(true);

    try {
      const data = await barbiApi.edgeHealth();
      setSummary(data);
      setErrorMessage(null);
      setQueuedSyncCount(readOfflineQueue().length);
      setHistory((prev) =>
        appendTelemetrySample(prev, {
          timestamp: data.timestamp,
          cpuLoadPct: data.compute.cpuLoadPct,
          memoryUsedPct: data.compute.memoryUsedPct,
          eventLoopLagMs: data.compute.eventLoopLagMs,
          dbLatencyMs: data.storage.latencyMs ?? 0,
        })
      );
    } catch (err) {
      setErrorMessage((err as Error)?.message || 'Edge control layer unreachable.');
      setQueuedSyncCount(readOfflineQueue().length);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth(false);
  }, [fetchHealth]);

  useEffect(() => {
    if (pollIntervalMs === 0) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchHealth(false);
      }
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [pollIntervalMs, fetchHealth]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void fetchHealth(false);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setQueuedSyncCount(readOfflineQueue().length);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchHealth]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const handleFlushSyncQueue = async () => {
    setIsFlushingQueue(true);
    try {
      const res = await syncPendingOfflineMutations();
      setQueuedSyncCount(res.remaining);
      await fetchHealth(true);
    } finally {
      setIsFlushingQueue(false);
    }
  };

  const overallStatus: HealthStatusLevel = !isOnline
    ? 'DEGRADED'
    : summary
      ? summary.overallStatus
      : errorMessage
        ? 'CRITICAL'
        : 'NOMINAL';

  const tone = statusToneClasses(overallStatus);

  const filteredSubsystems = useMemo(() => {
    if (!summary) return [];
    if (activeFilter === 'all') return summary.subsystems;
    return summary.subsystems.filter((item) => item.category === activeFilter);
  }, [summary, activeFilter]);

  const cpuSparkPoints = useMemo(
    () => buildSparklinePath(history.map((h) => h.cpuLoadPct), 220, 34, 0, 100),
    [history]
  );
  const memSparkPoints = useMemo(
    () => buildSparklinePath(history.map((h) => h.memoryUsedPct), 220, 34, 0, 100),
    [history]
  );

  const openCoreMatrix = () => {
    setExpanded(false);
    window.openEvoBackendModal?.();
  };

  const openPowerTelemetry = () => {
    setExpanded(false);
    window.openPowerTelemetryModal?.();
  };

  const launchHostedEdgeApp = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <aside
      id="system-health-hud"
      data-expanded={expanded ? 'true' : 'false'}
      data-health-status={overallStatus}
      aria-label="System Health Dashboard"
      className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center pointer-events-none select-none"
    >
      {/* Sliding Container: Handle Tab + Right-Hand Drawer Panel */}
      <div
        className={`flex items-center transition-transform duration-300 ease-out will-change-transform ${
          expanded ? 'translate-x-0' : 'translate-x-[calc(100%-52px)]'
        }`}
      >
        {/* Minimalist Right-Edge Toggle Handle: Arrow + Health Symbol Sign */}
        <button
          id="btn-system-health-toggle"
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls="system-health-drawer"
          aria-label={expanded ? 'Collapse System Health Dashboard' : 'Expand System Health Dashboard'}
          title={
            expanded
              ? 'Collapse System Health Dashboard'
              : `System Health (${getHealthStatusLabel(overallStatus)}) — Click to expand`
          }
          className="pointer-events-auto relative flex items-center justify-center gap-0.5 w-[52px] h-11 rounded-l-xl bg-[#090603]/88 hover:bg-[#120c06]/95 backdrop-blur-xl border border-r-0 border-amber-500/35 hover:border-amber-400/65 shadow-[-8px_0_24px_rgba(0,0,0,0.65)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
        >
          {expanded ? (
            <ChevronRight className="w-3.5 h-3.5 text-amber-300/85 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-amber-300/85 shrink-0" aria-hidden="true" />
          )}
          <HeartPulse
            className={`w-[18px] h-[18px] shrink-0 transition-colors ${tone.accent}`}
            aria-hidden="true"
          />
          <span
            aria-hidden="true"
            className={`absolute top-2 right-1.5 w-1.5 h-1.5 rounded-full ${tone.dot}`}
          />
        </button>

        {/* Right-Hand Collapsible System Health Dashboard Drawer */}
        <section
          id="system-health-drawer"
          aria-label="Edge-Native Control Layer Diagnostics"
          aria-hidden={!expanded}
          className={`pointer-events-auto w-[min(calc(100vw-56px),400px)] max-h-[calc(100vh-120px)] overflow-y-auto hud-scroll-inner rounded-l-2xl bg-[#090603]/94 backdrop-blur-2xl border border-r-0 border-amber-500/35 shadow-[-18px_0_52px_rgba(0,0,0,0.88)] text-amber-50 ${
            expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
          } transition-opacity duration-200`}
        >
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-amber-500/18">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Activity className={`w-4 h-4 shrink-0 ${tone.accent}`} aria-hidden="true" />
                <h2 className="text-xs font-semibold tracking-wide text-amber-50 truncate">
                  System Health
                </h2>
                <span className={`font-mono-tech text-[10.5px] font-semibold ${tone.text}`}>
                  {isLoading && !summary
                    ? 'Checking'
                    : !isOnline
                      ? 'Offline'
                      : getHealthStatusLabel(overallStatus)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] font-mono-tech text-amber-200/60 tabular-nums">
                Updated {summary ? formatClockTime(summary.timestamp) : '--:--:--'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div
                role="group"
                aria-label="Auto refresh cadence"
                className="flex items-center bg-black/55 border border-amber-500/25 p-0.5 rounded"
              >
                {POLL_OPTIONS.map((opt) => {
                  const active = pollIntervalMs === opt.value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setPollIntervalMs(opt.value)}
                      aria-pressed={active}
                      className={`px-2 py-0.5 text-[10px] font-mono-tech transition-colors cursor-pointer whitespace-nowrap rounded-sm ${
                        active
                          ? 'bg-amber-500/25 text-amber-100 font-semibold'
                          : 'text-amber-200/60 hover:text-amber-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <button
                id="btn-system-health-refresh"
                type="button"
                onClick={() => void fetchHealth(true)}
                disabled={isRefreshing}
                aria-label="Refresh system health metrics"
                title="Refresh metrics"
                className="flex items-center justify-center w-7 h-7 rounded text-amber-200/80 hover:text-amber-50 hover:bg-amber-500/15 border border-amber-500/25 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-300' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {/* Error / Advisory Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 px-4 py-2.5 bg-red-950/45 border-b border-red-500/30 text-xs"
            >
              <span className="text-red-200 leading-snug">{errorMessage}</span>
              <button
                type="button"
                onClick={() => void fetchHealth(true)}
                className="px-2.5 py-1 text-[11px] font-medium bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-red-100 whitespace-nowrap shrink-0 cursor-pointer rounded"
              >
                Retry
              </button>
            </div>
          )}

          {!errorMessage && summary && summary.advisories.length > 0 && (
            <div className="px-4 py-2 bg-amber-950/35 border-b border-amber-500/25 text-[11px] text-amber-200/90 leading-relaxed">
              {summary.advisories[0]}
            </div>
          )}

          {/* Loading Skeleton */}
          {isLoading && !summary ? (
            <div className="p-4 space-y-3" aria-busy="true">
              <div className="h-12 bg-amber-500/10 animate-pulse rounded" />
              <div className="h-10 bg-amber-500/10 animate-pulse rounded" />
              <div className="h-10 bg-amber-500/10 animate-pulse rounded" />
            </div>
          ) : summary ? (
            <>
              {/* High-Level Metric Strip & Live Sparkline */}
              <div className="px-4 py-3 border-b border-amber-500/18 space-y-3">
                <div className="grid grid-cols-4 gap-2 text-left">
                  <div>
                    <div className="text-[10px] text-amber-200/60">CPU Load</div>
                    <div className="mt-0.5 font-mono-tech text-sm font-semibold tabular-nums text-amber-50">
                      {summary.compute.cpuLoadPct}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-amber-200/60">Memory</div>
                    <div className="mt-0.5 font-mono-tech text-sm font-semibold tabular-nums text-amber-50">
                      {summary.compute.memoryUsedPct}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-amber-200/60">Event Loop</div>
                    <div className="mt-0.5 font-mono-tech text-sm font-semibold tabular-nums text-amber-50">
                      {summary.compute.eventLoopLagMs.toFixed(1)}ms
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-amber-200/60">Uptime</div>
                    <div className="mt-0.5 font-mono-tech text-sm font-semibold tabular-nums text-amber-50">
                      {formatUptimeCompact(summary.compute.controlUptimeSec)}
                    </div>
                  </div>
                </div>

                {/* Live Telemetry Trend Sparkline */}
                <div className="pt-1">
                  <div className="flex items-center justify-between text-[10px] font-mono-tech text-amber-200/65 mb-1">
                    <span>
                      Trend · <span className="text-amber-400">CPU</span> /{' '}
                      <span className="text-sky-400">Memory</span>
                    </span>
                    <span className="tabular-nums">
                      {history.length} {history.length === 1 ? 'sample' : 'samples'}
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 220 34"
                    preserveAspectRatio="none"
                    aria-label="CPU and memory telemetry trend"
                    className="w-full h-9 bg-black/50 border border-amber-500/20 rounded block"
                  >
                    <line
                      x1="0"
                      y1="17"
                      x2="220"
                      y2="17"
                      stroke="rgba(217,107,8,0.18)"
                      strokeDasharray="3 3"
                    />
                    {memSparkPoints && (
                      <polyline
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        points={memSparkPoints}
                      />
                    )}
                    {cpuSparkPoints && (
                      <polyline
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth="1.75"
                        strokeLinejoin="round"
                        points={cpuSparkPoints}
                      />
                    )}
                  </svg>
                </div>
              </div>

              {/* Segmented Subsystem Filter Bar */}
              <div className="px-4 py-2 border-b border-amber-500/18 flex items-center justify-between gap-2">
                <div
                  role="tablist"
                  aria-label="Filter control layer subsystems"
                  className="flex items-center gap-1 overflow-x-auto"
                >
                  {FILTER_TABS.map((tab) => {
                    const selected = activeFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setActiveFilter(tab.id)}
                        className={`px-2.5 py-1 text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer rounded ${
                          selected
                            ? 'bg-amber-500/22 text-amber-50 border border-amber-400/50'
                            : 'text-amber-200/65 hover:text-amber-50 border border-transparent'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subsystem Diagnostics Rows */}
              <div className="divide-y divide-amber-500/15" data-testid="system-health-subsystems">
                {filteredSubsystems.map((sub) => {
                  const subTone = statusToneClasses(sub.status);
                  return (
                    <div key={sub.id} className="px-4 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium text-amber-50 truncate">{sub.name}</span>
                          <span className="text-amber-500/35 text-[10px]" aria-hidden="true">
                            ·
                          </span>
                          <span className={`font-mono-tech text-[10.5px] font-semibold shrink-0 ${subTone.text}`}>
                            {getHealthStatusLabel(sub.status)}
                          </span>
                        </div>
                        <span className="font-mono-tech text-[11px] tabular-nums text-amber-100 shrink-0">
                          {sub.headlineMetric}
                        </span>
                      </div>
                      <p className="mt-1 font-mono-tech text-[10.5px] text-amber-200/65 tabular-nums leading-relaxed">
                        {sub.detailLine}
                      </p>
                    </div>
                  );
                })}

                {/* Edge Workloads & Offline Sync Bus Section */}
                {(activeFilter === 'all' || activeFilter === 'edge') && (
                  <div className="px-4 py-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-amber-200/75 font-medium">Client Sync Bus</span>
                      <div className="flex items-center gap-2 font-mono-tech text-[10.5px] tabular-nums">
                        <span className={isOnline ? 'text-emerald-400' : 'text-amber-300'}>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                        <span className="text-amber-500/35" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-amber-100/80">{queuedSyncCount} queued</span>
                        {queuedSyncCount > 0 && isOnline && (
                          <button
                            type="button"
                            onClick={() => void handleFlushSyncQueue()}
                            disabled={isFlushingQueue}
                            className="px-2 py-0.5 text-[10px] bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/45 text-amber-100 cursor-pointer rounded"
                          >
                            {isFlushingQueue ? 'Syncing' : 'Sync Now'}
                          </button>
                        )}
                      </div>
                    </div>

                    {summary.workloads.hostedApps.length > 0 ? (
                      <div className="space-y-1">
                        <div className="text-[10.5px] text-amber-200/60">Hosted Edge Modules</div>
                        {summary.workloads.hostedApps.map((app) => (
                          <div
                            key={app.slug}
                            className="flex items-center justify-between gap-2 text-[11px] py-0.5"
                          >
                            <div className="min-w-0 truncate">
                              <span className="text-amber-50 font-medium">{app.appTitle}</span>
                              <span className="text-amber-200/55 ml-1.5 font-mono-tech text-[10px]">
                                {app.slug}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => launchHostedEdgeApp(app.hostedUrl)}
                              className="inline-flex items-center gap-1 text-[10.5px] font-mono-tech text-amber-300 hover:text-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-amber-200/55">
                        No hosted edge modules deployed yet.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Quick Links to Deep B.A.R.B.I Diagnostics */}
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-amber-500/18 bg-black/35 text-[11px]">
                <span className="font-mono-tech text-[10px] text-amber-200/60 truncate">
                  {summary.compute.platform}/{summary.compute.arch} · {summary.compute.memoryFreeGb} GB free
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={openPowerTelemetry}
                    className="text-amber-300/90 hover:text-amber-100 underline-offset-4 hover:underline whitespace-nowrap cursor-pointer"
                  >
                    PMIC Power
                  </button>
                  <button
                    type="button"
                    onClick={openCoreMatrix}
                    className="text-amber-300/90 hover:text-amber-100 underline-offset-4 hover:underline whitespace-nowrap cursor-pointer"
                  >
                    Core Matrix
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-4 py-5 text-center space-y-2">
              <p className="text-xs text-amber-200/75">
                Unable to load edge-native control layer metrics.
              </p>
              <button
                type="button"
                onClick={() => void fetchHealth(true)}
                className="px-3 py-1.5 text-xs bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-100 cursor-pointer rounded"
              >
                Retry Connection
              </button>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
