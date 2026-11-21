import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TARGET_PLATFORMS,
  DEFAULT_REA_REPO_PROFILE,
  extractDomArchitectureSummary,
  generateMultiPlatformSystemFiles,
  isSafePublicHttpUrl,
  normalizeTargetPlatforms,
  parseGitHubRepoUrl,
  sanitizeSlug,
} from './reaService.ts';

test('isSafePublicHttpUrl blocks loopback and private SSRF addresses while allowing public https', () => {
  assert.equal(isSafePublicHttpUrl('https://github.com/morluto/rea'), true);
  assert.equal(isSafePublicHttpUrl('http://localhost:3000'), false);
  assert.equal(isSafePublicHttpUrl('http://127.0.0.1/admin'), false);
  assert.equal(isSafePublicHttpUrl('http://192.168.1.50'), false);
  assert.equal(isSafePublicHttpUrl('http://169.254.169.254/latest'), false);
  assert.equal(isSafePublicHttpUrl('file:///etc/passwd'), false);
});

test('extractDomArchitectureSummary extracts headings, controls, and stack markers', () => {
  const html = `<html><head><title>Test Studio</title></head><body><nav></nav><h1>Dashboard</h1><button>Run</button><canvas></canvas><script>react</script></body></html>`;
  const summary = extractDomArchitectureSummary(html, 'https://example.com');
  assert.equal(summary.title, 'Test Studio');
  assert.deepEqual(summary.headings, ['Dashboard']);
  assert.equal(summary.metrics.navCount, 1);
  assert.equal(summary.metrics.buttonCount, 1);
  assert.equal(summary.metrics.canvasCount, 1);
  assert.ok(summary.detectedStack.includes('React / Next.js'));
  assert.equal(sanitizeSlug('Solar SCADA v2.0!'), 'solar-scada-v2-0');
});

test('parseGitHubRepoUrl parses full URLs, shorthand, and defaults to morluto/rea while rejecting non-GitHub hosts', () => {
  const def = parseGitHubRepoUrl('');
  assert.equal(def.fullName, 'morluto/rea');
  assert.equal(def.htmlUrl, 'https://github.com/morluto/rea');

  const full = parseGitHubRepoUrl('https://github.com/morluto/rea.git');
  assert.equal(full.owner, 'morluto');
  assert.equal(full.repo, 'rea');

  const short = parseGitHubRepoUrl('zulutronix/barbi-rea-fork');
  assert.equal(short.htmlUrl, 'https://github.com/zulutronix/barbi-rea-fork');

  assert.throws(() => parseGitHubRepoUrl('https://evil.example.com/morluto/rea'), /github\.com/);
});

test('normalizeTargetPlatforms preserves canonical ordering and always includes web core', () => {
  assert.deepEqual(normalizeTargetPlatforms([]), [...ALL_TARGET_PLATFORMS]);
  assert.deepEqual(normalizeTargetPlatforms(['android', 'macos', 'invalid']), ['web', 'macos', 'android']);
});

test('generateMultiPlatformSystemFiles generates valid end-to-end deliverables for Web, Windows, macOS, iOS, and Android', () => {
  const result = generateMultiPlatformSystemFiles({
    slug: 'fleet-command',
    appTitle: 'Fleet Command OS',
    tagline: 'Cross-platform robotics & edge telemetry cockpit',
    prompt: 'Build a robotics cockpit for desktop, mobile, and web',
    modules: [
      { title: 'Telemetry Stream', metric: 'HZ', value: '60 Hz', actionLabel: 'Sample' },
      { title: 'Mission Planner', metric: 'WAYPOINTS', value: '12', actionLabel: 'Sync' },
    ],
    platforms: ['web', 'windows', 'macos', 'ios', 'android'],
    reaRepo: DEFAULT_REA_REPO_PROFILE,
  });

  assert.equal(result.bundleId, 'co.za.zulutronix.fleetcommand');
  assert.deepEqual(result.platforms, ['web', 'windows', 'macos', 'ios', 'android']);
  assert.equal(result.platformDeliverables.length, 5);

  // Verify presence of all 5 platform deliverables + REA MCP + CI/CD workflow
  const keys = Object.keys(result.files);
  for (const expected of [
    'web/index.html',
    'web/manifest.webmanifest',
    'web/sw.js',
    'package.json',
    'server.js',
    'src-tauri/tauri.conf.json',
    'src-tauri/Cargo.toml',
    'src-tauri/src/main.rs',
    'scripts/build-windows.ps1',
    'launch-windows-app.bat',
    'src-tauri/tauri.macos.conf.json',
    'macos/Info.plist',
    'scripts/build-macos.sh',
    'capacitor.config.ts',
    'ios/App/App/Info.plist',
    'ios/ExportOptions.plist',
    'scripts/build-ios.sh',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/build.gradle',
    'scripts/build-android.sh',
    '.rea/rea-mcp.json',
    '.rea/system-blueprint.json',
    '.github/workflows/rea-multiplatform-release.yml',
    'README.md',
  ]) {
    assert.ok(keys.includes(expected), `Missing expected multi-platform file: ${expected}`);
  }

  // Validate generated JSON artifacts parse cleanly
  const pkg = JSON.parse(result.files['package.json']);
  assert.ok(pkg.scripts['build:windows']);
  assert.ok(pkg.scripts['build:macos']);
  assert.ok(pkg.scripts['build:ios']);
  assert.ok(pkg.scripts['build:android']);
  assert.equal(pkg.reaForge.upstreamRepo, 'https://github.com/morluto/rea');

  const tauriConf = JSON.parse(result.files['src-tauri/tauri.conf.json']);
  assert.deepEqual(tauriConf.bundle.targets, ['nsis', 'msi', 'dmg', 'app']);

  const mcp = JSON.parse(result.files['.rea/rea-mcp.json']);
  assert.equal(mcp.upstreamRepository, 'https://github.com/morluto/rea');
  assert.equal(mcp.mcpServers.rea.command, 'npx');

  const workflow = result.files['.github/workflows/rea-multiplatform-release.yml'];
  assert.ok(workflow.includes('build-windows:'));
  assert.ok(workflow.includes('build-macos:'));
  assert.ok(workflow.includes('build-ios:'));
  assert.ok(workflow.includes('build-android:'));
});

test('generateMultiPlatformSystemFiles scopes generated platform artifacts when subset of targets is chosen', () => {
  const result = generateMultiPlatformSystemFiles({
    slug: 'mobile-only-kit',
    appTitle: 'Mobile Field Kit',
    tagline: 'Android and Web field operations',
    prompt: 'Android field scanner',
    modules: [{ title: 'Scanner', metric: 'MODE', value: 'READY', actionLabel: 'Scan' }],
    platforms: ['web', 'android'],
    reaRepo: DEFAULT_REA_REPO_PROFILE,
  });

  assert.deepEqual(result.platforms, ['web', 'android']);
  assert.ok(result.files['android/app/build.gradle']);
  assert.ok(result.files['capacitor.config.ts']);
  assert.equal(result.files['src-tauri/tauri.conf.json'], undefined);
  assert.equal(result.files['ios/App/App/Info.plist'], undefined);
  assert.equal(result.files['scripts/build-windows.ps1'], undefined);
  assert.equal(result.files['scripts/build-macos.sh'], undefined);
});
