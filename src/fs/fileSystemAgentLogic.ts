export type FsAccessMode = 'read' | 'readwrite';
export type FsMountKind = 'native-fsa' | 'file-input' | 'sample-workspace';

export interface FsNode {
  path: string;
  name: string;
  kind: 'directory' | 'file';
  size: number;
  language?: string;
  lastModified?: number;
  children?: FsNode[];
}

export interface FsAnalysisFinding {
  severity: 'high' | 'medium' | 'low' | 'info';
  file: string;
  title: string;
  detail: string;
}

export interface ProposedFileEdit {
  path: string;
  rationale: string;
  updatedContent: string;
}

export interface FsAnalysisResult {
  summary: string;
  findings: FsAnalysisFinding[];
  proposedEdits: ProposedFileEdit[];
  provider: string;
  model: string;
}

export interface DiffLine {
  type: 'context' | 'added' | 'removed';
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}

export interface LineDiffSummary {
  lines: DiffLine[];
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
}

export interface FsAuditEvent {
  id: string;
  timestamp: string;
  action: 'mount' | 'read' | 'analyze' | 'write' | 'revert' | 'permission';
  target: string;
  detail: string;
}

export const IGNORED_DIR_NAMES = new Set<string>([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  '.playwright-cli',
  'target',
  '.turbo',
]);

const BINARY_EXTENSIONS = new Set<string>([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'bmp',
  'pdf',
  'zip',
  'tar',
  'gz',
  '7z',
  'rar',
  'mp3',
  'wav',
  'ogg',
  'mp4',
  'webm',
  'mov',
  'exe',
  'dll',
  'so',
  'dylib',
  'wasm',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'sqlite',
  'db',
]);

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  jsx: 'JSX',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  json: 'JSON',
  md: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  c: 'C',
  h: 'C Header',
  cpp: 'C++',
  hpp: 'C++ Header',
  ino: 'Arduino C++',
  java: 'Java',
  kt: 'Kotlin',
  sh: 'Shell',
  bash: 'Shell',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  sql: 'SQL',
  xml: 'XML',
  svg: 'SVG',
  env: 'Env',
  txt: 'Text',
};

export function shouldIgnoreEntryName(name: string): boolean {
  const clean = name.trim();
  if (!clean) return true;
  return IGNORED_DIR_NAMES.has(clean);
}

export function getFileExtension(path: string): string {
  const base = path.split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  if (idx <= 0 || idx === base.length - 1) return '';
  return base.slice(idx + 1).toLowerCase();
}

export function detectFileLanguage(path: string): string {
  const base = (path.split('/').pop() || '').toLowerCase();
  if (base === 'dockerfile') return 'Dockerfile';
  if (base === 'makefile') return 'Makefile';
  if (base.startsWith('.env')) return 'Env';
  const ext = getFileExtension(path);
  return EXTENSION_LANGUAGE_MAP[ext] || (ext ? ext.toUpperCase() : 'Plain Text');
}

export function isLikelyTextFile(path: string, mimeType?: string): boolean {
  if (mimeType) {
    if (mimeType.startsWith('text/')) return true;
    if (/json|javascript|typescript|xml|yaml|svg|sh|sql/i.test(mimeType)) return true;
    if (/^(image|audio|video)\//i.test(mimeType) && !/svg/i.test(mimeType)) return false;
  }
  const ext = getFileExtension(path);
  if (!ext) return true;
  return !BINARY_EXTENSIONS.has(ext);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function sortFsNodes(nodes: FsNode[]): FsNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    })
    .map((node) =>
      node.kind === 'directory' && node.children
        ? { ...node, children: sortFsNodes(node.children) }
        : node
    );
}

export function flattenFileNodes(nodes: FsNode[]): FsNode[] {
  const result: FsNode[] = [];
  const walk = (list: FsNode[]) => {
    for (const node of list) {
      if (node.kind === 'file') {
        result.push(node);
      } else if (node.children) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return result;
}

export function filterFileTree(nodes: FsNode[], rawQuery: string): FsNode[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return nodes;

  const filterList = (list: FsNode[]): FsNode[] => {
    const out: FsNode[] = [];
    for (const node of list) {
      if (node.kind === 'file') {
        if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
          out.push(node);
        }
      } else {
        const filteredChildren = node.children ? filterList(node.children) : [];
        if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
          out.push({
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : node.children || [],
          });
        }
      }
    }
    return out;
  };

  return filterList(nodes);
}

