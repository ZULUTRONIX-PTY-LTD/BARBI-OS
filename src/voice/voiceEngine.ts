import { barbiApi } from '../api/barbiClient';
import {
  classifySpeechError,
  detectSpeechCapabilities,
  formatTextForSpeech,
  selectPreferredVoice,
  splitIntoSpeechChunks,
  type SpeechCapabilities,
} from './voiceLogic';

export type MicStatusState =
  | 'idle'
  | 'requesting-permission'
  | 'listening'
  | 'recording-fallback'
  | 'transcribing'
  | 'error'
  | 'unsupported';

export interface VoiceListenerCallbacks {
  onStatusChange?: (status: MicStatusState, detail: string) => void;
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (userMessage: string, suggestTextFallback: boolean) => void;
}

export interface SpeechOutputOptions {
  enabled?: boolean;
  voiceName?: string;
  pitch?: number;
  rate?: number;
  lang?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

class BarbiVoiceEngine {
  private activeRecognition: BrowserSpeechRecognition | null = null;
  private activeRecorder: MediaRecorder | null = null;
  private activeStream: MediaStream | null = null;
  private speechQueueId = 0;
  private status: MicStatusState = 'idle';

  getCapabilities(): SpeechCapabilities {
    return detectSpeechCapabilities();
  }

  getStatus(): MicStatusState {
    return this.status;
  }

