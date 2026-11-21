import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProjectTreeSummary,
  computeLineDiff,
  computeProjectStats,
  createSampleWorkspace,
  detectFileLanguage,
  filterFileTree,
  flattenFileNodes,
  formatFileSize,
  isLikelyTextFile,
  sanitizeRelativePath,
  shouldIgnoreEntryName,
  validateSelectedFilesPayload,
} from './fileSystemAgentLogic';

test('ignores noisy dependency and build directories safely', () => {
  assert.equal(shouldIgnoreEntryName('node_modules'), true);
  assert.equal(shouldIgnoreEntryName('.git'), true);
  assert.equal(shouldIgnoreEntryName('dist'), true);
  assert.equal(shouldIgnoreEntryName('src'), false);
  assert.equal(shouldIgnoreEntryName('telemetry'), false);
});

test('detects languages, text vs binary files, and formats sizes cleanly', () => {
  assert.equal(detectFileLanguage('src/motorController.ts'), 'TypeScript');
  assert.equal(detectFileLanguage('config/safetyLimits.json'), 'JSON');
  assert.equal(detectFileLanguage('Dockerfile'), 'Dockerfile');
  assert.equal(isLikelyTextFile('src/app.tsx'), true);
  assert.equal(isLikelyTextFile('assets/logo.png'), false);
  assert.equal(formatFileSize(512), '512 B');
  assert.equal(formatFileSize(2048), '2.0 KB');
});

test('sample workspace produces valid tree summary, filter results, and stats', () => {
  const sample = createSampleWorkspace();
  const files = flattenFileNodes(sample.tree);
  assert.equal(files.length, 5);

  const stats = computeProjectStats(sample.tree);
  assert.equal(stats.totalFiles, 5);
  assert.equal(stats.totalDirs, 4);
  assert.ok(stats.totalBytes > 400);

  const filtered = filterFileTree(sample.tree, 'motor');
  const filteredFiles = flattenFileNodes(filtered);
  assert.equal(filteredFiles.length, 1);
  assert.equal(filteredFiles[0].path, 'src/motorController.ts');

  const summary = buildProjectTreeSummary(sample.tree, sample.rootName);
  assert.match(summary, /zulutronix-actuator-core\//);
  assert.match(summary, /motorController\.ts/);
  assert.match(summary, /pmicSensor\.ts/);
});

test('sanitizeRelativePath and validateSelectedFilesPayload block path traversal', () => {
  assert.equal(sanitizeRelativePath('../etc/passwd'), null);
  assert.equal(sanitizeRelativePath('src/../secret.env'), null);
  assert.equal(sanitizeRelativePath('/src/app.ts'), 'src/app.ts');

  const empty = validateSelectedFilesPayload([]);
  assert.equal(empty.ok, false);

  const traversal = validateSelectedFilesPayload([{ path: '../../secret.txt', content: 'x' }]);
  assert.equal(traversal.ok, false);

  const valid = validateSelectedFilesPayload([
    { path: 'src/motorController.ts', content: 'export const x = 1;' },
  ]);
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.files.length, 1);
    assert.equal(valid.files[0].path, 'src/motorController.ts');
    assert.equal(valid.files[0].truncated, false);
  }
});

test('computeLineDiff accurately computes added, removed, and context lines', () => {
  const before = ['const a = 1;', 'const b = 2;', 'return a + b;'].join('\n');
  const after = ['const a = 1;', 'const b = 4;', 'const c = 10;', 'return a + b + c;'].join('\n');

  const diff = computeLineDiff(before, after);
  assert.equal(diff.unchangedCount, 1);
  assert.equal(diff.removedCount, 2);
  assert.equal(diff.addedCount, 3);
  assert.equal(diff.lines[0].type, 'context');
  assert.equal(diff.lines[0].content, 'const a = 1;');
});
