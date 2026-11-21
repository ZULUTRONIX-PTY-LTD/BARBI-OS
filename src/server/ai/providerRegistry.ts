export type SwitchMode = 'auto' | 'recommend';

export interface ProviderFreeTierSpec {
  id: string;
  name: string;
  modelId: string;
  tierLabel: string;
  envVarName: string;
  endpoint: string;
  freeLimits: {
    rpm: number;
    tpm: number;
    rpd: number;
    tpd: number;
  };
  strength: string;
  privacyNote: string;
}

export interface ProviderRuntimeCounters {
  minuteWindowStartMs: number;
  dayWindowStartMs: number;
  requestsMinute: number;
  tokensMinute: number;
  requestsToday: number;
  tokensToday: number;
  cooldownUntilMs: number;
  lastError: string;
  lastLatencyMs: number;
}

export interface ProviderQuotaSnapshot {
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
  limits: {
    rpm: number;
    tpm: number;
    rpd: number;
    tpd: number;
  };
  usedTokensToday: number;
  remainingTokensToday: number;
  usedRequestsToday: number;
  remainingRequestsToday: number;
  remainingQuotaPct: number;
  cooldownRemainingSec: number;
  status: 'READY' | 'LOW_QUOTA' | 'COOLDOWN' | 'EXHAUSTED' | 'UNCONFIGURED' | 'DISABLED';
  lastError: string;
  lastLatencyMs: number;
}

export interface UserAiRoutingPrefs {
  priorityOrder: string[];
  enabled: Record<string, boolean>;
  selectedProviderId: string;
  switchMode: SwitchMode;
}

