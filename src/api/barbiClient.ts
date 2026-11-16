import { getFirebaseIdToken } from '../lib/firebase';
import {
  enqueueOfflineMutation,
  flushOfflineQueue,
  readOfflineQueue,
} from '../sync/offlineQueue';

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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options?.timeoutMs ?? 25000);

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
    if (
      method !== 'GET' &&
      options?.queueWhenOffline &&
      !(err as { status?: number })?.status
    ) {
      enqueueOfflineMutation({ endpoint: path, method, body: options.body });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
    }>('/api/system/telemetry'),
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
      conversationKey: string;
      activatedNodes: string[];
      fallback: boolean;
    }>('/api/ai/chat', {
      method: 'POST',
      body: payload,
      timeoutMs: 32000,
    }),
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
  reaBuildAgent: (payload: { prompt: string; allowAutoFailover?: boolean }) =>
    apiRequest<Record<string, unknown>>('/api/rea/build-agent', {
      method: 'POST',
      body: payload,
      timeoutMs: 32000,
    }),
  reaBuildSystem: (payload: { systemName: string; prompt: string; allowAutoFailover?: boolean }) =>
    apiRequest<Record<string, unknown>>('/api/rea/build-system', {
      method: 'POST',
      body: payload,
      timeoutMs: 35000,
    }),
  reaListHosted: () =>
    apiRequest<{
      hostedApps: Array<{ slug: string; appTitle: string; tagline: string; hostedUrl: string; createdAt: string }>;
    }>('/api/rea/hosted'),
  studioGenerateStudyPack: (payload: { topicTitle: string; materialText: string; allowAutoFailover?: boolean }) =>
    apiRequest<Record<string, unknown>>('/api/studio/generate-study-pack', {
      method: 'POST',
      body: payload,
      timeoutMs: 35000,
    }),
};
