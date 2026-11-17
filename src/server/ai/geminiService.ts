import { GoogleGenAI, ThinkingLevel, Type, type FunctionDeclaration } from '@google/genai';
import { deterministicEmbed768, VECTOR_DIMENSIONS } from '../../lib/vectorMath.ts';
import {
  captureAiToolSpan,
  captureManualAiEmbedding,
  captureManualAiGeneration,
  type AiObservabilityContext,
} from './observability.ts';
import { selectAiRoutingConfig, type BarbiThinkingMode } from './complexity.ts';
import {
  estimateTokenCount,
  markProviderRateLimited,
  recordProviderUsage,
} from './providerRegistry.ts';

let _aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!_aiClient) {
    const options = {
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    };
    _aiClient = new GoogleGenAI(options);
  }
  return _aiClient;
}

export function hasConfiguredGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 8);
}

function mapThinkingLevel(level: BarbiThinkingMode): ThinkingLevel {
  switch (level) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'HIGH':
      return ThinkingLevel.HIGH;
    case 'XHIGH':
      return ThinkingLevel.XHIGH;
    default:
      return ThinkingLevel.HIGH;
  }
}

interface GeminiGenerationResponse {
  text?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

async function runObservedGeminiGeneration<T extends GeminiGenerationResponse>(params: {
  context?: AiObservabilityContext;
  model: string;
  input: Array<{ role: string; content: string }>;
  execute: () => Promise<T>;
}): Promise<T> {
  const startMs = Date.now();
  try {
    const response = await params.execute();
    const output = response.text || '';
    captureManualAiGeneration({
      context: params.context,
      provider: 'google',
      model: params.model,
      input: params.input,
      output,
      inputTokens:
        response.usageMetadata?.promptTokenCount ||
        estimateTokenCount(params.input.map((message) => message.content).join('\n')),
      outputTokens:
        response.usageMetadata?.candidatesTokenCount || estimateTokenCount(output),
      latencyMs: Date.now() - startMs,
    });
    return response;
  } catch (error) {
    captureManualAiGeneration({
      context: params.context,
      provider: 'google',
      model: params.model,
      input: params.input,
      output: '',
      inputTokens: estimateTokenCount(params.input.map((message) => message.content).join('\n')),
      outputTokens: 0,
      latencyMs: Date.now() - startMs,
      error: (error as Error)?.message || 'Gemini request failed',
    });
    throw error;
  }
}

export async function generateEmbedding768(
  text: string,
  observability?: AiObservabilityContext
): Promise<{
  vector: number[];
  provider: 'gemini-embedding-2' | 'deterministic-fallback';
}> {
  const clean = String(text || '').trim();
  if (!clean) {
    return { vector: deterministicEmbed768('empty'), provider: 'deterministic-fallback' };
  }

  const ai = getAiClient();
  if (!ai) {
    return { vector: deterministicEmbed768(clean), provider: 'deterministic-fallback' };
  }

  const embeddingStartMs = Date.now();
  try {
    const res = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: clean.slice(0, 4000),
      config: {
        outputDimensionality: VECTOR_DIMENSIONS,
      },
    });
    captureManualAiEmbedding({
      context: observability,
      provider: 'google',
      model: 'gemini-embedding-2',
      input: clean.slice(0, 4000),
      inputTokens: estimateTokenCount(clean.slice(0, 4000)),
      latencyMs: Date.now() - embeddingStartMs,
    });
    const values = res?.embeddings?.[0]?.values;
    if (Array.isArray(values) && values.length === VECTOR_DIMENSIONS) {
      return { vector: values, provider: 'gemini-embedding-2' };
    }
  } catch (err) {
    captureManualAiEmbedding({
      context: observability,
      provider: 'google',
      model: 'gemini-embedding-2',
      input: clean.slice(0, 4000),
      inputTokens: estimateTokenCount(clean.slice(0, 4000)),
      latencyMs: Date.now() - embeddingStartMs,
      error: (err as Error)?.message || 'Gemini embedding failed',
    });
    console.warn('Gemini embedding fallback engaged:', (err as Error)?.message || err);
  }

  return { vector: deterministicEmbed768(clean), provider: 'deterministic-fallback' };
}