export function computeProjectStats(nodes: FsNode[]): {
  totalFiles: number;
  totalDirs: number;
  totalBytes: number;
  byExtension: Array<{ ext: string; count: number }>;
} {
  let totalFiles = 0;
  let totalDirs = 0;
  let totalBytes = 0;
  const extCounts = new Map<string, number>();

  const walk = (list: FsNode[]) => {
    for (const node of list) {
      if (node.kind === 'directory') {
        totalDirs += 1;
        if (node.children) walk(node.children);
      } else {
        totalFiles += 1;
        totalBytes += node.size || 0;
        const ext = getFileExtension(node.path) || 'other';
        extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
      }
    }
  };
  walk(nodes);

  const byExtension = Array.from(extCounts.entries())
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count || a.ext.localeCompare(b.ext))
    .slice(0, 6);

  return { totalFiles, totalDirs, totalBytes, byExtension };
}

export function buildProjectTreeSummary(nodes: FsNode[], rootName = 'workspace', maxLines = 180): string {
  const lines: string[] = [`${rootName}/`];
  let truncated = false;

  const walk = (list: FsNode[], prefix: string) => {
    for (let i = 0; i < list.length; i += 1) {
      if (lines.length >= maxLines) {
        truncated = true;
        return;
      }
      const node = list[i];
      const isLast = i === list.length - 1;
      const branch = isLast ? '└── ' : '├── ';
      const suffix = node.kind === 'directory' ? '/' : ` (${formatFileSize(node.size)})`;
      lines.push(`${prefix}${branch}${node.name}${suffix}`);
      if (node.kind === 'directory' && node.children && node.children.length > 0) {
        walk(node.children, `${prefix}${isLast ? '    ' : '│   '}`);
      }
    }
  };

  walk(nodes, '');
  if (truncated) {
    lines.push('... (additional entries truncated for context budget)');
  }
  return lines.join('\n');
}

export function sanitizeRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!normalized) return null;
  const parts = normalized.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  return parts.join('/');
}

export function validateSelectedFilesPayload(
  files: Array<{ path: string; content: string }>,
  maxTotalChars = 120_000
): { ok: true; files: Array<{ path: string; content: string; truncated: boolean }> } | { ok: false; error: string } {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, error: 'Select at least one file before invoking B.A.R.B.I. analysis.' };
  }
  if (files.length > 15) {
    return { ok: false, error: 'Select up to 15 files per analysis pass to stay within safe context limits.' };
  }

  let runningChars = 0;
  const sanitized: Array<{ path: string; content: string; truncated: boolean }> = [];

  for (const file of files) {
    const cleanPath = sanitizeRelativePath(file.path);
    if (!cleanPath) {
      return { ok: false, error: `Invalid or unsafe file path rejected: "${file.path}".` };
    }
    const remaining = Math.max(0, maxTotalChars - runningChars);
    if (remaining <= 0) break;
    const raw = String(file.content ?? '');
    const truncated = raw.length > remaining;
    const content = truncated ? raw.slice(0, remaining) : raw;
    runningChars += content.length;
    sanitized.push({ path: cleanPath, content, truncated });
  }

  return { ok: true, files: sanitized };
}

/**
 * Deterministic LCS-based line diff with graceful fallback for very large files.
 */
export function computeLineDiff(original: string, updated: string): LineDiffSummary {
  const oldLines = original.replace(/\r\n/g, '\n').split('\n');
  const newLines = updated.replace(/\r\n/g, '\n').split('\n');

  // Guard DP matrix memory for very large files
  if (oldLines.length * newLines.length > 320_000) {
    const lines: DiffLine[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);
    let addedCount = 0;
    let removedCount = 0;
    let unchangedCount = 0;

    for (let i = 0; i < maxLen; i += 1) {
      const a = oldLines[i];
      const b = newLines[i];
      if (a === b && a !== undefined) {
        lines.push({ type: 'context', oldLineNumber: i + 1, newLineNumber: i + 1, content: a });
        unchangedCount += 1;
      } else {
        if (a !== undefined) {
          lines.push({ type: 'removed', oldLineNumber: i + 1, newLineNumber: null, content: a });
          removedCount += 1;
        }
        if (b !== undefined) {
          lines.push({ type: 'added', oldLineNumber: null, newLineNumber: i + 1, content: b });
          addedCount += 1;
        }
      }
    }
    return { lines, addedCount, removedCount, unchangedCount };
  }

  const m = oldLines.length;
  const n = newLines.length;
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
      }
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      lines.push({
        type: 'context',
        oldLineNumber: i + 1,
        newLineNumber: j + 1,
        content: oldLines[i],
      });
      unchangedCount += 1;
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({
        type: 'removed',
        oldLineNumber: i + 1,
        newLineNumber: null,
        content: oldLines[i],
      });
      removedCount += 1;
      i += 1;
    } else {
      lines.push({
        type: 'added',
        oldLineNumber: null,
        newLineNumber: j + 1,
        content: newLines[j],
      });
      addedCount += 1;
      j += 1;
    }
  }

  while (i < m) {
    lines.push({ type: 'removed', oldLineNumber: i + 1, newLineNumber: null, content: oldLines[i] });
    removedCount += 1;
    i += 1;
  }

  while (j < n) {
    lines.push({ type: 'added', oldLineNumber: null, newLineNumber: j + 1, content: newLines[j] });
    addedCount += 1;
    j += 1;
  }

  return { lines, addedCount, removedCount, unchangedCount };
}