export const FREE_PROVIDER_CATALOG: ProviderFreeTierSpec[] = [
  {
    id: 'gemini',
    name: 'Google Gemini (AI Studio Free)',
    modelId: 'gemini-4-hydrogen',
    tierLabel: 'Free Tier • 15 RPM / 250K TPM / 500 RPD',
    envVarName: 'GEMINI_API_KEY',
    endpoint: 'SDK:@google/genai',
    freeLimits: { rpm: 15, tpm: 250000, rpd: 500, tpd: 1500000 },
    strength: 'Long-context reasoning, tool calling & multimodal engineering',
    privacyNote: 'Standard AI Studio free-tier terms apply; no card required.',
  },
  {
    id: 'groq',
    name: 'GroqCloud LPU (Open Weights)',
    modelId: 'llama-3.3-70b-versatile',
    tierLabel: 'Free Tier • 30 RPM / 8K TPM / 200K TPD',
    envVarName: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    freeLimits: { rpm: 30, tpm: 8000, rpd: 1000, tpd: 200000 },
    strength: 'Ultra-low-latency LPU inference for quick coding & voice turns',
    privacyNote: 'Strict minute/daily token limits; ideal secondary speed relay.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (:free Aggregator)',
    modelId: 'deepseek/deepseek-chat-v3-0324:free',
    tierLabel: 'Free Tier • 20 RPM / 50–1000 RPD',
    envVarName: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    freeLimits: { rpm: 20, tpm: 40000, rpd: 50, tpd: 250000 },
    strength: '20+ rotating :free open-weights models (DeepSeek, Llama, Qwen)',
    privacyNote: '50 RPD without top-up; 1,000 RPD after one-time credit.',
  },
  {
    id: 'cerebras',
    name: 'Cerebras Inference (Wafer-Scale)',
    modelId: 'llama3.3-70b',
    tierLabel: 'Free Developer • 30 RPM / 60K TPM / 1M TPD',
    envVarName: 'CEREBRAS_API_KEY',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    freeLimits: { rpm: 30, tpm: 60000, rpd: 14400, tpd: 1000000 },
    strength: 'High throughput open-weights generation burst capacity',
    privacyNote: 'Developer free allocation subject to active burst capacity.',
  },
  {
    id: 'github_models',
    name: 'GitHub Models (Free Tier)',
    modelId: 'openai/gpt-4o-mini',
    tierLabel: 'Free Tier • 15 RPM / 150 RPD (No Phone SMS)',
    envVarName: 'GITHUB_TOKEN',
    endpoint: 'https://models.github.ai/inference/chat/completions',
    freeLimits: { rpm: 15, tpm: 40000, rpd: 150, tpd: 400000 },
    strength: 'Free GPT-4o-mini / Llama / Mistral routing with standard GitHub PAT (models:read)',
    privacyNote: 'No credit card or phone SMS required; standard GitHub rate limits.',
  },
  {
    id: 'openrouter_mistral',
    name: 'OpenRouter Mistral (:free Relay)',
    modelId: 'mistralai/mistral-small-24b-instruct-2501:free',
    tierLabel: 'Free Tier • 20 RPM / 50–1000 RPD (No Phone SMS)',
    envVarName: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    freeLimits: { rpm: 20, tpm: 40000, rpd: 50, tpd: 250000 },
    strength: 'Mistral Small 24B via OpenRouter without console.mistral.ai phone verification',
    privacyNote: 'Shares OPENROUTER_API_KEY; drop-in replacement for Mistral free tier.',
  },
  {
    id: 'mistral',
    name: 'Mistral La Plateforme (Experiment)',
    modelId: 'mistral-small-latest',
    tierLabel: 'Experiment Free • 60 RPM / 500K TPM',
    envVarName: 'MISTRAL_API_KEY',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    freeLimits: { rpm: 60, tpm: 500000, rpd: 1000, tpd: 500000 },
    strength: 'Direct Mistral multilingual & European technical writing backup',
    privacyNote: 'Requires Experiment plan activation + SMS verification in Mistral Console.',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face Inference Router',
    modelId: 'Qwen/Qwen2.5-72B-Instruct',
    tierLabel: 'Free Tier • 15 RPM / 100K TPD',
    envVarName: 'HF_TOKEN',
    endpoint: 'https://router.huggingface.co/v1/chat/completions',
    freeLimits: { rpm: 15, tpm: 16000, rpd: 300, tpd: 100000 },
    strength: 'Open-weights ecosystem fallback across Qwen & Llama hubs',
    privacyNote: 'Monthly/daily free compute credits.',
  },
  {
    id: 'ollama',
    name: 'Local Edge (Ollama / Jetson / PC)',
    modelId: 'qwen2.5-coder:7b-instruct',
    tierLabel: 'Local Hardware • Unlimited Quota',
    envVarName: 'OLLAMA_BASE_URL',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    freeLimits: { rpm: 999, tpm: 9999999, rpd: 99999, tpd: 9999999 },
    strength: '100% private offline inference on local GPU / Jetson / Windows PC',
    privacyNote: 'Zero external limits when Ollama daemon is running locally.',
  },
];

const DEFAULT_PRIORITY = FREE_PROVIDER_CATALOG.map((p) => p.id);

const providerCounters = new Map<string, ProviderRuntimeCounters>();
const userPreferences = new Map<string, UserAiRoutingPrefs>();

function getOrCreateCounters(providerId: string, nowMs = Date.now()): ProviderRuntimeCounters {
  let c = providerCounters.get(providerId);
  if (!c) {
    c = {
      minuteWindowStartMs: nowMs,
      dayWindowStartMs: nowMs,
      requestsMinute: 0,
      tokensMinute: 0,
      requestsToday: 0,
      tokensToday: 0,
      cooldownUntilMs: 0,
      lastError: '',
      lastLatencyMs: 0,
    };
    providerCounters.set(providerId, c);
  }
  // Reset minute window
  if (nowMs - c.minuteWindowStartMs >= 60_000) {
    c.minuteWindowStartMs = nowMs;
    c.requestsMinute = 0;
    c.tokensMinute = 0;
  }
  // Reset 24h day window
  if (nowMs - c.dayWindowStartMs >= 86_400_000) {
    c.dayWindowStartMs = nowMs;
    c.requestsToday = 0;
    c.tokensToday = 0;
    c.lastError = '';
  }
  if (c.cooldownUntilMs > 0 && nowMs >= c.cooldownUntilMs) {
    c.cooldownUntilMs = 0;
  }
  return c;
}

export function isProviderEnvConfigured(providerId: string): boolean {
  const spec = FREE_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!spec) return false;
  const val = process.env[spec.envVarName];
  if (!val) return false;
  const trimmed = val.trim();
  if (!trimmed || trimmed.startsWith('MY_')) return false;
  return true;
}

