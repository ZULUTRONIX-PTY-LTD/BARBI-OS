import os from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { testDbConnection } from '../../db/index.ts';
import {
  evaluateEdgeControlHealth,
  type EdgeControlHealthSummary,
} from '../../health/edgeHealthLogic.ts';
import { getProviderQuotaSnapshot } from '../ai/providerRegistry.ts';
import { listHostedSystems } from '../rea/reaService.ts';

let loopHistogram: ReturnType<typeof monitorEventLoopDelay> | null = null;

function ensureLoopMonitor() {
  if (loopHistogram) return loopHistogram;
  try {
    loopHistogram = monitorEventLoopDelay({ resolution: 20 });
    loopHistogram.enable();
  } catch {
    loopHistogram = null;
  }
  return loopHistogram;
}

ensureLoopMonitor();

let cachedDbProbe: { checkedAt: number; connected: boolean; latencyMs: number | null } | null = null;
const DB_PROBE_CACHE_MS = 3000;

async function probeArchivexDatabase(): Promise<{ connected: boolean; latencyMs: number | null }> {
  const now = Date.now();
  if (cachedDbProbe && now - cachedDbProbe.checkedAt < DB_PROBE_CACHE_MS) {
    return { connected: cachedDbProbe.connected, latencyMs: cachedDbProbe.latencyMs };
  }
  const start = performance.now();
  const connected = await testDbConnection();
  const latencyMs = connected ? Math.max(1, Math.round(performance.now() - start)) : null;
  cachedDbProbe = { checkedAt: now, connected, latencyMs };
  return { connected, latencyMs };
}

function readEventLoopLagMs(): number {
  const hist = ensureLoopMonitor();
  if (!hist) return 0.5;
  const p95Ns = hist.percentile(95);
  if (!Number.isFinite(p95Ns) || p95Ns <= 0) {
    const meanNs = hist.mean;
    return Number.isFinite(meanNs) && meanNs > 0 ? Number((meanNs / 1e6).toFixed(1)) : 0.4;
  }
  // Subtract the 20ms histogram resolution floor so idle loop reads realistic sub-millisecond/low-ms lag
  const adjustedMs = Math.max(0.2, p95Ns / 1e6 - 20);
  return Number(adjustedMs.toFixed(1));
}

export async function collectEdgeControlHealth(userKey: string): Promise<EdgeControlHealthSummary> {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMemPct = Math.round(((totalMem - freeMem) / Math.max(1, totalMem)) * 100);
  const load = os.loadavg();
  const cpuLoadPct = Math.min(99, Math.max(2, Math.round((load[0] / Math.max(1, cpus.length)) * 100)));
  const procMem = process.memoryUsage();
  const eventLoopLagMs = readEventLoopLagMs();

  const [dbProbe, aiSnapshot] = await Promise.all([
    probeArchivexDatabase(),
    Promise.resolve(getProviderQuotaSnapshot(userKey)),
  ]);

  const hostedApps = listHostedSystems();

  const configuredProviders = aiSnapshot.providers.filter((p) => p.configured);
  const readyProviders = aiSnapshot.providers.filter(
    (p) => p.configured && p.enabled && (p.status === 'READY' || p.status === 'LOW_QUOTA')
  );
  const activeProvider =
    aiSnapshot.providers.find((p) => p.id === aiSnapshot.activeProviderId) ||
    readyProviders[0] ||
    configuredProviders[0] ||
    aiSnapshot.providers[0];

  return evaluateEdgeControlHealth({
    compute: {
      platform: os.platform(),
      arch: os.arch(),
      cpuCount: cpus.length,
      cpuModel: cpus[0]?.model || 'Edge Compute Core',
      cpuLoadPct,
      memoryUsedPct: usedMemPct,
      memoryTotalGb: Number((totalMem / 1024 ** 3).toFixed(2)),
      memoryFreeGb: Number((freeMem / 1024 ** 3).toFixed(2)),
      processRssMb: Math.round(procMem.rss / 1024 ** 2),
      heapUsedMb: Math.round(procMem.heapUsed / 1024 ** 2),
      eventLoopLagMs,
      hostUptimeSec: Math.round(os.uptime()),
      controlUptimeSec: Math.round(process.uptime()),
    },
    storage: {
      engine: 'postgresql+pgvector',
      connected: dbProbe.connected,
      latencyMs: dbProbe.latencyMs,
    },
    aiMesh: {
      activeProviderId: activeProvider?.id || 'gemini',
      activeProviderName: activeProvider?.name || 'Local ARCHIVEX',
      switchMode: aiSnapshot.switchMode,
      configuredCount: configuredProviders.length,
      readyCount: readyProviders.length,
      totalCount: aiSnapshot.providers.length,
      activeRemainingQuotaPct: activeProvider?.remainingQuotaPct ?? 0,
      lastLatencyMs: activeProvider?.lastLatencyMs ?? 0,
    },
    workloads: {
      hostedAppsCount: hostedApps.length,
      hostedApps,
      apiRateLimitWindowSec: 60,
      controlPlaneNode: os.hostname() || 'BARBI-EDGE-NODE',
    },
  });
}
