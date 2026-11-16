import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDomArchitectureSummary,
  isSafePublicHttpUrl,
  sanitizeSlug,
} from './reaService.ts';

test('isSafePublicHttpUrl blocks loopback and private SSRF addresses while allowing public https', () => {
  assert.equal(isSafePublicHttpUrl('https://github.com/google-ai-edge'), true);
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