export function getUserRoutingPrefs(userKey = 'guest'): UserAiRoutingPrefs {
  let prefs = userPreferences.get(userKey);
  if (!prefs) {
    const enabled: Record<string, boolean> = {};
    for (const p of FREE_PROVIDER_CATALOG) {
      enabled[p.id] = true;
    }
    prefs = {
      priorityOrder: [...DEFAULT_PRIORITY],
      enabled,
      selectedProviderId: 'gemini',
      switchMode: 'recommend',
    };
    userPreferences.set(userKey, prefs);
  }
  return prefs;
}

export function updateUserRoutingPrefs(
  userKey: string,
  patch: Partial<UserAiRoutingPrefs>
): UserAiRoutingPrefs {
  const current = getUserRoutingPrefs(userKey);
  const validIds = new Set(FREE_PROVIDER_CATALOG.map((p) => p.id));

  let nextPriority = current.priorityOrder;
  if (Array.isArray(patch.priorityOrder)) {
    const seen = new Set<string>();
    const filtered: string[] = [];
    for (const id of patch.priorityOrder) {
      if (validIds.has(id) && !seen.has(id)) {
        seen.add(id);
        filtered.push(id);
      }
    }
    for (const id of DEFAULT_PRIORITY) {
      if (!seen.has(id)) filtered.push(id);
    }
    nextPriority = filtered;
  }

  const nextEnabled = { ...current.enabled, ...(patch.enabled || {}) };
  const nextSelected =
    patch.selectedProviderId && validIds.has(patch.selectedProviderId)
      ? patch.selectedProviderId
      : current.selectedProviderId;
  const nextSwitchMode: SwitchMode =
    patch.switchMode === 'recommend' || patch.switchMode === 'auto'
      ? patch.switchMode
      : current.switchMode;

  const updated: UserAiRoutingPrefs = {
    priorityOrder: nextPriority,
    enabled: nextEnabled,
    selectedProviderId: nextSelected,
    switchMode: nextSwitchMode,
  };
  userPreferences.set(userKey, updated);
  return updated;
}

export function estimateTokenCount(text: string): number {
  const len = String(text || '').trim().length;
  return Math.max(1, Math.ceil(len / 4));
}

export function recordProviderUsage(
  providerId: string,
  stats: { tokensUsed: number; latencyMs?: number; nowMs?: number }
): void {
  const now = stats.nowMs ?? Date.now();
  const c = getOrCreateCounters(providerId, now);
  c.requestsMinute += 1;
  c.requestsToday += 1;
  c.tokensMinute += Math.max(1, Math.round(stats.tokensUsed));
  c.tokensToday += Math.max(1, Math.round(stats.tokensUsed));
  c.lastError = '';
  if (typeof stats.latencyMs === 'number') {
    c.lastLatencyMs = Math.round(stats.latencyMs);
  }
}

export function markProviderRateLimited(
  providerId: string,
  reason: string,
  retryAfterSeconds = 60,
  nowMs = Date.now()
): void {
  const c = getOrCreateCounters(providerId, nowMs);
  c.cooldownUntilMs = nowMs + Math.max(15, retryAfterSeconds) * 1000;
  c.lastError = reason.slice(0, 180);
}

