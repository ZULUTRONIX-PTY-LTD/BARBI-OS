import {
  detectFileLanguage,
  isLikelyTextFile,
  shouldIgnoreEntryName,
  sortFsNodes,
  type FsAccessMode,
  type FsNode,
} from './fileSystemAgentLogic';

export interface FsaPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

export interface FsaWritableStream {
  write(data: string | Blob | BufferSource): Promise<void>;
  close(): Promise<void>;
}

export interface FsaHandleBase {
  readonly kind: 'file' | 'directory';
  readonly name: string;
  queryPermission?: (desc?: FsaPermissionDescriptor) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (desc?: FsaPermissionDescriptor) => Promise<'granted' | 'denied' | 'prompt'>;
}

export interface FsaFileHandle extends FsaHandleBase {
  readonly kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<FsaWritableStream>;
}

export interface FsaDirectoryHandle extends FsaHandleBase {
  readonly kind: 'directory';
  values(): AsyncIterableIterator<FsaFileHandle | FsaDirectoryHandle>;
}

interface FsaWindow {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }) => Promise<FsaDirectoryHandle>;
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
  }) => Promise<FsaFileHandle[]>;
}

export interface FsApiCapabilities {
  hasDirectoryPicker: boolean;
  hasOpenFilePicker: boolean;
  isEmbeddedIframe: boolean;
}

export interface MountedWorkspaceResult {
  rootName: string;
  mountKind: 'native-fsa' | 'file-input';
  rootHandle: FsaDirectoryHandle | null;
  tree: FsNode[];
  fileHandles: Map<string, FsaFileHandle>;
  fileObjects: Map<string, File>;
  truncatedByLimit: boolean;
}

const MAX_SCAN_FILES = 600;
const MAX_SCAN_DEPTH = 7;
const MAX_READABLE_BYTES = 1_500_000;

export function detectFsApiCapabilities(): FsApiCapabilities {
  if (typeof window === 'undefined') {
    return { hasDirectoryPicker: false, hasOpenFilePicker: false, isEmbeddedIframe: false };
  }
  const win = window as unknown as FsaWindow;
  let isEmbeddedIframe = false;
  try {
    isEmbeddedIframe = window.self !== window.top;
  } catch {
    isEmbeddedIframe = true;
  }
  return {
    hasDirectoryPicker: typeof win.showDirectoryPicker === 'function',
    hasOpenFilePicker: typeof win.showOpenFilePicker === 'function',
    isEmbeddedIframe,
  };
}

export function isCrossOriginPickerError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err || '');
  return /SecurityError|Cross origin sub frames|sub frames aren't allowed/i.test(msg);
}

export function isUserAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name || '';
  return name === 'AbortError';
}

export async function mountLocalDirectoryNative(
  mode: FsAccessMode = 'readwrite'
): Promise<MountedWorkspaceResult> {
  const win = window as unknown as FsaWindow;
  if (typeof win.showDirectoryPicker !== 'function') {
    throw new Error('File System Access API (showDirectoryPicker) is not supported in this browser.');
  }

  const rootHandle = await win.showDirectoryPicker({
    id: 'barbi-fs-agent-workspace',
    mode,
  });

  const fileHandles = new Map<string, FsaFileHandle>();
  const fileObjects = new Map<string, File>();
  let scannedCount = 0;
  let truncatedByLimit = false;

  const walkDir = async (
    dirHandle: FsaDirectoryHandle,
    parentPath: string,
    depth: number
  ): Promise<FsNode[]> => {
    if (depth > MAX_SCAN_DEPTH) {
      truncatedByLimit = true;
      return [];
    }

    const entries: FsNode[] = [];
    for await (const entry of dirHandle.values()) {
      if (scannedCount >= MAX_SCAN_FILES) {
        truncatedByLimit = true;
        break;
      }
      if (shouldIgnoreEntryName(entry.name)) {
        continue;
      }

      const relPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        const children = await walkDir(entry, relPath, depth + 1);
        entries.push({
          path: relPath,
          name: entry.name,
          kind: 'directory',
          size: 0,
          children,
        });
      } else {
        scannedCount += 1;
        fileHandles.set(relPath, entry);
        let size = 0;
        let lastModified: number | undefined;
        try {
          const f = await entry.getFile();
          size = f.size;
          lastModified = f.lastModified;
        } catch {
          // Keep lightweight entry even if metadata read fails
        }
        entries.push({
          path: relPath,
          name: entry.name,
          kind: 'file',
          size,
          language: detectFileLanguage(relPath),
          lastModified,
        });
      }
    }

    return sortFsNodes(entries);
  };

  const tree = await walkDir(rootHandle, '', 0);

  return {
    rootName: rootHandle.name || 'local-workspace',
    mountKind: 'native-fsa',
    rootHandle,
    tree,
    fileHandles,
    fileObjects,
    truncatedByLimit,
  };
}

export async function mountLocalFilesNative(): Promise<MountedWorkspaceResult> {
  const win = window as unknown as FsaWindow;
  if (typeof win.showOpenFilePicker !== 'function') {
    throw new Error('File System Access API (showOpenFilePicker) is not supported in this browser.');
  }

  const handles = await win.showOpenFilePicker({ multiple: true });
  const fileHandles = new Map<string, FsaFileHandle>();
  const fileObjects = new Map<string, File>();
  const nodes: FsNode[] = [];

  for (const handle of handles) {
    const file = await handle.getFile();
    const relPath = handle.name;
    fileHandles.set(relPath, handle);
    nodes.push({
      path: relPath,
      name: handle.name,
      kind: 'file',
      size: file.size,
      language: detectFileLanguage(relPath),
      lastModified: file.lastModified,
    });
  }

  return {
    rootName: handles.length === 1 ? handles[0].name : `${handles.length} Selected Local Files`,
    mountKind: 'native-fsa',
    rootHandle: null,
    tree: sortFsNodes(nodes),
    fileHandles,
    fileObjects,
    truncatedByLimit: false,
  };
}

