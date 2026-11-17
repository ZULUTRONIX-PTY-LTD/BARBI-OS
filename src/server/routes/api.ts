import { Router, type Response } from 'express';
import { z } from 'zod';
import os from 'node:os';
import { optionalAuth, requireAuth, type AuthRequest } from '../../middleware/auth.ts';
import {
  generateBarbiChatTurn,
  hasConfiguredGeminiKey,
  transcribeAudioBuffer,
} from '../ai/geminiService.ts';
import { createAiObservabilityContext } from '../ai/observability.ts';
import {
  callOpenAiCompatibleProvider,
  estimateTokenCount,
  getProviderQuotaSnapshot,
  selectBestAvailableProvider,
  updateUserRoutingPrefs,
} from '../ai/providerRegistry.ts';
import {
  buildAndHostSystemBundle,
  buildCustomAgentBlueprint,
  listHostedSystems,
  studyExternalPlatform,
} from '../rea/reaService.ts';
import { generateNotebookStudyPack } from '../studio/studyStudioService.ts';
import {
  addMemorySource,
  appendConversationTurn,
  createKnowledgeEdge,
  createOrUpdateKnowledgeNode,
  createTimerSession,
  deleteConversation,
  deleteHabit,
  deleteKnowledgeEdge,
  deleteKnowledgeNode,
  exportFullArchivexBackup,
  getConversationMessages,
  getUserSettingsRecord,
  listContradictionsAndTimeline,
  listConversations,
  listHabits,
  listKnowledgeEdges,
  listKnowledgeNodes,
  listMemorySources,
  listTimerSessions,
  resolveContradiction,
  retrieveRelevantPastConversations,
  saveUserSettingsRecord,
  seedUserArchivexIfEmpty,
  semanticSearchKnowledgeNodes,
  upsertHabit,
} from '../archivex/repository.ts';
import { testDbConnection } from '../../db/index.ts';

export const apiRouter = Router();

function sendError(res: Response, status: number, message: string, details?: unknown) {
  return res.status(status).json({ error: message, ...(details ? { details } : {}) });
}

// 1. Health & Diagnostics
apiRouter.get('/health', async (_req, res) => {
  const dbOk = await testDbConnection();
  return res.json({
    ok: dbOk,
    service: 'B.A.R.B.I 2.0 PIOS Engine',
    database: dbOk ? 'postgresql+pgvector' : 'disconnected',
    aiConfigured: hasConfiguredGeminiKey(),
    timestamp: new Date().toISOString(),
  });
});

// 2. Real Host OS Telemetry
apiRouter.get('/system/telemetry', (_req, res) => {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMemPct = Math.round(((totalMem - freeMem) / Math.max(1, totalMem)) * 100);
  const load = os.loadavg();
  const cpuLoadPct = Math.min(99, Math.max(4, Math.round((load[0] / Math.max(1, cpus.length)) * 100)));

  return res.json({
    platform: os.platform(),
    arch: os.arch(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model || 'Host Compute Core',
    cpuLoadPct,
    memoryUsedPct: usedMemPct,
    memoryTotalGb: Number((totalMem / 1024 ** 3).toFixed(2)),
    memoryFreeGb: Number((freeMem / 1024 ** 3).toFixed(2)),
    uptimeSeconds: Math.round(os.uptime()),
  });
});

// 3. Server-Side Weather Proxy (Open-Meteo, zero client API key needed)
apiRouter.get('/weather', async (req, res) => {
  try {
    const lat = Number(req.query.lat ?? -25.7479);
    const lon = Number(req.query.lon ?? 28.2293);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return sendError(res, 400, 'Invalid coordinates.');
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) {
      return sendError(res, 502, 'Upstream weather telemetry unavailable.');
    }
    const data = await r.json();
    return res.json(data);
  } catch (err) {
    return sendError(res, 502, (err as Error)?.message || 'Weather proxy failed.');
  }
});