export function getProviderQuotaSnapshot(
  userKey = 'guest',
  nowMs = Date.now()
): {
  activeProviderId: string;
  switchMode: SwitchMode;
  providers: ProviderQuotaSnapshot[];
} {
  const prefs = getUserRoutingPrefs(userKey);
  const providers: ProviderQuotaSnapshot[] = prefs.priorityOrder
    .map((id, idx) => {
      const spec = FREE_PROVIDER_CATALOG.find((p) => p.id === id);
      if (!spec) return null;
      const c = getOrCreateCounters(id, nowMs);
      const configured = isProviderEnvConfigured(id);
      const enabled = prefs.enabled[id] !== false;
      const remainingTokensToday = Math.max(0, spec.freeLimits.tpd - c.tokensToday);
      const remainingRequestsToday = Math.max(0, spec.freeLimits.rpd - c.requestsToday);
      const tokenPct = (remainingTokensToday / Math.max(1, spec.freeLimits.tpd)) * 100;
      const reqPct = (remainingRequestsToday / Math.max(1, spec.freeLimits.rpd)) * 100;
      const remainingQuotaPct = Number(Math.min(tokenPct, reqPct).toFixed(1));
      const cooldownRemainingSec =
        c.cooldownUntilMs > nowMs ? Math.ceil((c.cooldownUntilMs - nowMs) / 1000) : 0;

      let status: ProviderQuotaSnapshot['status'] = 'READY';
      if (!enabled) status = 'DISABLED';
      else if (!configured) status = 'UNCONFIGURED';
      else if (remainingTokensToday <= 0 || remainingRequestsToday <= 0) status = 'EXHAUSTED';
      else if (cooldownRemainingSec > 0 || c.requestsMinute >= spec.freeLimits.rpm) {
        status = 'COOLDOWN';
      } else if (remainingQuotaPct < 15) status = 'LOW_QUOTA';

      return {
        id: spec.id,
        name: spec.name,
        modelId: spec.modelId,
        tierLabel: spec.tierLabel,
        envVarName: spec.envVarName,
        configured,
        enabled,
        priorityIndex: idx,
        strength: spec.strength,
        privacyNote: spec.privacyNote,
        limits: spec.freeLimits,
        usedTokensToday: c.tokensToday,
        remainingTokensToday,
        usedRequestsToday: c.requestsToday,
        remainingRequestsToday,
        remainingQuotaPct,
        cooldownRemainingSec,
        status,
        lastError: c.lastError,
        lastLatencyMs: c.lastLatencyMs,
      } satisfies ProviderQuotaSnapshot;
    })
    .filter((x): x is ProviderQuotaSnapshot => Boolean(x));

  return {
    activeProviderId: prefs.selectedProviderId,
    switchMode: prefs.switchMode,
    providers,
  };
}

export function canAcceptEstimatedCall(
  providerId: string,
  estimatedTokens = 1200,
  nowMs = Date.now()
): { allowed: boolean; reason?: string; lowQuota?: boolean } {
  const spec = FREE_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!spec) return { allowed: false, reason: 'Unknown provider' };
  const c = getOrCreateCounters(providerId, nowMs);
  if (c.cooldownUntilMs > nowMs) {
    const sec = Math.ceil((c.cooldownUntilMs - nowMs) / 1000);
    return { allowed: false, reason: `Cooldown active (${sec}s remaining)` };
  }
  const safeTokens = Math.max(100, estimatedTokens);
  if (c.requestsToday >= spec.freeLimits.rpd || c.tokensToday + safeTokens > spec.freeLimits.tpd) {
    return {
      allowed: false,
      reason: `Free-tier daily ceiling reached (${c.tokensToday.toLocaleString()}/${spec.freeLimits.tpd.toLocaleString()} tokens, ${c.requestsToday}/${spec.freeLimits.rpd} reqs)`,
    };
  }
  if (c.requestsMinute >= spec.freeLimits.rpm || c.tokensMinute + safeTokens > spec.freeLimits.tpm) {
    markProviderRateLimited(
      providerId,
      `Minute ceiling guard (${spec.freeLimits.rpm} RPM / ${spec.freeLimits.tpm.toLocaleString()} TPM)`,
      30,
      nowMs
    );
    return {
      allowed: false,
      reason: `Pre-flight minute ceiling guard triggered (${spec.freeLimits.rpm} RPM / ${spec.freeLimits.tpm.toLocaleString()} TPM)`,
    };
  }
  const remPct = ((spec.freeLimits.tpd - c.tokensToday) / Math.max(1, spec.freeLimits.tpd)) * 100;
  return { allowed: true, lowQuota: remPct < 15 };
}