export function createSampleWorkspace(): {
  rootName: string;
  tree: FsNode[];
  contents: Record<string, string>;
} {
  const contents: Record<string, string> = {
    'package.json': JSON.stringify(
      {
        name: 'zulutronix-actuator-core',
        version: '1.4.0',
        private: true,
        description: 'ZULUTRONIX (PTY) LTD mechatronic actuator & PMIC telemetry firmware',
        scripts: {
          build: 'tsc --noEmit',
          test: 'tsx --test src/**/*.test.ts',
        },
        dependencies: {
          zod: '^3.24.0',
        },
      },
      null,
      2
    ),
    'config/safetyLimits.json': JSON.stringify(
      {
        maxBusVoltageV: 24.8,
        minBusVoltageV: 10.5,
        maxContinuousCurrentA: 12.0,
        thermalShutdownC: 82.0,
        watchdogTimeoutMs: 250,
      },
      null,
      2
    ),
    'src/motorController.ts': `export interface DriveCommand {
  targetRpm: number;
  torqueLimitNm: number;
  emergencyStop?: boolean;
}

export interface ControllerState {
  currentRpm: number;
  busVoltageV: number;
  phaseCurrentA: number;
  mosfetTempC: number;
}

export function computePwmDutyCycle(cmd: DriveCommand, state: ControllerState): number {
  if (cmd.emergencyStop) {
    return 0;
  }
  // TODO: Enforce thermal shutdown and over-voltage clamping before returning duty cycle
  const error = cmd.targetRpm - state.currentRpm;
  const rawDuty = error * 0.045;
  return rawDuty;
}
`,
    'src/telemetry/pmicSensor.ts': `export interface PmicReading {
  voltageV: number;
  currentA: number;
  temperatureC: number;
  sampledAt: string;
}

export function computeInstantPowerWatts(reading: PmicReading): number {
  return Number((reading.voltageV * reading.currentA).toFixed(2));
}

export function isThermalNominal(tempC: number, maxSafeC = 82): boolean {
  return Number.isFinite(tempC) && tempC >= -10 && tempC < maxSafeC;
}
`,
    'docs/architecture.md': `# ZULUTRONIX Actuator & PMIC Core

Engineered by Treasure Trinity Zulu, Chief Engineer · ZULUTRONIX (PTY) LTD.

## Modules
- \`src/motorController.ts\`: Closed-loop PWM duty calculation for brushless joint actuators.
- \`src/telemetry/pmicSensor.ts\`: Real-time P = V × I bus telemetry and thermal envelope verification.
- \`config/safetyLimits.json\`: Hardware envelope bounds for Pretoria lab bench testing.
`,
  };

  const makeFile = (path: string): FsNode => {
    const name = path.split('/').pop() || path;
    const text = contents[path] || '';
    return {
      path,
      name,
      kind: 'file',
      size: new TextEncoder().encode(text).length,
      language: detectFileLanguage(path),
      lastModified: Date.now(),
    };
  };

  const tree: FsNode[] = sortFsNodes([
    {
      path: 'config',
      name: 'config',
      kind: 'directory',
      size: 0,
      children: [makeFile('config/safetyLimits.json')],
    },
    {
      path: 'docs',
      name: 'docs',
      kind: 'directory',
      size: 0,
      children: [makeFile('docs/architecture.md')],
    },
    {
      path: 'src',
      name: 'src',
      kind: 'directory',
      size: 0,
      children: [
        makeFile('src/motorController.ts'),
        {
          path: 'src/telemetry',
          name: 'telemetry',
          kind: 'directory',
          size: 0,
          children: [makeFile('src/telemetry/pmicSensor.ts')],
        },
      ],
    },
    makeFile('package.json'),
  ]);

  return {
    rootName: 'zulutronix-actuator-core',
    tree,
    contents,
  };
}