export interface ChatAttachmentInput {
  name: string;
  mimeType?: string;
  base64Data?: string;
  textExcerpt?: string;
}

export interface ChatTurnInput {
  prompt: string;
  honorific?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  memoryContext?: string;
  graphContext?: string;
  conversationContext?: string;
  attachments?: ChatAttachmentInput[];
  deepThink?: boolean;
  quickMode?: boolean;
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  observability?: AiObservabilityContext;
}

export interface ChatTurnResult {
  reply: string;
  model: string;
  thinkingLevel: BarbiThinkingMode;
  provider: 'gemini' | 'local-archivex-fallback';
  toolInvocations: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown> }>;
}

const BARBI_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'save_archivex_memory',
    description: 'Persist an important new fact, milestone, engineering decision, or user preference into the ARCHIVEX knowledge graph.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING, description: 'Short concise node title.' },
        content: { type: Type.STRING, description: 'Full factual memory statement.' },
        category: { type: Type.STRING, description: 'KNOWLEDGE, PROJECT, CREDENTIAL, PREFERENCE, or INSIGHT.' },
        domain: { type: Type.STRING, description: 'mechanical, mechatronics, ai, academic, enterprise, research, personal, or identity.' },
      },
      required: ['label', 'content'],
    },
  },
  {
    name: 'create_productivity_habit',
    description: 'Create a new actionable habit or engineering task in the user Habits & To-Do Matrix.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Task or habit title.' },
        category: { type: Type.STRING, description: 'professional or personal.' },
      },
      required: ['title'],
    },
  },
];

