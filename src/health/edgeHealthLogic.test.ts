import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendTelemetrySample,
  buildSparklinePath,
  evaluateEdgeControlHealth,
  formatUptimeCompact,
  getHealthStatusLabel,
  type EdgeHealthEvaluationInput,
} from './edgeHealthLogic';

function makeBaseInput(overrides?: Partial<EdgeHealthEvaluationInput>): EdgeHealthEvaluationInput {
  return {
    compute: {
      platform: 'linux',
      arch: 'x64',
      cpuCount: 8,
      cpuModel: 'Edge Compute Core',
      cpuLoadPct: 22,
      memoryUsedPct: 48,
      memoryTotalGb: 16,
      memoryFreeGb: 8.32,
      processRssMb: 142,
      heapUsedMb: 64,
      eventLoopLagMs: 1.4,
      hostUptimeSec: 172800,
      controlUptimeSec: 3665,
      ...(overrides?.compute || {}),
    },
    storage: {
      engine: 'postgresql+pgvector',
      connected: true,
      latencyMs: 6,
      ...(overrides?.storage || {}),
    },
    aiMesh: {
      activeProviderId: 'gemini',
      activeProviderName: 'Google Gemini (AI Studio Free)',
      switchMode: 'recommend',
      configuredCount: 2,
      readyCount: 2,
      totalCount: 9,
      activeRemainingQuotaPct: 92,
      lastLatencyMs: 410,
      ...(overrides?.aiMesh || {}),
    },
    workloads: {
      hostedAppsCount: 1,
      hostedApps: [
        {
          slug: 'telemetry-edge-hub',
          appTitle: 'Telemetry Edge Hub',
          tagline: 'Edge Diagnostics Console',
          hostedUrl: '/hosted/telemetry-edge-hub/',
          createdAt: '2026-11-16T09:15:09.677Z',
        },
      ],
      apiRateLimitWindowSec: 60,
      controlPlaneNode: 'BARBI-EDGE-01',
      ...(overrides?.workloads || {}),
    },
  };
}

test('evaluateEdgeControlHealth reports NOMINAL when all subsystems are healthy', () => {
  const result = evaluateEdgeControlHealth(makeBaseInput(), '2026-11-19T16:40:00.000Z');
  assert.equal(result.overallStatus, 'NOMINAL');
  assert.equal(result.advisories.length, 0);
  assert.equal(result.subsystems.length, 4);
  assert.equal(result.subsystems.every((s) => s.status === 'NOMINAL'), true);
  assert.equal(getHealthStatusLabel(result.overallStatus), 'Nominal');
});

test('evaluateEdgeControlHealth reports DEGRADED when CPU or DB latency crosses threshold', () => {
  const highCpu = evaluateEdgeControlHealth(
    makeBaseInput({
      compute: {
        ...makeBaseInput().compute,
        cpuLoadPct: 81,
      },
    })
  );
  assert.equal(highCpu.overallStatus, 'DEGRADED');
  assert.equal(highCpu.subsystems[0].status, 'DEGRADED');
  assert.ok(highCpu.advisories.some((a) => a.includes('81%')));

  const lowQuota = evaluateEdgeControlHealth(
    makeBaseInput({
      aiMesh: {
        ...makeBaseInput().aiMesh,
        activeRemainingQuotaPct: 10,
      },
    })
  );
  assert.equal(lowQuota.overallStatus, 'DEGRADED');
  assert.equal(lowQuota.subsystems[2].status, 'DEGRADED');
});

test('evaluateEdgeControlHealth escalates to CRITICAL on compute saturation or dual DB+AI outage', () => {
  const saturated = evaluateEdgeControlHealth(
    makeBaseInput({
      compute: {
        ...makeBaseInput().compute,
        memoryUsedPct: 96,
      },
    })
  );
  assert.equal(saturated.overallStatus, 'CRITICAL');

  const dualOutage = evaluateEdgeControlHealth(
    makeBaseInput({
      storage: { engine: 'postgresql+pgvector', connected: false, latencyMs: null },
      aiMesh: { ...makeBaseInput().aiMesh, configuredCount: 0, readyCount: 0 },
    })
  );
  assert.equal(dualOutage.overallStatus, 'CRITICAL');
  assert.equal(dualOutage.advisories.length, 2);
});

test('formatUptimeCompact formats seconds, minutes, hours, and days cleanly', () => {
  assert.equal(formatUptimeCompact(42), '42s');
  assert.equal(formatUptimeCompact(125), '2m 5s');
  assert.equal(formatUptimeCompact(7500), '2h 5m');
  assert.equal(formatUptimeCompact(190800), '2d 5h');
  assert.equal(formatUptimeCompact(-10), '0s');
});

test('appendTelemetrySample enforces bounded ring buffer length', () => {
  let history = [] as ReturnType<typeof appendTelemetrySample>;
  for (let i = 0; i < 10; i += 1) {
    history = appendTelemetrySample(
      history,
      {
        timestamp: `2026-11-19T16:40:0${i}.000Z`,
        cpuLoadPct: 10 + i,
        memoryUsedPct: 40 + i,
        eventLoopLagMs: 1.2,
        dbLatencyMs: 5,
      },
      5
    );
  }
  assert.equal(history.length, 5);
  assert.equal(history[0].cpuLoadPct, 15);
  assert.equal(history[4].cpuLoadPct, 19);
});

test('buildSparklinePath produces valid SVG coordinates clamped within range', () => {
  const path = buildSparklinePath([0, 50, 100], 100, 24, 0, 100);
  assert.equal(path, '0.0,22.0 50.0,12.0 100.0,2.0');

  const single = buildSparklinePath([50], 100, 24, 0, 100);
  assert.equal(single, '0,12.0 100.0,12.0');

  assert.equal(buildSparklinePath([], 100, 24), '');
});
