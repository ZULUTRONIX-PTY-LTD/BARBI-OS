import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BARBI_WAKE_DISPLAY_NAME,
  BARBI_WAKE_SPOKEN_LIST,
  detectBarbiWakePhrase,
} from './wakeWordEngine.ts';

test('detectBarbiWakePhrase listens for Hey Barbie, Hey B, and Barbie and displays B.A.R.B.I', () => {
  assert.equal(BARBI_WAKE_DISPLAY_NAME, 'B.A.R.B.I');
  assert.deepEqual(BARBI_WAKE_SPOKEN_LIST, ['Hey Barbie', 'Hey B', 'Barbie']);

  const m1 = detectBarbiWakePhrase('Hey Barbie open Gods Eye');
  assert.equal(m1.matched, true);
  assert.equal(m1.triggerLabel, 'B.A.R.B.I');
  assert.equal(m1.trailingCommand, 'open Gods Eye');

  const m2 = detectBarbiWakePhrase('Hey B what is on my screen');
  assert.equal(m2.matched, true);
  assert.equal(m2.triggerLabel, 'B.A.R.B.I');
  assert.equal(m2.trailingCommand, 'what is on my screen');

  const m3 = detectBarbiWakePhrase('Barbie close all panels');
  assert.equal(m3.matched, true);
  assert.equal(m3.triggerLabel, 'B.A.R.B.I');
  assert.equal(m3.trailingCommand, 'close all panels');

  const m4 = detectBarbiWakePhrase('hey bee, switch to arctic cyan');
  assert.equal(m4.matched, true);
  assert.equal(m4.triggerLabel, 'B.A.R.B.I');
  assert.equal(m4.trailingCommand, 'switch to arctic cyan');
});

test('detectBarbiWakePhrase ignores normal conversation and unrelated hey words', () => {
  assert.equal(detectBarbiWakePhrase('Hey brother check the schematic').matched, false);
  assert.equal(detectBarbiWakePhrase('Hi B open timer').matched, false);
  assert.equal(detectBarbiWakePhrase('open the power telemetry module').matched, false);
  assert.equal(detectBarbiWakePhrase('').matched, false);
});