// 4. GitHub Public Repository Capability Explorer (Server-side proxy + optional import)
apiRouter.get('/integrations/github/search', async (req, res) => {
  try {
    const q = String(req.query.q || 'mechatronics esp32 robotics').trim().slice(0, 120);
    if (!q) return sendError(res, 400, 'Query q is required.');
    const ghRes = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=8`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'BARBI-PIOS-2.0',
        },
      }
    );
    if (!ghRes.ok) {
      return sendError(res, 502, `GitHub API returned ${ghRes.status}`);
    }
    const json = (await ghRes.json()) as {
      items?: Array<{
        full_name: string;
        html_url: string;
        description: string | null;
        stargazers_count: number;
        language: string | null;
        topics?: string[];
        updated_at: string;
      }>;
    };
    const items = (json.items || []).map((repo) => ({
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description || 'No description provided.',
      stars: repo.stargazers_count,
      language: repo.language || 'Unknown',
      topics: (repo.topics || []).slice(0, 6),
      updatedAt: repo.updated_at,
    }));
    return res.json({ query: q, items });
  } catch (err) {
    return sendError(res, 502, (err as Error)?.message || 'GitHub search failed.');
  }
});

// 5. Server-Side Telegram Relay (uses server env secrets, never client tokens)
const telegramSendSchema = z.object({
  text: z.string().min(1).max(4000),
  chatId: z.string().max(120).optional(),
});

apiRouter.post('/integrations/telegram/send', optionalAuth, async (req: AuthRequest, res) => {
  const parsed = telegramSendSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'Invalid Telegram payload.', parsed.error.flatten());
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = parsed.data.chatId?.trim() || process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return res.status(503).json({
      configured: false,
      error: 'Telegram server relay is not configured on this host (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).',
    });
  }
  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: parsed.data.text }),
    });
    const tgJson = await tgRes.json();
    if (!tgRes.ok) {
      return sendError(res, 502, 'Telegram API delivery failed.', tgJson);
    }
    return res.json({ ok: true, result: tgJson });
  } catch (err) {
    return sendError(res, 502, (err as Error)?.message || 'Telegram request failed.');
  }
});

// 6. Authenticated Workspace Bootstrap
apiRouter.post('/bootstrap', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    await seedUserArchivexIfEmpty(uid);

    const [
      nodes,
      edges,
      sources,
      contradictionsAndTimeline,
      conversationsList,
      habitRows,
      timerRows,
      settingsRow,
    ] = await Promise.all([
      listKnowledgeNodes(uid, { limit: 300 }),
      listKnowledgeEdges(uid),
      listMemorySources(uid),
      listContradictionsAndTimeline(uid),
      listConversations(uid),
      listHabits(uid),
      listTimerSessions(uid),
      getUserSettingsRecord(uid),
    ]);

    return res.json({
      user: {
        uid,
        email: req.user!.email || '',
        name: req.user!.name || 'Treasure Trinity Zulu',
      },
      nodes,
      edges,
      sources,
      contradictions: contradictionsAndTimeline.contradictions,
      timelineEvents: contradictionsAndTimeline.timeline,
      conversations: conversationsList,
      habits: habitRows,
      timerSessions: timerRows,
      settings: settingsRow,
    });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to bootstrap workspace.');
  }
});

// 7. ARCHIVEX Knowledge Nodes CRUD & Semantic Vector Search
const nodePayloadSchema = z.object({
  nodeKey: z.string().max(160).optional(),
  label: z.string().min(1).max(200),
  category: z.string().max(64).optional(),
  domain: z.string().max(64).optional(),
  nexusCategory: z.string().max(120).optional(),
  tier: z.string().max(32).optional(),
  icon: z.string().max(16).optional(),
  summary: z.string().max(600).optional(),
  content: z.string().min(1).max(16000),
  evidence: z.string().max(4000).optional(),
  source: z.string().max(240).optional(),
  sourceUri: z.string().max(512).optional(),
  verificationStatus: z.string().max(64).optional(),
  confidence: z.number().min(0).max(1).optional(),
  year: z.number().int().min(1900).max(2200).optional(),
  isoTimestamp: z.string().max(64).optional(),
  datePrecision: z.string().max(32).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

apiRouter.get('/memories', requireAuth, async (req: AuthRequest, res) => {
  try {
    const nodes = await listKnowledgeNodes(req.user!.uid, {
      domain: typeof req.query.domain === 'string' ? req.query.domain : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
      query: typeof req.query.q === 'string' ? req.query.q : undefined,
    });
    return res.json({ nodes });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to list memories.');
  }
});

apiRouter.post('/memories', requireAuth, async (req: AuthRequest, res) => {
  const parsed = nodePayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'Invalid memory payload.', parsed.error.flatten());
  }
  try {
    const result = await createOrUpdateKnowledgeNode(req.user!.uid, parsed.data);
    return res.status(201).json(result);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to save memory.');
  }
});

apiRouter.put('/memories/:nodeKey', requireAuth, async (req: AuthRequest, res) => {
  const parsed = nodePayloadSchema.safeParse({ ...req.body, nodeKey: req.params.nodeKey });
  if (!parsed.success) {
    return sendError(res, 400, 'Invalid memory update payload.', parsed.error.flatten());
  }
  try {
    const result = await createOrUpdateKnowledgeNode(req.user!.uid, parsed.data);
    return res.json(result);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to update memory.');
  }
});

apiRouter.delete('/memories/:nodeKey', requireAuth, async (req: AuthRequest, res) => {
  try {
    const hard = req.query.hard === 'true';
    const deleted = await deleteKnowledgeNode(req.user!.uid, String(req.params.nodeKey), hard);
    if (!deleted) return sendError(res, 404, 'Memory node not found.');
    return res.json({ ok: true, deleted });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to delete memory.');
  }
});

apiRouter.post('/memories/search', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({ query: z.string().min(1).max(1000), limit: z.number().int().min(1).max(30).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'Invalid search query.', parsed.error.flatten());
  }
  try {
    const out = await semanticSearchKnowledgeNodes(
      req.user!.uid,
      parsed.data.query,
      parsed.data.limit || 8
    );
    return res.json(out);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Semantic search failed.');
  }
});

// 8. Knowledge Graph Edges & Sources & Contradictions & Timeline
apiRouter.get('/edges', requireAuth, async (req: AuthRequest, res) => {
  try {
    const edges = await listKnowledgeEdges(req.user!.uid);
    return res.json({ edges });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to load edges.');
  }
});

apiRouter.post('/edges', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    sourceNodeKey: z.string().min(1).max(160),
    targetNodeKey: z.string().min(1).max(160),
    relationType: z.string().min(1).max(64).default('RELATES_TO'),
    weight: z.number().min(0).max(1).optional(),
    evidence: z.string().max(1000).optional(),
    source: z.string().max(240).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid edge payload.', parsed.error.flatten());
  try {
    const edge = await createKnowledgeEdge(req.user!.uid, parsed.data);
    return res.status(201).json({ edge });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to save edge.');
  }
});

apiRouter.delete('/edges/:id', requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return sendError(res, 400, 'Invalid edge id.');
  try {
    const deleted = await deleteKnowledgeEdge(req.user!.uid, id);
    if (!deleted) return sendError(res, 404, 'Edge not found.');
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to delete edge.');
  }
});

apiRouter.get('/sources', requireAuth, async (req: AuthRequest, res) => {
  try {
    const nodeKey = typeof req.query.nodeKey === 'string' ? req.query.nodeKey : undefined;
    const sources = await listMemorySources(req.user!.uid, nodeKey);
    return res.json({ sources });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to load memory sources.');
  }
});

apiRouter.post('/sources', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    nodeKey: z.string().min(1).max(160),
    sourceType: z.string().max(48).optional(),
    sourceTitle: z.string().min(1).max(240),
    sourceUri: z.string().max(512).optional(),
    excerpt: z.string().max(2000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid source payload.', parsed.error.flatten());
  try {
    const source = await addMemorySource(req.user!.uid, parsed.data);
    return res.status(201).json({ source });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to save source.');
  }
});

apiRouter.get('/contradictions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await listContradictionsAndTimeline(req.user!.uid);
    return res.json(data);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to load integrity records.');
  }
});

apiRouter.patch('/contradictions/:key', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    status: z.enum(['PENDING_CONFIRMATION', 'VERIFIED_CORRECTION', 'DISMISSED']),
    correctedRecord: z.string().max(2000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid resolution payload.');
  try {
    const updated = await resolveContradiction(
      req.user!.uid,
      String(req.params.key),
      parsed.data.status,
      parsed.data.correctedRecord
    );
    if (!updated) return sendError(res, 404, 'Contradiction record not found.');
    return res.json({ contradiction: updated });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to resolve contradiction.');
  }
});

apiRouter.get('/timeline', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = await listContradictionsAndTimeline(req.user!.uid);
    return res.json({ timelineEvents: data.timeline });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to load timeline.');
  }
});

// 9. Persistent Conversations & Messages
apiRouter.get('/conversations', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await listConversations(req.user!.uid);
    return res.json({ conversations: items });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to list conversations.');
  }
});

apiRouter.get('/conversations/:key/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await getConversationMessages(req.user!.uid, String(req.params.key));
    if (!result) return sendError(res, 404, 'Conversation not found.');
    return res.json(result);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to fetch conversation messages.');
  }
});

apiRouter.post('/conversations/:key/messages', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    title: z.string().max(120).optional(),
    sender: z.enum(['user', 'barbi', 'system']),
    content: z.string().min(1).max(32000),
    model: z.string().max(64).optional(),
    thinkingUsed: z.boolean().optional(),
    activatedNodes: z.array(z.string()).optional(),
    attachments: z
      .array(z.object({ name: z.string(), type: z.string(), mimeType: z.string().optional() }))
      .optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid message payload.');
  try {
    const saved = await appendConversationTurn(req.user!.uid, {
      conversationKey: String(req.params.key),
      ...parsed.data,
    });
    return res.status(201).json(saved);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to store conversation message.');
  }
});

apiRouter.delete('/conversations/:key', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await deleteConversation(req.user!.uid, String(req.params.key));
    if (!deleted) return sendError(res, 404, 'Conversation not found.');
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to delete conversation.');
  }
});

// 10. Habits, Smart Timer Sessions, User Settings, Backup Export
apiRouter.get('/habits', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await listHabits(req.user!.uid);
    return res.json({ habits: rows });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to load habits.');
  }
});

apiRouter.post('/habits', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    habitKey: z.string().max(100).optional(),
    title: z.string().min(1).max(280),
    category: z.string().max(48).optional(),
    completed: z.boolean().optional(),
    streak: z.number().int().min(0).max(99999).optional(),
    dueTime: z.string().max(32).optional(),
    reminderEnabled: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid habit payload.');
  try {
    const habit = await upsertHabit(req.user!.uid, parsed.data);
    return res.status(201).json({ habit });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to save habit.');
  }
});

apiRouter.delete('/habits/:key', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await deleteHabit(req.user!.uid, String(req.params.key));
    if (!deleted) return sendError(res, 404, 'Habit not found.');
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to delete habit.');
  }
});

apiRouter.get('/timer-sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sessions = await listTimerSessions(req.user!.uid);
    return res.json({ sessions });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to load timer sessions.');
  }
});

apiRouter.post('/timer-sessions', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    mode: z.string().max(32).default('focus'),
    durationSeconds: z.number().int().min(1).max(86400),
    completedSeconds: z.number().int().min(0).max(86400),
    status: z.string().max(32).default('completed'),
    label: z.string().max(120).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid timer session payload.');
  try {
    const session = await createTimerSession(req.user!.uid, parsed.data);
    return res.status(201).json({ session });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to log timer session.');
  }
});

apiRouter.get('/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const settings = await getUserSettingsRecord(req.user!.uid);
    return res.json({ settings });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to load settings.');
  }
});

apiRouter.put('/settings', requireAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    settingsJson: z.record(z.string(), z.unknown()).default({}),
    voiceSettingsJson: z.record(z.string(), z.unknown()).default({}),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid settings payload.');
  try {
    const settings = await saveUserSettingsRecord(
      req.user!.uid,
      parsed.data.settingsJson,
      parsed.data.voiceSettingsJson
    );
    return res.json({ settings });
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to save settings.');
  }
});

apiRouter.get('/export', requireAuth, async (req: AuthRequest, res) => {
  try {
    const backup = await exportFullArchivexBackup(req.user!.uid);
    return res.json(backup);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Failed to export ARCHIVEX backup.');
  }
});

// 11. Modular Server-Side AI Chat & Voice Transcription
const aiChatSchema = z.object({
  prompt: z.string().min(1).max(20000),
  conversationKey: z.string().max(120).optional(),
  honorific: z.string().max(64).optional(),
  deepThink: z.boolean().optional(),
  quickMode: z.boolean().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      })
    )
    .max(20)
    .optional(),
  localNodesContext: z.string().max(6000).optional(),
  providerId: z.string().max(40).optional(),
  allowAutoFailover: z.boolean().optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().max(240),
        mimeType: z.string().max(120).optional(),
        base64Data: z.string().max(8_000_000).optional(),
        textExcerpt: z.string().max(12000).optional(),
      })
    )
    .max(4)
    .optional(),
});

// 11A. Free-Tier Multi-Provider Quota Monitor & Priority Arrangement
apiRouter.get('/ai/providers', optionalAuth, (req: AuthRequest, res) => {
  const userKey = req.user?.uid || 'guest';
  return res.json(getProviderQuotaSnapshot(userKey));
});

apiRouter.put('/ai/providers/preferences', optionalAuth, (req: AuthRequest, res) => {
  const schema = z.object({
    priorityOrder: z.array(z.string().max(40)).optional(),
    enabled: z.record(z.string(), z.boolean()).optional(),
    selectedProviderId: z.string().max(40).optional(),
    switchMode: z.enum(['auto', 'recommend']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid provider preferences payload.');
  const userKey = req.user?.uid || 'guest';
  updateUserRoutingPrefs(userKey, parsed.data);
  return res.json(getProviderQuotaSnapshot(userKey));
});

apiRouter.post('/ai/providers/switch', optionalAuth, (req: AuthRequest, res) => {
  const schema = z.object({ providerId: z.string().min(1).max(40) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid providerId.');
  const userKey = req.user?.uid || 'guest';
  updateUserRoutingPrefs(userKey, { selectedProviderId: parsed.data.providerId });
  return res.json(getProviderQuotaSnapshot(userKey));
});

apiRouter.post('/ai/chat', optionalAuth, async (req: AuthRequest, res) => {
  const parsed = aiChatSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'Invalid AI chat request.', parsed.error.flatten());
  }

  const uid = req.user?.uid;
  const userKey = uid || 'guest';
  const conversationKey = parsed.data.conversationKey || `conv-session-${Date.now()}`;
  const observability = createAiObservabilityContext({
    sessionId: conversationKey,
    ...(uid ? { distinctId: uid } : {}),
  });

  let memoryContext = '';
  let conversationContext = '';
  const activatedNodeKeys: string[] = [];

  if (uid) {
    try {
      const [semNodes, pastTurns] = await Promise.all([
        semanticSearchKnowledgeNodes(uid, parsed.data.prompt, 6, observability),
        retrieveRelevantPastConversations(uid, parsed.data.prompt, 4, observability),
      ]);
      if (semNodes.results.length > 0) {
        memoryContext = semNodes.results
          .map((n) => {
            activatedNodeKeys.push(n.nodeKey);
            return `- ${n.label} [${n.verificationStatus}, sim=${n.similarity.toFixed(2)}]: ${n.content}`;
          })
          .join('\n');
      }
      if (pastTurns.length > 0) {
        conversationContext = pastTurns
          .map((t) => `- [${t.sender}] ${t.content.slice(0, 240)}`)
          .join('\n');
      }
    } catch (err) {
      console.warn('Semantic retrieval skipped:', (err as Error)?.message || err);
    }
  }

  const estimatedTokens = estimateTokenCount(parsed.data.prompt + memoryContext + conversationContext) + 500;
  const prefsSnapshot = getProviderQuotaSnapshot(userKey);
  const routingDecision = selectBestAvailableProvider(userKey, [], Date.now(), estimatedTokens);

  // HARD FREE-TIER STOP: never exceed free tier! Throw warning recommendation instead of overrunning cap
  if (
    prefsSnapshot.switchMode === 'recommend' &&
    routingDecision.needsSwitchPrompt &&
    routingDecision.recommendedNext &&
    !parsed.data.providerId &&
    !parsed.data.allowAutoFailover
  ) {
    return res.json({
      reply: '',
      model: routingDecision.primary?.modelId || 'gemini-4-hydrogen',
      thinkingLevel: 'MEDIUM',
      provider: 'rate-limit-recommendation',
      toolInvocations: [],
      conversationKey,
      activatedNodes: activatedNodeKeys,
      fallback: false,
      switchRecommendation: {
        currentProvider: routingDecision.primary,
        recommendedProvider: routingDecision.recommendedNext,
        cooldownRemainingSec: routingDecision.primary?.cooldownRemainingSec || 30,
        reason: routingDecision.reason,
        warningType: 'HARD_STOP_PREVENT_EXCEED',
      },
      quotaSnapshot: getProviderQuotaSnapshot(userKey),
    });
  }

  const orderedCandidates = [
    ...(parsed.data.providerId ? [parsed.data.providerId] : []),
    ...(routingDecision.primary ? [routingDecision.primary.id] : []),
    ...prefsSnapshot.providers
      .filter((p) => p.enabled && p.configured && (p.status === 'READY' || p.status === 'LOW_QUOTA'))
      .map((p) => p.id),
  ].filter((id, idx, arr) => arr.indexOf(id) === idx);

  const failoverTrail: Array<{ providerId: string; status: string; reason?: string }> = [];
  let aiResult: Awaited<ReturnType<typeof generateBarbiChatTurn>> | null = null;
  let activeProviderId = orderedCandidates[0] || 'gemini';

  for (const candidateId of orderedCandidates) {
    activeProviderId = candidateId;
    try {
      if (candidateId === 'gemini') {
        const gRes = await generateBarbiChatTurn({
          prompt: parsed.data.prompt,
          honorific: parsed.data.honorific,
          history: parsed.data.history,
          memoryContext,
          conversationContext,
          graphContext: parsed.data.localNodesContext,
          attachments: parsed.data.attachments,
          deepThink: parsed.data.deepThink,
          quickMode: parsed.data.quickMode,
          observability,
          onToolCall: uid
            ? async (fnName, args) => {
                if (fnName === 'save_archivex_memory') {
                  const saved = await createOrUpdateKnowledgeNode(uid, {
                    label: String(args.label || 'Captured Insight'),
                    content: String(args.content || parsed.data.prompt),
                    category: typeof args.category === 'string' ? args.category : 'KNOWLEDGE',
                    domain: typeof args.domain === 'string' ? args.domain : undefined,
                    source: 'BARBI_TOOL_CALL',
                    verificationStatus: 'USER_REPORTED',
                  }, { observability });
                  return {
                    saved: true,
                    nodeKey: saved.node.nodeKey,
                    contradiction: saved.detectedContradiction,
                  };
                }
                if (fnName === 'create_productivity_habit') {
                  const habit = await upsertHabit(uid, {
                    title: String(args.title || 'Follow-up Engineering Action'),
                    category: typeof args.category === 'string' ? args.category : 'professional',
                    completed: false,
                    streak: 0,
                  });
                  return { created: true, habitKey: habit.habitKey, title: habit.title };
                }
                return { ok: false, reason: 'Unknown tool' };
              }
            : undefined,
        });
        if (gRes.reply) {
          aiResult = gRes;
          failoverTrail.push({ providerId: 'gemini', status: 'succeeded' });
          break;
        }
        failoverTrail.push({ providerId: 'gemini', status: 'skipped', reason: 'Empty reply or key missing' });
      } else {
        const systemInstruction = [
          `You are B.A.R.B.I. (Brilliant Adaptive Reasoning Brain Interface), the personal cognitive AI operating system of Treasure Trinity Zulu.`,
          `Address the user respectfully as "${parsed.data.honorific || 'Chief Engineer'}" or "Treasure".`,
          memoryContext ? `[ARCHIVEX Persistent Memories]\n${memoryContext}` : '',
          conversationContext ? `[Retrieved Prior Conversations]\n${conversationContext}` : '',
          parsed.data.localNodesContext ? `[Active Knowledge Graph]\n${parsed.data.localNodesContext}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const extRes = await callOpenAiCompatibleProvider({
          providerId: candidateId,
          systemInstruction,
          prompt: parsed.data.prompt,
          history: parsed.data.history,
          observability,
        });
        aiResult = {
          reply: extRes.reply,
          model: `${candidateId}:${extRes.model}`,
          thinkingLevel: 'MEDIUM',
          provider: 'gemini',
          toolInvocations: [],
        };
        failoverTrail.push({ providerId: candidateId, status: 'succeeded' });
        break;
      }
    } catch (err) {
      failoverTrail.push({
        providerId: candidateId,
        status: 'failed',
        reason: (err as Error)?.message || 'error',
      });
      if (prefsSnapshot.switchMode === 'recommend' && !parsed.data.allowAutoFailover) {
        break;
      }
    }
  }

  if (aiResult && aiResult.reply) {
    if (uid) {
      try {
        await appendConversationTurn(uid, {
          conversationKey,
          sender: 'user',
          content: parsed.data.prompt,
          model: aiResult.model,
          activatedNodes: activatedNodeKeys,
          observability,
        });
        await appendConversationTurn(uid, {
          conversationKey,
          sender: 'barbi',
          content: aiResult.reply,
          model: aiResult.model,
          thinkingUsed: aiResult.thinkingLevel !== 'LOW',
          activatedNodes: activatedNodeKeys,
          observability,
        });
      } catch (persistErr) {
        console.warn('Conversation turn persistence warning:', persistErr);
      }
    }

    const postDecision = selectBestAvailableProvider(userKey);
    return res.json({
      ...aiResult,
      activeProviderId,
      failoverTrail,
      quotaSnapshot: getProviderQuotaSnapshot(userKey),
      ...(postDecision.lowQuotaWarning && postDecision.recommendedNext
        ? {
            lowQuotaWarning: {
              activeProvider: postDecision.primary,
              recommendedNext: postDecision.recommendedNext,
              reason: postDecision.reason,
            },
          }
        : {}),
      conversationKey,
      activatedNodes: activatedNodeKeys,
      fallback: false,
    });
  }

  const postFailDecision = selectBestAvailableProvider(userKey);
  return res.json({
    reply: '',
    model: 'gemini-4-hydrogen',
    thinkingLevel: 'HIGH',
    provider: 'local-archivex-fallback',
    activeProviderId,
    failoverTrail,
    quotaSnapshot: getProviderQuotaSnapshot(userKey),
    toolInvocations: [],
    conversationKey,
    activatedNodes: activatedNodeKeys,
    fallback: true,
    ...(postFailDecision.needsSwitchPrompt && postFailDecision.recommendedNext
      ? {
          switchRecommendation: {
            currentProvider: postFailDecision.primary,
            recommendedProvider: postFailDecision.recommendedNext,
            cooldownRemainingSec: postFailDecision.primary?.cooldownRemainingSec || 60,
            reason: postFailDecision.reason,
          },
        }
      : {}),
  });
});

