export interface SpeechCapabilities {
  hasRecognition: boolean;
  hasSynthesis: boolean;
  hasMediaRecorder: boolean;
  hasGetUserMedia: boolean;
}

export interface SpeechErrorInfo {
  code: string;
  userMessage: string;
  recoverable: boolean;
  suggestFallback: boolean;
}

export function detectSpeechCapabilities(win?: {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
  speechSynthesis?: unknown;
  MediaRecorder?: unknown;
  navigator?: { mediaDevices?: { getUserMedia?: unknown } };
}): SpeechCapabilities {
  const w = win || (typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {});
  const nav = (w as { navigator?: { mediaDevices?: { getUserMedia?: unknown } } }).navigator;
  return {
    hasRecognition: Boolean((w as Record<string, unknown>).SpeechRecognition || (w as Record<string, unknown>).webkitSpeechRecognition),
    hasSynthesis: Boolean((w as Record<string, unknown>).speechSynthesis),
    hasMediaRecorder: Boolean((w as Record<string, unknown>).MediaRecorder),
    hasGetUserMedia: Boolean(nav?.mediaDevices?.getUserMedia),
  };
}

export function classifySpeechError(errorCode: string): SpeechErrorInfo {
  const code = String(errorCode || 'unknown').toLowerCase();
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'permission-denied':
      return {
        code,
        userMessage: 'Microphone permission was denied. Allow microphone access in browser settings or use text / audio upload.',
        recoverable: false,
        suggestFallback: true,
      };
    case 'audio-capture':
    case 'not-found':
      return {
        code,
        userMessage: 'No active microphone hardware detected. Switched to text composer fallback.',
        recoverable: false,
        suggestFallback: true,
      };
    case 'no-speech':
      return {
        code,
        userMessage: 'No speech detected. Tap Mic and speak clearly, or type your message.',
        recoverable: true,
        suggestFallback: false,
      };
    case 'network':
      return {
        code,
        userMessage: 'Speech recognition service network error. Recording fallback or text input ready.',
        recoverable: true,
        suggestFallback: true,
      };
    case 'aborted':
      return {
        code,
        userMessage: 'Microphone dictation stopped.',
        recoverable: true,
        suggestFallback: false,
      };
    default:
      return {
        code,
        userMessage: `Voice input interrupted (${code}). Text composer remains ready.`,
        recoverable: true,
        suggestFallback: true,
      };
  }
}

export function formatTextForSpeech(rawText: string): string {
  return String(rawText || '')
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[•\-*]\s+/gm, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/°C\b/g, ' degrees Celsius')
    .replace(/↔/g, ' to ')
    .replace(/→/g, ' leads to ')
    .replace(/×/g, ' times ')
    .replace(/σ/g, 'sigma ')
    .replace(/ω_n/g, 'omega n')
    .replace(/ζ/g, 'zeta ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitIntoSpeechChunks(cleanText: string, maxLen = 190): string[] {
  const trimmed = cleanText.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const sentences = trimmed.match(/[^.!?]+[.!?]*/g) || [trimmed];
  const chunks: string[] = [];
  let current = '';

  for (const s of sentences) {
    const part = s.trim();
    if (!part) continue;
    if ((current + ' ' + part).trim().length <= maxLen) {
      current = (current + ' ' + part).trim();
    } else {
      if (current) chunks.push(current);
      if (part.length <= maxLen) {
        current = part;
      } else {
        // Split very long sentence on commas or spaces
        let rest = part;
        while (rest.length > maxLen) {
          let cut = rest.lastIndexOf(',', maxLen);
          if (cut < maxLen * 0.4) cut = rest.lastIndexOf(' ', maxLen);
          if (cut <= 0) cut = maxLen;
          chunks.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).replace(/^,\s*/, '').trim();
        }
        current = rest;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
}

export function selectPreferredVoice<T extends VoiceLike>(
  voices: T[],
  preferredVoiceName?: string,
  preferredLang = 'en'
): T | undefined {
  if (!voices || voices.length === 0) return undefined;
  if (preferredVoiceName) {
    const exact = voices.find((v) => v.name === preferredVoiceName);
    if (exact) return exact;
  }
  const femaleMatch = voices.find(
    (v) =>
      v.lang?.toLowerCase().startsWith(preferredLang.toLowerCase()) &&
      /samantha|victoria|karen|zira|aria|jenny|sonia|natasha|google uk english female|female/i.test(v.name)
  );
  if (femaleMatch) return femaleMatch;

  const langMatch = voices.find((v) => v.lang?.toLowerCase().startsWith(preferredLang.toLowerCase()));
  return langMatch || voices[0];
}
