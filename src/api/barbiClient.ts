import { getFirebaseIdToken } from '../lib/firebase';
import type { EdgeControlHealthSummary } from '../health/edgeHealthLogic';
import {
  extractGroundingMetadata,
  parseSseChunkBuffer,
  type ChatGroundingMetadata,
} from '../chat/chatLogic';
import {
  enqueueOfflineMutation,
  flushOfflineQueue,
  readOfflineQueue,
} from '../sync/offlineQueue';
import type {
  BarbiV4Module,
  CustomAssimilatedRepo,
  FinTechRailStatus,
  GovernanceTier,
  IntegrationPackId,
  LiveGitHubRepoTelemetry,
  ModuleExecutionMode,
  MountedModuleRecord,
  V4TierId,
} from '../v4/moduleCatalog';
import type { GodsEyeFeedsSnapshot } from '../v4/godsEyeLogic';
import type { FsAnalysisResult } from '../fs/fileSystemAgentLogic';

export interface V4CatalogSnapshotResponse {
  companyName: string;
  version: string;
  modules: BarbiV4Module[];
  mounted: Record<string, MountedModuleRecord>;
  repoTelemetry: Record<string, LiveGitHubRepoTelemetry>;
  customRepos: CustomAssimilatedRepo[];
  stats: {
    totalModules: number;
    mountedCount: number;
    nativeActiveCount: number;
    capitalGatedCount: number;
    totalRepos: number;
    syncedRepoCount: number;
    byTier: Record<V4TierId, { total: number; mounted: number; native: number }>;
  };
  fintechRails: FinTechRailStatus[];
  auditLog: Array<{
    id: string;
    timestamp: string;
    action: string;
    target: string;
    mode: string;
    note: string;
  }>;
  githubTokenConfigured: boolean;
}

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getFirebaseIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

