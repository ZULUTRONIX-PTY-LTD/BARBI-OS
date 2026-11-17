import { randomUUID } from 'node:crypto';
import { PostHog } from 'posthog-node';

const posthogKey = process.env.VITE_POSTHOG_KEY;
const posthogHost = process.env.VITE_POSTHOG_HOST;

if ((!posthogKey || !posthogHost) && process.env.NODE_ENV !== 'production') {
  console.warn(
    !posthogKey
      ? 'VITE_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_KEY is configured'
      : 'VITE_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once VITE_POSTHOG_HOST is configured'
  );
}

export const serverPosthog =
  posthogKey && posthogHost
    ? new PostHog(posthogKey, {
        host: posthogHost,
        privacyMode: false,
      })
    : null;

export interface AiObservabilityContext {
  sessionId: string;
  traceId: string;
  distinctId?: string;
}

function sanitizeSessionId(sessionId: string): string {
  const safe = sessionId.replace(/[^a-zA-Z0-9\-_~.@()!' :|]/g, '-').slice(0, 200);
  return safe || `ai-session-${randomUUID()}`;
}

export function createAiObservabilityContext(params: {
  sessionId: string;
  distinctId?: string;
}): AiObservabilityContext {
  return {
    sessionId: sanitizeSessionId(params.sessionId),
    traceId: randomUUID(),
    distinctId: params.distinctId,
  };
}

function captureDistinctId(context: AiObservabilityContext): string {
  return context.distinctId || `ai-session:${context.sessionId}`;
}

export function captureAiToolSpan(params: {
  context?: AiObservabilityContext;
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  latencyMs: number;
}): void {
  if (!serverPosthog || !params.context) return;
  try {
    serverPosthog.capture({
      distinctId: captureDistinctId(params.context),
      event: '$ai_span',
      properties: {
        $ai_trace_id: params.context.traceId,
        $ai_session_id: params.context.sessionId,
        $ai_span_id: randomUUID(),
        $ai_span_name: params.name,
        $ai_input_state: params.input,
        $ai_output_state: params.output,
        $ai_latency: params.latencyMs / 1000,
        ...(params.context.distinctId ? {} : { $process_person_profile: false }),
      },
    });
  } catch {
    // AI observability must never affect tool execution.
  }
}

export function captureManualAiGeneration(params: {
  context?: AiObservabilityContext;
  provider: string;
  model: string;
  input: Array<{ role: string; content: string }>;
  output?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  error?: string;
}): void {
  if (!serverPosthog || !params.context) return;
  try {
    serverPosthog.capture({
      distinctId: captureDistinctId(params.context),
      event: '$ai_generation',
      properties: {
        $ai_trace_id: params.context.traceId,
        $ai_session_id: params.context.sessionId,
        $ai_model: params.model,
        $ai_provider: params.provider,
        $ai_input: params.input,
        $ai_output_choices: [{ role: 'assistant', content: params.output || '' }],
        $ai_input_tokens: params.inputTokens ?? 0,
        $ai_output_tokens: params.outputTokens ?? 0,
        $ai_latency: params.latencyMs / 1000,
        ...(params.error ? { $ai_is_error: true, $ai_error: params.error } : {}),
        ...(params.context.distinctId ? {} : { $process_person_profile: false }),
      },
    });
  } catch {
    // AI observability must never affect the provider response.
  }
}

export function captureManualAiEmbedding(params: {
  context?: AiObservabilityContext;
  provider: string;
  model: string;
  input: string;
  inputTokens: number;
  latencyMs: number;
  error?: string;
}): void {
  if (!serverPosthog || !params.context) return;
  try {
    serverPosthog.capture({
      distinctId: captureDistinctId(params.context),
      event: '$ai_embedding',
      properties: {
        $ai_trace_id: params.context.traceId,
        $ai_session_id: params.context.sessionId,
        $ai_model: params.model,
        $ai_provider: params.provider,
        $ai_input: params.input,
        $ai_input_tokens: params.inputTokens,
        $ai_latency: params.latencyMs / 1000,
        ...(params.error ? { $ai_is_error: true, $ai_error: params.error } : {}),
        ...(params.context.distinctId ? {} : { $process_person_profile: false }),
      },
    });
  } catch {
    // AI observability must never affect the provider response.
  }
}
