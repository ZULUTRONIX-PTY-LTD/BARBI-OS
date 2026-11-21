import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Compass,
  Cpu,
  Eye,
  FolderOpen,
  Hand,
  Layers,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  Radar,
  Radio,
  ScanEye,
  Send,
  Sliders,
  Sparkles,
  Terminal,
  TrendingUp,
  Volume2,
} from 'lucide-react';
import {
  LIVE_VOICE_OPTIONS,
  base64ToInt16Pcm,
  computeRmsLevel,
  downsampleFloat32ToInt16Pcm,
  int16PcmToBase64,
  int16PcmToFloat32,
  mergeTranscriptDelta,
  type LiveVoiceName,
} from '../voice/liveAudioLogic';
import {
  BARBI_CREATOR_PROFILE,
  BARBI_USABLE_SYSTEMS,
  VOICE_QUICK_COMMANDS,
  normalizeVoiceUiAction,
  summarizeVoiceSnapshot,
  type UiRenderMutationPayload,
  type VoiceUiActionPayload,
} from '../voice/barbiVoiceTools';
import {
  captureActiveCanvasJpeg,
  captureBarbiUiSnapshot,
} from '../voice/barbiUiPerception';
import {
  executeBarbiUiAction,
  executeBarbiUiRenderMutation,
} from '../voice/executeBarbiUiAction';
import { barbiApi } from '../api/barbiClient';

export type LiveConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

interface LiveFeedEntry {
  id: string;
  kind: 'user' | 'assistant' | 'action' | 'mutation' | 'system_scan';
  text: string;
  subtitle?: string;
  actionPayload?: VoiceUiActionPayload;
  timestamp: string;
}

