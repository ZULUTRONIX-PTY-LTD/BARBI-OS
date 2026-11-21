export interface WakeWordMatch {
  matched: boolean;
  triggerLabel: string;
  trailingCommand: string;
}

export const BARBI_WAKE_DISPLAY_NAME = 'B.A.R.B.I';
export const BARBI_WAKE_SPOKEN_LIST: readonly string[] = ['Hey Barbie', 'Hey B', 'Barbie'];

const WAKE_WORD_PATTERNS: ReadonlyArray<{ label: string; regex: RegExp }> = [
  {
    label: BARBI_WAKE_DISPLAY_NAME,
    regex: /\bhey[\s,.\-]*(?:barbie|barbi|barby|b\.?\s*a\.?\s*r\.?\s*b\.?\s*i\.?)\b/i,
  },
  {
    label: BARBI_WAKE_DISPLAY_NAME,
    regex: /\bhey[\s,.\-]*(?:b|bee)(?:\b|(?=[,.\s!?]|$))/i,
  },
  {
    label: BARBI_WAKE_DISPLAY_NAME,
    regex: /\b(?:barbie|barbi|barby|b\.?\s*a\.?\s*r\.?\s*b\.?\s*i\.?)\b/i,
  },
];

export function detectBarbiWakePhrase(transcript: string): WakeWordMatch {
  const clean = String(transcript || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) {
    return { matched: false, triggerLabel: '', trailingCommand: '' };
  }

  for (const candidate of WAKE_WORD_PATTERNS) {
    const match = candidate.regex.exec(clean);
    if (!match) continue;

    // Avoid false positives for bare "hey b..." inside another word like "hey brother"
    const afterIndex = match.index + match[0].length;
    const remainderRaw = clean.slice(afterIndex);
    const trailingCommand = remainderRaw
      .replace(/^[\s,.:;!?-]+/, '')
      .trim();

    return {
      matched: true,
      triggerLabel: candidate.label,
      trailingCommand,
    };
  }

  return { matched: false, triggerLabel: '', trailingCommand: '' };
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence?: number;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function isWakeWordSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface WakeWordMonitorHandle {
  stop: () => void;
}

export function startWakeWordMonitor(options: {
  onWake: (match: WakeWordMatch) => void;
  onStatus?: (status: 'listening' | 'unsupported' | 'denied' | 'stopped', detail?: string) => void;
}): WakeWordMonitorHandle {
  if (typeof window === 'undefined') {
    options.onStatus?.('unsupported');
    return { stop: () => {} };
  }

  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) {
    options.onStatus?.('unsupported', 'Web Speech wake-word API is unavailable in this browser.');
    return { stop: () => {} };
  }

  let stopped = false;
  let restartTimer: number | null = null;
  let lastTriggerAt = 0;
  let recognition: SpeechRecognitionLike | null = null;

  const scheduleRestart = (delayMs = 550) => {
    if (stopped) return;
    if (restartTimer !== null) window.clearTimeout(restartTimer);
    restartTimer = window.setTimeout(() => {
      if (!stopped) begin();
    }, delayMs);
  };

  const begin = () => {
    if (stopped) return;
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      recognition = rec;

      rec.onresult = (event) => {
        if (stopped) return;
        let combined = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const item = event.results[i];
          if (item && item[0]?.transcript) {
            combined += ` ${item[0].transcript}`;
          }
        }
        const match = detectBarbiWakePhrase(combined);
        if (match.matched) {
          const now = Date.now();
          if (now - lastTriggerAt < 2400) return;
          lastTriggerAt = now;
          try {
            rec.stop();
          } catch {
            // ignore
          }
          options.onWake(match);
        }
      };

      rec.onerror = (ev) => {
        if (stopped) return;
        const code = String(ev?.error || '');
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          stopped = true;
          options.onStatus?.('denied', 'Microphone permission is required for hands-free "Hey B.A.R.B.I." wake word.');
          return;
        }
        if (code === 'no-speech' || code === 'aborted' || code === 'network') {
          scheduleRestart(900);
        }
      };

      rec.onend = () => {
        if (!stopped) {
          scheduleRestart(650);
        }
      };

      rec.start();
      options.onStatus?.('listening');
    } catch {
      scheduleRestart(1200);
    }
  };

  begin();

  return {
    stop: () => {
      stopped = true;
      if (restartTimer !== null) {
        window.clearTimeout(restartTimer);
        restartTimer = null;
      }
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          recognition.abort();
        } catch {
          try {
            recognition.stop();
          } catch {
            // ignore
          }
        }
        recognition = null;
      }
      options.onStatus?.('stopped');
    },
  };
}