export async function apiRequest<T = unknown>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    queueWhenOffline?: boolean;
    timeoutMs?: number;
  }
): Promise<T> {
  const method = options?.method || 'GET';
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (isOffline && method !== 'GET' && options?.queueWhenOffline) {
    enqueueOfflineMutation({ endpoint: path, method, body: options.body });
    throw new Error('OFFLINE_QUEUED');
  }

  const maxAttempts = method === 'GET' ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const ctrl = new AbortController();
    const timeoutMs = options?.timeoutMs ?? 25000;
    const timer = setTimeout(() => {
      try {
        ctrl.abort(new Error(`Request timed out after ${timeoutMs}ms`));
      } catch {
        ctrl.abort();
      }
    }, timeoutMs);

    try {
      const res = await fetch(path, {
        method,
        headers: await authHeaders(),
        signal: ctrl.signal,
        ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        const err = new Error(data?.error || `HTTP ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return data as T;
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      const isAbortOrNetwork =
        !status &&
        (err instanceof TypeError ||
          (err instanceof Error && /abort|timeout|fetch|network/i.test(err.name + ' ' + err.message)));

      if (attempt < maxAttempts - 1 && isAbortOrNetwork && navigator.onLine !== false) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        continue;
      }

      if (method !== 'GET' && options?.queueWhenOffline && !status) {
        enqueueOfflineMutation({ endpoint: path, method, body: options.body });
      }

      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Request timed out while contacting the server.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Request failed');
}

export async function syncPendingOfflineMutations(): Promise<{ synced: number; remaining: number }> {
  const token = await getFirebaseIdToken();
  if (!token || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { synced: 0, remaining: readOfflineQueue().length };
  }
  return flushOfflineQueue(async (item) => {
    const res = await fetch(item.endpoint, {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(item.body !== undefined ? { body: JSON.stringify(item.body) } : {}),
    });
    return res.ok;
  });
}

export const barbiApi = {
  health: () => apiRequest<{ ok: boolean; database: string; aiConfigured: boolean }>('/api/health'),
  telemetry: () =>
    apiRequest<{
      platform: string;
      cpuCount: number;
      cpuLoadPct: number;
      memoryUsedPct: number;
      memoryTotalGb: number;
      memoryFreeGb: number;
      uptimeSeconds: number;
    }>('/api/system/telemetry', { timeoutMs: 12000 }),
  edgeHealth: () => apiRequest<EdgeControlHealthSummary>('/api/system/edge-health', { timeoutMs: 16000 }),
  weather: (lat: number, lon: number) =>
    apiRequest<Record<string, unknown>>(`/api/weather?lat=${lat}&lon=${lon}`),
  githubSearch: (query: string) =>
    apiRequest<{
      query: string;
      items: Array<{
        fullName: string;
        url: string;
        description: string;
        stars: number;
        language: string;
        topics: string[];
        updatedAt: string;
      }>;
    }>(`/api/integrations/github/search?q=${encodeURIComponent(query)}`),
  sendTelegram: (text: string, chatId?: string) =>
    apiRequest<{ ok: boolean }>('/api/integrations/telegram/send', {
      method: 'POST',
      body: { text, ...(chatId ? { chatId } : {}) },
    }),
  bootstrap: () => apiRequest<Record<string, unknown>>('/api/bootstrap', { method: 'POST' }),
  listMemories: (q?: string) =>
    apiRequest<{ nodes: Array<Record<string, unknown>> }>(
      `/api/memories${q ? `?q=${encodeURIComponent(q)}` : ''}`
    ),
  saveMemory: (payload: Record<string, unknown>) =>
    apiRequest<{ node: Record<string, unknown>; detectedContradiction: unknown }>('/api/memories', {
      method: 'POST',
      body: payload,
      queueWhenOffline: true,
    }),
  deleteMemory: (nodeKey: string) =>
    apiRequest<{ ok: boolean }>(`/api/memories/${encodeURIComponent(nodeKey)}`, {
      method: 'DELETE',
      queueWhenOffline: true,
    }),
  semanticSearch: (query: string, limit = 8) =>
    apiRequest<{ results: Array<Record<string, unknown>>; embeddingProvider: string }>(
      '/api/memories/search',
      { method: 'POST', body: { query, limit } }
    ),
  createEdge: (payload: Record<string, unknown>) =>
    apiRequest('/api/edges', { method: 'POST', body: payload, queueWhenOffline: true }),
  resolveContradiction: (key: string, status: string, correctedRecord?: string) =>
    apiRequest(`/api/contradictions/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: { status, ...(correctedRecord ? { correctedRecord } : {}) },
    }),
  listConversations: () =>
    apiRequest<{ conversations: Array<Record<string, unknown>> }>('/api/conversations'),
  getConversationMessages: (key: string) =>
    apiRequest<{ conversation: Record<string, unknown>; messages: Array<Record<string, unknown>> }>(
      `/api/conversations/${encodeURIComponent(key)}/messages`
    ),
  saveHabit: (payload: Record<string, unknown>) =>
    apiRequest('/api/habits', { method: 'POST', body: payload, queueWhenOffline: true }),
  deleteHabit: (habitKey: string) =>
    apiRequest(`/api/habits/${encodeURIComponent(habitKey)}`, {
      method: 'DELETE',
      queueWhenOffline: true,
    }),
  logTimerSession: (payload: Record<string, unknown>) =>
    apiRequest('/api/timer-sessions', { method: 'POST', body: payload, queueWhenOffline: true }),
  saveSettings: (settingsJson: Record<string, unknown>, voiceSettingsJson: Record<string, unknown>) =>
    apiRequest('/api/settings', {
      method: 'PUT',
      body: { settingsJson, voiceSettingsJson },
      queueWhenOffline: true,
    }),
  exportBackup: () => apiRequest<Record<string, unknown>>('/api/export'),
  chatTurn: (payload: Record<string, unknown>) =>
    apiRequest<{
      reply: string;
      model: string;
      thinkingLevel: string;
      provider: string;
      activeProviderId?: string;
      failoverTrail?: Array<{ providerId: string; status: string; reason?: string }>;
      quotaSnapshot?: {
        activeProviderId: string;
        switchMode: 'auto' | 'recommend';
        providers: Array<Record<string, unknown>>;
      };
      lowQuotaWarning?: {
        activeProvider: Record<string, unknown> | null;
        recommendedNext: Record<string, unknown> | null;
        reason: string;
      };
      switchRecommendation?: {
        currentProvider: Record<string, unknown> | null;
        recommendedProvider: Record<string, unknown> | null;
        cooldownRemainingSec: number;
        reason: string;
        warningType?: string;
      };
      toolInvocations: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown> }>;
      grounding?: ChatGroundingMetadata;
      conversationKey: string;
      activatedNodes: string[];
      fallback: boolean;
      error?: string;
    }>('/api/ai/chat', {
      method: 'POST',
      body: payload,
      timeoutMs: 45000,
    }),
  chatStream: async (
    payload: Record<string, unknown>,
    callbacks: {
      signal?: AbortSignal;
      onMeta?: (meta: {
        conversationKey: string;
        providerId: string;
        model: string;
        thinkingLevel: string;
        activatedNodes: string[];
      }) => void;
      onDelta?: (deltaText: string) => void;
      onGrounding?: (grounding: ChatGroundingMetadata) => void;
      onDone?: (done: {
        reply: string;
        model: string;
        thinkingLevel: string;
        activeProviderId: string;
        latencyMs: number;
        conversationKey: string;
        activatedNodes: string[];
        toolInvocations: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown> }>;
        grounding?: ChatGroundingMetadata;
      }) => void;
    }
  ): Promise<{
    reply: string;
    model: string;
    thinkingLevel: string;
    activeProviderId: string;
    latencyMs: number;
    conversationKey: string;
    activatedNodes: string[];
    toolInvocations: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown> }>;
    grounding?: ChatGroundingMetadata;
  }> => {
    const res = await fetch('/api/ai/chat/stream', {
      method: 'POST',
      headers: await authHeaders({ Accept: 'text/event-stream' }),
      body: JSON.stringify(payload),
      signal: callbacks.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let message = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText) as { error?: string };
        if (parsed?.error) message = parsed.error;
      } catch {
        if (errText.trim()) message = errText.trim();
      }
      throw new Error(message);
    }

    if (!res.body) {
      throw new Error('Streaming response body unavailable.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamedText = '';
    let finalMeta = {
      model: 'gemini-4-hydrogen',
      thinkingLevel: 'MEDIUM',
      activeProviderId: 'gemini',
      conversationKey: String(payload.conversationKey || ''),
      activatedNodes: [] as string[],
    };
    let latestGrounding: ChatGroundingMetadata | undefined;
    let finalDone: {
      reply: string;
      model: string;
      thinkingLevel: string;
      activeProviderId: string;
      latencyMs: number;
      conversationKey: string;
      activatedNodes: string[];
      toolInvocations: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown> }>;
      grounding?: ChatGroundingMetadata;
    } | null = null;
    let streamError: string | null = null;

    const startMs = Date.now();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const parsed = parseSseChunkBuffer(buffer, chunk);
      buffer = parsed.remainder;

      for (const evt of parsed.events) {
        const data = (evt.data || {}) as Record<string, unknown>;
        if (evt.event === 'meta') {
          finalMeta = {
            model: String(data.model || finalMeta.model),
            thinkingLevel: String(data.thinkingLevel || finalMeta.thinkingLevel),
            activeProviderId: String(data.providerId || finalMeta.activeProviderId),
            conversationKey: String(data.conversationKey || finalMeta.conversationKey),
            activatedNodes: Array.isArray(data.activatedNodes)
              ? data.activatedNodes.map(String)
              : finalMeta.activatedNodes,
          };
          callbacks.onMeta?.({
            conversationKey: finalMeta.conversationKey,
            providerId: finalMeta.activeProviderId,
            model: finalMeta.model,
            thinkingLevel: finalMeta.thinkingLevel,
            activatedNodes: finalMeta.activatedNodes,
          });
        } else if (evt.event === 'grounding') {
          const normalized = extractGroundingMetadata(data);
          if (normalized) {
            latestGrounding = normalized;
            callbacks.onGrounding?.(normalized);
          }
        } else if (evt.event === 'delta') {
          const text = String(data.text || '');
          if (text) {
            streamedText += text;
            callbacks.onDelta?.(text);
          }
        } else if (evt.event === 'done') {
          const doneGrounding = extractGroundingMetadata(data.grounding) ?? latestGrounding;
          finalDone = {
            reply: String(data.reply || streamedText),
            model: String(data.model || finalMeta.model),
            thinkingLevel: String(data.thinkingLevel || finalMeta.thinkingLevel),
            activeProviderId: String(data.activeProviderId || finalMeta.activeProviderId),
            latencyMs: Number(data.latencyMs || Date.now() - startMs),
            conversationKey: String(data.conversationKey || finalMeta.conversationKey),
            activatedNodes: Array.isArray(data.activatedNodes)
              ? data.activatedNodes.map(String)
              : finalMeta.activatedNodes,
            toolInvocations: Array.isArray(data.toolInvocations)
              ? (data.toolInvocations as Array<{
                  name: string;
                  args: Record<string, unknown>;
                  result: Record<string, unknown>;
                }>)
              : [],
            ...(doneGrounding ? { grounding: doneGrounding } : {}),
          };
          callbacks.onDone?.(finalDone);
        } else if (evt.event === 'error') {
          streamError = String(data.error || 'AI streaming request failed.');
        }
      }
    }

    if (streamError) {
      throw new Error(streamError);
    }

    if (finalDone) return finalDone;
    if (streamedText.trim()) {
      return {
        reply: streamedText.trim(),
        model: finalMeta.model,
        thinkingLevel: finalMeta.thinkingLevel,
        activeProviderId: finalMeta.activeProviderId,
        latencyMs: Date.now() - startMs,
        conversationKey: finalMeta.conversationKey,
        activatedNodes: finalMeta.activatedNodes,
        toolInvocations: [],
        ...(latestGrounding ? { grounding: latestGrounding } : {}),
      };
    }
    throw new Error('The AI provider closed the connection without sending a response.');
  },
  getProviders: () =>
    apiRequest<{
      activeProviderId: string;
      switchMode: 'auto' | 'recommend';
      providers: Array<{
        id: string;
        name: string;
        modelId: string;
        tierLabel: string;
        envVarName: string;
        configured: boolean;
        enabled: boolean;
        priorityIndex: number;
        strength: string;
        privacyNote: string;
        limits: { rpm: number; tpm: number; rpd: number; tpd: number };
        usedTokensToday: number;
        remainingTokensToday: number;
        usedRequestsToday: number;
        remainingRequestsToday: number;
        remainingQuotaPct: number;
        cooldownRemainingSec: number;
        status: string;
        lastError: string;
        lastLatencyMs: number;
      }>;
    }>('/api/ai/providers'),
  updateProviderPrefs: (prefs: {
    priorityOrder?: string[];
    enabled?: Record<string, boolean>;
    selectedProviderId?: string;
    switchMode?: 'auto' | 'recommend';
  }) =>
    apiRequest<{
      activeProviderId: string;
      switchMode: 'auto' | 'recommend';
      providers: Array<Record<string, unknown>>;
    }>('/api/ai/providers/preferences', {
      method: 'PUT',
      body: prefs,
    }),
  switchProvider: (providerId: string) =>
    apiRequest('/api/ai/providers/switch', {
      method: 'POST',
      body: { providerId },
    }),
  transcribeAudio: (audioBase64: string, mimeType: string) =>
    apiRequest<{ transcript: string }>('/api/ai/transcribe', {
      method: 'POST',
      body: { audioBase64, mimeType },
      timeoutMs: 25000,
    }),
  reaStudyUrl: (payload: { target: string; notes?: string; allowAutoFailover?: boolean }) =>
    apiRequest<Record<string, unknown>>('/api/rea/study-url', {
      method: 'POST',
      body: payload,
      timeoutMs: 32000,
    }),
  reaSyncGithubRepo: (repo?: string) =>
    apiRequest<{ reaRepo: Record<string, unknown> }>(
      `/api/rea/github-repo${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`,
      { timeoutMs: 15000 }
    ),
  reaBuildAgent: (payload: {
    prompt: string;
    reaRepoUrl?: string;
    platforms?: string[];
    allowAutoFailover?: boolean;
  }) =>
    apiRequest<Record<string, unknown>>('/api/rea/build-agent', {
      method: 'POST',
      body: payload,
      timeoutMs: 32000,
    }),
  reaBuildSystem: (payload: {
    systemName: string;
    prompt: string;
    platforms?: string[];
    reaRepoUrl?: string;
    allowAutoFailover?: boolean;
  }) =>
    apiRequest<Record<string, unknown>>('/api/rea/build-system', {
      method: 'POST',
      body: payload,
      timeoutMs: 40000,
    }),
  reaListHosted: () =>
    apiRequest<{
      hostedApps: Array<{
        slug: string;
        appTitle: string;
        tagline: string;
        hostedUrl: string;
        platforms?: string[];
        fileCount?: number;
        reaRepoFullName?: string;
        createdAt: string;
      }>;
    }>('/api/rea/hosted'),
  reaGetHostedBundle: (slug: string) =>
    apiRequest<{
      hostedApp: Record<string, unknown>;
      reaRepo: Record<string, unknown> | null;
      files: Record<string, string>;
    }>(`/api/rea/hosted/${encodeURIComponent(slug)}/bundle`),
  studioGenerateStudyPack: (payload: { topicTitle: string; materialText: string; allowAutoFailover?: boolean }) =>
    apiRequest<Record<string, unknown>>('/api/studio/generate-study-pack', {
      method: 'POST',
      body: payload,
      timeoutMs: 35000,
    }),
  v4GetModules: () =>
    apiRequest<V4CatalogSnapshotResponse>('/api/v4/modules', { timeoutMs: 15000 }),
  v4SyncModuleGitHub: (moduleId: number, force = true) =>
    apiRequest<{
      module: BarbiV4Module;
      repos: LiveGitHubRepoTelemetry[];
      snapshot: V4CatalogSnapshotResponse;
    }>(`/api/v4/modules/${moduleId}/sync-github`, {
      method: 'POST',
      body: { force },
      timeoutMs: 25000,
    }),
  v4SyncPackGitHub: (payload: { packId?: IntegrationPackId; tier?: V4TierId; maxModules?: number }) =>
    apiRequest<{
      syncedCount: number;
      liveCount: number;
      repos: LiveGitHubRepoTelemetry[];
      snapshot: V4CatalogSnapshotResponse;
    }>('/api/v4/modules/sync-pack', {
      method: 'POST',
      body: payload,
      timeoutMs: 35000,
    }),
  v4MountModule: (
    moduleId: number,
    payload: {
      requestedMode?: ModuleExecutionMode;
      approvalConfirmed?: boolean;
      approvedBy?: string;
    }
  ) =>
    apiRequest<{
      ok: boolean;
      requiresApproval: boolean;
      decision: { allowed: boolean; resolvedMode: ModuleExecutionMode; requiresApproval: boolean; reason: string };
      snapshot: V4CatalogSnapshotResponse;
    }>(`/api/v4/modules/${moduleId}/mount`, {
      method: 'POST',
      body: payload,
    }),
  v4UnmountModule: (moduleId: number) =>
    apiRequest<{ ok: boolean; snapshot: V4CatalogSnapshotResponse }>(
      `/api/v4/modules/${moduleId}/unmount`,
      { method: 'POST' }
    ),
  v4MountPack: (packId: IntegrationPackId, approvalConfirmed: boolean) =>
    apiRequest<{
      ok: boolean;
      mountedCount: number;
      skippedCapitalGated: number;
      snapshot: V4CatalogSnapshotResponse;
    }>(`/api/v4/packs/${packId}/mount`, {
      method: 'POST',
      body: { approvalConfirmed },
    }),
  v4SearchGitHub: (query: string) =>
    apiRequest<{
      query: string;
      totalCount: number;
      items: Array<{
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
      }>;
    }>('/api/v4/github/search', {
      method: 'POST',
      body: { query },
      timeoutMs: 18000,
    }),
  v4AssimilateGitHubRepo: (payload: {
    fullName: string;
    htmlUrl: string;
    description: string;
    stars: number;
    language: string;
    license: string;
    tier: V4TierId;
    governanceTier: GovernanceTier;
    securityStatus: 'VERIFIED' | 'CAUTION' | 'UNVERIFIED';
  }) =>
    apiRequest<{ ok: boolean; repo: CustomAssimilatedRepo; snapshot: V4CatalogSnapshotResponse }>(
      '/api/v4/github/assimilate',
      { method: 'POST', body: payload }
    ),
  v4RemoveAssimilatedRepo: (repoId: string) =>
    apiRequest<{ ok: boolean; snapshot: V4CatalogSnapshotResponse }>(
      `/api/v4/github/assimilate/${encodeURIComponent(repoId)}`,
      { method: 'DELETE' }
    ),
  v4SetFinTechMode: (payload: {
    railId: string;
    targetMode: 'PAPER_SANDBOX' | 'LIVE_APPROVED';
    approvalConfirmed: boolean;
    riskCapNote?: string;
  }) =>
    apiRequest<{
      ok: boolean;
      requiresApproval: boolean;
      reason?: string;
      snapshot: V4CatalogSnapshotResponse;
    }>('/api/v4/fintech/execution-mode', {
      method: 'POST',
      body: payload,
    }),
  v4ExportStack: (payload: { pack: IntegrationPackId | 'mounted' | 'all'; companyName?: string }) =>
    apiRequest<{
      pack: string;
      companyName: string;
      moduleCount: number;
      repoCount: number;
      files: Record<string, string>;
    }>('/api/v4/export-stack', {
      method: 'POST',
      body: payload,
    }),
  godsEyeFeeds: (force = false) =>
    apiRequest<GodsEyeFeedsSnapshot>(`/api/gods-eye/feeds${force ? '?refresh=1' : ''}`, {
      timeoutMs: 15000,
    }),
  fsAgentAnalyze: (payload: {
    rootName: string;
    mode: 'analyze' | 'modify';
    instruction: string;
    projectTree: string;
    selectedFiles: Array<{ path: string; content: string; language?: string }>;
  }) =>
    apiRequest<FsAnalysisResult>('/api/fs-agent/analyze', {
      method: 'POST',
      body: payload,
      timeoutMs: 45000,
    }),
};
