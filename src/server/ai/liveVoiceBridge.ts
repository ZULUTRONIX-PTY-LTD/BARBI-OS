import type { Server as HttpServer } from 'node:http';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import { isValidLiveVoiceName, type LiveVoiceName } from '../../voice/liveAudioLogic.ts';
import {
  BARBI_VOICE_SYSTEM_INSTRUCTION,
  BARBI_VOICE_TOOL_DECLARATIONS,
  buildSystemInventoryReport,
  normalizeUiRenderMutation,
  normalizeVoiceUiAction,
  summarizeVoiceSnapshot,
} from '../../voice/barbiVoiceTools.ts';
import { getV4CatalogSnapshot } from '../v4/githubModuleService.ts';

const LIVE_MODEL = 'gemini-3.8-live';

function getLiveGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function safeWsSend(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore send errors on closing sockets
    }
  }
}

export function attachLiveVoiceWebSocket(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname !== '/api/ai/live') {
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs, request) => {
    const ai = getLiveGeminiClient();
    if (!ai) {
      safeWsSend(clientWs, {
        type: 'error',
        error: 'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets.',
      });
      clientWs.close(1011, 'API key not configured');
      return;
    }

    let voiceName: LiveVoiceName = 'Zephyr';
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const requestedVoice = url.searchParams.get('voice');
      if (isValidLiveVoiceName(requestedVoice)) {
        voiceName = requestedVoice;
      }
    } catch {
      // Default to Zephyr
    }

    let closed = false;
    let latestUiSnapshot: Record<string, unknown> | null = null;
    const pendingSnapshotRequests = new Map<
      string,
      { resolve: (snap: Record<string, unknown>) => void; timer: ReturnType<typeof setTimeout> }
    >();

    const requestLiveUiSnapshotFromClient = (includeVisualFrame = false): Promise<Record<string, unknown>> => {
      return new Promise((resolve) => {
        if (closed || clientWs.readyState !== WebSocket.OPEN) {
          resolve(latestUiSnapshot ?? { status: 'unavailable' });
          return;
        }
        const requestId = `uisnap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const timer = setTimeout(() => {
          pendingSnapshotRequests.delete(requestId);
          resolve(latestUiSnapshot ?? { status: 'timeout_fallback' });
        }, 1600);
        pendingSnapshotRequests.set(requestId, { resolve, timer });
        safeWsSend(clientWs, {
          type: 'request_ui_snapshot',
          requestId,
          includeVisualFrame,
        });
      });
    };

    const sessionPromise = ai.live
      .connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: BARBI_VOICE_SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: BARBI_VOICE_TOOL_DECLARATIONS }],
        },
        callbacks: {
          onopen: () => {
            safeWsSend(clientWs, {
              type: 'ready',
              model: LIVE_MODEL,
              voice: voiceName,
            });
          },
          onmessage: (message: LiveServerMessage) => {
            if (closed) return;

            // Handle live Gemini function calls so B.A.R.B.I. can read UI, inspect systems, close panels & mutate render in real time
            const toolCalls = message.toolCall?.functionCalls;
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
              void (async () => {
                const functionResponses: Array<{
                  id?: string;
                  name?: string;
                  response: Record<string, unknown>;
                }> = [];

                for (const fc of toolCalls) {
                  const args = (fc.args && typeof fc.args === 'object' ? fc.args : {}) as Record<string, unknown>;

                  if (fc.name === 'read_ui_state') {
                    const includeVisualFrame = Boolean(args.includeVisualFrame);
                    const uiSnapshot = await requestLiveUiSnapshotFromClient(includeVisualFrame);
                    safeWsSend(clientWs, {
                      type: 'tool_event',
                      tool: 'read_ui_state',
                      label: 'Live Screen Perception Read',
                      detail:
                        typeof uiSnapshot.visibleSummaryText === 'string'
                          ? uiSnapshot.visibleSummaryText
                          : 'Read active panels, 3D sphere settings, and on-screen headings.',
                    });
                    functionResponses.push({
                      id: fc.id,
                      name: fc.name,
                      response: { uiState: uiSnapshot },
                    });
                  } else if (fc.name === 'inspect_barbi_systems') {
                    const query = typeof args.query === 'string' ? args.query : undefined;
                    try {
                      const snapshot = await getV4CatalogSnapshot();
                      const report = buildSystemInventoryReport(snapshot, query);
                      const summary = summarizeVoiceSnapshot(snapshot);
                      safeWsSend(clientWs, {
                        type: 'tool_event',
                        tool: 'inspect_barbi_systems',
                        label: query ? `System Scan · ${query}` : 'Active Systems Inventory Scan',
                        detail: `Verified ${summary.totalModules} v4.0 modules (${summary.mountedModules} mounted) · God's Eye (M11) 3D Globe online`,
                      });
                      functionResponses.push({
                        id: fc.id,
                        name: fc.name,
                        response: { result: report },
                      });
                    } catch (err) {
                      functionResponses.push({
                        id: fc.id,
                        name: fc.name,
                        response: {
                          error: err instanceof Error ? err.message : 'Unable to inspect B.A.R.B.I. systems.',
                        },
                      });
                    }
                  } else if (fc.name === 'execute_interface_action') {
                    const normalized = normalizeVoiceUiAction(args);
                    if (!normalized) {
                      functionResponses.push({
                        id: fc.id,
                        name: fc.name,
                        response: {
                          ok: false,
                          error: `Unsupported interface action: ${String(args.action || '')}`,
                        },
                      });
                    } else {
                      safeWsSend(clientWs, {
                        type: 'ui_action',
                        actionPayload: normalized,
                      });
                      functionResponses.push({
                        id: fc.id,
                        name: fc.name,
                        response: {
                          ok: true,
                          activated: normalized.label,
                          description: normalized.description,
                        },
                      });
                    }
                  } else if (fc.name === 'mutate_ui_render') {
                    const normalizedMutation = normalizeUiRenderMutation(args);
                    if (!normalizedMutation) {
                      functionResponses.push({
                        id: fc.id,
                        name: fc.name,
                        response: {
                          ok: false,
                          error: 'No valid UI render parameters were provided.',
                        },
                      });
                    } else {
                      safeWsSend(clientWs, {
                        type: 'ui_mutation',
                        mutationPayload: normalizedMutation,
                      });
                      functionResponses.push({
                        id: fc.id,
                        name: fc.name,
                        response: {
                          ok: true,
                          applied: normalizedMutation.label,
                          description: normalizedMutation.description,
                        },
                      });
                    }
                  } else {
                    functionResponses.push({
                      id: fc.id,
                      name: fc.name,
                      response: { ok: false, error: `Unknown tool ${String(fc.name || '')}` },
                    });
                  }
                }

                const session = await sessionPromise;
                if (session && !closed && functionResponses.length > 0) {
                  try {
                    session.sendToolResponse({ functionResponses });
                  } catch {
                    // Ignore write after close
                  }
                }
              })();
            }

            const serverContent = message.serverContent;
            if (!serverContent) return;

            if (serverContent.inputTranscription?.text) {
              safeWsSend(clientWs, {
                type: 'input_transcript',
                text: serverContent.inputTranscription.text,
              });
            }

            if (serverContent.outputTranscription?.text) {
              safeWsSend(clientWs, {
                type: 'output_transcript',
                text: serverContent.outputTranscription.text,
              });
            }

            const parts = serverContent.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                safeWsSend(clientWs, {
                  type: 'audio',
                  audio: part.inlineData.data,
                  mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                });
              }
            }

            if (serverContent.interrupted) {
              safeWsSend(clientWs, { type: 'interrupted', interrupted: true });
            }

            if (serverContent.turnComplete) {
              safeWsSend(clientWs, { type: 'turn_complete', turnComplete: true });
            }
          },
          onerror: (err: unknown) => {
            if (closed) return;
            const msg =
              err instanceof Error
                ? err.message
                : typeof err === 'object' && err !== null && 'message' in err
                  ? String((err as { message?: unknown }).message || 'Gemini Live API error')
                  : 'Gemini Live API encountered a connection error.';
            safeWsSend(clientWs, { type: 'error', error: msg });
          },
          onclose: (event: unknown) => {
            if (closed) return;
            closed = true;
            const reason =
              typeof event === 'object' && event !== null && 'reason' in event
                ? String((event as { reason?: unknown }).reason || '')
                : '';
            safeWsSend(clientWs, {
              type: 'closed',
              reason: reason || 'Live session closed.',
            });
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.close();
            }
          },
        },
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err || 'Failed to connect to Gemini Live API.');
        safeWsSend(clientWs, { type: 'error', error: msg });
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(1011, 'Live session init failed');
        }
        return null;
      });

    clientWs.on('message', (raw) => {
      if (closed) return;
      let parsed: {
        type?: string;
        audio?: string;
        text?: string;
        requestId?: string;
        snapshot?: Record<string, unknown>;
        videoFrameBase64?: string;
      };
      try {
        parsed = JSON.parse(raw.toString()) as typeof parsed;
      } catch {
        return;
      }

      if (parsed.type === 'stop') {
        closed = true;
        for (const entry of pendingSnapshotRequests.values()) {
          clearTimeout(entry.timer);
        }
        pendingSnapshotRequests.clear();
        void sessionPromise.then((session) => {
          try {
            session?.close();
          } catch {
            // ignore close error
          }
        });
        clientWs.close();
        return;
      }

      if (parsed.type === 'ui_snapshot_response' && parsed.requestId) {
        if (parsed.snapshot && typeof parsed.snapshot === 'object') {
          latestUiSnapshot = parsed.snapshot;
        }
        const pending = pendingSnapshotRequests.get(parsed.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingSnapshotRequests.delete(parsed.requestId);
          pending.resolve(parsed.snapshot ?? latestUiSnapshot ?? { status: 'empty' });
        }
        if (typeof parsed.videoFrameBase64 === 'string' && parsed.videoFrameBase64.length > 0) {
          const frameData = parsed.videoFrameBase64;
          void sessionPromise.then((session) => {
            if (!session || closed) return;
            try {
              session.sendRealtimeInput({
                video: { data: frameData, mimeType: 'image/jpeg' },
              });
            } catch {
              // ignore
            }
          });
        }
        return;
      }

      if (parsed.type === 'ui_state_update' && parsed.snapshot && typeof parsed.snapshot === 'object') {
        latestUiSnapshot = parsed.snapshot;
        return;
      }

      if (parsed.type === 'video_frame' && typeof parsed.videoFrameBase64 === 'string' && parsed.videoFrameBase64.length > 0) {
        const frameData = parsed.videoFrameBase64;
        void sessionPromise.then((session) => {
          if (!session || closed) return;
          try {
            session.sendRealtimeInput({
              video: { data: frameData, mimeType: 'image/jpeg' },
            });
          } catch {
            // ignore
          }
        });
        return;
      }

      if (typeof parsed.audio === 'string' && parsed.audio.length > 0) {
        void sessionPromise.then((session) => {
          if (!session || closed) return;
          try {
            session.sendRealtimeInput({
              audio: {
                data: parsed.audio!,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } catch {
            // Ignore write after close
          }
        });
        return;
      }

      if (typeof parsed.text === 'string' && parsed.text.trim()) {
        const text = parsed.text.trim();
        void sessionPromise.then((session) => {
          if (!session || closed) return;
          try {
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text }] }],
              turnComplete: true,
            });
          } catch {
            // Ignore write after close
          }
        });
      }
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      for (const entry of pendingSnapshotRequests.values()) {
        clearTimeout(entry.timer);
      }
      pendingSnapshotRequests.clear();
      void sessionPromise.then((session) => {
        try {
          session?.close();
        } catch {
          // ignore close error
        }
      });
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
  });

  return wss;
}
