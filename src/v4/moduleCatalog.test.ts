import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BARBI_COMPANY_NAME,
  BARBI_V4_MODULES,
  INTEGRATION_PACKS,
  V4_TIERS,
  computeTierStats,
  evaluateGovernanceGate,
  filterModules,
  generateDockerComposeYaml,
  generateEnvExampleForModules,
  generateGithubBootstrapScript,
  generateMcpManifestJson,
  getModulesForPack,
} from './moduleCatalog';

test('BARBI_V4_MODULES defines all 55 modules sequentially across Tiers A-F', () => {
  assert.equal(BARBI_V4_MODULES.length, 55);
  assert.equal(V4_TIERS.length, 6);

  const seenIds = new Set<number>();
  const seenCodes = new Set<string>();
  for (let idx = 0; idx < BARBI_V4_MODULES.length; idx += 1) {
    const mod = BARBI_V4_MODULES[idx];
    assert.equal(mod.id, idx + 1, `Expected module index ${idx + 1}, got ${mod.id}`);
    assert.ok(!seenIds.has(mod.id), `Duplicate module id ${mod.id}`);
    assert.ok(!seenCodes.has(mod.code), `Duplicate module code ${mod.code}`);
    seenIds.add(mod.id);
    seenCodes.add(mod.code);
    assert.ok(mod.repos.length >= 1, `Module ${mod.code} must link at least one GitHub repo`);
    for (const repo of mod.repos) {
      assert.match(repo.fullName, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
      assert.ok(repo.url.startsWith('https://github.com/'));
    }
  }

  // Verify exact tier counts from specification: A=10, B=5, C=6, D=12, E=11, F=11
  const stats = computeTierStats(BARBI_V4_MODULES, new Set([1, 2, 3, 45]), 12);
  assert.equal(stats.byTier.A.total, 10);
  assert.equal(stats.byTier.B.total, 5);
  assert.equal(stats.byTier.C.total, 6);
  assert.equal(stats.byTier.D.total, 12);
  assert.equal(stats.byTier.E.total, 11);
  assert.equal(stats.byTier.F.total, 11);
  assert.equal(stats.mountedCount, 4);
  assert.equal(stats.syncedRepoCount, 12);
});

test('filterModules filters accurately by tier, search query, pack, and mounted state', () => {
  const tierF = filterModules(BARBI_V4_MODULES, { tier: 'F' });
  assert.equal(tierF.length, 11);
  assert.equal(tierF[0].id, 45);
  assert.equal(tierF[tierF.length - 1].id, 55);

  const eeSearch = filterModules(BARBI_V4_MODULES, { search: 'EasyEquities' });
  assert.ok(eeSearch.length >= 1);
  assert.ok(eeSearch.some((m) => m.code === 'M45'));

  const exactRepoSearch = filterModules(BARBI_V4_MODULES, { search: 'easy-equities-client' });
  assert.equal(exactRepoSearch.length, 1);
  assert.equal(exactRepoSearch[0].code, 'M45');

  const mountedOnly = filterModules(BARBI_V4_MODULES, {
    onlyMounted: true,
    mountedIds: new Set([1, 45, 49]),
  });
  assert.deepEqual(
    mountedOnly.map((m) => m.id),
    [1, 45, 49]
  );

  const pack2 = getModulesForPack('pack-2-fintech', new Set());
  assert.ok(pack2.some((m) => m.id === 45));
  assert.ok(pack2.some((m) => m.id === 49));
  assert.equal(INTEGRATION_PACKS.length, 6);
});

test('evaluateGovernanceGate enforces Dual-Tier Approval for CAPITAL_GATE modules', () => {
  const preAuthMod = BARBI_V4_MODULES.find((m) => m.id === 1)!;
  const preAuthDecision = evaluateGovernanceGate(preAuthMod, {
    requestedMode: 'PAPER_SANDBOX',
    approvalConfirmed: false,
  });
  assert.equal(preAuthDecision.allowed, true);
  assert.equal(preAuthDecision.requiresApproval, false);

  const finTechMod = BARBI_V4_MODULES.find((m) => m.id === 45)!;
  const blockedDecision = evaluateGovernanceGate(finTechMod, {
    requestedMode: 'LIVE_APPROVED',
    approvalConfirmed: false,
  });
  assert.equal(blockedDecision.allowed, false);
  assert.equal(blockedDecision.requiresApproval, true);
  assert.equal(blockedDecision.resolvedMode, 'PAPER_SANDBOX');

  const approvedSandbox = evaluateGovernanceGate(finTechMod, {
    requestedMode: 'PAPER_SANDBOX',
    approvalConfirmed: true,
  });
  assert.equal(approvedSandbox.allowed, true);
  assert.equal(approvedSandbox.resolvedMode, 'PAPER_SANDBOX');

  const approvedLive = evaluateGovernanceGate(finTechMod, {
    requestedMode: 'LIVE_APPROVED',
    approvalConfirmed: true,
  });
  assert.equal(approvedLive.allowed, true);
  assert.equal(approvedLive.resolvedMode, 'LIVE_APPROVED');
});

test('deployment generators produce valid docker-compose, MCP manifest, bootstrap script, and env template', () => {
  const pack1Modules = getModulesForPack('pack-1-core', new Set());
  const dockerYaml = generateDockerComposeYaml(pack1Modules);
  assert.ok(dockerYaml.includes(BARBI_COMPANY_NAME));
  assert.ok(dockerYaml.includes('barbi-os-core:'));
  assert.ok(dockerYaml.includes('devlikeapro/waha:latest'));
  assert.ok(dockerYaml.includes('qdrant/qdrant:latest'));

  const pack2Modules = getModulesForPack('pack-2-fintech', new Set());
  const mcpJsonRaw = generateMcpManifestJson(pack2Modules);
  const parsedMcp = JSON.parse(mcpJsonRaw) as {
    organization: string;
    mcpServers: Record<string, unknown>;
  };
  assert.equal(parsedMcp.organization, BARBI_COMPANY_NAME);
  assert.ok(Object.keys(parsedMcp.mcpServers).some((k) => k.includes('m49_agent_toolkit')));

  const script = generateGithubBootstrapScript(pack2Modules);
  assert.ok(script.includes('https://github.com/deanmalan/easy-equities-client.git'));
  assert.ok(script.includes('https://github.com/paypal/agent-toolkit.git'));

  const envTpl = generateEnvExampleForModules(pack2Modules);
  assert.ok(envTpl.includes('EASYEQUITIES_USERNAME='));
  assert.ok(envTpl.includes('PAYPAL_ACCESS_TOKEN='));
});
