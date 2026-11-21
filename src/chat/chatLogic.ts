export type ChatRole = 'user' | 'assistant';

export interface ChatAttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  base64Data?: string;
  textExcerpt?: string;
}

export interface ChatToolInvocation {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface ChatGroundingSource {
  title: string;
  uri: string;
  domain: string;
}

export interface ChatGroundingMetadata {
  webSearchQueries: string[];
  sources: ChatGroundingSource[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  model?: string;
  providerId?: string;
  thinkingLevel?: string;
  latencyMs?: number;
  attachments?: Array<{ name: string; mimeType: string }>;
  activatedNodes?: string[];
  toolInvocations?: ChatToolInvocation[];
  grounding?: ChatGroundingMetadata;
  error?: string;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ChatProviderOption {
  id: string;
  name: string;
  modelId: string;
  configured: boolean;
  enabled: boolean;
  status: string;
  remainingQuotaPct: number;
  remainingTokensToday: number;
}

export type MarkdownInlineNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'link'; label: string; href: string };

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string };

export interface ParsedSseEvent {
  event: string;
  data: unknown;
}

export const STARTER_PROMPTS: Array<{ title: string; subtitle: string; prompt: string }> = [
  {
    title: 'Live docs & releases',
    subtitle: 'Google Search grounded current tech info',
    prompt: 'What are the latest stable Node.js LTS and TypeScript release versions and key documentation highlights?',
  },
  {
    title: 'Write & review code',
    subtitle: 'Clean TypeScript, Python or C++',
    prompt: 'Write a clean TypeScript async retry helper with exponential backoff and jitter.',
  },
  {
    title: 'System architecture',
    subtitle: 'Trade-offs, reliability & design',
    prompt: 'Design a resilient edge-to-cloud telemetry pipeline for ESP32-S3 nodes with offline buffering.',
  },
  {
    title: 'Explain a concept clearly',
    subtitle: 'First principles, equations & intuition',
    prompt: 'Explain how PID controllers work with a practical robotics example and key equations.',
  },
];

export function createChatSession(nowIso = new Date().toISOString()): ChatSession {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id: `conv-${unique}`,
    title: 'New chat',
    createdAt: nowIso,
    updatedAt: nowIso,
    messages: [],
  };
}