const transcribeSchema = z.object({
  audioBase64: z.string().min(16).max(12_000_000),
  mimeType: z.string().max(100).default('audio/webm'),
});

apiRouter.post('/ai/transcribe', optionalAuth, async (req, res) => {
  const parsed = transcribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'Invalid audio payload.');
  }
  if (!hasConfiguredGeminiKey()) {
    return res.status(503).json({
      error: 'Server audio transcription unavailable without configured GEMINI_API_KEY.',
    });
  }
  try {
    const transcript = await transcribeAudioBuffer(
      parsed.data.audioBase64,
      parsed.data.mimeType,
      createAiObservabilityContext({
        sessionId: `transcription-${Date.now()}`,
        ...(req.user?.uid ? { distinctId: req.user.uid } : {}),
      })
    );
    return res.json({ transcript });
  } catch (err) {
    return sendError(res, 502, (err as Error)?.message || 'Audio transcription failed.');
  }
});

// 12. R.E.A. Platform / Website Study, Agent Forge & System Builder + Hosting
apiRouter.post('/rea/study-url', optionalAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    target: z.string().min(2).max(1000),
    notes: z.string().max(4000).optional(),
    allowAutoFailover: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid platform/URL study target.');
  try {
    const userKey = req.user?.uid || 'guest';
    const out = await studyExternalPlatform({ userKey, ...parsed.data });
    return res.json(out);
  } catch (err) {
    return sendError(res, 400, (err as Error)?.message || 'Platform study failed.');
  }
});

