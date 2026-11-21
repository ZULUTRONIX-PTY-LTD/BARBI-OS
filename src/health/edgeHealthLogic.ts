export type HealthStatusLevel = 'NOMINAL' | 'DEGRADED' | 'CRITICAL';

export type HealthSubsystemCategory = 'compute' | 'storage' | 'ai' | 'edge';

export interface EdgeComputeMetrics {
  platform: string;
  arch: string;
  cpuCount: number;
  cpuModel: string;
  cpuLoadPct: number;
  memoryUsedPct: number;
  memoryTotalGb: number;
  memoryFreeGb: number;
  processRssMb: number;
  heapUsedMb: number;
  eventLoopLagMs: number;
  hostUptimeSec: number;
  controlUptimeSec: number;
}

export interface EdgeStorageMetrics {
  engine: string;
  connected: boolean;
  latencyMs: number | null;
}

export interface EdgeAiMeshMetrics {
  activeProviderId: string;
  activeProviderName: string;
  switchMode: 'auto' | 'recommend';
  configuredCount: number;
  readyCount: number;
  totalCount: number;
  activeRemainingQuotaPct: number;
  lastLatencyMs: number;
}

export interface EdgeHostedWorkload {
  slug: string;
  appTitle: string;
  tagline: string;
  hostedUrl: string;
  createdAt: string;
}

export interface EdgeWorkloadsMetrics {
  hostedAppsCount: number;
  hostedApps: EdgeHostedWorkload[];
  apiRateLimitWindowSec: number;
  controlPlaneNode: string;
}

export interface SubsystemHealthItem {
  id: string;
  category: HealthSubsystemCategory;
  name: string;
  status: HealthStatusLevel;
  headlineMetric: string;
  detailLine: string;
}

export interface EdgeControlHealthSummary {
  timestamp: string;
  overallStatus: HealthStatusLevel;
  statusSummary: string;
  advisories: string[];
  compute: EdgeComputeMetrics;
  storage: EdgeStorageMetrics;
  aiMesh: EdgeAiMeshMetrics;
  workloads: EdgeWorkloadsMetrics;
  subsystems: SubsystemHealthItem[];
}

export interface TelemetryHistoryPoint {
  timestamp: string;
  cpuLoadPct: number;
  memoryUsedPct: number;
  eventLoopLagMs: number;
  dbLatencyMs: number;
}

export interface EdgeHealthEvaluationInput {
  compute: EdgeComputeMetrics;
  storage: EdgeStorageMetrics;
  aiMesh: EdgeAiMeshMetrics;
  workloads: EdgeWorkloadsMetrics;
}

const STATUS_SEVERITY: Record<HealthStatusLevel, number> = {
  NOMINAL: 0,
  DEGRADED: 1,
  CRITICAL: 2,
};

export function maxHealthStatus(levels: HealthStatusLevel[]): HealthStatusLevel {
  let highest: HealthStatusLevel = 'NOMINAL';
  for (const lvl of levels) {
    if (STATUS_SEVERITY[lvl] > STATUS_SEVERITY[highest]) {
      highest = lvl;
    }
  }
  return highest;
}

