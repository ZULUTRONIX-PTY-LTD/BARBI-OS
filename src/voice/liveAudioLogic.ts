export type LiveVoiceName = 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';

export const LIVE_VOICE_OPTIONS: Array<{ id: LiveVoiceName; label: string; tone: string }> = [
  { id: 'Zephyr', label: 'Zephyr', tone: 'Warm & balanced' },
  { id: 'Puck', label: 'Puck', tone: 'Upbeat & crisp' },
  { id: 'Kore', label: 'Kore', tone: 'Clear & articulate' },
  { id: 'Charon', label: 'Charon', tone: 'Calm & deep' },
  { id: 'Fenrir', label: 'Fenrir', tone: 'Direct & grounded' },
];

export function isValidLiveVoiceName(value: unknown): value is LiveVoiceName {
  return (
    value === 'Zephyr' ||
    value === 'Puck' ||
    value === 'Charon' ||
    value === 'Kore' ||
    value === 'Fenrir'
  );
}

/**
 * Downsamples Float32 PCM samples from any browser AudioContext sample rate
 * (e.g. 48kHz, 44.1kHz, or 16kHz) to 16-bit signed little-endian PCM at 16kHz.
 */
export function downsampleFloat32ToInt16Pcm(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Int16Array {
  if (input.length === 0) return new Int16Array(0);
  const safeInRate = inputSampleRate > 0 ? inputSampleRate : targetSampleRate;

  if (Math.abs(safeInRate - targetSampleRate) < 1) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, input[i]));
      out[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    }
    return out;
  }

  const ratio = safeInRate / targetSampleRate;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += 1) {
      sum += input[j];
      count += 1;
    }
    const avg = count > 0 ? sum / count : input[Math.min(start, input.length - 1)] || 0;
    const clamped = Math.max(-1, Math.min(1, avg));
    out[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  return out;
}

export function int16PcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function base64ToInt16Pcm(base64: string): Int16Array {
  if (!base64) return new Int16Array(0);
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    const alignedByteLen = buf.byteLength - (buf.byteLength % 2);
    const copy = new Uint8Array(alignedByteLen);
    copy.set(buf.subarray(0, alignedByteLen));
    return new Int16Array(copy.buffer);
  }
  const binary = atob(base64);
  const alignedByteLen = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(alignedByteLen);
  for (let i = 0; i < alignedByteLen; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export function int16PcmToFloat32(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    out[i] = pcm[i] < 0 ? pcm[i] / 0x8000 : pcm[i] / 0x7fff;
  }
  return out;
}

export function computeRmsLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / samples.length);
  return Math.max(0, Math.min(1, rms * 3.5));
}

export function mergeTranscriptDelta(existing: string, incoming: string): string {
  const inc = String(incoming || '');
  if (!inc) return existing;
  if (!existing) return inc.trimStart();
  // Avoid double spaces while preserving natural word spacing from Live API chunks
  if (existing.endsWith(' ') || inc.startsWith(' ') || /^[.,!?;:'")]/.test(inc)) {
    return `${existing}${inc}`;
  }
  return `${existing}${inc}`;
}