export function deriveSessionTitle(prompt: string, maxLen = 48): string {
  const cleaned = String(prompt || '')
    .replace(/\s+/g, ' ')
    .replace(/^[#>*`-\s]+/, '')
    .trim();
  if (!cleaned) return 'New chat';
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(8, maxLen - 1)).trimEnd()}…`;
}

export function appendMessageToSession(
  session: ChatSession,
  message: ChatMessage,
  nowIso = new Date().toISOString()
): ChatSession {
  const isFirstUserMsg =
    message.role === 'user' && !session.messages.some((m) => m.role === 'user');
  return {
    ...session,
    title: isFirstUserMsg ? deriveSessionTitle(message.content) : session.title,
    updatedAt: nowIso,
    messages: [...session.messages, message],
  };
}

export function buildApiHistory(
  messages: ChatMessage[],
  maxTurns = 12
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => !m.isStreaming && !m.error && m.content.trim().length > 0)
    .slice(-maxTurns)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 6000),
    }));
}

export function serializeSessionsForStorage(sessions: ChatSession[], maxSessions = 25): string {
  const safe = sessions.slice(0, maxSessions).map((s) => ({
    ...s,
    messages: s.messages
      .filter((m) => !m.isStreaming)
      .slice(-60)
      .map((m) => ({
        ...m,
        isStreaming: false,
      })),
  }));
  return JSON.stringify(safe);
}

export function parseStoredSessions(raw: string | null | undefined): ChatSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is ChatSession =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          Array.isArray(item.messages)
      )
      .map((s) => ({
        id: s.id,
        title: s.title || 'New chat',
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
        updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : new Date().toISOString(),
        messages: s.messages
          .filter(
            (m): m is ChatMessage =>
              Boolean(m) &&
              typeof m.id === 'string' &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.content === 'string'
          )
          .map((m) => ({
            ...m,
            grounding: extractGroundingMetadata(m.grounding) ?? undefined,
            isStreaming: false,
          })),
      }));
  } catch {
    return [];
  }
}

export function formatApiErrorMessage(rawError: unknown): string {
  const str =
    typeof rawError === 'string'
      ? rawError
      : rawError instanceof Error
        ? rawError.message
        : String(rawError || '');

  const trimmed = str.trim();
  if (!trimmed) return 'The AI provider could not complete this request. Please retry.';

  // Extract nested Google/OpenAI JSON error payloads if present
  const jsonStart = trimmed.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        error?: { message?: string; code?: number; status?: string } | string;
        message?: string;
      };
      if (typeof parsed?.error === 'object' && parsed.error?.message) {
        return parsed.error.message;
      }
      if (typeof parsed?.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim();
      }
      if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        return parsed.message.trim();
      }
    } catch {
      // fall through
    }
  }

  if (/AbortError|aborted/i.test(trimmed)) {
    return 'Generation stopped.';
  }
  if (/403|PERMISSION_DENIED|API_KEY_INVALID|401/i.test(trimmed)) {
    return 'API key authentication failed. Check your configured key in Settings > Secrets or switch to another active provider.';
  }
  if (/429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(trimmed)) {
    return 'Rate limit or free-tier quota reached on the selected provider. Switch providers or try again shortly.';
  }
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(trimmed)) {
    return 'The model is temporarily experiencing high demand. Please retry or select another provider.';
  }
  return trimmed.length > 260 ? `${trimmed.slice(0, 257)}...` : trimmed;
}

export function parseSseChunkBuffer(
  existingBuffer: string,
  incomingChunk: string
): { events: ParsedSseEvent[]; remainder: string } {
  const combined = (existingBuffer + incomingChunk).replace(/\r\n/g, '\n');
  const frames = combined.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: ParsedSseEvent[] = [];

  for (const frame of frames) {
    if (!frame.trim()) continue;
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) continue;
    const rawData = dataLines.join('\n');
    try {
      events.push({ event: eventName, data: JSON.parse(rawData) });
    } catch {
      events.push({ event: eventName, data: rawData });
    }
  }

  return { events, remainder };
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const normalized = String(markdown || '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block
    const fenceMatch = trimmed.match(/^```([\w.+-]*)$/);
    if (fenceMatch) {
      const language = fenceMatch[1] || 'text';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume closing ```
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // Headings (#, ##, ###)
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      i += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    // Unordered list
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Paragraph (gather contiguous non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
    }
  }

  return blocks;
}

export function parseInlineMarkdown(text: string): MarkdownInlineNode[] {
  const input = String(text || '');
  const nodes: MarkdownInlineNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIdx) {
      nodes.push({ type: 'text', value: input.slice(lastIdx, match.index) });
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push({ type: 'code', value: token.slice(1, -1) });
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push({ type: 'bold', value: token.slice(2, -2) });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push({ type: 'italic', value: token.slice(1, -1) });
    } else if (match[2] && match[3]) {
      nodes.push({ type: 'link', label: match[2], href: match[3] });
    } else {
      nodes.push({ type: 'text', value: token });
    }
    lastIdx = pattern.lastIndex;
  }

  if (lastIdx < input.length) {
    nodes.push({ type: 'text', value: input.slice(lastIdx) });
  }

  return nodes.length > 0 ? nodes : [{ type: 'text', value: input }];
}

export function formatLatencyLabel(ms?: number): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function sanitizeExternalHttpUrl(rawUri: unknown): string | null {
  if (typeof rawUri !== 'string') return null;
  const trimmed = rawUri.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export function formatSourceHost(uri: string, fallbackTitle?: string): string {
  try {
    const host = new URL(uri).hostname.replace(/^www\./i, '').toLowerCase();
    const isGoogleRedirectHost =
      host === 'vertexaisearch.cloud.google.com' ||
      host.endsWith('.googleusercontent.com');
    if (!isGoogleRedirectHost && host) {
      return host;
    }
  } catch {
    // fall through to title parsing
  }

  const titleClean = String(fallbackTitle || '').trim();
  if (titleClean) {
    const domainMatch = titleClean.match(/\b([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+)\b/i);
    if (domainMatch?.[1]) {
      return domainMatch[1].replace(/^www\./i, '').toLowerCase();
    }
  }
  return 'web';
}

export function extractGroundingMetadata(raw: unknown): ChatGroundingMetadata | null {
  if (!raw || typeof raw !== 'object') return null;

  let metaObj: Record<string, unknown> = raw as Record<string, unknown>;
  if (Array.isArray(raw)) {
    const first = raw[0] as Record<string, unknown> | undefined;
    if (!first || typeof first !== 'object' || !first.groundingMetadata) return null;
    metaObj = first.groundingMetadata as Record<string, unknown>;
  } else if ('groundingMetadata' in metaObj && metaObj.groundingMetadata && typeof metaObj.groundingMetadata === 'object') {
    metaObj = metaObj.groundingMetadata as Record<string, unknown>;
  }

  const seenQueries = new Set<string>();
  const webSearchQueries: string[] = [];
  const rawQueries = metaObj.webSearchQueries;
  if (Array.isArray(rawQueries)) {
    for (const q of rawQueries) {
      if (typeof q !== 'string') continue;
      const trimmed = q.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seenQueries.has(key)) continue;
      seenQueries.add(key);
      webSearchQueries.push(trimmed.slice(0, 180));
      if (webSearchQueries.length >= 8) break;
    }
  }

  const seenUris = new Set<string>();
  const sources: ChatGroundingSource[] = [];

  const pushSource = (rawUri: unknown, rawTitle: unknown, rawDomain?: unknown) => {
    if (sources.length >= 12) return;
    const safeUri = sanitizeExternalHttpUrl(rawUri);
    if (!safeUri) return;
    if (seenUris.has(safeUri)) return;
    seenUris.add(safeUri);

    const titleCandidate = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    const domainCandidate =
      typeof rawDomain === 'string' && rawDomain.trim()
        ? rawDomain.trim().replace(/^www\./i, '').toLowerCase()
        : formatSourceHost(safeUri, titleCandidate);

    const title = (titleCandidate || domainCandidate || safeUri).slice(0, 140);
    sources.push({
      title,
      uri: safeUri,
      domain: domainCandidate || 'web',
    });
  };

  if (Array.isArray(metaObj.groundingChunks)) {
    for (const chunk of metaObj.groundingChunks) {
      if (!chunk || typeof chunk !== 'object') continue;
      const web = (chunk as Record<string, unknown>).web;
      if (!web || typeof web !== 'object') continue;
      const webObj = web as Record<string, unknown>;
      pushSource(webObj.uri, webObj.title);
    }
  }

  if (Array.isArray(metaObj.sources)) {
    for (const src of metaObj.sources) {
      if (!src || typeof src !== 'object') continue;
      const srcObj = src as Record<string, unknown>;
      pushSource(srcObj.uri, srcObj.title, srcObj.domain);
    }
  }

  if (webSearchQueries.length === 0 && sources.length === 0) {
    return null;
  }

  return {
    webSearchQueries,
    sources,
  };
}

export function mergeGroundingMetadata(
  base?: ChatGroundingMetadata | null,
  incoming?: ChatGroundingMetadata | null
): ChatGroundingMetadata | undefined {
  if (!base && !incoming) return undefined;
  if (!base) return incoming ?? undefined;
  if (!incoming) return base;

  const queries: string[] = [];
  const seenQueries = new Set<string>();
  for (const q of [...base.webSearchQueries, ...incoming.webSearchQueries]) {
    const trimmed = q.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seenQueries.has(key)) continue;
    seenQueries.add(key);
    queries.push(trimmed);
    if (queries.length >= 8) break;
  }

  const sources: ChatGroundingSource[] = [];
  const seenUris = new Set<string>();
  for (const src of [...base.sources, ...incoming.sources]) {
    if (!src.uri || seenUris.has(src.uri)) continue;
    seenUris.add(src.uri);
    sources.push(src);
    if (sources.length >= 12) break;
  }

  if (queries.length === 0 && sources.length === 0) return undefined;
  return {
    webSearchQueries: queries,
    sources,
  };
}

