import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySpeechError,
  detectSpeechCapabilities,
  formatTextForSpeech,
  selectPreferredVoice,
  splitIntoSpeechChunks,
} from './voiceLogic';

test('formatTextForSpeech strips markdown, code blocks, and expands technical symbols', () => {
  const input = `**SOM307B Analysis**: Check \`σ = 120 MPa\` at 25°C.\n- Equation → Verification\n\`\`\`ts\nconst x = 1;\n\`\`\``;
  const formatted = formatTextForSpeech(input);
  assert.ok(!formatted.includes('**'));
  assert.ok(!formatted.includes('`'));
  assert.ok(formatted.includes('degrees Celsius'));
  assert.ok(formatted.includes('leads to'));
  assert.ok(formatted.includes('Code block omitted'));
});

test('splitIntoSpeechChunks respects maxLen boundaries without dropping text', () => {
  const text =
    'Sentence one explains the thermal boundary layer. Sentence two computes the Nusselt number for laminar flow. Sentence three validates the heat transfer rate to three decimal places.';
  const chunks = splitIntoSpeechChunks(text, 90);
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 90, `Chunk exceeded limit: ${chunk.length}`);
  }
  assert.equal(chunks.join(' '), text);
});

test('classifySpeechError maps Web Speech permission and hardware errors cleanly', () => {
  const denied = classifySpeechError('not-allowed');
  assert.equal(denied.recoverable, false);
  assert.equal(denied.suggestFallback, true);
  assert.match(denied.userMessage, /permission/i);

  const noSpeech = classifySpeechError('no-speech');
  assert.equal(noSpeech.recoverable, true);
  assert.equal(noSpeech.suggestFallback, false);
});

test('detectSpeechCapabilities & selectPreferredVoice pick natural English female voice first', () => {
  const caps = detectSpeechCapabilities({ speechSynthesis: {}, SpeechRecognition: function () {} });
  assert.equal(caps.hasRecognition, true);
  assert.equal(caps.hasSynthesis, true);
  assert.equal(caps.hasMediaRecorder, false);

  const picked = selectPreferredVoice([
    { name: 'es-ES Standard', lang: 'es-ES' },
    { name: 'en-US Guy', lang: 'en-US' },
    { name: 'Microsoft Aria Online (Natural)', lang: 'en-US' },
  ]);
  assert.equal(picked?.name, 'Microsoft Aria Online (Natural)');
});