export function mountFromFileList(fileList: FileList): MountedWorkspaceResult {
  const fileHandles = new Map<string, FsaFileHandle>();
  const fileObjects = new Map<string, File>();
  const rootMap = new Map<string, FsNode>();
  let rootName = 'local-selection';
  let scannedCount = 0;
  let truncatedByLimit = false;

  const files = Array.from(fileList);
  const firstRel = (files[0] as File & { webkitRelativePath?: string })?.webkitRelativePath || '';
  if (firstRel.includes('/')) {
    rootName = firstRel.split('/')[0] || rootName;
  } else if (files.length === 1) {
    rootName = files[0].name;
  } else if (files.length > 1) {
    rootName = `${files.length} Local Files`;
  }

  const ensureDir = (segments: string[]): FsNode[] => {
    let currentList: FsNode[] | null = null;
    let currentPath = '';

    for (const seg of segments) {
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;
      if (!currentList) {
        let top = rootMap.get(currentPath);
        if (!top) {
          top = { path: currentPath, name: seg, kind: 'directory', size: 0, children: [] };
          rootMap.set(currentPath, top);
        }
        if (!top.children) top.children = [];
        currentList = top.children;
      } else {
        let child: FsNode | undefined = currentList.find(
          (n) => n.kind === 'directory' && n.name === seg
        );
        if (!child) {
          child = { path: currentPath, name: seg, kind: 'directory', size: 0, children: [] };
          currentList.push(child);
        }
        if (!child.children) child.children = [];
        currentList = child.children;
      }
    }

    return currentList || [];
  };

  for (const file of files) {
    if (scannedCount >= MAX_SCAN_FILES) {
      truncatedByLimit = true;
      break;
    }

    const rawRel = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
      .replace(/\\/g, '/')
      .replace(/^\/+/, '');
    const parts = rawRel.split('/').filter(Boolean);
    const trimmedParts = parts.length > 1 && parts[0] === rootName ? parts.slice(1) : parts;
    if (trimmedParts.some((p) => shouldIgnoreEntryName(p))) {
      continue;
    }

    const relPath = trimmedParts.join('/');
    if (!relPath) continue;

    scannedCount += 1;
    fileObjects.set(relPath, file);

    const fileNode: FsNode = {
      path: relPath,
      name: trimmedParts[trimmedParts.length - 1],
      kind: 'file',
      size: file.size,
      language: detectFileLanguage(relPath),
      lastModified: file.lastModified,
    };

    if (trimmedParts.length === 1) {
      rootMap.set(relPath, fileNode);
    } else {
      const parentChildren = ensureDir(trimmedParts.slice(0, -1));
      parentChildren.push(fileNode);
    }
  }

  return {
    rootName,
    mountKind: 'file-input',
    rootHandle: null,
    tree: sortFsNodes(Array.from(rootMap.values())),
    fileHandles,
    fileObjects,
    truncatedByLimit,
  };
}

export async function readMountedFileText(
  path: string,
  fileHandles: Map<string, FsaFileHandle>,
  fileObjects: Map<string, File>,
  memoryContents: Record<string, string>
): Promise<{ text: string; isBinary: boolean; byteLength: number }> {
  if (Object.prototype.hasOwnProperty.call(memoryContents, path)) {
    const text = memoryContents[path];
    return {
      text,
      isBinary: false,
      byteLength: new TextEncoder().encode(text).length,
    };
  }

  const handle = fileHandles.get(path);
  let file: File | null = null;
  if (handle) {
    file = await handle.getFile();
  } else {
    file = fileObjects.get(path) || null;
  }

  if (!file) {
    throw new Error(`File "${path}" is not available in the mounted workspace.`);
  }

  if (!isLikelyTextFile(path, file.type)) {
    return {
      text: `[Binary file: ${file.name} (${file.type || 'unknown mime'}, ${file.size} bytes) — preview and AI text modification disabled for safety.]`,
      isBinary: true,
      byteLength: file.size,
    };
  }

  if (file.size > MAX_READABLE_BYTES) {
    const slice = await file.slice(0, MAX_READABLE_BYTES).text();
    return {
      text: `${slice}\n\n[Truncated at 1.5 MB for browser responsiveness]`,
      isBinary: false,
      byteLength: file.size,
    };
  }

  const text = await file.text();
  return { text, isBinary: false, byteLength: file.size };
}

export async function writeFileContentNative(
  handle: FsaFileHandle,
  content: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (typeof handle.queryPermission === 'function') {
      const status = await handle.queryPermission({ mode: 'readwrite' });
      if (status !== 'granted' && typeof handle.requestPermission === 'function') {
        const req = await handle.requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') {
          return { ok: false, error: 'Write permission was declined by the browser security prompt.' };
        }
      }
    }

    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error)?.message || 'Failed to write changes to local disk.',
    };
  }
}

export function downloadModifiedFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.split('/').pop() || 'modified-file.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
