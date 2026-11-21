import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  AlertCircle,
  ArrowUp,
  AudioLines,
  Check,
  ChevronDown,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  History,
  Image as ImageIcon,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  ScanEye,
  Search,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { barbiApi } from '../api/barbiClient';
import { LiveVoicePanel } from './LiveVoicePanel';
import {
  STARTER_PROMPTS,
  appendMessageToSession,
  buildApiHistory,
  createChatSession,
  formatApiErrorMessage,
  formatLatencyLabel,
  parseInlineMarkdown,
  parseMarkdownBlocks,
  parseStoredSessions,
  serializeSessionsForStorage,
  type ChatAttachmentMeta,
  type ChatGroundingMetadata,
  type ChatMessage,
  type ChatProviderOption,
  type ChatSession,
  type MarkdownInlineNode,
} from '../chat/chatLogic';
import {
  captureBarbiUiSnapshot,
  formatUiSnapshotForPrompt,
} from '../voice/barbiUiPerception';
import { extractChatUiDirectives } from '../voice/barbiVoiceTools';
import {
  executeBarbiUiAction,
  executeBarbiUiRenderMutation,
} from '../voice/executeBarbiUiAction';
import {
  isWakeWordSpeechSupported,
  startWakeWordMonitor,
  type WakeWordMonitorHandle,
} from '../voice/wakeWordEngine';

const STORAGE_KEY = 'barbi_llm_chat_sessions_v1';
const ACTIVE_SESSION_KEY = 'barbi_llm_chat_active_id_v1';
const WAKE_WORD_PREF_KEY = 'barbi_wake_word_armed_v1';
const WEB_SEARCH_PREF_KEY = 'barbi_chat_web_search_v1';

declare global {
  interface Window {
    __setBarbiChatOpenState?: (open: boolean) => void;
    __barbiChatPanelOpen?: boolean;
    __barbiChatUiState?: {
      open: boolean;
      mode: 'text' | 'voice';
      voiceMinimized: boolean;
      voiceConnectionState: string;
      wakeWordArmed: boolean;
    };
    openBarbiVoiceMode?: (opts?: { autoConnect?: boolean; command?: string }) => void;
  }
}