export function formatUptimeCompact(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function evaluateEdgeControlHealth(
  input: EdgeHealthEvaluationInput,
  timestampIso = new Date().toISOString()
): EdgeControlHealthSummary {
  const advisories: string[] = [];

  // 1. Edge Compute evaluation
  let computeStatus: HealthStatusLevel = 'NOMINAL';
  if (input.compute.cpuLoadPct >= 92 || input.compute.memoryUsedPct >= 94 || input.compute.eventLoopLagMs >= 120) {
    computeStatus = 'CRITICAL';
    advisories.push(
      `Edge compute saturation detected (CPU ${input.compute.cpuLoadPct}%, RAM ${input.compute.memoryUsedPct}%, loop ${input.compute.eventLoopLagMs.toFixed(1)}ms).`
    );
  } else if (
    input.compute.cpuLoadPct >= 75 ||
    input.compute.memoryUsedPct >= 82 ||
    input.compute.eventLoopLagMs >= 45
  ) {
    computeStatus = 'DEGRADED';
    advisories.push(
      `Elevated host load on edge compute node (CPU ${input.compute.cpuLoadPct}%, RAM ${input.compute.memoryUsedPct}%).`
    );
  }

  // 2. ARCHIVEX Storage evaluation
  let storageStatus: HealthStatusLevel = 'NOMINAL';
  if (!input.storage.connected) {
    storageStatus = 'DEGRADED';
    advisories.push('ARCHIVEX PostgreSQL store unreachable; operating with local browser cache fallback.');
  } else if ((input.storage.latencyMs ?? 0) >= 250) {
    storageStatus = 'DEGRADED';
    advisories.push(`High ARCHIVEX query latency (${input.storage.latencyMs}ms).`);
  }

  // 3. AI Inference Mesh evaluation
  let aiStatus: HealthStatusLevel = 'NOMINAL';
  if (input.aiMesh.configuredCount === 0 || input.aiMesh.readyCount === 0) {
    aiStatus = 'DEGRADED';
    advisories.push('No cloud AI providers currently ready; local ARCHIVEX fallback active.');
  } else if (input.aiMesh.activeRemainingQuotaPct <= 15) {
    aiStatus = 'DEGRADED';
    advisories.push(
      `Active AI provider (${input.aiMesh.activeProviderName}) has low daily quota (${input.aiMesh.activeRemainingQuotaPct}% remaining).`
    );
  }

  // 4. Edge Hosted Workloads evaluation
  const edgeStatus: HealthStatusLevel = 'NOMINAL';

  const subsystems: SubsystemHealthItem[] = [
    {
      id: 'edge-compute',
      category: 'compute',
      name: 'Edge Compute Core',
      status: computeStatus,
      headlineMetric: `CPU ${input.compute.cpuLoadPct}% · RAM ${input.compute.memoryUsedPct}%`,
      detailLine: `${input.compute.cpuCount} cores · Loop ${input.compute.eventLoopLagMs.toFixed(1)}ms · RSS ${input.compute.processRssMb}MB · Up ${formatUptimeCompact(input.compute.controlUptimeSec)}`,
    },
    {
      id: 'archivex-storage',
      category: 'storage',
      name: 'ARCHIVEX Vector Store',
      status: storageStatus,
      headlineMetric: input.storage.connected
        ? `Online · ${input.storage.latencyMs ?? 0}ms`
        : 'Offline · Local Fallback',
      detailLine: `${input.storage.engine} · ${input.storage.connected ? 'pgvector sync healthy' : 'Awaiting database link'}`,
    },
    {
      id: 'ai-inference-mesh',
      category: 'ai',
      name: 'AI Inference Mesh',
      status: aiStatus,
      headlineMetric: `${input.aiMesh.readyCount}/${input.aiMesh.totalCount} Ready · ${input.aiMesh.activeRemainingQuotaPct}% Quota`,
      detailLine: `Active: ${input.aiMesh.activeProviderName} · Mode: ${input.aiMesh.switchMode === 'auto' ? 'Auto failover' : 'Prompt switch'}`,
    },
    {
      id: 'edge-workloads',
      category: 'edge',
      name: 'Edge Control & Workloads',
      status: edgeStatus,
      headlineMetric: `${input.workloads.hostedAppsCount} Hosted ${input.workloads.hostedAppsCount === 1 ? 'Module' : 'Modules'}`,
      detailLine: `${input.workloads.controlPlaneNode} · Rate guard ${input.workloads.apiRateLimitWindowSec}s window`,
    },
  ];

  // Overall status: CRITICAL if compute is critical OR both storage & AI mesh are down
  let overallStatus = maxHealthStatus([computeStatus, storageStatus, aiStatus, edgeStatus]);
  if (!input.storage.connected && input.aiMesh.readyCount === 0) {
    overallStatus = 'CRITICAL';
  }

  const statusSummary =
    overallStatus === 'NOMINAL'
      ? 'All edge-native control planes operating within nominal parameters.'
      : overallStatus === 'DEGRADED'
        ? advisories[0] || 'One or more control-plane subsystems require attention.'
        : advisories[0] || 'Critical degradation across edge-native control subsystems.';

  return {
    timestamp: timestampIso,
    overallStatus,
    statusSummary,
    advisories,
    compute: input.compute,
    storage: input.storage,
    aiMesh: input.aiMesh,
    workloads: input.workloads,
    subsystems,
  };
}

export function appendTelemetrySample(
  history: TelemetryHistoryPoint[],
  sample: TelemetryHistoryPoint,
  maxSamples = 24
): TelemetryHistoryPoint[] {
  const safeMax = Math.max(2, Math.floor(maxSamples));
  const next = [...history, sample];
  return next.length > safeMax ? next.slice(next.length - safeMax) : next;
}

export function buildSparklinePath(
  values: number[],
  width: number,
  height: number,
  minValue = 0,
  maxValue = 100
): string {
  if (!values.length || width <= 0 || height <= 0) return '';
  const padY = 2;
  const usableH = Math.max(1, height - padY * 2);
  const range = Math.max(1e-6, maxValue - minValue);

  if (values.length === 1) {
    const clamped = Math.min(maxValue, Math.max(minValue, values[0]));
    const y = padY + usableH * (1 - (clamped - minValue) / range);
    return `0,${y.toFixed(1)} ${width.toFixed(1)},${y.toFixed(1)}`;
  }

  const stepX = width / (values.length - 1);
  return values
    .map((val, idx) => {
      const clamped = Math.min(maxValue, Math.max(minValue, Number.isFinite(val) ? val : minValue));
      const x = idx * stepX;
      const y = padY + usableH * (1 - (clamped - minValue) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function getHealthStatusLabel(status: HealthStatusLevel): string {
  if (status === 'CRITICAL') return 'Critical';
  if (status === 'DEGRADED') return 'Degraded';
  return 'Nominal';
}