interface LiveVoicePanelProps {
  onCommitTurn?: (userText: string, assistantText: string) => void;
  onExitVoiceMode: () => void;
  onClosePanel?: () => void;
  onConnectionChange?: (state: LiveConnectionState, isSpeaking: boolean, isMuted: boolean) => void;
  onRequestMinimize?: () => void;
  autoConnectToken?: number;
  pendingCommand?: { id: number; text: string } | null;
  onConsumePendingCommand?: () => void;
  wakeWordArmed?: boolean;
  wakeWordSupported?: boolean;
  wakeWordStatusText?: string;
  onToggleWakeWord?: () => void;
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function commandIconFor(id: string) {
  switch (id) {
    case 'cmd-check-systems':
      return <Radar className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
    case 'cmd-gods-eye':
      return <Eye className="w-3.5 h-3.5 text-cyan-300 shrink-0" />;
    case 'cmd-fs-agent':
      return <FolderOpen className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
    case 'cmd-fintech':
      return <TrendingUp className="w-3.5 h-3.5 text-emerald-300 shrink-0" />;
    case 'cmd-v4-hub':
      return <Layers className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
    case 'cmd-rea':
      return <Cpu className="w-3.5 h-3.5 text-cyan-300 shrink-0" />;
    case 'cmd-study':
      return <BookOpen className="w-3.5 h-3.5 text-amber-200 shrink-0" />;
    case 'cmd-gesture':
      return <Hand className="w-3.5 h-3.5 text-amber-300 shrink-0" />;
    default:
      return <Compass className="w-3.5 h-3.5 text-stone-300 shrink-0" />;
  }
}

export function LiveVoicePanel({
  onCommitTurn,
  onExitVoiceMode,
  onClosePanel,
  onConnectionChange,
  onRequestMinimize,
  autoConnectToken = 0,
  pendingCommand = null,
  onConsumePendingCommand,
  wakeWordArmed = false,
  wakeWordSupported = false,
  wakeWordStatusText,
  onToggleWakeWord,
}: LiveVoicePanelProps) {
  const [connState, setConnState] = useState<LiveConnectionState>('idle');
  const [selectedVoice, setSelectedVoice] = useState<LiveVoiceName>('Zephyr');
  const [isMuted, setIsMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feed, setFeed] = useState<LiveFeedEntry[]>([]);
  const [liveUserDraft, setLiveUserDraft] = useState('');
  const [liveAiDraft, setLiveAiDraft] = useState('');
  const [textNudge, setTextNudge] = useState('');
  const [scanningSystems, setScanningSystems] = useState(false);
  const [lastExecutedLabel, setLastExecutedLabel] = useState<string | null>(null);
  const [visionSyncLabel, setVisionSyncLabel] = useState<string>('Screen Sync Ready');
  const [moduleCountSummary, setModuleCountSummary] = useState<string>("55 Modules · God's Eye M11 Live");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef<boolean>(false);
  const userDraftRef = useRef<string>('');
  const aiDraftRef = useRef<string>('');
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputLevelRef = useRef<number>(0);
  const outputLevelRef = useRef<number>(0);
  const connStateRef = useRef<LiveConnectionState>('idle');
  const isAiSpeakingRef = useRef<boolean>(false);
  const actionPulseRef = useRef<number>(0);
  const lastAutoTokenRef = useRef<number>(0);
  const pendingCommandRef = useRef<{ id: number; text: string } | null>(pendingCommand);

  // Ref-stabilized parent callbacks to prevent any React update-depth cycles
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onCommitTurnRef = useRef(onCommitTurn);
  const onClosePanelRef = useRef(onClosePanel);
  const onRequestMinimizeRef = useRef(onRequestMinimize);
  const onConsumePendingCommandRef = useRef(onConsumePendingCommand);

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange;
  }, [onConnectionChange]);
  useEffect(() => {
    onCommitTurnRef.current = onCommitTurn;
  }, [onCommitTurn]);
  useEffect(() => {
    onClosePanelRef.current = onClosePanel;
  }, [onClosePanel]);
  useEffect(() => {
    onRequestMinimizeRef.current = onRequestMinimize;
  }, [onRequestMinimize]);
  useEffect(() => {
    onConsumePendingCommandRef.current = onConsumePendingCommand;
  }, [onConsumePendingCommand]);
  useEffect(() => {
    pendingCommandRef.current = pendingCommand;
  }, [pendingCommand]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  useEffect(() => {
    inputLevelRef.current = inputLevel;
  }, [inputLevel]);
  useEffect(() => {
    outputLevelRef.current = outputLevel;
  }, [outputLevel]);
  useEffect(() => {
    connStateRef.current = connState;
  }, [connState]);
  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
  }, [isAiSpeaking]);

  useEffect(() => {
    onConnectionChangeRef.current?.(connState, isAiSpeaking, isMuted);
  }, [connState, isAiSpeaking, isMuted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [feed.length, liveUserDraft, liveAiDraft]);

  // Fetch real v4 module count quietly on mount
  useEffect(() => {
    let active = true;
    void barbiApi
      .v4GetModules()
      .then((snap) => {
        if (!active) return;
        const summary = summarizeVoiceSnapshot(snap);
        const m11 = snap.modules.find((m) => m.id === 11 || m.code === 'M11');
        setModuleCountSummary(
          `${summary.totalModules} Modules (${summary.mountedModules} mounted) · ${m11 ? "God's Eye M11 Live" : 'OS Online'}`
        );
      })
      .catch(() => {
        // Keep baseline summary if offline
      });
    return () => {
      active = false;
    };
  }, []);

  // Periodic live UI state telemetry push while connected so B.A.R.B.I. always sees screen changes
  useEffect(() => {
    if (connState !== 'connected') return;
    const interval = window.setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const snapshot = captureBarbiUiSnapshot();
        wsRef.current.send(JSON.stringify({ type: 'ui_state_update', snapshot }));
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [connState]);

  // Interactive HTML5 Canvas Harmonic Resonance & Waveform Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;

    const renderFrame = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(260, Math.round(rect.width));
      const height = Math.max(150, Math.round(rect.height));

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const state = connStateRef.current;
      const speaking = isAiSpeakingRef.current;
      const muted = isMutedRef.current;
      const rawEnergy =
        state === 'connected'
          ? speaking
            ? Math.max(0.16, outputLevelRef.current * 2.4)
            : muted
              ? 0.03
              : Math.max(0.08, inputLevelRef.current * 2.8)
          : state === 'connecting'
            ? 0.22
            : 0.06;

      actionPulseRef.current *= 0.92;
      const energy = Math.min(1, rawEnergy + actionPulseRef.current * 0.55);
      phase += 0.028 + energy * 0.055;

      const cx = width * 0.5;
      const cy = height * 0.48;
      const baseR = Math.min(width * 0.16, height * 0.31, 52);

      // Architectural coordinate grid
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.055)';
      ctx.lineWidth = 1;
      for (let x = 24; x < width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 20; y < height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const primaryRgb =
        state === 'connected'
          ? speaking
            ? '245, 158, 11'
            : muted
              ? '168, 162, 158'
              : '52, 211, 153'
          : '245, 158, 11';

      // Dual harmonic horizon waves
      for (let ribbon = 0; ribbon < 2; ribbon++) {
        ctx.beginPath();
        const amp = (ribbon === 0 ? 18 : 11) * (0.25 + energy * 1.45);
        const freq = ribbon === 0 ? 0.022 : 0.036;
        const speed = ribbon === 0 ? 1.0 : -1.35;
        for (let x = 0; x <= width; x += 3) {
          const normX = (x - cx) / (width * 0.5);
          const envelope = Math.exp(-normX * normX * 2.2);
          const y =
            cy +
            Math.sin(x * freq + phase * speed) * amp * envelope +
            Math.cos(x * freq * 1.8 - phase * 0.7) * (amp * 0.35) * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${primaryRgb}, ${ribbon === 0 ? 0.44 + energy * 0.45 : 0.2 + energy * 0.25})`;
        ctx.lineWidth = ribbon === 0 ? 1.6 : 1.0;
        ctx.stroke();
      }

      // Ambient radial core glow
      const glow = ctx.createRadialGradient(cx, cy, baseR * 0.15, cx, cy, baseR * (1.85 + energy * 0.6));
      glow.addColorStop(0, `rgba(${primaryRgb}, ${0.24 + energy * 0.24})`);
      glow.addColorStop(0.55, `rgba(${primaryRgb}, ${0.07 + energy * 0.08})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * (1.85 + energy * 0.6), 0, Math.PI * 2);
      ctx.fill();

      // Segmented targeting ring
      const outerR = baseR * (1.28 + energy * 0.14);
      ctx.strokeStyle = `rgba(${primaryRgb}, 0.28)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, phase * 0.2, phase * 0.2 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 48-bar radial harmonic spectrum
      const bars = 48;
      for (let i = 0; i < bars; i++) {
        const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const harmonic =
          0.5 + 0.5 * Math.sin(angle * 4 + phase * 1.6) * Math.cos(angle * 2 - phase * 0.9);
        const barLen = 3 + harmonic * (6 + energy * 24);
        const r1 = baseR * 0.88;
        const r2 = r1 + barLen;

        ctx.strokeStyle = `rgba(${primaryRgb}, ${0.35 + harmonic * (0.28 + energy * 0.35)})`;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
        ctx.stroke();
      }

      // Obsidian acoustic center ring
      ctx.fillStyle = 'rgba(10, 8, 6, 0.88)';
      ctx.strokeStyle = `rgba(${primaryRgb}, ${0.52 + energy * 0.4})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const stopScheduledPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Already stopped
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsAiSpeaking(false);
    setOutputLevel(0);
  }, []);

  const teardownSession = useCallback(
    (nextState: LiveConnectionState = 'idle') => {
      stopScheduledPlayback();

      if (processorRef.current) {
        processorRef.current.onaudioprocess = null;
        try {
          processorRef.current.disconnect();
        } catch {
          // ignore
        }
        processorRef.current = null;
      }

      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.disconnect();
        } catch {
          // ignore
        }
        sourceNodeRef.current = null;
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      if (inputCtxRef.current) {
        void inputCtxRef.current.close().catch(() => {});
        inputCtxRef.current = null;
      }

      if (outputCtxRef.current) {
        void outputCtxRef.current.close().catch(() => {});
        outputCtxRef.current = null;
      }

      if (wsRef.current) {
        const socket = wsRef.current;
        wsRef.current = null;
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'stop' }));
          }
          socket.close();
        } catch {
          // ignore
        }
      }

      setInputLevel(0);
      setOutputLevel(0);
      setIsAiSpeaking(false);
      setConnState(nextState);
    },
    [stopScheduledPlayback]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      teardownSession('idle');
    };
  }, [teardownSession]);

  const flushCompletedTurn = useCallback(() => {
    const userFinal = userDraftRef.current.trim();
    const aiFinal = aiDraftRef.current.trim();
    if (!userFinal && !aiFinal) return;

    const ts = nowTimeLabel();
    const appended: LiveFeedEntry[] = [];
    if (userFinal) {
      appended.push({ id: `lv-u-${Date.now()}-${Math.random()}`, kind: 'user', text: userFinal, timestamp: ts });
    }
    if (aiFinal) {
      appended.push({ id: `lv-a-${Date.now()}-${Math.random()}`, kind: 'assistant', text: aiFinal, timestamp: ts });
    }
    if (appended.length > 0) {
      setFeed((prev) => [...prev, ...appended]);
      onCommitTurnRef.current?.(userFinal, aiFinal);
    }

    userDraftRef.current = '';
    aiDraftRef.current = '';
    setLiveUserDraft('');
    setLiveAiDraft('');
  }, []);

  const runUiAction = useCallback(
    (payload: VoiceUiActionPayload, initiatedByVoice: boolean) => {
      actionPulseRef.current = 1.0;
      const result = executeBarbiUiAction(payload);
      setLastExecutedLabel(result.label);
      setFeed((prev) => [
        ...prev,
        {
          id: `lv-act-${Date.now()}-${Math.random()}`,
          kind: 'action',
          text: `${initiatedByVoice ? 'Voice Action' : 'Executed'}: ${result.label}`,
          subtitle: result.description,
          actionPayload: payload,
          timestamp: nowTimeLabel(),
        },
      ]);

      // Push updated screen snapshot back to live bridge so B.A.R.B.I. confirms the new state
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        window.setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({ type: 'ui_state_update', snapshot: captureBarbiUiSnapshot() })
            );
          }
        }, 120);
      }

      if (result.shouldCloseChat) {
        flushCompletedTurn();
        teardownSession('idle');
        onClosePanelRef.current?.();
        return;
      }

      if (result.shouldMinimizeChat) {
        if (connStateRef.current === 'connected' || connStateRef.current === 'connecting') {
          onRequestMinimizeRef.current?.();
        } else {
          onClosePanelRef.current?.();
        }
      }
    },
    [flushCompletedTurn, teardownSession]
  );

  const runUiRenderMutation = useCallback((payload: UiRenderMutationPayload) => {
    actionPulseRef.current = 1.0;
    const result = executeBarbiUiRenderMutation(payload);
    setLastExecutedLabel(result.label);
    setFeed((prev) => [
      ...prev,
      {
        id: `lv-mut-${Date.now()}-${Math.random()}`,
        kind: 'mutation',
        text: result.label,
        subtitle: result.description,
        timestamp: nowTimeLabel(),
      },
    ]);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      window.setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: 'ui_state_update', snapshot: captureBarbiUiSnapshot() })
          );
        }
      }, 120);
    }
  }, []);

  const schedulePcmOutput = useCallback((base64Audio: string) => {
    const outCtx = outputCtxRef.current;
    if (!outCtx) return;

    if (outCtx.state === 'suspended') {
      void outCtx.resume().catch(() => {});
    }

    const pcm16 = base64ToInt16Pcm(base64Audio);
    if (pcm16.length === 0) return;

    const float32 = int16PcmToFloat32(pcm16);
    const rms = computeRmsLevel(float32);
    setOutputLevel(rms);
    setIsAiSpeaking(true);

    const buffer = outCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = outCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(outCtx.destination);

    const now = outCtx.currentTime;
    const startAt = Math.max(now + 0.01, nextStartTimeRef.current);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsAiSpeaking(false);
        setOutputLevel(0);
      }
    };
    source.start(startAt);
  }, []);

  const startLiveSession = useCallback(async () => {
    if (connStateRef.current === 'connecting' || connStateRef.current === 'connected') return;
    setErrorMessage(null);
    setConnState('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      const inputCtx = new AudioCtxClass({ sampleRate: 16000 });
      const outputCtx = new AudioCtxClass({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/ai/live?voice=${encodeURIComponent(selectedVoice)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let msg: {
          type?: string;
          audio?: string;
          text?: string;
          interrupted?: boolean;
          turnComplete?: boolean;
          error?: string;
          label?: string;
          detail?: string;
          requestId?: string;
          includeVisualFrame?: boolean;
          actionPayload?: VoiceUiActionPayload;
          mutationPayload?: UiRenderMutationPayload;
        };
        try {
          msg = JSON.parse(String(event.data || '{}'));
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          setConnState('connected');
          setErrorMessage(null);
          actionPulseRef.current = 0.85;

          // Immediately sync live UI state to B.A.R.B.I. upon connect
          const initialSnap = captureBarbiUiSnapshot();
          ws.send(JSON.stringify({ type: 'ui_state_update', snapshot: initialSnap }));
          setVisionSyncLabel(`Screen Synced · ${initialSnap.openPanels.length} active`);

          // If wake-word included a trailing spoken command (e.g. "Hey Barbie open God's Eye"), send immediately
          if (pendingCommandRef.current?.text) {
            const cmdText = pendingCommandRef.current.text;
            pendingCommandRef.current = null;
            onConsumePendingCommandRef.current?.();
            ws.send(JSON.stringify({ text: cmdText }));
            userDraftRef.current = mergeTranscriptDelta(userDraftRef.current, cmdText);
            setLiveUserDraft(userDraftRef.current);
          }

          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          sourceNodeRef.current = source;
          processorRef.current = processor;

          const silentGain = inputCtx.createGain();
          silentGain.gain.value = 0;

          processor.onaudioprocess = (audioEvent) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
            const channelData = audioEvent.inputBuffer.getChannelData(0);
            if (isMutedRef.current) {
              setInputLevel(0);
              return;
            }
            const rms = computeRmsLevel(channelData);
            setInputLevel(rms);

            const pcm16 = downsampleFloat32ToInt16Pcm(channelData, inputCtx.sampleRate, 16000);
            const base64 = int16PcmToBase64(pcm16);
            wsRef.current.send(JSON.stringify({ audio: base64 }));
          };

          source.connect(processor);
          processor.connect(silentGain);
          silentGain.connect(inputCtx.destination);
        } else if (msg.type === 'request_ui_snapshot' && msg.requestId) {
          const snapshot = captureBarbiUiSnapshot();
          const videoFrameBase64 = msg.includeVisualFrame ? captureActiveCanvasJpeg(560) : null;
          setVisionSyncLabel(`Screen Read · ${nowTimeLabel()}`);
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'ui_snapshot_response',
                requestId: msg.requestId,
                snapshot,
                ...(videoFrameBase64 ? { videoFrameBase64 } : {}),
              })
            );
          }
        } else if (msg.type === 'audio' && msg.audio) {
          schedulePcmOutput(msg.audio);
        } else if (msg.type === 'input_transcript' && msg.text) {
          userDraftRef.current = mergeTranscriptDelta(userDraftRef.current, msg.text);
          setLiveUserDraft(userDraftRef.current);
        } else if (msg.type === 'output_transcript' && msg.text) {
          aiDraftRef.current = mergeTranscriptDelta(aiDraftRef.current, msg.text);
          setLiveAiDraft(aiDraftRef.current);
        } else if (msg.type === 'tool_event') {
          actionPulseRef.current = 0.9;
          setFeed((prev) => [
            ...prev,
            {
              id: `lv-scan-${Date.now()}-${Math.random()}`,
              kind: 'system_scan',
              text: msg.label || 'B.A.R.B.I. System Scan Complete',
              subtitle: msg.detail || "Verified all live modules including God's Eye (M11).",
              actionPayload: normalizeVoiceUiAction({ action: 'open_gods_eye' }) || undefined,
              timestamp: nowTimeLabel(),
            },
          ]);
        } else if (msg.type === 'ui_action' && msg.actionPayload) {
          runUiAction(msg.actionPayload, true);
        } else if (msg.type === 'ui_mutation' && msg.mutationPayload) {
          runUiRenderMutation(msg.mutationPayload);
        } else if (msg.type === 'interrupted' || msg.interrupted) {
          stopScheduledPlayback();
        } else if (msg.type === 'turn_complete' || msg.turnComplete) {
          flushCompletedTurn();
        } else if (msg.type === 'error') {
          setErrorMessage(msg.error || 'Gemini Live API encountered an error.');
          teardownSession('error');
        } else if (msg.type === 'closed') {
          flushCompletedTurn();
          teardownSession('idle');
        }
      };

      ws.onerror = () => {
        setErrorMessage('Could not establish real-time voice WebSocket connection.');
        teardownSession('error');
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          flushCompletedTurn();
          teardownSession('idle');
        }
      };
    } catch (err) {
      const msg =
        err instanceof Error && /denied|NotAllowedError|Permission/i.test(err.name + ' ' + err.message)
          ? 'Microphone access was denied. Allow microphone permissions in your browser to speak with B.A.R.B.I.'
          : err instanceof Error
            ? err.message
            : 'Unable to start live voice session.';
      setErrorMessage(msg);
      teardownSession('error');
    }
  }, [flushCompletedTurn, runUiAction, runUiRenderMutation, schedulePcmOutput, selectedVoice, stopScheduledPlayback, teardownSession]);

  // Auto-activate voice link when triggered via Voice HUD icon or wake word ("Hey B.A.R.B.I." / "Hey B" / "Barbie")
  useEffect(() => {
    if (autoConnectToken > 0 && autoConnectToken !== lastAutoTokenRef.current) {
      lastAutoTokenRef.current = autoConnectToken;
      if (connStateRef.current === 'idle' || connStateRef.current === 'error') {
        void startLiveSession();
      }
    }
  }, [autoConnectToken, startLiveSession]);

  const handleSendTextNudge = useCallback(
    (overrideText?: string) => {
      const trimmed = (overrideText ?? textNudge).trim();
      if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ text: trimmed }));
      userDraftRef.current = mergeTranscriptDelta(userDraftRef.current, trimmed);
      setLiveUserDraft(userDraftRef.current);
      if (!overrideText) setTextNudge('');
    },
    [textNudge]
  );

  const handleQuickCommand = useCallback(
    async (cmd: (typeof VOICE_QUICK_COMMANDS)[number]) => {
      if (connState === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) {
        handleSendTextNudge(cmd.spokenPrompt);
        return;
      }

      if (cmd.id === 'cmd-check-systems') {
        setScanningSystems(true);
        actionPulseRef.current = 0.9;
        try {
          const snap = await barbiApi.v4GetModules();
          const summary = summarizeVoiceSnapshot(snap);
          const m11 = snap.modules.find((m) => m.id === 11 || m.code === 'M11');
          const m11Repos = m11
            ? m11.repos.map((r) => r.fullName).join(' · ')
            : 'bilawalsidhu/gods-eye-view · koala73/worldmonitor';
          setModuleCountSummary(
            `${summary.totalModules} Modules (${summary.mountedModules} mounted) · God's Eye M11 Live`
          );
          setFeed((prev) => [
            ...prev,
            {
              id: `lv-scan-${Date.now()}`,
              kind: 'system_scan',
              text: `All ${BARBI_USABLE_SYSTEMS.length} Usable Interfaces & ${summary.totalModules} v4.0 Modules Verified`,
              subtitle: `Built for ${BARBI_CREATOR_PROFILE.creatorName} (${BARBI_CREATOR_PROFILE.companyName}). God's Eye (Module M11) is live in Tier B with an interactive 3D globe (${m11Repos}).`,
              actionPayload: normalizeVoiceUiAction({ action: 'open_gods_eye' }) || undefined,
              timestamp: nowTimeLabel(),
            },
          ]);
        } catch {
          setFeed((prev) => [
            ...prev,
            {
              id: `lv-scan-${Date.now()}`,
              kind: 'system_scan',
              text: `${BARBI_USABLE_SYSTEMS.length} Usable B.A.R.B.I. Interfaces Active`,
              subtitle:
                "God's Eye 3D Globe (Module M11 · bilawalsidhu/gods-eye-view & koala73/worldmonitor), FinTech Venture HUD, R.E.A Agent Forge, Study Studio, Power & PMIC, Gesture D3, Maps, Weather, and Timer are ready.",
              actionPayload: normalizeVoiceUiAction({ action: 'open_gods_eye' }) || undefined,
              timestamp: nowTimeLabel(),
            },
          ]);
        } finally {
          setScanningSystems(false);
        }
        return;
      }

      if (cmd.action) {
        const normalized = normalizeVoiceUiAction({ action: cmd.action });
        if (normalized) {
          runUiAction(normalized, false);
        }
      }
    },
    [connState, handleSendTextNudge, runUiAction]
  );

  const statusHeadline =
    connState === 'connected'
      ? isAiSpeaking
        ? 'B.A.R.B.I. Speaking'
        : isMuted
          ? 'Microphone Muted'
          : 'Listening · Live Screen & UI Control Armed'
      : connState === 'connecting'
        ? 'Establishing Acoustic Link'
        : 'Voice Command Standby';

  const statusSubline =
    connState === 'connected'
      ? 'Ask what is on screen, switch themes/glass, launch God\'s Eye, or say "close panel".'
      : `Engineered by ${BARBI_CREATOR_PROFILE.creatorName}, ${BARBI_CREATOR_PROFILE.creatorRole} · ${BARBI_CREATOR_PROFILE.companyName}`;

  return (
    <div
      id="barbi-live-voice-panel"
      className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-black/35 via-black/25 to-black/50 text-stone-100"
    >
      {/* Top Telemetry, Screen Vision Sync, Wake Word & Voice Persona Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-2 border-b border-amber-500/20 bg-black/45">
        <div className="flex items-center gap-2 text-xs min-w-0">
          <AudioLines className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-semibold tracking-wide text-amber-50 whitespace-nowrap">Acoustic Deck</span>
          <span className="text-stone-600" aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1 font-mono-tech text-[10.5px] text-cyan-300/90 whitespace-nowrap">
            <ScanEye className="w-3 h-3 shrink-0" />
            <span>{visionSyncLabel}</span>
          </span>
          <span className="hidden 2xl:inline text-stone-600" aria-hidden="true">·</span>
          <span className="hidden 2xl:inline font-mono-tech text-[10.5px] text-amber-200/75 truncate">
            {moduleCountSummary}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onToggleWakeWord && (
            <button
              id="btn-voice-wake-toggle"
              type="button"
              onClick={onToggleWakeWord}
              aria-pressed={wakeWordArmed}
              disabled={!wakeWordSupported}
              title={
                wakeWordSupported
                  ? 'Toggle hands-free B.A.R.B.I voice activation'
                  : 'Browser Web Speech Recognition unavailable in this browser'
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 border text-[10.5px] font-mono-tech transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 ${
                wakeWordArmed
                  ? 'bg-emerald-500/18 border-emerald-400/50 text-emerald-200'
                  : 'bg-white/[0.03] border-white/[0.1] text-stone-300 hover:text-amber-100 hover:border-amber-400/40'
              }`}
            >
              <Radio className="w-3 h-3 shrink-0" />
              <span>{wakeWordArmed ? 'Wake Armed: B.A.R.B.I' : 'Arm B.A.R.B.I Wake'}</span>
            </button>
          )}

          <div
            className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.1] p-0.5"
            role="radiogroup"
            aria-label="Live voice persona"
          >
            {LIVE_VOICE_OPTIONS.map((v) => {
              const active = selectedVoice === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={connState === 'connected' || connState === 'connecting'}
                  onClick={() => setSelectedVoice(v.id)}
                  title={`${v.label} — ${v.tone}`}
                  className={`px-2 py-1 text-[10.5px] font-mono-tech transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-amber-500/25 text-amber-100 border border-amber-400/50'
                      : 'text-stone-400 hover:text-stone-200 border border-transparent'
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>

          {connState === 'connected' && onRequestMinimize && (
            <button
              type="button"
              onClick={onRequestMinimize}
              title="Minimize to floating voice bar while navigating B.A.R.B.I."
              className="p-1.5 bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.12] text-stone-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Minimize live voice deck"
            >
              <Minimize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="mx-4 sm:mx-5 mt-3 flex items-center justify-between gap-3 px-3.5 py-2.5 bg-red-950/60 border border-red-500/40 text-xs text-red-100"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-[11px] font-mono-tech text-red-200 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_276px] overflow-hidden">
        {/* Left Column: Reactive Acoustic Canvas + Live Transcript & Action Feed */}
        <div className="flex flex-col min-h-0 px-4 sm:px-5 py-3.5 gap-3 overflow-hidden">
          <div className="relative border border-amber-500/25 bg-gradient-to-b from-black/75 via-[#0e0905]/80 to-black/70 overflow-hidden shrink-0 barbi-scifi-cut-sm">
            <canvas
              ref={canvasRef}
              aria-label="B.A.R.B.I. real-time acoustic resonance visualizer"
              className="w-full h-[164px] sm:h-[180px] block"
            />

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <button
                id="btn-voice-orb-trigger"
                type="button"
                disabled={connState === 'connecting'}
                onClick={() => {
                  if (connState === 'connected') {
                    setIsMuted((prev) => !prev);
                  } else {
                    void startLiveSession();
                  }
                }}
                aria-label={
                  connState === 'connected'
                    ? isMuted
                      ? 'Unmute microphone'
                      : 'Mute microphone'
                    : 'Activate B.A.R.B.I. Live Voice'
                }
                className={`pointer-events-auto flex items-center justify-center w-16 h-16 rounded-full border transition-all duration-200 cursor-pointer disabled:opacity-60 ${
                  connState === 'connected'
                    ? isAiSpeaking
                      ? 'bg-amber-500/20 border-amber-300/80 text-amber-200 shadow-[0_0_28px_rgba(245,158,11,0.4)]'
                      : isMuted
                        ? 'bg-red-950/60 border-red-400/60 text-red-200'
                        : 'bg-emerald-500/18 border-emerald-400/70 text-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.28)]'
                    : 'bg-amber-500/14 hover:bg-amber-500/26 border-amber-400/65 text-amber-200 hover:scale-105 shadow-[0_0_24px_rgba(245,158,11,0.24)]'
                }`}
              >
                {connState === 'connected' ? (
                  isAiSpeaking ? (
                    <Volume2 className="w-6 h-6" />
                  ) : isMuted ? (
                    <MicOff className="w-6 h-6" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </button>
            </div>

            <div className="absolute inset-x-0 bottom-0 px-3.5 py-2 bg-gradient-to-t from-black/92 via-black/70 to-transparent flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-amber-50 leading-tight">{statusHeadline}</div>
                <div className="text-[11px] text-stone-400 truncate">{statusSubline}</div>
              </div>
              {lastExecutedLabel && (
                <div className="font-mono-tech text-[10.5px] text-emerald-300 flex items-center gap-1.5 shrink-0">
                  <Terminal className="w-3 h-3" />
                  <span>{lastExecutedLabel}</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Transcript, UI Read & Execution Stream */}
          <div className="flex-1 min-h-[110px] overflow-y-auto bg-black/45 border border-white/[0.1] p-3.5 space-y-2.5">
            {feed.length === 0 && !liveUserDraft && !liveAiDraft ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-4">
                <Sparkles className="w-4 h-4 text-amber-400/80 mb-2" />
                <p className="text-xs font-medium text-stone-200">
                  Ready for Chief Engineer {BARBI_CREATOR_PROFILE.creatorName}
                </p>
                <p className="mt-1 text-[11px] text-stone-400 max-w-md leading-relaxed">
                  Call <span className="text-amber-200">B.A.R.B.I</span> hands-free when wake word is armed — or tap the orb to inspect what&apos;s on screen, launch God&apos;s Eye, change themes, or close any panel.
                </p>
                {wakeWordStatusText && (
                  <p className="mt-2 font-mono-tech text-[10.5px] text-emerald-300/85">
                    {wakeWordStatusText}
                  </p>
                )}
              </div>
            ) : (
              <>
                {feed.map((entry) => {
                  if (entry.kind === 'action' || entry.kind === 'mutation' || entry.kind === 'system_scan') {
                    return (
                      <div
                        key={entry.id}
                        className="bg-amber-500/[0.07] border border-amber-400/30 px-3 py-2.5 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[10.5px] font-mono-tech text-amber-300 uppercase tracking-wider">
                            {entry.kind === 'system_scan' ? (
                              <Radar className="w-3 h-3 shrink-0" />
                            ) : entry.kind === 'mutation' ? (
                              <Sliders className="w-3 h-3 shrink-0" />
                            ) : (
                              <Terminal className="w-3 h-3 shrink-0" />
                            )}
                            <span>{entry.text}</span>
                            <span className="text-stone-500">· {entry.timestamp}</span>
                          </div>
                          {entry.subtitle && (
                            <p className="mt-1 text-xs text-stone-200 leading-relaxed">{entry.subtitle}</p>
                          )}
                        </div>
                        {entry.actionPayload && (
                          <button
                            type="button"
                            onClick={() => runUiAction(entry.actionPayload!, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/45 text-[11px] font-medium text-amber-100 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                          >
                            <span>Open</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={entry.id}
                      className={`flex flex-col ${entry.kind === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[10px] font-mono-tech uppercase tracking-wider text-stone-500 mb-0.5">
                        {entry.kind === 'user' ? 'Treasure' : `B.A.R.B.I. (${selectedVoice})`} · {entry.timestamp}
                      </span>
                      <div
                        className={`max-w-[88%] px-3 py-2 text-xs leading-relaxed ${
                          entry.kind === 'user'
                            ? 'bg-amber-500/14 border border-amber-400/28 text-amber-50'
                            : 'bg-white/[0.045] border border-white/[0.1] text-stone-100'
                        }`}
                      >
                        {entry.text}
                      </div>
                    </div>
                  );
                })}

                {liveUserDraft && (
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-mono-tech uppercase tracking-wider text-emerald-400/90 mb-0.5">
                      Treasure · live
                    </span>
                    <div className="max-w-[88%] px-3 py-2 text-xs leading-relaxed bg-amber-500/10 border border-amber-400/24 text-amber-100/90">
                      {liveUserDraft}
                    </div>
                  </div>
                )}

                {liveAiDraft && (
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] font-mono-tech uppercase tracking-wider text-amber-300/90 mb-0.5 flex items-center gap-1">
                      <Volume2 className="w-3 h-3" />
                      B.A.R.B.I. · responding
                    </span>
                    <div className="max-w-[88%] px-3 py-2 text-xs leading-relaxed bg-white/[0.05] border border-amber-400/25 text-stone-100">
                      {liveAiDraft}
                    </div>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Right Column: Live Interface Controls Rail */}
        <aside
          aria-label="Usable B.A.R.B.I. systems and voice commands"
          className="border-t md:border-t-0 md:border-l border-white/[0.1] bg-black/40 px-3.5 py-3.5 flex flex-col min-h-0 overflow-y-auto"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <h4 className="text-[11px] font-mono-tech uppercase tracking-wider text-amber-300/90 whitespace-nowrap">
              Live Interface Controls
            </h4>
            <span className="text-[10px] font-mono-tech text-stone-400 whitespace-nowrap shrink-0">
              {BARBI_USABLE_SYSTEMS.length} online
            </span>
          </div>

          <p className="text-[11px] text-stone-400 leading-snug mb-3">
            {connState === 'connected'
              ? 'Speak any module, render change, or "close panel" — or click a trigger below.'
              : 'Click any command below to scan or open live systems, or activate Voice Link.'}
          </p>

          <div className="space-y-1.5">
            {VOICE_QUICK_COMMANDS.map((cmd) => (
              <button
                key={cmd.id}
                id={`btn-voice-cmd-${cmd.id}`}
                type="button"
                disabled={cmd.id === 'cmd-check-systems' && scanningSystems}
                onClick={() => void handleQuickCommand(cmd)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 border text-left transition-colors cursor-pointer disabled:opacity-55 ${
                  cmd.id === 'cmd-gods-eye'
                    ? 'bg-cyan-500/12 hover:bg-cyan-500/22 border-cyan-400/45 text-cyan-50'
                    : 'bg-white/[0.025] hover:bg-white/[0.07] border-white/[0.08] hover:border-amber-400/40 text-stone-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {commandIconFor(cmd.id)}
                  <span className="text-xs font-medium truncate">
                    {cmd.id === 'cmd-check-systems' && scanningSystems ? 'Scanning Systems...' : cmd.label}
                  </span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-stone-500 shrink-0" />
              </button>
            ))}
          </div>

          <div className="mt-auto pt-3 border-t border-white/[0.08] space-y-0.5 text-[10.5px] font-mono-tech text-stone-400">
            <div className="text-amber-200/90 font-semibold">{BARBI_CREATOR_PROFILE.companyName}</div>
            <div>
              {BARBI_CREATOR_PROFILE.creatorName} · {BARBI_CREATOR_PROFILE.creatorRole}
            </div>
            <div className="text-cyan-300/80">M11 God&apos;s Eye · 3D Globe + GitHub Live</div>
          </div>
        </aside>
      </div>

      {/* Bottom Voice Transport Controls */}
      <div className="px-4 sm:px-5 py-3 border-t border-white/[0.1] bg-black/55 flex flex-wrap items-center justify-between gap-2.5">
        {connState === 'connected' ? (
          <>
            <div className="flex items-center gap-2">
              <button
                id="btn-live-mute"
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                aria-pressed={isMuted}
                className={`inline-flex items-center gap-1.5 px-3 py-2 border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isMuted
                    ? 'bg-red-500/20 border-red-400/45 text-red-100'
                    : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.14] text-stone-100'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-emerald-400" />}
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </button>

              <button
                id="btn-live-end"
                type="button"
                onClick={() => {
                  flushCompletedTurn();
                  teardownSession('idle');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-500/85 hover:bg-red-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Call</span>
              </button>
            </div>

            <div className="flex-1 min-w-[200px] max-w-md flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.12] px-2.5 py-1.5">
              <input
                type="text"
                value={textNudge}
                onChange={(e) => setTextNudge(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendTextNudge();
                }}
                placeholder="Send a command or question into live voice..."
                className="flex-1 bg-transparent text-xs text-white placeholder:text-stone-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleSendTextNudge()}
                disabled={!textNudge.trim()}
                aria-label="Send command to live voice session"
                className="p-1 text-amber-300 hover:bg-white/10 disabled:opacity-35 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <div className="w-full flex flex-wrap items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={onExitVoiceMode}
              className="px-3 py-2 bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.12] text-xs text-stone-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Switch to Text Core
            </button>

            <button
              id="btn-live-start"
              type="button"
              disabled={connState === 'connecting'}
              onClick={() => void startLiveSession()}
              className="inline-flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 barbi-scifi-cut-sm"
            >
              <Mic className="w-4 h-4" />
              <span>{connState === 'connecting' ? 'Connecting...' : 'Activate B.A.R.B.I. Voice'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
