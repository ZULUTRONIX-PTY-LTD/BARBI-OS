import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAiRoutingConfig } from './complexity';

test('selectAiRoutingConfig chooses HIGH thinking for engineering derivation prompts', () => {
  const decision = selectAiRoutingConfig({
    prompt: 'Derive the Von Mises stress equation and solve for safety factor in SI units.',
  });
  assert.equal(decision.model, 'gemini-4-hydrogen');
  assert.equal(decision.thinkingLevel, 'HIGH');
});

test('selectAiRoutingConfig honors explicit deepThinkRequested with XHIGH on gemini-4-hydrogen', () => {
  const decision = selectAiRoutingConfig({
    prompt: 'Audit ZULUTRONIX architecture',
    deepThinkRequested: true,
  });
  assert.equal(decision.model, 'gemini-4-hydrogen');
  assert.equal(decision.thinkingLevel, 'XHIGH');
});

test('selectAiRoutingConfig uses MEDIUM for standard turns and flash-lite for explicit quick short mode', () => {
  const std = selectAiRoutingConfig({ prompt: 'Hello BARBI, how are you?' });
  assert.equal(std.model, 'gemini-4-hydrogen');
  assert.equal(std.thinkingLevel, 'MEDIUM');

  const quick = selectAiRoutingConfig({ prompt: 'Time check', quickMode: true });
  assert.equal(quick.model, 'gemini-3.1-flash-lite');
  assert.equal(quick.thinkingLevel, 'LOW');
});