export async function generateBarbiChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const routing = selectAiRoutingConfig({
    prompt: input.prompt,
    attachmentsCount: input.attachments?.length || 0,
    deepThinkRequested: input.deepThink,
    quickMode: input.quickMode,
  });

  const honorific = input.honorific || 'Chief Engineer';
  const systemInstruction = [
    `You are B.A.R.B.I. (Brilliant Adaptive Reasoning Brain Interface), the personal cognitive AI operating system of Treasure Trinity Zulu (Chief Engineer & Founder of ZULUTRONIX (PTY) LTD, CIPC K2025/699918/07; Final-Year BEngTech Mechanical Engineering student at TUT; ECSA Candidate Engineer).`,
    `Address the user respectfully and warmly as "${honorific}" or "Treasure".`,
    `Factual & Epistemic Rigor:`,
    `- Never state planned or aspirational goals (TUT graduation, UJ BEngTechHons 2027, UCT BScEng Mechatronics, Wits MSc AI, PhD Robotics, Pr.Eng., R200,000+/month) as already completed.`,
    `- For engineering, physics, math, and mechatronics problems, follow: What & Where -> How & Why -> Equations -> Modelling -> Verification, using strict SI units and 3 decimal places for final numerical results.`,
    input.memoryContext ? `\n[ARCHIVEX Persistent Memories]\n${input.memoryContext}` : '',
    input.conversationContext ? `\n[Retrieved Prior Conversations]\n${input.conversationContext}` : '',
    input.graphContext ? `\n[Active Knowledge Graph Nodes]\n${input.graphContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const ai = getAiClient();
  if (!ai) {
    return {
      reply: '',
      model: routing.model,
      thinkingLevel: routing.thinkingLevel,
      provider: 'local-archivex-fallback',
      toolInvocations: [],
    };
  }

  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

  if (Array.isArray(input.history)) {
    for (const h of input.history.slice(-8)) {
      if (!h.content?.trim()) continue;
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content.slice(0, 4000) }],
      });
    }
  }

  const currentParts: Array<Record<string, unknown>> = [];
  if (Array.isArray(input.attachments)) {
    for (const att of input.attachments.slice(0, 4)) {
      if (att.base64Data && att.mimeType) {
        currentParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.base64Data,
          },
        });
      } else if (att.textExcerpt) {
        currentParts.push({
          text: `[Attached file: ${att.name}]\n${att.textExcerpt.slice(0, 6000)}`,
        });
      }
    }
  }
  currentParts.push({ text: input.prompt });
  contents.push({ role: 'user', parts: currentParts });

  const toolInvocations: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }> = [];

  const startMs = Date.now();
  try {
    const config: Record<string, unknown> = {
      systemInstruction,
      thinkingConfig: {
        thinkingLevel: mapThinkingLevel(routing.thinkingLevel),
      },
    };
    if (input.onToolCall) {
      config.tools = [{ functionDeclarations: BARBI_TOOL_DECLARATIONS }];
    }

    let response = await runObservedGeminiGeneration({
      context: input.observability,
      model: routing.model,
      input: [{ role: 'user', content: input.prompt }],
      execute: () =>
        ai.models.generateContent({
          model: routing.model,
          contents,
          config,
        }),
    });

    // Execute up to 3 function calls if the model chooses to invoke ARCHIVEX / Habit tools
    if (input.onToolCall && response.functionCalls && response.functionCalls.length > 0) {
      const fnResponses: Array<Record<string, unknown>> = [];
      for (const fc of response.functionCalls.slice(0, 3)) {
        const fnName = fc.name || 'unknown';
        const fnArgs = (fc.args || {}) as Record<string, unknown>;
        const toolStartMs = Date.now();
        const result = await input.onToolCall(fnName, fnArgs);
        captureAiToolSpan({
          context: input.observability,
          name: fnName,
          input: fnArgs,
          output: result,
          latencyMs: Date.now() - toolStartMs,
        });
        toolInvocations.push({ name: fnName, args: fnArgs, result });
        fnResponses.push({
          functionResponse: {
            name: fnName,
            response: result,
          },
        });
      }
      const modelCandidateParts = response.candidates?.[0]?.content?.parts || [];
      response = await runObservedGeminiGeneration({
        context: input.observability,
        model: routing.model,
        input: [{ role: 'user', content: input.prompt }],
        execute: () =>
          ai.models.generateContent({
            model: routing.model,
            contents: [
              ...contents,
              { role: 'model', parts: modelCandidateParts as Array<Record<string, unknown>> },
              { role: 'user', parts: fnResponses },
            ],
            config: {
              systemInstruction,
              thinkingConfig: {
                thinkingLevel: mapThinkingLevel(routing.thinkingLevel),
              },
            },
          }),
      });
    }

    const text = (response.text || '').trim();
    const totalTokens =
      response.usageMetadata?.totalTokenCount ||
      estimateTokenCount(systemInstruction + input.prompt + text);
    recordProviderUsage('gemini', {
      tokensUsed: totalTokens,
      latencyMs: Date.now() - startMs,
    });

    if (!text) {
      return {
        reply: '',
        model: routing.model,
        thinkingLevel: routing.thinkingLevel,
        provider: 'local-archivex-fallback',
        toolInvocations,
      };
    }

    return {
      reply: text,
      model: routing.model,
      thinkingLevel: routing.thinkingLevel,
      provider: 'gemini',
      toolInvocations,
    };
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err);
    if (/429|quota|rate|resource_exhausted/i.test(errMsg)) {
      markProviderRateLimited('gemini', errMsg, 60);
    }
    console.error('Gemini generateBarbiChatTurn error:', errMsg);
    throw err;
  }
}

export async function transcribeAudioBuffer(
  base64Audio: string,
  mimeType: string,
  observability?: AiObservabilityContext
): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('Server transcription requires a configured GEMINI_API_KEY.');
  }
  const res = await runObservedGeminiGeneration({
    context: observability,
    model: 'gemini-3.5-transcribe',
    input: [{ role: 'user', content: '[audio transcription request]' }],
    execute: () =>
      ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'audio/webm',
                data: base64Audio,
              },
            },
            {
              text: 'Transcribe the spoken audio accurately as plain text.',
            },
          ],
        },
      }),
  });
  return (res.text || '').trim();
}
