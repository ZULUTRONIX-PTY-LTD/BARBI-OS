import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProviderQuotaSnapshot,
  markProviderRateLimited,
  recordProviderUsage,
  resetProviderRegistryForTests,
  selectBestAvailableProvider,
  updateUserRoutingPrefs,
} from './providerRegistry.ts';

test('providerRegistry tracks remaining tokens, cooldown timers, and priority arrangement', () => {
  resetProviderRegistryForTests();
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevGroq = process.env.GROQ_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key-123456';
  process.env.GROQ_API_KEY = 'test-groq-key-123456';

  try {
    const uid = 'test-user-1';
    updateUserRoutingPrefs(uid, {
      priorityOrder: ['groq', 'gemini', 'openrouter'],
      selectedProviderId: 'groq',
      switchMode: 'recommend',
    });

    recordProviderUsage('groq', { tokensUsed: 12000, latencyMs: 180 });
    const snap1 = getProviderQuotaSnapshot(uid);
    const groqSnap = snap1.providers.find((p) => p.id === 'groq')!;
    assert.equal(groqSnap.priorityIndex, 0);
    assert.equal(groqSnap.usedTokensToday, 12000);
    assert.equal(groqSnap.remainingTokensToday, 200000 - 12000);
    assert.equal(groqSnap.status, 'READY');

    // Simulate Groq hitting 429 cooldown
    markProviderRateLimited('groq', 'HTTP 429 RPM limit reached', 45);
    const decision = selectBestAvailableProvider(uid);
    assert.equal(decision.needsSwitchPrompt, true);
    assert.equal(decision.recommendedNext?.id, 'gemini');
    assert.match(decision.reason, /COOLDOWN/);

    // Verify pre-flight hard ceiling stop prevents exceeding free tier TPD
    updateUserRoutingPrefs(uid, { selectedProviderId: 'openrouter' });
    process.env.OPENROUTER_API_KEY = 'test-or-key-123456';
    process.env.GITHUB_TOKEN = 'github_pat_test_123456';
    const snap2 = getProviderQuotaSnapshot(uid);
    const ghSnap = snap2.providers.find((p) => p.id === 'github_models');
    const orMistralSnap = snap2.providers.find((p) => p.id === 'openrouter_mistral');
    assert.equal(ghSnap?.status, 'READY');
    assert.equal(orMistralSnap?.status, 'READY');

    recordProviderUsage('openrouter', { tokensUsed: 249500 });
    const blocked = selectBestAvailableProvider(uid, [], Date.now(), 2000);
    assert.equal(blocked.needsSwitchPrompt, true);
    assert.equal(blocked.recommendedNext?.id, 'gemini');
  } finally {
    if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGemini;
    if (prevGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = prevGroq;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GITHUB_TOKEN;
    resetProviderRegistryForTests();
  }
});