export function selectBestAvailableProvider(
  userKey = 'guest',
  excludeIds: string[] = [],
  nowMs = Date.now(),
  estimatedTokens = 1200
): {
  primary: ProviderQuotaSnapshot | null;
  recommendedNext: ProviderQuotaSnapshot | null;
  needsSwitchPrompt: boolean;
  lowQuotaWarning: boolean;
  reason: string;
} {
  const snapshot = getProviderQuotaSnapshot(userKey, nowMs);
  const excluded = new Set(excludeIds);
  const current = snapshot.providers.find((p) => p.id === snapshot.activeProviderId) || null;
  const readyCandidates = snapshot.providers.filter(
    (p) =>
      !excluded.has(p.id) &&
      p.enabled &&
      p.configured &&
      (p.status === 'READY' || p.status === 'LOW_QUOTA') &&
      canAcceptEstimatedCall(p.id, estimatedTokens, nowMs).allowed
  );

  if (
    current &&
    !excluded.has(current.id) &&
    current.enabled &&
    current.configured &&
    (current.status === 'READY' || current.status === 'LOW_QUOTA')
  ) {
    const budgetCheck = canAcceptEstimatedCall(current.id, estimatedTokens, nowMs);
    if (budgetCheck.allowed) {
      const alt = readyCandidates.find((p) => p.id !== current.id) || null;
      return {
        primary: current,
        recommendedNext: alt,
        needsSwitchPrompt: false,
        lowQuotaWarning: Boolean(budgetCheck.lowQuota || current.status === 'LOW_QUOTA'),
        reason:
          current.status === 'LOW_QUOTA'
            ? `${current.name} is running low (${current.remainingQuotaPct}% / ${current.remainingTokensToday.toLocaleString()} tokens left).`
            : `${current.name} is ready (${current.remainingTokensToday.toLocaleString()} tokens left today).`,
      };
    }
  }

  const nextBest = readyCandidates[0] || null;
  const refreshedCurrent = getProviderQuotaSnapshot(userKey, nowMs).providers.find(
    (p) => p.id === snapshot.activeProviderId
  ) || current;
  const blockReason = refreshedCurrent
    ? `${refreshedCurrent.name} stopped at ${refreshedCurrent.status}${
        refreshedCurrent.cooldownRemainingSec > 0
          ? ` (${refreshedCurrent.cooldownRemainingSec}s cooldown)`
          : ''
      } to protect your free tier.`
    : 'Primary provider unavailable.';

  return {
    primary: snapshot.switchMode === 'auto' ? nextBest : refreshedCurrent,
    recommendedNext: nextBest,
    needsSwitchPrompt: Boolean(nextBest && refreshedCurrent && nextBest.id !== refreshedCurrent.id),
    lowQuotaWarning: false,
    reason: nextBest
      ? `${blockReason} Recommended next best: ${nextBest.name} (${nextBest.remainingTokensToday.toLocaleString()} tokens left).`
      : `${blockReason} No other configured provider has remaining free-tier quota right now.`,
  };
}