apiRouter.post('/rea/build-agent', optionalAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    prompt: z.string().min(4).max(4000),
    allowAutoFailover: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid agent prompt.');
  try {
    const userKey = req.user?.uid || 'guest';
    const out = await buildCustomAgentBlueprint({ userKey, ...parsed.data });
    return res.json(out);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Agent forge failed.');
  }
});

apiRouter.post('/rea/build-system', optionalAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    systemName: z.string().min(2).max(120),
    prompt: z.string().min(5).max(8000),
    allowAutoFailover: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Invalid system forge specification.');
  try {
    const userKey = req.user?.uid || 'guest';
    const out = await buildAndHostSystemBundle({ userKey, ...parsed.data });
    return res.json(out);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'System forge failed.');
  }
});

apiRouter.get('/rea/hosted', (_req, res) => {
  return res.json({ hostedApps: listHostedSystems() });
});

// 13. NotebookLM-Style Study Guide & Animated Explainer Video Storyboard Studio
apiRouter.post('/studio/generate-study-pack', optionalAuth, async (req: AuthRequest, res) => {
  const schema = z.object({
    topicTitle: z.string().min(2).max(200),
    materialText: z.string().min(20).max(20000),
    allowAutoFailover: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'Provide a topic title and at least 20 characters of study material.');
  try {
    const userKey = req.user?.uid || 'guest';
    const out = await generateNotebookStudyPack({ userKey, ...parsed.data });
    return res.json(out);
  } catch (err) {
    return sendError(res, 500, (err as Error)?.message || 'Study Studio generation failed.');
  }
});