  async checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const res = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        return res.state;
      }
    } catch {
      // Safari / Firefox / embedded WebViews may not support microphone permission query
    }
    return 'unknown';
  }

  private async ensureMicrophoneAccess(): Promise<{ ok: true; stream?: MediaStream } | { ok: false; message: string }> {
    const caps = this.getCapabilities();
    if (!caps.hasGetUserMedia) {
      return {
        ok: false,
        message: 'Microphone hardware API is unavailable in this browser/context. Use the text composer fallback.',
      };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return { ok: true, stream };
    } catch (err) {
      const domName = (err as DOMException)?.name || '';
      const mapped =
        domName === 'NotAllowedError' || domName === 'SecurityError'
          ? 'not-allowed'
          : domName === 'NotFoundError' || domName === 'DevicesNotFoundError'
            ? 'not-found'
            : 'audio-capture';
      return { ok: false, message: classifySpeechError(mapped).userMessage };
    }
  }

  async startDictation(callbacks: VoiceListenerCallbacks, lang = 'en-ZA'): Promise<void> {
    if (this.status === 'listening' || this.status === 'recording-fallback') {
      this.stopDictation();
      return;
    }

    const caps = this.getCapabilities();
    this.status = 'requesting-permission';
    callbacks.onStatusChange?.('requesting-permission', 'Verifying microphone access...');

    const permState = await this.checkMicrophonePermission();
    if (permState === 'denied') {
      const info = classifySpeechError('not-allowed');
      this.status = 'error';
      callbacks.onStatusChange?.('error', info.userMessage);
      callbacks.onError?.(info.userMessage, true);
      return;
    }

    // 1. Primary path: Native Browser Web Speech API SpeechRecognition
    const win = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const SpeechRecCtor = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (SpeechRecCtor) {
      try {
        // Explicit permission check via getUserMedia so permission prompts trigger reliably before recognition
        if (caps.hasGetUserMedia && permState !== 'granted') {
          const access = await this.ensureMicrophoneAccess();
          if (!access.ok) {
            this.status = 'error';
            callbacks.onStatusChange?.('error', access.message);
            callbacks.onError?.(access.message, true);
            return;
          }
          access.stream?.getTracks().forEach((t) => t.stop());
        }

        const recognition = new SpeechRecCtor();
        recognition.lang = lang;
        recognition.interimResults = true;
        recognition.continuous = false;
        recognition.maxAlternatives = 1;
        this.activeRecognition = recognition;

        let latestFinal = '';
        let latestInterim = '';

        recognition.onstart = () => {
          this.status = 'listening';
          callbacks.onStatusChange?.('listening', 'Listening via Web Speech API...');
        };

        recognition.onresult = (event) => {
          let interim = '';
          let finalChunk = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i];
            const t = res[0]?.transcript || '';
            if (res.isFinal) {
              finalChunk += t;
            } else {
              interim += t;
            }
          }
          if (finalChunk.trim()) {
            latestFinal = `${latestFinal} ${finalChunk}`.trim();
            callbacks.onFinalTranscript?.(latestFinal);
          } else if (interim.trim()) {
            latestInterim = `${latestFinal} ${interim}`.trim();
            callbacks.onInterimTranscript?.(latestInterim);
          }
        };

        recognition.onerror = (event) => {
          const code = event?.error || 'unknown';
          const info = classifySpeechError(code);
          this.activeRecognition = null;

          // Automatic fallback to MediaRecorder + server transcription on 'network' error if available
          if (code === 'network' && caps.hasMediaRecorder && caps.hasGetUserMedia) {
            this.startRecorderFallback(callbacks);
            return;
          }

          this.status = 'error';
          callbacks.onStatusChange?.('error', info.userMessage);
          callbacks.onError?.(info.userMessage, info.suggestFallback);
        };

        recognition.onend = () => {
          this.activeRecognition = null;
          if (this.status === 'listening') {
            this.status = 'idle';
            if (!latestFinal && latestInterim) {
              callbacks.onFinalTranscript?.(latestInterim);
            }
            callbacks.onStatusChange?.('idle', 'Microphone ready');
          }
        };

        recognition.start();
        return;
      } catch (err) {
        const msg = (err as Error)?.message || 'Could not start speech recognition';
        if (!caps.hasMediaRecorder) {
          this.status = 'error';
          callbacks.onStatusChange?.('error', msg);
          callbacks.onError?.(msg, true);
          return;
        }
      }
    }

    // 2. Fallback path: MediaRecorder + Server Gemini Transcription (for Firefox / browsers without SpeechRecognition)
    if (caps.hasMediaRecorder && caps.hasGetUserMedia) {
      await this.startRecorderFallback(callbacks);
      return;
    }

    // 3. Final graceful fallback: Inform user text composer is active
    this.status = 'unsupported';
    const fallbackMsg =
      'Browser Speech Recognition is unavailable in this environment. Type directly in the composer below.';
    callbacks.onStatusChange?.('unsupported', fallbackMsg);
    callbacks.onError?.(fallbackMsg, true);
  }

  private async startRecorderFallback(callbacks: VoiceListenerCallbacks): Promise<void> {
    const access = await this.ensureMicrophoneAccess();
    if (!access.ok || !access.stream) {
      this.status = 'error';
      const msg = access.ok ? 'Microphone stream unavailable.' : access.message;
      callbacks.onStatusChange?.('error', msg);
      callbacks.onError?.(msg, true);
      return;
    }

    try {
      const stream = access.stream;
      this.activeStream = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      this.activeRecorder = recorder;
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        this.activeStream = null;
        this.activeRecorder = null;

        if (chunks.length === 0) {
          this.status = 'idle';
          callbacks.onStatusChange?.('idle', 'Recording stopped');
          return;
        }

        this.status = 'transcribing';
        callbacks.onStatusChange?.('transcribing', 'Transcribing audio...');

        try {
          const blob = new Blob(chunks, { type: mimeType });
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const str = String(reader.result || '');
              const idx = str.indexOf(',');
              resolve(idx >= 0 ? str.slice(idx + 1) : str);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });

          const res = await barbiApi.transcribeAudio(base64, mimeType);
          if (res.transcript?.trim()) {
            callbacks.onFinalTranscript?.(res.transcript.trim());
          } else {
            callbacks.onError?.('No speech captured in recording. Type your message instead.', true);
          }
        } catch (err) {
          callbacks.onError?.(
            `Fallback transcription unavailable (${(err as Error)?.message || 'network'}). Please use text input.`,
            true
          );
        } finally {
          this.status = 'idle';
          callbacks.onStatusChange?.('idle', 'Microphone ready');
        }
      };

      this.status = 'recording-fallback';
      callbacks.onStatusChange?.('recording-fallback', 'Recording audio (tap Mic again to finish)...');
      recorder.start();
    } catch (err) {
      this.activeStream?.getTracks().forEach((t) => t.stop());
      this.activeStream = null;
      this.status = 'error';
      const msg = (err as Error)?.message || 'Audio recording fallback failed.';
      callbacks.onStatusChange?.('error', msg);
      callbacks.onError?.(msg, true);
    }
  }

  stopDictation(): void {
    if (this.activeRecognition) {
      try {
        this.activeRecognition.stop();
      } catch {
        // ignore
      }
      this.activeRecognition = null;
    }
    if (this.activeRecorder && this.activeRecorder.state !== 'inactive') {
      try {
        this.activeRecorder.stop();
      } catch {
        // ignore
      }
    }
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((t) => t.stop());
      this.activeStream = null;
    }
    this.status = 'idle';
  }

  listAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices() || [];
  }

  speak(rawText: string, options: SpeechOutputOptions = {}): boolean {
    if (options.enabled === false) return false;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      options.onError?.('Web Speech Synthesis is not available in this browser.');
      return false;
    }

    const clean = formatTextForSpeech(rawText);
    const chunks = splitIntoSpeechChunks(clean, 190);
    if (chunks.length === 0) return false;

    try {
      window.speechSynthesis.cancel();
      const myQueueId = ++this.speechQueueId;
      const voices = this.listAvailableVoices();
      const chosenVoice = selectPreferredVoice(voices, options.voiceName, options.lang || 'en');

      const speakNext = (idx: number) => {
        if (myQueueId !== this.speechQueueId || idx >= chunks.length) {
          options.onEnd?.();
          return;
        }
        const utter = new SpeechSynthesisUtterance(chunks[idx]);
        if (chosenVoice) utter.voice = chosenVoice;
        utter.lang = chosenVoice?.lang || options.lang || 'en-US';
        utter.pitch = typeof options.pitch === 'number' ? options.pitch : 1.08;
        utter.rate = typeof options.rate === 'number' ? options.rate : 1.03;
        utter.onstart = () => {
          if (idx === 0) options.onStart?.();
        };
        utter.onend = () => speakNext(idx + 1);
        utter.onerror = (ev) => {
          if (ev.error !== 'interrupted' && ev.error !== 'canceled') {
            options.onError?.(`Speech output warning (${ev.error || 'playback'})`);
          }
          options.onEnd?.();
        };
        window.speechSynthesis.speak(utter);
      };

      speakNext(0);
      return true;
    } catch (err) {
      options.onError?.((err as Error)?.message || 'Speech synthesis failed');
      return false;
    }
  }

  stopSpeaking(): void {
    this.speechQueueId++;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }
}

export const barbiVoiceEngine = new BarbiVoiceEngine();