export async function callOpenAiCompatibleProvider(params: {
  providerId: string;
  systemInstruction: string;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{ reply: string; model: string; tokensUsed: number; latencyMs: number }> {
  const spec = FREE_PROVIDER_CATALOG.find((p) => p.id === params.providerId);
  if (!spec || spec.endpoint.startsWith('SDK:')) {
    throw new Error(`Unsupported OpenAI-compatible provider: ${params.providerId}`);
  }
  const envVal = process.env[spec.envVarName]?.trim();
  if (!envVal) {
    throw new Error(`Provider ${spec.name} is not configured.`);
  }

  const url =
    spec.id === 'ollama'
      ? envVal.endsWith('/chat/completions')
        ? envVal
        : `${envVal.replace(/\/$/, '')}/v1/chat/completions`
      : spec.endpoint;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (spec.id !== 'ollama') {
    headers.Authorization = `Bearer ${envVal}`;
  }
  if (spec.id === 'github_models') {
    headers.Accept = 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }
  if (spec.id === 'openrouter' || spec.id === 'openrouter_mistral') {
    headers['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3000';
    headers['X-Title'] = 'B.A.R.B.I 2.0 PIOS';
  }

  const messages = [
    { role: 'system', content: params.systemInstruction },
    ...(params.history || []).slice(-6),
    { role: 'user', content: params.prompt },
  ];

  const startMs = Date.now();
  const ctrl = new AbortController();
  const timeoutMs = spec.id === 'ollama' ? 2500 : 18000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: spec.modelId,
        messages,
      }),
    });

    if (res.status === 429 || res.status === 402) {
      const retryHeader = Number(res.headers.get('retry-after') || '60');
      const errTxt = await res.text().catch(() => '');
      markProviderRateLimited(
        spec.id,
        `HTTP ${res.status} rate/quota limit reached`,
        Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 60
      );
      throw new Error(`RATE_LIMIT:${spec.id}:${errTxt.slice(0, 120)}`);
    }

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 140)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    const reply = (data?.choices?.[0]?.message?.content || '').trim();
    if (!reply) throw new Error(`Empty response from ${spec.name}`);

    const tokensUsed =
      data?.usage?.total_tokens ||
      estimateTokenCount(params.systemInstruction + params.prompt + reply);
    const latencyMs = Date.now() - startMs;
    recordProviderUsage(spec.id, { tokensUsed, latencyMs });
    return { reply, model: spec.modelId, tokensUsed, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

export async function streamOpenAiCompatibleProvider(params: {
  providerId: string;
  systemInstruction: string;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onChunk: (delta: string) => void;
}): Promise<{ reply: string; model: string; tokensUsed: number; latencyMs: number }> {
  const spec = FREE_PROVIDER_CATALOG.find((p) => p.id === params.providerId);
  if (!spec || spec.endpoint.startsWith('SDK:')) {
    throw new Error(`Unsupported OpenAI-compatible provider: ${params.providerId}`);
  }
  const envVal = process.env[spec.envVarName]?.trim();
  if (!envVal) {
    throw new Error(`Provider ${spec.name} is not configured.`);
  }

  const url =
    spec.id === 'ollama'
      ? envVal.endsWith('/chat/completions')
        ? envVal
        : `${envVal.replace(/\/$/, '')}/v1/chat/completions`
      : spec.endpoint;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (spec.id !== 'ollama') {
    headers.Authorization = `Bearer ${envVal}`;
  }
  if (spec.id === 'github_models') {
    headers.Accept = 'application/vnd.github+json';
    headers['X-GitHub-Api-Version'] = '2022-11-28';
  }
  if (spec.id === 'openrouter' || spec.id === 'openrouter_mistral') {
    headers['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3000';
    headers['X-Title'] = 'B.A.R.B.I 2.0 PIOS';
  }

  const messages = [
    { role: 'system', content: params.systemInstruction },
    ...(params.history || []).slice(-10),
    { role: 'user', content: params.prompt },
  ];

  const startMs = Date.now();
  const ctrl = new AbortController();
  const timeoutMs = spec.id === 'ollama' ? 2500 : 22000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        model: spec.modelId,
        messages,
        stream: true,
      }),
    });

    if (res.status === 429 || res.status === 402) {
      const retryHeader = Number(res.headers.get('retry-after') || '60');
      const errTxt = await res.text().catch(() => '');
      markProviderRateLimited(
        spec.id,
        `HTTP ${res.status} rate/quota limit reached`,
        Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 60
      );
      throw new Error(`RATE_LIMIT:${spec.id}:${errTxt.slice(0, 120)}`);
    }

    if (!res.ok) {
      const errTxt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errTxt.slice(0, 140)}`);
    }

    if (!res.body) {
      return callOpenAiCompatibleProvider(params);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullReply = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
          };
          const delta =
            parsed?.choices?.[0]?.delta?.content ??
            parsed?.choices?.[0]?.message?.content ??
            '';
          if (delta) {
            fullReply += delta;
            params.onChunk(delta);
          }
        } catch {
          // ignore keepalive / non-JSON comment chunks
        }
      }
    }

    const cleanReply = fullReply.trim();
    if (!cleanReply) throw new Error(`Empty streaming response from ${spec.name}`);

    const tokensUsed = estimateTokenCount(params.systemInstruction + params.prompt + cleanReply);
    const latencyMs = Date.now() - startMs;
    recordProviderUsage(spec.id, { tokensUsed, latencyMs });
    return { reply: cleanReply, model: spec.modelId, tokensUsed, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

export function resetProviderRegistryForTests(): void {
  providerCounters.clear();
  userPreferences.clear();
}
