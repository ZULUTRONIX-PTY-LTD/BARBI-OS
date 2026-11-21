import { GoogleGenAI, ThinkingLevel, Type, type FunctionDeclaration } from '@google/genai';
import { deterministicEmbed768, VECTOR_DIMENSIONS } from '../../lib/vectorMath.ts';
import {
  extractGroundingMetadata,
  mergeGroundingMetadata,
  type ChatGroundingMetadata,
} from '../../chat/chatLogic.ts';
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
    _aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
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

export async function generateEmbedding768(text: string): Promise<{
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

  try {
    const res = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: clean.slice(0, 4000),
      config: {
        outputDimensionality: VECTOR_DIMENSIONS,
      },
    });
    const values = res?.embeddings?.[0]?.values;
    if (Array.isArray(values) && values.length === VECTOR_DIMENSIONS) {
      return { vector: values, provider: 'gemini-embedding-2' };
    }
  } catch (err) {
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
  uiSnapshot?: string;
  attachments?: ChatAttachmentInput[];
  deepThink?: boolean;
  quickMode?: boolean;
  enableGoogleSearch?: boolean;
  onToolCall?: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface ChatTurnResult {
  reply: string;
  model: string;
  thinkingLevel: BarbiThinkingMode;
  provider: 'gemini' | 'local-archivex-fallback';
  toolInvocations: Array<{ name: string; args: Record<string, unknown>; result: Record<string, unknown> }>;
  grounding?: ChatGroundingMetadata;
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

function isTransientGeminiError(errMsg: string): boolean {
  return /503|502|504|UNAVAILABLE|overloaded|high demand|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
    errMsg
  );
}

function clampThinkingForModel(
  model: string,
  level: BarbiThinkingMode
): BarbiThinkingMode {
  if (model === 'gemini-3.1-flash-lite' && level === 'XHIGH') {
    return 'HIGH';
  }
  return level;
}

function applyGeminiToolsConfig(
  config: Record<string, unknown>,
  enableGoogleSearch: boolean,
  hasToolCall: boolean,
  allowHybrid: boolean
): void {
  if (enableGoogleSearch && hasToolCall && allowHybrid) {
    config.tools = [{ googleSearch: {} }, { functionDeclarations: BARBI_TOOL_DECLARATIONS }];
    config.toolConfig = { includeServerSideToolInvocations: true };
  } else if (enableGoogleSearch) {
    config.tools = [{ googleSearch: {} }];
  } else if (hasToolCall) {
    config.tools = [{ functionDeclarations: BARBI_TOOL_DECLARATIONS }];
  }
}

function isToolConfigCompatibilityError(errMsg: string): boolean {
  return /INVALID_ARGUMENT|tool_config|includeServerSideToolInvocations|google_search|function_declarations|Tool use with/i.test(
    errMsg
  );
}

function buildBarbiSystemInstruction(input: ChatTurnInput): string {
  const honorific = input.honorific || 'Chief Engineer';
  const searchGroundingEnabled = input.enableGoogleSearch !== false;
  return [
    `You are B.A.R.B.I. (Brilliant Adaptive Reasoning Brain Interface), an advanced general-purpose AI assistant and the personal cognitive operating system of Treasure Trinity Zulu (Chief Engineer & Founder at ZULUTRO & I (PTY) LTD / ZULUTRONIX (PTY) LTD, CIPC K2025/699918/07; Final-Year BEngTech Mechanical Engineering student at TUT; ECSA Candidate Engineer).`,
    `Communicate naturally, clearly, and helpfully like a world-class large language model. Adapt tone, length, and formatting (clean Markdown, headings, bullet points, and fenced code blocks where useful) to match the user's request. Address the user warmly when appropriate (e.g., "${honorific}" or "Treasure"), without forcing stiff templates on casual or general questions.`,
    searchGroundingEnabled
      ? `Live Web Search Grounding: Google Search grounding is active. Use live web search whenever the user asks about current events, recent news, latest library/framework versions, APIs, or up-to-date technical documentation, and synthesize accurate, date-aware answers.`
      : '',
    `Factual & Epistemic Rigor:`,
    `- Never state planned or aspirational goals (TUT graduation, UJ BEngTechHons 2027, UCT BScEng Mechatronics, Wits MSc AI, PhD Robotics, Pr.Eng., R200,000+/month) as already completed.`,
    `- When solving formal engineering, physics, mathematics, or mechatronics problems, provide clear structured steps, equations, SI units, and verification.`,
    `Live Interface Perception & Control:`,
    `- You can read the exact live B.A.R.B.I. screen state supplied under [Live B.A.R.B.I. Screen State] below. Use it to answer accurately when Treasure asks what is currently visible, open, or active on screen.`,
    `- When Treasure asks you to open a module, close a panel, exit all panels, or change the live UI render (3D sphere theme, visual complexity, rotation speed, Focus Mode, HUD glassmorphism, sphere labels, top controls, camera zoom, or God's Eye optical mode), include one or more machine-executable directives at the very end of your reply (the interface strips them before displaying your message and executes them immediately):`,
    `  * Action directive: [[BARBI_UI_ACTION:{"action":"<action_name>","target":"<optional_panel>","mode":"<optional>","query":"<optional>"}]]`,
    `    Supported actions: open_gods_eye, open_file_system_agent, open_v4_hub, open_fintech, open_rea_forge, open_study_studio, open_power_pmic, open_sphere_config, open_memory_search, open_timer, open_weather, open_maps, open_youtube, open_whatsapp, open_gesture_control, toggle_focus_mode, reset_sphere_orbit, close_panel (with target: active|all|chat|voice|v4_hub|gods_eye|file_system|sphere_config|gesture_nav|rea|study|power|maps|weather|timer|whatsapp|youtube|memory|inspector), close_all_panels, gods_eye_control (mode: standard|flir|nvg|crt).`,
    `  * Render mutation directive: [[BARBI_UI_MUTATE:{"colorTheme":"burnt-amber|solar-copper|cobalt-forge|emerald-circuit|crimson-tactical","visualComplexity":"minimal|balanced|high|ultra","rotationSpeed":1.0,"focusMode":false,"hudGlassPreset":"obsidian|frosted|stealth|luminous","sphereLabelsVisible":true,"topControlsExpanded":true,"cameraAction":"reset|zoom_in|zoom_out","godsEyeOpticalMode":"standard|flir|nvg|crt"}]] (include only the keys to change).`,
    `- Note on God's Eye (Module M11): Both GitHub repositories (bilawalsidhu/gods-eye-view and koala73/worldmonitor) are public, verified, and directly reachable from this workspace, and an interactive 3D God's Eye Spatial Globe viewport is integrated natively. You can open it immediately with open_gods_eye.`,
    input.uiSnapshot ? `\n[Live B.A.R.B.I. Screen State]\n${input.uiSnapshot}` : '',
    input.memoryContext ? `\n[ARCHIVEX Persistent Memories]\n${input.memoryContext}` : '',
    input.conversationContext ? `\n[Retrieved Prior Conversations]\n${input.conversationContext}` : '',
    input.graphContext ? `\n[Active Knowledge Graph Nodes]\n${input.graphContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildGeminiContents(
  input: ChatTurnInput
): Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

  if (Array.isArray(input.history)) {
    for (const h of input.history.slice(-12)) {
      if (!h.content?.trim()) continue;
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content.slice(0, 6000) }],
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
          text: `[Attached file: ${att.name}]\n${att.textExcerpt.slice(0, 8000)}`,
        });
      }
    }
  }
  currentParts.push({ text: input.prompt });
  contents.push({ role: 'user', parts: currentParts });
  return contents;
}

export async function generateBarbiChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const routing = selectAiRoutingConfig({
    prompt: input.prompt,
    attachmentsCount: input.attachments?.length || 0,
    deepThinkRequested: input.deepThink,
    quickMode: input.quickMode,
  });

  const systemInstruction = buildBarbiSystemInstruction(input);
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

  const contents = buildGeminiContents(input);
  const toolInvocations: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }> = [];

  const candidateModels =
    routing.model === 'gemini-4-hydrogen'
      ? ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
      : [routing.model, 'gemini-4-hydrogen'];

  const useGoogleSearch = input.enableGoogleSearch !== false;

  let lastErr: unknown = null;
  for (const modelName of candidateModels) {
    const effectiveLevel = clampThinkingForModel(modelName, routing.thinkingLevel);
    const maxAttempts = modelName === candidateModels[0] ? 2 : 1;
    let allowHybrid = true;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const startMs = Date.now();
      try {
        const config: Record<string, unknown> = {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: mapThinkingLevel(effectiveLevel),
          },
        };
        applyGeminiToolsConfig(config, useGoogleSearch, Boolean(input.onToolCall), allowHybrid);

        let response = await ai.models.generateContent({
          model: modelName,
          contents,
          config,
        });

        let collectedGrounding = extractGroundingMetadata(response.candidates) ?? undefined;

        if (input.onToolCall && response.functionCalls && response.functionCalls.length > 0) {
          const fnResponses: Array<Record<string, unknown>> = [];
          for (const fc of response.functionCalls.slice(0, 3)) {
            const fnName = fc.name || 'unknown';
            const fnArgs = (fc.args || {}) as Record<string, unknown>;
            const result = await input.onToolCall(fnName, fnArgs);
            toolInvocations.push({ name: fnName, args: fnArgs, result });
            fnResponses.push({
              functionResponse: {
                ...(fc.id ? { id: fc.id } : {}),
                name: fnName,
                response: result,
              },
            });
          }
          const modelCandidateParts = response.candidates?.[0]?.content?.parts || [];
          const followUpConfig: Record<string, unknown> = {
            systemInstruction,
            thinkingConfig: {
              thinkingLevel: mapThinkingLevel(effectiveLevel),
            },
          };
          applyGeminiToolsConfig(followUpConfig, useGoogleSearch, false, false);
          response = await ai.models.generateContent({
            model: modelName,
            contents: [
              ...contents,
              { role: 'model', parts: modelCandidateParts as Array<Record<string, unknown>> },
              { role: 'user', parts: fnResponses },
            ],
            config: followUpConfig,
          });
          collectedGrounding = mergeGroundingMetadata(
            collectedGrounding,
            extractGroundingMetadata(response.candidates)
          );
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
            model: modelName,
            thinkingLevel: effectiveLevel,
            provider: 'local-archivex-fallback',
            toolInvocations,
            grounding: collectedGrounding,
          };
        }

        return {
          reply: text,
          model: modelName,
          thinkingLevel: effectiveLevel,
          provider: 'gemini',
          toolInvocations,
          grounding: collectedGrounding,
        };
      } catch (err) {
        lastErr = err;
        const errMsg = (err as Error)?.message || String(err);
        if (
          useGoogleSearch &&
          Boolean(input.onToolCall) &&
          allowHybrid &&
          isToolConfigCompatibilityError(errMsg)
        ) {
          console.warn(`Gemini ${modelName} hybrid tools fallback to pure googleSearch:`, errMsg);
          allowHybrid = false;
          attempt -= 1;
          continue;
        }
        if (/429|quota|rate|resource_exhausted/i.test(errMsg)) {
          markProviderRateLimited('gemini', errMsg, 60);
          console.error('Gemini generateBarbiChatTurn rate-limit:', errMsg);
          throw err;
        }
        if (isTransientGeminiError(errMsg)) {
          console.warn(`Gemini ${modelName} transient error (attempt ${attempt + 1}):`, errMsg);
          if (attempt + 1 < maxAttempts) {
            await new Promise((r) => setTimeout(r, 550 * (attempt + 1)));
            continue;
          }
          break; // try next fallback Gemini model
        }
        console.error('Gemini generateBarbiChatTurn error:', errMsg);
        throw err;
      }
    }
  }

  throw lastErr || new Error('Gemini API request failed.');
}

export async function generateBarbiChatStream(
  input: ChatTurnInput & {
    onChunk: (deltaText: string) => void;
    onGrounding?: (grounding: ChatGroundingMetadata) => void;
    onModelSelected?: (model: string, thinkingLevel: BarbiThinkingMode) => void;
    preferredModel?: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  }
): Promise<ChatTurnResult> {
  const routing = selectAiRoutingConfig({
    prompt: input.prompt,
    attachmentsCount: input.attachments?.length || 0,
    deepThinkRequested: input.deepThink,
    quickMode: input.quickMode,
  });

  const systemInstruction = buildBarbiSystemInstruction(input);
  const ai = getAiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const contents = buildGeminiContents(input);
  const toolInvocations: Array<{
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }> = [];

  const useGoogleSearch = input.enableGoogleSearch !== false;
  const primaryModel = input.preferredModel || routing.model;
  const candidateModels =
    primaryModel === 'gemini-4-hydrogen'
      ? ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']
      : ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'];

  let lastErr: unknown = null;

  for (const modelName of candidateModels) {
    const effectiveLevel = clampThinkingForModel(
      modelName,
      input.deepThink ? routing.thinkingLevel : input.preferredModel === 'gemini-3.1-flash-lite' ? 'LOW' : routing.thinkingLevel
    );
    const startMs = Date.now();
    let allowHybrid = true;

    for (let hybridPass = 0; hybridPass < 2; hybridPass++) {
      let streamedReply = '';
      let collectedGrounding: ChatGroundingMetadata | undefined;
      let lastGroundingSig = '';

      const absorbCandidatesGrounding = (candidates: unknown) => {
        const extracted = extractGroundingMetadata(candidates);
        if (!extracted) return;
        const merged = mergeGroundingMetadata(collectedGrounding, extracted);
        if (!merged) return;
        collectedGrounding = merged;
        const sig = `${merged.webSearchQueries.length}:${merged.sources.map((s) => s.uri).join('|')}`;
        if (sig !== lastGroundingSig) {
          lastGroundingSig = sig;
          input.onGrounding?.(merged);
        }
      };

      try {
        input.onModelSelected?.(modelName, effectiveLevel);

        const config: Record<string, unknown> = {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: mapThinkingLevel(effectiveLevel),
          },
        };
        applyGeminiToolsConfig(config, useGoogleSearch, Boolean(input.onToolCall), allowHybrid);

        const stream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config,
        });

        const collectedFnCalls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> = [];
        const collectedModelParts: Array<Record<string, unknown>> = [];

        for await (const chunk of stream) {
          absorbCandidatesGrounding(chunk.candidates);
          const delta = chunk.text || '';
          if (delta) {
            streamedReply += delta;
            input.onChunk(delta);
          }
          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            for (const fc of chunk.functionCalls) {
              collectedFnCalls.push({
                id: fc.id,
                name: fc.name,
                args: (fc.args || {}) as Record<string, unknown>,
              });
            }
          }
          const candParts = chunk.candidates?.[0]?.content?.parts;
          if (Array.isArray(candParts)) {
            for (const p of candParts) {
              collectedModelParts.push(p as Record<string, unknown>);
            }
          }
        }

        if (input.onToolCall && collectedFnCalls.length > 0) {
          const fnResponses: Array<Record<string, unknown>> = [];
          for (const fc of collectedFnCalls.slice(0, 3)) {
            const fnName = fc.name || 'unknown';
            const fnArgs = fc.args || {};
            const result = await input.onToolCall(fnName, fnArgs);
            toolInvocations.push({ name: fnName, args: fnArgs, result });
            fnResponses.push({
              functionResponse: {
                ...(fc.id ? { id: fc.id } : {}),
                name: fnName,
                response: result,
              },
            });
          }
          const followUpConfig: Record<string, unknown> = {
            systemInstruction,
            thinkingConfig: {
              thinkingLevel: mapThinkingLevel(effectiveLevel),
            },
          };
          applyGeminiToolsConfig(followUpConfig, useGoogleSearch, false, false);
          const followUpStream = await ai.models.generateContentStream({
            model: modelName,
            contents: [
              ...contents,
              { role: 'model', parts: collectedModelParts },
              { role: 'user', parts: fnResponses },
            ],
            config: followUpConfig,
          });
          for await (const chunk of followUpStream) {
            absorbCandidatesGrounding(chunk.candidates);
            const delta = chunk.text || '';
            if (delta) {
              streamedReply += delta;
              input.onChunk(delta);
            }
          }
        }

        const finalText = streamedReply.trim();
        const totalTokens = estimateTokenCount(systemInstruction + input.prompt + finalText);
        recordProviderUsage('gemini', {
          tokensUsed: totalTokens,
          latencyMs: Date.now() - startMs,
        });

        if (!finalText) {
          throw new Error(`Empty response from ${modelName}`);
        }

        return {
          reply: finalText,
          model: modelName,
          thinkingLevel: effectiveLevel,
          provider: 'gemini',
          toolInvocations,
          grounding: collectedGrounding,
        };
      } catch (err) {
        lastErr = err;
        const errMsg = (err as Error)?.message || String(err);
        if (
          !streamedReply &&
          useGoogleSearch &&
          Boolean(input.onToolCall) &&
          allowHybrid &&
          isToolConfigCompatibilityError(errMsg)
        ) {
          console.warn(`Gemini stream ${modelName} hybrid tools fallback to pure googleSearch:`, errMsg);
          allowHybrid = false;
          continue;
        }
        if (/429|quota|rate|resource_exhausted/i.test(errMsg)) {
          markProviderRateLimited('gemini', errMsg, 60);
          throw err;
        }
        if (!streamedReply && isTransientGeminiError(errMsg)) {
          console.warn(`Gemini stream transient error on ${modelName}, failing over:`, errMsg);
          break;
        }
        throw err;
      }
    }
  }

  throw lastErr || new Error('Gemini streaming request failed.');
}

export async function transcribeAudioBuffer(
  base64Audio: string,
  mimeType: string
): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error('Server transcription requires a configured GEMINI_API_KEY.');
  }
  const res = await ai.models.generateContent({
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
  });
  return (res.text || '').trim();
}
