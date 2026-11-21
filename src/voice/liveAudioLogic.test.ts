import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToInt16Pcm,
  computeRmsLevel,
  downsampleFloat32ToInt16Pcm,
  int16PcmToBase64,
  int16PcmToFloat32,
  isValidLiveVoiceName,
  mergeTranscriptDelta,
} from './liveAudioLogic.ts';

test('downsampleFloat32ToInt16Pcm converts 16kHz samples accurately with clamping', () => {
  const input = new Float32Array([0, 0.5, -0.5, 1.4, -1.8]);
  const pcm = downsampleFloat32ToInt16Pcm(input, 16000, 16000);
  assert.equal(pcm.length, 5);
  assert.equal(pcm[0], 0);
  assert.ok(Math.abs(pcm[1] - 16384) <= 1);
  assert.ok(Math.abs(pcm[2] + 16384) <= 1);
  assert.equal(pcm[3], 32767);
  assert.equal(pcm[4], -32768);
});

test('downsampleFloat32ToInt16Pcm downsamples 48kHz to 16kHz at 3:1 ratio', () => {
  const input = new Float32Array(480);
  input.fill(0.25);
  const pcm = downsampleFloat32ToInt16Pcm(input, 48000, 16000);
  assert.equal(pcm.length, 160);
  assert.ok(Math.abs(pcm[0] - Math.round(0.25 * 32767)) <= 2);
});

test('int16PcmToBase64 and base64ToInt16Pcm round-trip raw PCM losslessly', () => {
  const original = new Int16Array([-32768, -1024, 0, 1024, 32767]);
  const b64 = int16PcmToBase64(original);
  const decoded = base64ToInt16Pcm(b64);
  assert.deepEqual(Array.from(decoded), Array.from(original));
});

test('int16PcmToFloat32 maps PCM bounds into [-1, 1]', () => {
  const f32 = int16PcmToFloat32(new Int16Array([-32768, 0, 32767]));
  assert.equal(f32[0], -1);
  assert.equal(f32[1], 0);
  assert.equal(f32[2], 1);
});

test('computeRmsLevel returns 0 for silence and bounded <= 1 for loud signals', () => {
  assert.equal(computeRmsLevel(new Float32Array([0, 0, 0, 0])), 0);
  const loud = computeRmsLevel(new Float32Array([0.8, -0.8, 0.8, -0.8]));
  assert.equal(loud, 1);
  const moderate = computeRmsLevel(new Float32Array([0.1, -0.1, 0.1, -0.1]));
  assert.ok(moderate > 0.2 && moderate < 0.5);
});

test('isValidLiveVoiceName validates supported Gemini Live voices', () => {
  assert.equal(isValidLiveVoiceName('Zephyr'), true);
  assert.equal(isValidLiveVoiceName('Puck'), true);
  assert.equal(isValidLiveVoiceName('InvalidVoice'), false);
});

test('mergeTranscriptDelta concatenates streaming transcript deltas cleanly', () => {
  let out = '';
  out = mergeTranscriptDelta(out, ' Hello');
  out = mergeTranscriptDelta(out, ' world');
  out = mergeTranscriptDelta(out, '!');
  assert.equal(out, 'Hello world!');
});