function makeMessageId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function stripIncompleteDirectives(raw: string): string {
  return raw
    .replace(/\[\[BARBI_UI_(?:ACTION|MUTATE):[\s\S]*?\]\]/g, '')
    .replace(/\[\[BARBI_UI_[\s\S]*$/, '')
    .trimEnd();
}

function HalfBrainCircuitIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <line x1="12" y1="2.5" x2="12" y2="21.5" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <path
        d="M12 4C9.2 4 7.2 5.4 6.6 7.4C5.1 7.9 4 9.3 4 11C4 12.4 4.8 13.7 6 14.3C5.8 15.1 6 16.2 6.8 17.1C7.8 18.3 9.5 19.2 12 19.2"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 7.5C10.1 7.5 8.8 8.3 8.2 9.5" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M11.8 11.5C9.6 11.5 8.2 10.7 7.2 12.1" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M12 15.2C10.2 15.2 9.1 14.5 8.3 15.8" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M12 6H15.2L17.4 3.8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.3" cy="3.0" r="1.25" fill="currentColor" stroke="none" />
      <path d="M12 9.6H16.6L18.8 7.4H20.2" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21.2" cy="7.4" r="1.25" fill="currentColor" stroke="none" />
      <path d="M12 13H17.2L19.4 15.2" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20.3" cy="16.1" r="1.25" fill="currentColor" stroke="none" />
      <path d="M12 16.6H15.0L17.2 19.2H18.6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19.8" cy="19.2" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="11.3" r="1.0" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  const nodes = useMemo(() => parseInlineMarkdown(text), [text]);
  return (
    <>
      {nodes.map((node: MarkdownInlineNode, idx: number) => {
        if (node.type === 'code') {
          return (
            <code
              key={idx}
              className="px-1.5 py-0.5 mx-0.5 bg-amber-500/12 border border-amber-500/25 font-mono-tech text-[12px] text-amber-200"
            >
              {node.value}
            </code>
          );
        }
        if (node.type === 'bold') {
          return (
            <strong key={idx} className="font-semibold text-white">
              {node.value}
            </strong>
          );
        }
        if (node.type === 'italic') {
          return (
            <em key={idx} className="italic text-amber-100/90">
              {node.value}
            </em>
          );
        }
        if (node.type === 'link') {
          return (
            <a
              key={idx}
              href={node.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-200"
            >
              {node.label}
            </a>
          );
        }
        return <span key={idx}>{node.value}</span>;
      })}
    </>
  );
}

function CodeBlockView({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  return (
    <div className="my-2.5 overflow-hidden border border-amber-500/25 bg-black/75">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/[0.08] text-[11px] font-mono-tech text-amber-200/75">
        <span className="lowercase">{language || 'code'}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1 text-[11px] text-amber-200/80 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[12.5px] leading-relaxed font-mono-tech text-amber-50/95">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function AssistantMarkdown({
  content,
  isStreaming,
  webSearchActive,
}: {
  content: string;
  isStreaming?: boolean;
  webSearchActive?: boolean;
}) {
  const displayContent = useMemo(
    () => (isStreaming ? stripIncompleteDirectives(content) : content),
    [content, isStreaming]
  );
  const blocks = useMemo(() => parseMarkdownBlocks(displayContent), [displayContent]);

  if (!displayContent && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-200/80 py-1 font-mono-tech tracking-wide">
        {webSearchActive && <Globe className="w-3.5 h-3.5 text-cyan-300 animate-pulse shrink-0" />}
        <span>
          {webSearchActive ? 'Searching Google & synthesizing response...' : 'Synthesizing neural response...'}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 text-[14px] leading-[1.65] text-stone-100 break-words">
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-base font-semibold text-white pt-1'
              : block.level === 2
                ? 'text-[15px] font-semibold text-amber-50 pt-1'
                : 'text-[14px] font-semibold text-amber-100 pt-0.5';
          return (
            <div key={idx} className={sizeClass}>
              <InlineMarkdown text={block.text} />
            </div>
          );
        }
        if (block.type === 'code') {
          return <CodeBlockView key={idx} language={block.language} code={block.code} />;
        }
        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={idx}
              className="pl-3 border-l-2 border-amber-400/55 text-amber-100/85 italic whitespace-pre-wrap"
            >
              <InlineMarkdown text={block.text} />
            </blockquote>
          );
        }
        if (block.type === 'hr') {
          return <hr key={idx} className="border-white/12 my-2" />;
        }
        if (block.type === 'ul') {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1 text-stone-100/95">
              {block.items.map((item, i) => (
                <li key={i}>
                  <InlineMarkdown text={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={idx} className="list-decimal pl-5 space-y-1 text-stone-100/95">
              {block.items.map((item, i) => (
                <li key={i}>
                  <InlineMarkdown text={item} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className="whitespace-pre-wrap">
            <InlineMarkdown text={block.text} />
          </p>
        );
      })}
      {isStreaming && (
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-4 align-middle ml-0.5 bg-amber-400/90 animate-pulse"
        />
      )}
    </div>
  );
}

function GroundingSourcesBlock({ grounding }: { grounding: ChatGroundingMetadata }) {
  if (!grounding.sources.length && !grounding.webSearchQueries.length) return null;

  return (
    <div
      data-testid="barbi-grounding-sources"
      className="mt-3 pt-2.5 border-t border-cyan-500/20 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-mono-tech">
        <span className="inline-flex items-center gap-1.5 uppercase tracking-wider text-cyan-200/90">
          <Globe className="w-3 h-3 text-cyan-300 shrink-0" />
          <span>Google Search Grounded</span>
        </span>
        {grounding.sources.length > 0 && (
          <span className="text-stone-400">
            {grounding.sources.length} {grounding.sources.length === 1 ? 'source' : 'sources'}
          </span>
        )}
      </div>

      {grounding.webSearchQueries.length > 0 && (
        <div
          className="text-[11px] font-mono-tech text-stone-400 truncate"
          title={grounding.webSearchQueries.join(' · ')}
        >
          Search: {grounding.webSearchQueries.join(' · ')}
        </div>
      )}

      {grounding.sources.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {grounding.sources.map((src, index) => (
            <a
              key={`${src.uri}-${index}`}
              href={src.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-2 px-2.5 py-1.5 bg-white/[0.03] hover:bg-cyan-500/12 border border-white/[0.1] hover:border-cyan-400/45 transition-colors min-w-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono-tech text-[10px] text-cyan-300/85 shrink-0">
                    [{index + 1}]
                  </span>
                  <span className="text-[11.5px] font-medium text-stone-100 group-hover:text-white truncate">
                    {src.title}
                  </span>
                </div>
                <div className="text-[10px] font-mono-tech text-stone-400 group-hover:text-cyan-200/80 truncate pl-5">
                  {src.domain}
                </div>
              </div>
              <ExternalLink className="w-3 h-3 text-stone-500 group-hover:text-cyan-300 shrink-0" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function loadInitialSessions(): ChatSession[] {
  try {
    const parsed = parseStoredSessions(window.localStorage.getItem(STORAGE_KEY));
    if (parsed.length > 0) return parsed;
  } catch {
    // ignore storage errors
  }
  return [createChatSession()];
}

function loadSavedWakeWordPref(): boolean {
  try {
    return window.localStorage.getItem(WAKE_WORD_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadSavedWebSearchPref(): boolean {
  try {
    const saved = window.localStorage.getItem(WEB_SEARCH_PREF_KEY);
    if (saved === null) return true;
    return saved === 'true';
  } catch {
    return true;
  }
}

export function BarbiChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadInitialSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const savedId = window.localStorage.getItem(ACTIVE_SESSION_KEY);
      const initial = loadInitialSessions();
      if (savedId && initial.some((s) => s.id === savedId)) return savedId;
      return initial[0].id;
    } catch {
      return '';
    }
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [input, setInput] = useState('');
  const [deepThink, setDeepThink] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(() => loadSavedWebSearchPref());
  const [attachments, setAttachments] = useState<ChatAttachmentMeta[]>([]);
  const [providers, setProviders] = useState<ChatProviderOption[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('auto');
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceMinimized, setVoiceMinimized] = useState(false);
  const [autoConnectToken, setAutoConnectToken] = useState(0);
  const [pendingVoiceCommand, setPendingVoiceCommand] = useState<{ id: number; text: string } | null>(null);
  const [wakeWordArmed, setWakeWordArmed] = useState<boolean>(() => loadSavedWakeWordPref());
  const [wakeWordSupported] = useState<boolean>(() => isWakeWordSpeechSupported());
  const [wakeWordStatusText, setWakeWordStatusText] = useState<string>('');
  const [screenSyncSummary, setScreenSyncSummary] = useState<string>('Screen Sync Live');
  const [lastUiExecNote, setLastUiExecNote] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<{
    conn: 'idle' | 'connecting' | 'connected' | 'error';
    speaking: boolean;
    muted: boolean;
  }>({ conn: 'idle', speaking: false, muted: false });

  const handleVoiceConnectionChange = useCallback(
    (conn: 'idle' | 'connecting' | 'connected' | 'error', speaking: boolean, muted: boolean) => {
      setVoiceStatus((prev) =>
        prev.conn === conn && prev.speaking === speaking && prev.muted === muted
          ? prev
          : { conn, speaking, muted }
      );
    },
    []
  );

  const handleConsumePendingCommand = useCallback(() => {
    setPendingVoiceCommand(null);
  }, []);

  const handleToggleWakeWord = useCallback(() => {
    if (!wakeWordSupported) return;
    setWakeWordArmed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(WAKE_WORD_PREF_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, [wakeWordSupported]);

  const handleToggleWebSearch = useCallback(() => {
    setWebSearchEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(WEB_SEARCH_PREF_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const providerMenuRef = useRef<HTMLDivElement | null>(null);
  const wakeHandleRef = useRef<WakeWordMonitorHandle | null>(null);

  const activeSession = useMemo(() => {
    const found = sessions.find((s) => s.id === activeSessionId);
    return found || sessions[0];
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (!activeSession && sessions.length > 0) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSession, sessions]);

  // Persist chat sessions
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeSessionsForStorage(sessions));
      if (activeSession?.id) {
        window.localStorage.setItem(ACTIVE_SESSION_KEY, activeSession.id);
      }
    } catch {
      // ignore quota errors
    }
  }, [sessions, activeSession?.id]);

  // Hands-free Voice Activation Wake-Word Monitor ("Hey B.A.R.B.I.", "Hey Barbie", "Hey B", "Barbie")
  // Automatically pauses while Gemini Live WebSocket is active so microphone never conflicts
  useEffect(() => {
    if (!wakeWordArmed || !wakeWordSupported) {
      wakeHandleRef.current?.stop();
      wakeHandleRef.current = null;
      setWakeWordStatusText('');
      return;
    }

    if (voiceStatus.conn === 'connected' || voiceStatus.conn === 'connecting') {
      wakeHandleRef.current?.stop();
      wakeHandleRef.current = null;
      setWakeWordStatusText('Live Voice Active (Wake Monitor Standby)');
      return;
    }

    const handle = startWakeWordMonitor({
      onWake: (match) => {
        setWakeWordStatusText(`Activated by "${match.triggerLabel}"`);
        setVoiceMode(true);
        setVoiceMinimized(false);
        setIsOpen(true);
        window.__barbiChatPanelOpen = true;
        if (match.trailingCommand) {
          setPendingVoiceCommand({ id: Date.now(), text: match.trailingCommand });
        }
        setAutoConnectToken((t) => t + 1);
      },
      onStatus: (status, detail) => {
        if (status === 'listening') {
          setWakeWordStatusText('Voice Wake Active · Listening for B.A.R.B.I');
        } else if (status === 'denied') {
          setWakeWordStatusText(detail || 'Microphone permission required for wake word.');
          setWakeWordArmed(false);
          try {
            window.localStorage.setItem(WAKE_WORD_PREF_KEY, 'false');
          } catch {
            // ignore
          }
        } else if (status === 'unsupported') {
          setWakeWordStatusText('Speech recognition unsupported in this browser.');
        }
      },
    });
    wakeHandleRef.current = handle;

    return () => {
      handle.stop();
      if (wakeHandleRef.current === handle) {
        wakeHandleRef.current = null;
      }
    };
  }, [wakeWordArmed, wakeWordSupported, voiceStatus.conn]);

  // Listen for half-brain circuit launcher & dedicated Voice Mode launcher events
  useEffect(() => {
    const onToggle = (ev: Event) => {
      const custom = ev as CustomEvent<{ open?: boolean }>;
      setVoiceMinimized(false);
      setIsOpen((prev) => {
        const next = typeof custom.detail?.open === 'boolean' ? custom.detail.open : !prev;
        window.__barbiChatPanelOpen = next;
        return next;
      });
    };

    const onOpenVoice = (ev?: Event) => {
      const custom = ev as CustomEvent<{ autoConnect?: boolean; command?: string }> | undefined;
      setVoiceMode(true);
      setVoiceMinimized(false);
      setIsOpen(true);
      window.__barbiChatPanelOpen = true;
      if (custom?.detail?.command) {
        setPendingVoiceCommand({ id: Date.now(), text: custom.detail.command });
      }
      if (custom?.detail?.autoConnect !== false) {
        setAutoConnectToken((t) => t + 1);
      }
    };

    window.openBarbiVoiceMode = (opts) => {
      setVoiceMode(true);
      setVoiceMinimized(false);
      setIsOpen(true);
      window.__barbiChatPanelOpen = true;
      if (opts?.command) {
        setPendingVoiceCommand({ id: Date.now(), text: opts.command });
      }
      if (opts?.autoConnect !== false) {
        setAutoConnectToken((t) => t + 1);
      }
    };

    window.addEventListener('barbi:toggle-chat-panel', onToggle);
    window.addEventListener('barbi:open-voice-mode', onOpenVoice);
    return () => {
      window.removeEventListener('barbi:toggle-chat-panel', onToggle);
      window.removeEventListener('barbi:open-voice-mode', onOpenVoice);
    };
  }, []);

  // Sync open & live UI state to barbi-runtime.js and UI Perception Engine
  useEffect(() => {
    const visibleOpen = isOpen && !voiceMinimized;
    window.__barbiChatPanelOpen = visibleOpen;
    window.__setBarbiChatOpenState?.(visibleOpen);
    window.__barbiChatUiState = {
      open: isOpen,
      mode: voiceMode ? 'voice' : 'text',
      voiceMinimized,
      voiceConnectionState: voiceStatus.conn,
      wakeWordArmed,
    };

    if (isOpen) {
      const snap = captureBarbiUiSnapshot();
      setScreenSyncSummary(`${snap.renderState.colorTheme} · ${snap.renderState.hudGlassPreset}`);
      if (!voiceMode) {
        window.setTimeout(() => textareaRef.current?.focus(), 70);
      }
    } else {
      setProviderMenuOpen(false);
      setVoiceMode(false);
      setVoiceMinimized(false);
    }
  }, [isOpen, voiceMode, voiceMinimized, voiceStatus.conn, wakeWordArmed]);

  // Escape key to close panel
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (providerMenuOpen) {
          setProviderMenuOpen(false);
        } else {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, providerMenuOpen]);

  // Close provider dropdown on outside click
  useEffect(() => {
    if (!providerMenuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)) {
        setProviderMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [providerMenuOpen]);

  // Fetch configured AI providers whenever chat panel opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    barbiApi
      .getProviders()
      .then((res) => {
        if (cancelled || !Array.isArray(res?.providers)) return;
        const list: ChatProviderOption[] = res.providers
          .filter((p) => p.configured && p.enabled)
          .map((p) => ({
            id: p.id,
            name: p.name,
            modelId: p.modelId,
            configured: p.configured,
            enabled: p.enabled,
            status: p.status,
            remainingQuotaPct: p.remainingQuotaPct,
            remainingTokensToday: p.remainingTokensToday,
          }));
        setProviders(list);
      })
      .catch(() => {
        // Keep current list on transient error
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Auto-scroll on message updates
  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isOpen, activeSession?.messages.length, activeSession?.messages[activeSession.messages.length - 1]?.content]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, [input]);

  const activeProviderLabel = useMemo(() => {
    if (selectedProviderId === 'auto') {
      const primary = providers.find((p) => p.id === 'gemini') || providers[0];
      return primary ? `Auto · ${primary.modelId}` : 'Auto · B.A.R.B.I. Mesh';
    }
    const chosen = providers.find((p) => p.id === selectedProviderId);
    return chosen ? `${chosen.name} · ${chosen.modelId}` : selectedProviderId;
  }, [selectedProviderId, providers]);

  const filteredSessions = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const sorted = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (!q) return sorted;
    return sorted.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [sessions, historySearch]);

  const handleNewChat = useCallback(() => {
    if (isSending) {
      abortRef.current?.abort();
      setIsSending(false);
    }
    const fresh = createChatSession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    setInput('');
    setAttachments([]);
    setEditingMsgId(null);
    setVoiceMode(false);
    window.setTimeout(() => textareaRef.current?.focus(), 40);
  }, [isSending]);

  const handleCommitLiveVoiceTurn = useCallback(
    (userText: string, assistantText: string) => {
      if (!activeSession) return;
      const sessionId = activeSession.id;
      const nowIso = new Date().toISOString();
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          let updated = s;
          if (userText.trim()) {
            updated = appendMessageToSession(
              updated,
              {
                id: makeMessageId('usr'),
                role: 'user',
                content: userText.trim(),
                createdAt: nowIso,
              },
              nowIso
            );
          }
          if (assistantText.trim()) {
            updated = appendMessageToSession(
              updated,
              {
                id: makeMessageId('ast'),
                role: 'assistant',
                content: assistantText.trim(),
                createdAt: nowIso,
                model: 'gemini-3.8-live',
                providerId: 'gemini',
              },
              nowIso
            );
          }
          return updated;
        })
      );
    },
    [activeSession]
  );

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fresh = createChatSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSession?.id === id) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  };

  const updateAssistantMessage = useCallback(
    (sessionId: string, assistantId: string, updater: (msg: ChatMessage) => ChatMessage) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            updatedAt: new Date().toISOString(),
            messages: s.messages.map((m) => (m.id === assistantId ? updater(m) : m)),
          };
        })
      );
    },
    []
  );

  const applyReplyDirectives = useCallback((rawReply: string): string => {
    const parsed = extractChatUiDirectives(rawReply);
    const notes: string[] = [];
    let shouldClose = false;

    for (const mut of parsed.mutations) {
      const res = executeBarbiUiRenderMutation(mut);
      notes.push(res.label);
    }

    for (const act of parsed.actions) {
      const res = executeBarbiUiAction(act);
      notes.push(res.label);
      if (res.shouldCloseChat) shouldClose = true;
    }

    if (notes.length > 0) {
      setLastUiExecNote(`Executed: ${notes.join(' · ')}`);
      const snap = captureBarbiUiSnapshot();
      setScreenSyncSummary(`${snap.renderState.colorTheme} · ${snap.renderState.hudGlassPreset}`);
    }

    if (shouldClose) {
      window.setTimeout(() => setIsOpen(false), 180);
    }

    return parsed.cleanText || (notes.length > 0 ? `Executed ${notes.join(', ')}.` : rawReply);
  }, []);

  const executePromptTurn = useCallback(
    async (
      promptText: string,
      opts?: {
        baseMessages?: ChatMessage[];
        turnAttachments?: ChatAttachmentMeta[];
      }
    ) => {
      const trimmed = promptText.trim();
      const attached = opts?.turnAttachments ?? attachments;
      if ((!trimmed && attached.length === 0) || isSending || !activeSession) return;

      const sessionId = activeSession.id;
      const effectivePrompt =
        trimmed ||
        `Analyze the attached file${attached.length > 1 ? 's' : ''}: ${attached.map((a) => a.name).join(', ')}`;

      const priorMessages = opts?.baseMessages ?? activeSession.messages;
      const historyPayload = buildApiHistory(priorMessages, 12);
      const liveUiSnapshot = captureBarbiUiSnapshot();
      setScreenSyncSummary(`${liveUiSnapshot.renderState.colorTheme} · ${liveUiSnapshot.renderState.hudGlassPreset}`);

      const userMsg: ChatMessage = {
        id: makeMessageId('usr'),
        role: 'user',
        content: effectivePrompt,
        createdAt: new Date().toISOString(),
        attachments: attached.map((a) => ({ name: a.name, mimeType: a.mimeType })),
      };

      const assistantId = makeMessageId('ast');
      const placeholderAssistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        isStreaming: true,
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const baseSession: ChatSession = opts?.baseMessages
            ? { ...s, messages: opts.baseMessages }
            : s;
          const withUser = appendMessageToSession(baseSession, userMsg);
          return appendMessageToSession(withUser, placeholderAssistant);
        })
      );

      setInput('');
      setAttachments([]);
      setEditingMsgId(null);
      setIsSending(true);
      setLastUiExecNote(null);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const startedAt = Date.now();

      const requestPayload: Record<string, unknown> = {
        prompt: effectivePrompt,
        conversationKey: sessionId,
        history: historyPayload,
        deepThink,
        enableGoogleSearch: webSearchEnabled,
        uiSnapshot: formatUiSnapshotForPrompt(liveUiSnapshot),
        allowAutoFailover: selectedProviderId === 'auto',
        ...(selectedProviderId !== 'auto' ? { providerId: selectedProviderId } : {}),
        ...(attached.length > 0
          ? {
              attachments: attached.map((a) => ({
                name: a.name,
                mimeType: a.mimeType,
                ...(a.base64Data ? { base64Data: a.base64Data } : {}),
                ...(a.textExcerpt ? { textExcerpt: a.textExcerpt } : {}),
              })),
            }
          : {}),
      };

      let receivedAnyDelta = false;

      try {
        const result = await barbiApi.chatStream(requestPayload, {
          signal: ctrl.signal,
          onMeta: (meta) => {
            updateAssistantMessage(sessionId, assistantId, (msg) => ({
              ...msg,
              model: meta.model,
              providerId: meta.providerId,
              thinkingLevel: meta.thinkingLevel,
              activatedNodes: meta.activatedNodes,
            }));
          },
          onGrounding: (grounding) => {
            updateAssistantMessage(sessionId, assistantId, (msg) => ({
              ...msg,
              grounding,
            }));
          },
          onDelta: (delta) => {
            receivedAnyDelta = true;
            updateAssistantMessage(sessionId, assistantId, (msg) => ({
              ...msg,
              content: msg.content + delta,
            }));
          },
        });

        const finalCleanReply = applyReplyDirectives(result.reply || '');
        updateAssistantMessage(sessionId, assistantId, (msg) => ({
          ...msg,
          content: finalCleanReply || stripIncompleteDirectives(msg.content),
          model: result.model || msg.model,
          providerId: result.activeProviderId || msg.providerId,
          thinkingLevel: result.thinkingLevel || msg.thinkingLevel,
          latencyMs: result.latencyMs || Date.now() - startedAt,
          activatedNodes: result.activatedNodes?.length ? result.activatedNodes : msg.activatedNodes,
          toolInvocations: result.toolInvocations?.length ? result.toolInvocations : msg.toolInvocations,
          grounding: result.grounding ?? msg.grounding,
          isStreaming: false,
          error: undefined,
        }));
      } catch (streamErr) {
        if (ctrl.signal.aborted) {
          updateAssistantMessage(sessionId, assistantId, (msg) => ({
            ...msg,
            content: stripIncompleteDirectives(msg.content).trim() || 'Generation stopped.',
            isStreaming: false,
          }));
          return;
        }

        if (!receivedAnyDelta) {
          try {
            const fallbackRes = await barbiApi.chatTurn(requestPayload);
            const finalCleanReply = applyReplyDirectives(fallbackRes.reply || 'No response received.');
            updateAssistantMessage(sessionId, assistantId, (msg) => ({
              ...msg,
              content: finalCleanReply,
              model: fallbackRes.model,
              providerId: fallbackRes.activeProviderId || fallbackRes.provider,
              thinkingLevel: fallbackRes.thinkingLevel,
              latencyMs: Date.now() - startedAt,
              activatedNodes: fallbackRes.activatedNodes,
              toolInvocations: fallbackRes.toolInvocations,
              grounding: fallbackRes.grounding ?? msg.grounding,
              isStreaming: false,
              error: fallbackRes.fallback && fallbackRes.error ? formatApiErrorMessage(fallbackRes.error) : undefined,
            }));
            return;
          } catch (fallbackErr) {
            const formatted = formatApiErrorMessage(fallbackErr);
            updateAssistantMessage(sessionId, assistantId, (msg) => ({
              ...msg,
              content: '',
              error: formatted,
              isStreaming: false,
            }));
            return;
          }
        }

        const formatted = formatApiErrorMessage(streamErr);
        updateAssistantMessage(sessionId, assistantId, (msg) => ({
          ...msg,
          error: formatted,
          isStreaming: false,
        }));
      } finally {
        if (abortRef.current === ctrl) {
          abortRef.current = null;
        }
        setIsSending(false);
      }
    },
    [
      activeSession,
      applyReplyDirectives,
      attachments,
      deepThink,
      isSending,
      selectedProviderId,
      updateAssistantMessage,
      webSearchEnabled,
    ]
  );

  const handleStopGenerating = () => {
    abortRef.current?.abort();
  };

  const handleRegenerateLast = () => {
    if (!activeSession || isSending) return;
    const msgs = activeSession.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i -= 1) {
      if (msgs[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;
    const lastUserPrompt = msgs[lastUserIdx].content;
    const trimmedBase = msgs.slice(0, lastUserIdx);
    void executePromptTurn(lastUserPrompt, { baseMessages: trimmedBase, turnAttachments: [] });
  };

  const handleEditSaveResend = (msgIndex: number) => {
    if (!activeSession || isSending || !editingText.trim()) return;
    const trimmedBase = activeSession.messages.slice(0, msgIndex);
    void executePromptTurn(editingText.trim(), { baseMessages: trimmedBase, turnAttachments: [] });
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      window.setTimeout(() => setCopiedMsgId(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleComposerKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void executePromptTurn(input);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    if (files.length === 0) return;

    const loaded: ChatAttachmentMeta[] = [];
    for (const file of files) {
      const mimeType = file.type || 'text/plain';
      if (mimeType.startsWith('image/')) {
        const base64Data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const raw = String(reader.result || '');
            resolve(raw.includes(',') ? raw.split(',')[1] : raw);
          };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
        loaded.push({
          id: makeMessageId('att'),
          name: file.name,
          mimeType,
          sizeBytes: file.size,
          base64Data,
        });
      } else {
        const textExcerpt = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || '').slice(0, 8000));
          reader.onerror = () => resolve('');
          reader.readAsText(file);
        });
        loaded.push({
          id: makeMessageId('att'),
          name: file.name,
          mimeType,
          sizeBytes: file.size,
          textExcerpt,
        });
      }
    }

    setAttachments((prev) => [...prev, ...loaded].slice(0, 4));
    e.target.value = '';
  };

  const messages = activeSession?.messages ?? [];

  return (
    <>
      {/* Persistent Hands-Free Wake Word Toggle near bottom dock when chat panel is closed */}
      {!isOpen && wakeWordSupported && (
        <button
          id="btn-floating-wake-word"
          type="button"
          onClick={handleToggleWakeWord}
          aria-pressed={wakeWordArmed}
          title={
            wakeWordArmed
              ? 'B.A.R.B.I voice activation armed (click to disarm)'
              : 'Enable hands-free B.A.R.B.I voice activation'
          }
          className={`fixed bottom-[72px] left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-1.5 px-3 py-1 backdrop-blur-xl border text-[10.5px] font-mono-tech tracking-wider transition-all cursor-pointer pointer-events-auto barbi-scifi-cut-sm ${
            wakeWordArmed
              ? 'bg-emerald-950/75 border-emerald-400/55 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.28)]'
              : 'bg-black/65 border-amber-500/30 text-stone-300 hover:text-amber-100 hover:border-amber-400/55'
          }`}
        >
          <Radio className="w-3 h-3 shrink-0" />
          <span className="whitespace-nowrap">
            {wakeWordArmed ? 'VOICE WAKE: B.A.R.B.I' : 'ARM B.A.R.B.I VOICE'}
          </span>
        </button>
      )}

      {/* Minimized Live Voice Bar when navigating B.A.R.B.I. modules mid-call */}
      {isOpen && voiceMode && voiceMinimized && (
        <div
          id="barbi-live-voice-floating-bar"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-3 px-4 py-2 bg-[#0c0906]/92 border border-amber-400/55 shadow-[0_12px_36px_rgba(0,0,0,0.85)] backdrop-blur-xl text-xs text-amber-50 barbi-scifi-cut-sm"
        >
          <AudioLines className="w-4 h-4 text-amber-300 shrink-0" />
          <span className="font-mono-tech text-[11px] whitespace-nowrap">
            {voiceStatus.speaking
              ? 'B.A.R.B.I. Speaking'
              : voiceStatus.muted
                ? 'Voice Link Muted'
                : 'B.A.R.B.I. Voice Listening'}
          </span>
          <button
            type="button"
            onClick={() => setVoiceMinimized(false)}
            className="px-2.5 py-1 bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400/50 text-[11px] font-medium text-amber-100 whitespace-nowrap cursor-pointer"
          >
            Expand Deck
          </button>
        </div>
      )}

      {isOpen && (
        <div
          id="barbi-llm-chat-backdrop"
          className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-[84px] sm:pb-[74px] px-2.5 sm:px-6 pointer-events-none select-text ${
            voiceMode && voiceMinimized ? 'opacity-0 pointer-events-none invisible' : ''
          }`}
        >
          {/* Click-away obsidian glass dimmer */}
          <div
            aria-hidden="true"
            onClick={() => {
              if (voiceMode && (voiceStatus.conn === 'connected' || voiceStatus.conn === 'connecting')) {
                setVoiceMinimized(true);
              } else {
                setIsOpen(false);
              }
            }}
            className={`fixed inset-0 bg-black/50 backdrop-blur-[3px] ${
              voiceMode && voiceMinimized ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
          />

          {/* Sci-Fi Edge Glassmorphic Chamfered Container */}
          <div className="barbi-scifi-frame-wrap relative z-10 w-full max-w-[980px] h-[min(82vh,720px)]">
            <section
              id="barbi-llm-chat-panel"
              role="dialog"
              aria-modal="true"
              aria-label="B.A.R.B.I. Neural Command Interface"
              className={`barbi-scifi-shell flex w-full h-full overflow-hidden text-stone-100 ${
                voiceMode && voiceMinimized ? 'pointer-events-none' : 'pointer-events-auto'
              }`}
            >
              {/* Precision Chamfered SVG Perimeter Hairline + Corner Fiducial Brackets */}
              <svg
                className="hud-frame-svg-overlay"
                viewBox="0 0 980 720"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polygon
                  points="18,1 962,1 979,18 979,702 962,719 18,719 1,702 1,18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <polyline points="1,54 1,18 18,1 62,1" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <polyline points="918,1 962,1 979,18 979,54" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <polyline points="1,666 1,702 18,719 62,719" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <polyline points="918,719 962,719 979,702 979,666" fill="none" stroke="currentColor" strokeWidth="1.8" />
              </svg>

              {/* Collapsible Thread History Sidebar */}
              {historyOpen && !voiceMode && (
                <aside
                  aria-label="Chat history"
                  className="relative z-10 w-[236px] shrink-0 flex flex-col border-r border-amber-500/20 bg-black/55 backdrop-blur-xl"
                >
                  <div className="p-3 border-b border-white/[0.08] space-y-2">
                    <button
                      type="button"
                      onClick={handleNewChat}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500/18 hover:bg-amber-500/28 border border-amber-400/45 text-xs font-medium text-amber-50 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Thread</span>
                    </button>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Filter memory threads..."
                        aria-label="Search chat threads"
                        className="w-full pl-8 pr-2.5 py-1.5 bg-white/[0.04] border border-white/[0.1] text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400/50"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {filteredSessions.map((session) => {
                      const isActive = session.id === activeSession?.id;
                      return (
                        <div
                          key={session.id}
                          className={`group flex items-center justify-between gap-1.5 px-2.5 py-2 text-xs transition-colors ${
                            isActive
                              ? 'bg-amber-500/18 text-amber-50 border border-amber-400/35'
                              : 'text-stone-300 hover:bg-white/[0.05] border border-transparent'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveSessionId(session.id)}
                            className="flex-1 text-left truncate cursor-pointer"
                            title={session.title}
                          >
                            {session.title}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(session.id)}
                            aria-label={`Delete chat ${session.title}`}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-stone-400 hover:text-red-300 transition-opacity cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </aside>
              )}

              {/* Main Neural Interface Column */}
              <div className="relative z-10 flex-1 flex flex-col min-w-0">
                {/* Sci-Fi Edge Command Header */}
                <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-amber-500/22 bg-gradient-to-r from-black/60 via-black/40 to-black/60 backdrop-blur-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {!voiceMode && (
                      <button
                        id="btn-chat-history-toggle"
                        type="button"
                        onClick={() => setHistoryOpen((prev) => !prev)}
                        aria-pressed={historyOpen}
                        title="Toggle thread history"
                        aria-label="Toggle thread history"
                        className={`p-1.5 border transition-colors cursor-pointer ${
                          historyOpen
                            ? 'bg-amber-500/22 border-amber-400/50 text-amber-100'
                            : 'bg-white/[0.03] border-white/[0.1] text-stone-300 hover:text-white hover:bg-white/[0.08]'
                        }`}
                      >
                        <History className="w-4 h-4" />
                      </button>
                    )}

                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex items-center justify-center w-8 h-8 border border-amber-400/50 bg-amber-500/14 text-amber-300 shrink-0 barbi-scifi-cut-sm">
                        <HalfBrainCircuitIcon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-[13px] font-semibold tracking-wider uppercase text-white truncate">
                          {voiceMode
                            ? 'B.A.R.B.I. Voice Core'
                            : activeSession?.messages.length
                              ? activeSession.title
                              : 'B.A.R.B.I. Neural Core'}
                        </h2>
                        <div className="flex items-center gap-2 text-[10px] font-mono-tech text-stone-400">
                          <span className="inline-flex items-center gap-1 text-cyan-300/85">
                            <ScanEye className="w-3 h-3 shrink-0" />
                            <span>Screen Sync: {screenSyncSummary}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Controls: Mode Switch, Provider, Wake Word, Deep Think, Close */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Crisp Segmented Text Core | Voice Deck Toggle */}
                    <div
                      role="group"
                      aria-label="Interface mode"
                      className="inline-flex items-center p-0.5 bg-black/55 border border-white/[0.12]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setVoiceMinimized(false);
                          setVoiceMode(false);
                        }}
                        aria-pressed={!voiceMode}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono-tech whitespace-nowrap cursor-pointer transition-colors ${
                          !voiceMode
                            ? 'bg-amber-500/24 border border-amber-400/50 text-amber-100'
                            : 'border border-transparent text-stone-400 hover:text-stone-100'
                        }`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span className="hidden sm:inline">Text Core</span>
                      </button>
                      <button
                        id="btn-chat-live-voice"
                        type="button"
                        onClick={() => {
                          setVoiceMode(true);
                          setVoiceMinimized(false);
                        }}
                        aria-pressed={voiceMode}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono-tech whitespace-nowrap cursor-pointer transition-colors ${
                          voiceMode
                            ? 'bg-amber-500/24 border border-amber-400/50 text-amber-100'
                            : 'border border-transparent text-stone-400 hover:text-stone-100'
                        }`}
                      >
                        <AudioLines className="w-3 h-3 text-amber-300" />
                        <span className="hidden sm:inline">Voice Deck</span>
                      </button>
                    </div>

                    {!voiceMode && (
                      <>
                        {/* Model / Provider Dropdown */}
                        <div className="relative" ref={providerMenuRef}>
                          <button
                            id="btn-chat-provider-select"
                            type="button"
                            onClick={() => setProviderMenuOpen((prev) => !prev)}
                            aria-expanded={providerMenuOpen}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-[11px] font-mono-tech text-amber-100/90 max-w-[185px] transition-colors cursor-pointer"
                          >
                            <Cpu className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">{activeProviderLabel}</span>
                            <ChevronDown className="w-3 h-3 text-stone-400 shrink-0" />
                          </button>

                          {providerMenuOpen && (
                            <div
                              role="menu"
                              className="absolute right-0 mt-1.5 w-64 bg-[#0d0a07]/96 backdrop-blur-xl border border-amber-500/40 shadow-2xl py-1.5 z-30"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setSelectedProviderId('auto');
                                  setProviderMenuOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                                  selectedProviderId === 'auto'
                                    ? 'bg-amber-500/20 text-amber-50'
                                    : 'text-stone-200 hover:bg-white/[0.06]'
                                }`}
                              >
                                <div>
                                  <div className="font-medium">Auto (Smart Failover)</div>
                                  <div className="text-[10px] text-stone-400 font-mono-tech">
                                    Uses best available active API
                                  </div>
                                </div>
                                {selectedProviderId === 'auto' && <Check className="w-3.5 h-3.5 text-amber-300" />}
                              </button>

                              {providers.length > 0 && <div className="my-1 border-t border-white/[0.08]" />}

                              {providers.map((p) => {
                                const active = selectedProviderId === p.id;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setSelectedProviderId(p.id);
                                      setProviderMenuOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                                      active
                                        ? 'bg-amber-500/20 text-amber-50'
                                        : 'text-stone-200 hover:bg-white/[0.06]'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div className="font-medium truncate">{p.name}</div>
                                      <div className="text-[10px] text-stone-400 font-mono-tech truncate">
                                        {p.modelId}
                                      </div>
                                    </div>
                                    {active && <Check className="w-3.5 h-3.5 text-amber-300 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <button
                          id="btn-chat-deep-think"
                          type="button"
                          onClick={() => setDeepThink((prev) => !prev)}
                          aria-pressed={deepThink}
                          title="Toggle deeper reasoning mode"
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 border text-[11px] font-mono-tech transition-colors cursor-pointer ${
                            deepThink
                              ? 'bg-amber-500/22 border-amber-400/55 text-amber-100'
                              : 'bg-white/[0.03] border-white/[0.1] text-stone-400 hover:text-stone-100 hover:bg-white/[0.07]'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">Deep</span>
                        </button>

                        <button
                          id="btn-chat-new-thread"
                          type="button"
                          onClick={handleNewChat}
                          title="Start a new thread"
                          className="hidden md:inline-flex items-center gap-1 px-2 py-1.5 bg-white/[0.03] hover:bg-white/[0.09] border border-white/[0.1] text-[11px] font-mono-tech text-stone-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}

                    <button
                      id="btn-chat-panel-close"
                      type="button"
                      onClick={() => setIsOpen(false)}
                      aria-label="Close B.A.R.B.I. panel"
                      className="p-1.5 bg-white/[0.04] hover:bg-red-500/30 border border-white/[0.12] text-stone-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </header>

                {voiceMode ? (
                  <LiveVoicePanel
                    onCommitTurn={handleCommitLiveVoiceTurn}
                    onExitVoiceMode={() => {
                      setVoiceMinimized(false);
                      setVoiceMode(false);
                    }}
                    onClosePanel={() => setIsOpen(false)}
                    onRequestMinimize={() => setVoiceMinimized(true)}
                    onConnectionChange={handleVoiceConnectionChange}
                    autoConnectToken={autoConnectToken}
                    pendingCommand={pendingVoiceCommand}
                    onConsumePendingCommand={handleConsumePendingCommand}
                    wakeWordArmed={wakeWordArmed}
                    wakeWordSupported={wakeWordSupported}
                    wakeWordStatusText={wakeWordStatusText}
                    onToggleWakeWord={handleToggleWakeWord}
                  />
                ) : (
                  <>
                    {/* Scrollable Message Viewport */}
                    <div
                      id="barbi-chat-messages"
                      className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5"
                    >
                      {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center">
                          <div className="w-12 h-12 bg-amber-500/12 border border-amber-400/45 flex items-center justify-center text-amber-300 mb-4 shadow-[0_0_26px_rgba(245,158,11,0.16)] barbi-scifi-cut-sm">
                            <HalfBrainCircuitIcon className="w-6 h-6" />
                          </div>
                          <h3 className="text-lg font-semibold tracking-wide text-white">
                            B.A.R.B.I. Neural Interface Online
                          </h3>
                          <p className="mt-1.5 text-xs text-stone-400 max-w-lg leading-relaxed">
                            Live Google Search grounding, screen perception, and UI render control active. Ask about current events or technical docs, inspect what&apos;s on screen, or launch any B.A.R.B.I. module.
                          </p>

                          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                            {STARTER_PROMPTS.map((item) => (
                              <button
                                key={item.title}
                                type="button"
                                onClick={() => void executePromptTurn(item.prompt)}
                                className="group p-3.5 bg-white/[0.03] hover:bg-amber-500/[0.09] border border-white/[0.1] hover:border-amber-400/45 transition-all cursor-pointer"
                              >
                                <div className="text-xs font-medium text-amber-50 group-hover:text-white">
                                  {item.title}
                                </div>
                                <div className="mt-1 text-[11px] text-stone-400 leading-snug">
                                  {item.subtitle}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-3xl mx-auto space-y-6">
                          {messages.map((msg, idx) => {
                            const isUser = msg.role === 'user';
                            const isLastAssistant = !isUser && idx === messages.length - 1;

                            if (isUser) {
                              const isEditing = editingMsgId === msg.id;
                              return (
                                <div key={msg.id} className="flex flex-col items-end group">
                                  {isEditing ? (
                                    <div className="w-full max-w-[85%] bg-white/[0.06] border border-amber-400/45 p-3 space-y-2">
                                      <textarea
                                        value={editingText}
                                        onChange={(e) => setEditingText(e.target.value)}
                                        rows={3}
                                        className="w-full bg-transparent text-sm text-white focus:outline-none resize-none"
                                      />
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setEditingMsgId(null)}
                                          className="px-2.5 py-1 text-xs text-stone-300 hover:text-white cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleEditSaveResend(idx)}
                                          className="px-3 py-1 bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/45 text-xs font-medium text-amber-50 cursor-pointer"
                                        >
                                          Send
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="max-w-[82%] px-4 py-2.5 bg-amber-500/14 border border-amber-400/35 text-[14px] leading-relaxed text-amber-50 whitespace-pre-wrap break-words backdrop-blur-md">
                                        {msg.attachments && msg.attachments.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 mb-2">
                                            {msg.attachments.map((att, aIdx) => (
                                              <span
                                                key={aIdx}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-black/45 border border-amber-400/30 text-[11px] font-mono-tech text-amber-200"
                                              >
                                                {att.mimeType.startsWith('image/') ? (
                                                  <ImageIcon className="w-3 h-3" />
                                                ) : (
                                                  <FileText className="w-3 h-3" />
                                                )}
                                                {att.name}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        {msg.content}
                                      </div>

                                      {!isSending && (
                                        <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingMsgId(msg.id);
                                              setEditingText(msg.content);
                                            }}
                                            title="Edit and resend"
                                            className="p-1 text-stone-400 hover:text-amber-200 cursor-pointer"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void handleCopyMessage(msg)}
                                            title="Copy prompt"
                                            className="p-1 text-stone-400 hover:text-amber-200 cursor-pointer"
                                          >
                                            {copiedMsgId === msg.id ? (
                                              <Check className="w-3 h-3 text-emerald-400" />
                                            ) : (
                                              <Copy className="w-3 h-3" />
                                            )}
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div key={msg.id} className="flex items-start gap-3 group">
                                <div className="w-7 h-7 bg-amber-500/12 border border-amber-400/35 flex items-center justify-center text-amber-300 shrink-0 mt-0.5">
                                  <HalfBrainCircuitIcon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  {msg.error && !msg.content ? (
                                    <div
                                      role="alert"
                                      className="flex items-start justify-between gap-3 p-3 bg-red-950/50 border border-red-500/40 text-xs text-red-100"
                                    >
                                      <div className="flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                        <span className="leading-relaxed">{msg.error}</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={handleRegenerateLast}
                                        className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/35 border border-red-400/45 text-red-50 whitespace-nowrap shrink-0 cursor-pointer"
                                      >
                                        Retry
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <AssistantMarkdown
                                        content={msg.content}
                                        isStreaming={msg.isStreaming}
                                        webSearchActive={webSearchEnabled}
                                      />
                                      {msg.grounding && <GroundingSourcesBlock grounding={msg.grounding} />}
                                      {msg.error && (
                                        <div className="mt-2 text-[11px] text-amber-300/90 font-mono-tech">
                                          Notice: {msg.error}
                                        </div>
                                      )}
                                    </>
                                  )}

                                  {!msg.isStreaming && msg.content && (
                                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => void handleCopyMessage(msg)}
                                          title="Copy response"
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/[0.06] text-stone-400 hover:text-stone-100 transition-colors cursor-pointer"
                                        >
                                          {copiedMsgId === msg.id ? (
                                            <Check className="w-3 h-3 text-emerald-400" />
                                          ) : (
                                            <Copy className="w-3 h-3" />
                                          )}
                                          <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                                        </button>
                                        {isLastAssistant && !isSending && (
                                          <button
                                            type="button"
                                            onClick={handleRegenerateLast}
                                            title="Regenerate response"
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/[0.06] text-stone-400 hover:text-stone-100 transition-colors cursor-pointer"
                                          >
                                            <RefreshCw className="w-3 h-3" />
                                            <span>Regenerate</span>
                                          </button>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 font-mono-tech text-[10.5px] text-stone-500">
                                        {msg.grounding && msg.grounding.sources.length > 0 && (
                                          <span className="text-cyan-300/85">
                                            Web Grounded ({msg.grounding.sources.length})
                                          </span>
                                        )}
                                        {msg.model && <span>{msg.model}</span>}
                                        {msg.latencyMs ? <span>· {formatLatencyLabel(msg.latencyMs)}</span> : null}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </div>

                    {/* Live UI Execution Feedback Bar (when B.A.R.B.I. executes actions/mutations from text) */}
                    {lastUiExecNote && (
                      <div className="px-4 sm:px-6 py-1.5 border-t border-cyan-500/20 bg-cyan-950/30 flex items-center justify-between gap-2 text-[11px] font-mono-tech text-cyan-200">
                        <span className="truncate">{lastUiExecNote}</span>
                        <button
                          type="button"
                          onClick={() => setLastUiExecNote(null)}
                          className="text-cyan-300/75 hover:text-white cursor-pointer shrink-0"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {/* Sci-Fi Edge Glassmorphic Composer Dock */}
                    <div className="px-4 sm:px-6 pb-4 pt-2.5 border-t border-amber-500/20 bg-black/45 backdrop-blur-md">
                      <div className="max-w-3xl mx-auto">
                        {/* Quick Direct HUD Actions Strip */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              id="btn-chat-web-search"
                              type="button"
                              onClick={handleToggleWebSearch}
                              aria-pressed={webSearchEnabled}
                              title={
                                webSearchEnabled
                                  ? 'Google Search Grounding enabled for live web and technical docs (click to disable)'
                                  : 'Enable Google Search Grounding for live web and technical docs'
                              }
                              className={`inline-flex items-center gap-1 px-2 py-0.5 border text-[10.5px] font-mono-tech whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                                webSearchEnabled
                                  ? 'bg-cyan-500/16 border-cyan-400/50 text-cyan-100'
                                  : 'bg-white/[0.03] border-white/[0.1] text-stone-400 hover:text-stone-100 hover:border-white/25'
                              }`}
                            >
                              <Globe className="w-3 h-3 shrink-0" />
                              <span>{webSearchEnabled ? 'Web Search: ON' : 'Web Search: OFF'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void executePromptTurn('Read my current screen state and tell me what is open and active.')}
                              disabled={isSending}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/[0.03] hover:bg-amber-500/15 border border-white/[0.1] hover:border-amber-400/40 text-[10.5px] font-mono-tech text-stone-300 hover:text-amber-100 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                            >
                              <ScanEye className="w-3 h-3 text-cyan-300 shrink-0" />
                              <span>Read Screen</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsOpen(false);
                                window.dispatchEvent(new CustomEvent('barbi:toggle-gods-eye', { detail: { open: true } }));
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/35 text-[10.5px] font-mono-tech text-cyan-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3 h-3 shrink-0" />
                              <span>Open God&apos;s Eye</span>
                            </button>
                          </div>

                          {wakeWordSupported && (
                            <button
                              type="button"
                              onClick={handleToggleWakeWord}
                              aria-pressed={wakeWordArmed}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 border text-[10.5px] font-mono-tech transition-colors cursor-pointer ${
                                wakeWordArmed
                                  ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200'
                                  : 'bg-white/[0.03] border-white/[0.1] text-stone-400 hover:text-stone-100'
                              }`}
                            >
                              <Radio className="w-3 h-3" />
                              <span>{wakeWordArmed ? 'Wake Armed' : 'Wake Off'}</span>
                            </button>
                          )}
                        </div>

                        {attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {attachments.map((att) => (
                              <span
                                key={att.id}
                                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 bg-amber-500/12 border border-amber-400/35 text-[11px] font-mono-tech text-amber-100"
                              >
                                {att.mimeType.startsWith('image/') ? (
                                  <ImageIcon className="w-3 h-3 text-amber-300" />
                                ) : (
                                  <FileText className="w-3 h-3 text-amber-300" />
                                )}
                                <span className="max-w-[160px] truncate">{att.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                                  aria-label={`Remove ${att.name}`}
                                  className="p-0.5 hover:text-white cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="barbi-scifi-composer flex items-end gap-2 px-3 py-2 transition-colors">
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.py,.cpp,.h,.html,.css"
                            onChange={(e) => void handleFileChange(e)}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            title="Attach file or image"
                            aria-label="Attach file or image"
                            disabled={isSending}
                            className="p-2 text-stone-400 hover:text-amber-200 hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                          >
                            <Paperclip className="w-4 h-4" />
                          </button>

                          <textarea
                            id="barbi-llm-chat-input"
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleComposerKeyDown}
                            placeholder="Command or message B.A.R.B.I. (reads screen, mutates UI, opens & closes panels)..."
                            rows={1}
                            className="flex-1 bg-transparent py-1.5 text-[14px] text-white placeholder:text-stone-500 focus:outline-none resize-none max-h-[150px] leading-relaxed"
                          />

                          <button
                            type="button"
                            onClick={() => {
                              setVoiceMode(true);
                              setAutoConnectToken((t) => t + 1);
                            }}
                            title="Activate real-time voice mode (Gemini Live)"
                            aria-label="Activate real-time voice mode"
                            disabled={isSending}
                            className="p-2 text-amber-300/85 hover:text-amber-200 hover:bg-amber-500/15 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                          >
                            <AudioLines className="w-4 h-4" />
                          </button>

                          {isSending ? (
                            <button
                              id="btn-chat-stop"
                              type="button"
                              onClick={handleStopGenerating}
                              aria-label="Stop generating"
                              title="Stop generating"
                              className="flex items-center justify-center w-9 h-9 bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/50 text-amber-100 transition-colors cursor-pointer shrink-0"
                            >
                              <Square className="w-3.5 h-3.5 fill-current" />
                            </button>
                          ) : (
                            <button
                              id="btn-chat-send"
                              type="button"
                              onClick={() => void executePromptTurn(input)}
                              disabled={!input.trim() && attachments.length === 0}
                              aria-label="Send message"
                              title="Send message"
                              className="flex items-center justify-center w-9 h-9 bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 barbi-scifi-cut-sm"
                            >
                              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
