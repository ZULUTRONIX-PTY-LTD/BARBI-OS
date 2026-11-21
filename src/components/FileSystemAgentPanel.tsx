import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileCode2,
  FileDiff,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  History,
  Lock,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { barbiApi } from '../api/barbiClient';
import {
  buildProjectTreeSummary,
  computeLineDiff,
  computeProjectStats,
  createSampleWorkspace,
  detectFileLanguage,
  filterFileTree,
  flattenFileNodes,
  formatFileSize,
  validateSelectedFilesPayload,
  type FsAccessMode,
  type FsAnalysisResult,
  type FsAuditEvent,
  type FsMountKind,
  type FsNode,
  type ProposedFileEdit,
} from '../fs/fileSystemAgentLogic';
import {
  detectFsApiCapabilities,
  downloadModifiedFile,
  isCrossOriginPickerError,
  isUserAbortError,
  mountFromFileList,
  mountLocalDirectoryNative,
  mountLocalFilesNative,
  readMountedFileText,
  writeFileContentNative,
  type FsaDirectoryHandle,
  type FsaFileHandle,
} from '../fs/fileSystemAccessBridge';

interface FsAgentToggleDetail {
  open?: boolean;
  loadSample?: boolean;
}

declare global {
  interface Window {
    __barbiFsAgentState?: {
      open: boolean;
      rootName: string | null;
      mountKind: FsMountKind | null;
      accessMode: FsAccessMode;
      totalFiles: number;
      selectedFilesCount: number;
      activeFilePath: string | null;
      pendingEditsCount: number;
    };
    openFileSystemAgent?: (options?: { loadSample?: boolean }) => void;
    closeFileSystemAgent?: () => void;
  }
}

type CenterViewTab = 'viewer' | 'diff' | 'structure';
type AgentOperationMode = 'analyze' | 'modify';

function nowStamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function collectAllDirPaths(nodes: FsNode[]): string[] {
  const dirs: string[] = [];
  const walk = (list: FsNode[]) => {
    for (const node of list) {
      if (node.kind === 'directory') {
        dirs.push(node.path);
        if (node.children) walk(node.children);
      }
    }
  };
  walk(nodes);
  return dirs;
}

export function FileSystemAgentPanel() {
  const [open, setOpen] = useState(false);
  const [rootName, setRootName] = useState<string | null>(null);
  const [mountKind, setMountKind] = useState<FsMountKind | null>(null);
  const [accessMode, setAccessMode] = useState<FsAccessMode>('readwrite');
  const [tree, setTree] = useState<FsNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<string>('');
  const [activeFileIsBinary, setActiveFileIsBinary] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  const [centerTab, setCenterTab] = useState<CenterViewTab>('viewer');
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [manualDraft, setManualDraft] = useState('');

  const [agentMode, setAgentMode] = useState<AgentOperationMode>('analyze');
  const [instruction, setInstruction] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<FsAnalysisResult | null>(null);
  const [pendingEdits, setPendingEdits] = useState<Record<string, ProposedFileEdit>>({});
  const [diffTargetPath, setDiffTargetPath] = useState<string | null>(null);
  const [writingPath, setWritingPath] = useState<string | null>(null);

  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [truncatedByLimit, setTruncatedByLimit] = useState(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLog, setAuditLog] = useState<FsAuditEvent[]>([]);

  // Mutable workspace storage refs (native FSA handles, File objects, in-memory overrides & originals for revert)
  const rootHandleRef = useRef<FsaDirectoryHandle | null>(null);
  const fileHandlesRef = useRef<Map<string, FsaFileHandle>>(new Map());
  const fileObjectsRef = useRef<Map<string, File>>(new Map());
  const memoryContentsRef = useRef<Record<string, string>>({});
  const originalSnapshotsRef = useRef<Record<string, string>>({});
  const [modifiedPaths, setModifiedPaths] = useState<Record<string, boolean>>({});

  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  const capabilities = useMemo(() => detectFsApiCapabilities(), []);

  const appendAudit = useCallback(
    (action: FsAuditEvent['action'], target: string, detail: string) => {
      const entry: FsAuditEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: nowStamp(),
        action,
        target,
        detail,
      };
      setAuditLog((prev) => [entry, ...prev].slice(0, 40));
    },
    []
  );

  const allFileNodes = useMemo(() => flattenFileNodes(tree), [tree]);
  const projectStats = useMemo(() => computeProjectStats(tree), [tree]);
  const filteredTree = useMemo(() => filterFileTree(tree, filterQuery), [tree, filterQuery]);
  const projectTreeText = useMemo(
    () => (rootName ? buildProjectTreeSummary(tree, rootName) : ''),
    [tree, rootName]
  );
  const pendingEditList = useMemo(() => Object.values(pendingEdits), [pendingEdits]);

  const activeFileNode = useMemo(
    () => allFileNodes.find((n) => n.path === activeFilePath) || null,
    [allFileNodes, activeFilePath]
  );

  const readFileByPath = useCallback(
    async (path: string): Promise<{ text: string; isBinary: boolean; byteLength: number }> => {
      return readMountedFileText(
        path,
        fileHandlesRef.current,
        fileObjectsRef.current,
        memoryContentsRef.current
      );
    },
    []
  );

  const openFilePreview = useCallback(
    async (path: string) => {
      setActiveFilePath(path);
      setIsManualEditing(false);
      setErrorBanner(null);
      setLoadingFile(true);
      try {
        const result = await readFileByPath(path);
        setActiveFileContent(result.text);
        setActiveFileIsBinary(result.isBinary);
        if (!Object.prototype.hasOwnProperty.call(originalSnapshotsRef.current, path) && !result.isBinary) {
          originalSnapshotsRef.current[path] = result.text;
        }
        appendAudit('read', path, `Loaded ${formatFileSize(result.byteLength)} for inspection`);
      } catch (err) {
        setErrorBanner((err as Error)?.message || `Unable to read "${path}".`);
        setActiveFileContent('');
      } finally {
        setLoadingFile(false);
      }
    },
    [readFileByPath, appendAudit]
  );

  const applyMountedWorkspace = useCallback(
    (payload: {
      rootName: string;
      mountKind: FsMountKind;
      rootHandle: FsaDirectoryHandle | null;
      tree: FsNode[];
      fileHandles: Map<string, FsaFileHandle>;
      fileObjects: Map<string, File>;
      memoryContents: Record<string, string>;
      truncatedByLimit: boolean;
    }) => {
      rootHandleRef.current = payload.rootHandle;
      fileHandlesRef.current = payload.fileHandles;
      fileObjectsRef.current = payload.fileObjects;
      memoryContentsRef.current = { ...payload.memoryContents };
      originalSnapshotsRef.current = { ...payload.memoryContents };

      setRootName(payload.rootName);
      setMountKind(payload.mountKind);
      setTree(payload.tree);
      setTruncatedByLimit(payload.truncatedByLimit);
      setFilterQuery('');
      setPendingEdits({});
      setDiffTargetPath(null);
      setAnalysisResult(null);
      setModifiedPaths({});
      setIsManualEditing(false);
      setCenterTab('viewer');
      setErrorBanner(null);

      const dirMap: Record<string, boolean> = {};
      for (const d of collectAllDirPaths(payload.tree)) {
        dirMap[d] = true;
      }
      setExpandedDirs(dirMap);

      const files = flattenFileNodes(payload.tree);
      const preferred =
        files.find((f) => /motorController|package\.json|README/i.test(f.path)) || files[0] || null;
      const defaultSelected: string[] = [];
      if (preferred) defaultSelected.push(preferred.path);
      for (const f of files) {
        if (defaultSelected.length >= 3) break;
        if (!defaultSelected.includes(f.path)) defaultSelected.push(f.path);
      }
      setSelectedPaths(defaultSelected);

      appendAudit(
        'mount',
        payload.rootName,
        `Mounted ${files.length} files via ${
          payload.mountKind === 'native-fsa'
            ? 'File System Access API'
            : payload.mountKind === 'file-input'
              ? 'Browser Folder Picker'
              : 'Sample Engineering Workspace'
        }`
      );

      if (preferred) {
        void openFilePreview(preferred.path);
      } else {
        setActiveFilePath(null);
        setActiveFileContent('');
      }
    },
    [appendAudit, openFilePreview]
  );

  const handleLoadSampleWorkspace = useCallback(() => {
    const sample = createSampleWorkspace();
    applyMountedWorkspace({
      rootName: sample.rootName,
      mountKind: 'sample-workspace',
      rootHandle: null,
      tree: sample.tree,
      fileHandles: new Map(),
      fileObjects: new Map(),
      memoryContents: sample.contents,
      truncatedByLimit: false,
    });
    setStatusNotice(
      'Loaded ZULUTRONIX sample workspace. Select files, inspect structure, or test AI diff review safely.'
    );
  }, [applyMountedWorkspace]);

  const handleMountLocalFolder = useCallback(async () => {
    setErrorBanner(null);
    setStatusNotice(null);

    if (capabilities.hasDirectoryPicker && !capabilities.isEmbeddedIframe) {
      try {
        const mounted = await mountLocalDirectoryNative(accessMode);
        applyMountedWorkspace({
          ...mounted,
          memoryContents: {},
        });
        setStatusNotice(
          `Mounted "${mounted.rootName}" directly via File System Access API (${
            accessMode === 'readwrite' ? 'Read + Approved Write' : 'Read-Only'
          }).`
        );
        return;
      } catch (err) {
        if (isUserAbortError(err)) return;
        if (!isCrossOriginPickerError(err)) {
          setErrorBanner((err as Error)?.message || 'Failed to mount local directory.');
          return;
        }
      }
    }

    // Fallback for cross-origin iframe previews or browsers without showDirectoryPicker
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
      folderInputRef.current.click();
    } else {
      setErrorBanner(
        'Your browser restricted direct directory picking in this frame. Open in a top-level tab for native readwrite disk access.'
      );
    }
  }, [capabilities.hasDirectoryPicker, capabilities.isEmbeddedIframe, accessMode, applyMountedWorkspace]);

  const handlePickLocalFiles = useCallback(async () => {
    setErrorBanner(null);
    setStatusNotice(null);

    if (capabilities.hasOpenFilePicker && !capabilities.isEmbeddedIframe) {
      try {
        const mounted = await mountLocalFilesNative();
        applyMountedWorkspace({
          ...mounted,
          memoryContents: {},
        });
        setStatusNotice(`Mounted ${mounted.tree.length} local file(s) via File System Access API.`);
        return;
      } catch (err) {
        if (isUserAbortError(err)) return;
        if (!isCrossOriginPickerError(err)) {
          setErrorBanner((err as Error)?.message || 'Failed to pick local files.');
          return;
        }
      }
    }

    if (filesInputRef.current) {
      filesInputRef.current.value = '';
      filesInputRef.current.click();
    }
  }, [capabilities.hasOpenFilePicker, capabilities.isEmbeddedIframe, applyMountedWorkspace]);

  const handleFallbackInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const mounted = mountFromFileList(files);
      applyMountedWorkspace({
        ...mounted,
        memoryContents: {},
      });
      setStatusNotice(
        `Mounted "${mounted.rootName}" (${flattenFileNodes(mounted.tree).length} files). Approved edits can be applied in-session and downloaded to disk.`
      );
    },
    [applyMountedWorkspace]
  );

  // Sync window state for B.A.R.B.I. live UI perception & voice control
  useEffect(() => {
    window.__barbiFsAgentState = {
      open,
      rootName,
      mountKind,
      accessMode,
      totalFiles: projectStats.totalFiles,
      selectedFilesCount: selectedPaths.length,
      activeFilePath,
      pendingEditsCount: pendingEditList.length,
    };
  }, [
    open,
    rootName,
    mountKind,
    accessMode,
    projectStats.totalFiles,
    selectedPaths.length,
    activeFilePath,
    pendingEditList.length,
  ]);

  useEffect(() => {
    window.openFileSystemAgent = (options?: { loadSample?: boolean }) => {
      setOpen(true);
      if (options?.loadSample) {
        handleLoadSampleWorkspace();
      }
    };
    window.closeFileSystemAgent = () => {
      setOpen(false);
    };

    const onToggle = (ev: Event) => {
      const detail = (ev as CustomEvent<FsAgentToggleDetail>).detail;
      if (typeof detail?.open === 'boolean') {
        setOpen(detail.open);
      } else {
        setOpen((prev) => !prev);
      }
      if (detail?.loadSample) {
        handleLoadSampleWorkspace();
      }
    };

    window.addEventListener('barbi:toggle-fs-agent', onToggle);
    return () => {
      window.removeEventListener('barbi:toggle-fs-agent', onToggle);
    };
  }, [handleLoadSampleWorkspace]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const toggleFileSelected = useCallback((path: string) => {
    setSelectedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  }, []);

  const handleSelectAllVisible = useCallback(() => {
    const visible = flattenFileNodes(filteredTree).slice(0, 15).map((f) => f.path);
    setSelectedPaths(visible);
  }, [filteredTree]);

  const handleClearSelection = useCallback(() => {
    setSelectedPaths([]);
  }, []);

  const handleRunAnalysis = useCallback(async () => {
    setErrorBanner(null);
    setStatusNotice(null);

    if (!rootName) {
      setErrorBanner('Mount a local folder, pick files, or load the sample workspace first.');
      return;
    }

    const trimmedInstruction = instruction.trim();
    const effectiveInstruction =
      trimmedInstruction ||
      (agentMode === 'modify'
        ? 'Audit the selected files for safety issues or bugs and propose clean production fixes.'
        : 'Analyze the project structure and selected files, summarize architecture, and report concrete findings.');

    if (selectedPaths.length === 0) {
      setErrorBanner('Select at least one file in the left tree to grant B.A.R.B.I. read scope.');
      return;
    }

    setAnalyzing(true);
    try {
      const loadedFiles: Array<{ path: string; content: string; language?: string }> = [];
      for (const path of selectedPaths) {
        const res = await readFileByPath(path);
        if (res.isBinary) continue;
        if (!Object.prototype.hasOwnProperty.call(originalSnapshotsRef.current, path)) {
          originalSnapshotsRef.current[path] = res.text;
        }
        loadedFiles.push({
          path,
          content: res.text,
          language: detectFileLanguage(path),
        });
      }

      const validated = validateSelectedFilesPayload(loadedFiles);
      if (!validated.ok) {
        setErrorBanner(validated.error);
        return;
      }

      appendAudit(
        'analyze',
        `${validated.files.length} file(s)`,
        `${agentMode === 'modify' ? 'Modification proposal' : 'Read-only analysis'}: ${effectiveInstruction.slice(0, 90)}`
      );

      const response = await barbiApi.fsAgentAnalyze({
        rootName,
        mode: agentMode,
        instruction: effectiveInstruction,
        projectTree: projectTreeText,
        selectedFiles: validated.files.map((f) => ({
          path: f.path,
          content: f.content,
          language: detectFileLanguage(f.path),
        })),
      });

      setAnalysisResult(response);

      if (response.proposedEdits.length > 0) {
        const nextEdits: Record<string, ProposedFileEdit> = {};
        for (const edit of response.proposedEdits) {
          nextEdits[edit.path] = edit;
        }
        setPendingEdits(nextEdits);
        const firstPath = response.proposedEdits[0].path;
        setDiffTargetPath(firstPath);
        setActiveFilePath(firstPath);
        const orig = await readFileByPath(firstPath);
        setActiveFileContent(orig.text);
        setCenterTab('diff');
        setStatusNotice(
          `Prepared ${response.proposedEdits.length} proposed edit(s). Review the unified diff and click Approve to commit.`
        );
      } else {
        setStatusNotice(
          `B.A.R.B.I. completed ${agentMode === 'modify' ? 'review' : 'analysis'} across ${validated.files.length} file(s).`
        );
      }
    } catch (err) {
      setErrorBanner((err as Error)?.message || 'Failed to run B.A.R.B.I. File System analysis.');
    } finally {
      setAnalyzing(false);
    }
  }, [
    rootName,
    instruction,
    agentMode,
    selectedPaths,
    readFileByPath,
    projectTreeText,
    appendAudit,
  ]);

  const handleApproveEdit = useCallback(
    async (edit: ProposedFileEdit) => {
      setErrorBanner(null);
      if (accessMode === 'read') {
        setErrorBanner(
          'Workspace is currently in Read-Only Safe Mode. Switch the Write Guard in the header to Approved Write before committing changes.'
        );
        return;
      }

      setWritingPath(edit.path);
      try {
        const nativeHandle = fileHandlesRef.current.get(edit.path);
        if (mountKind === 'native-fsa' && nativeHandle) {
          const writeRes = await writeFileContentNative(nativeHandle, edit.updatedContent);
          if (!writeRes.ok) {
            setErrorBanner(writeRes.error || 'Write permission denied.');
            return;
          }
          memoryContentsRef.current[edit.path] = edit.updatedContent;
          appendAudit('write', edit.path, 'Approved & written directly to local disk via File System Access API');
          setStatusNotice(`Approved and written directly to disk: ${edit.path}`);
        } else {
          memoryContentsRef.current[edit.path] = edit.updatedContent;
          appendAudit('write', edit.path, 'Approved & applied to mounted workspace snapshot');
          setStatusNotice(
            mountKind === 'file-input'
              ? `Approved & applied in workspace: ${edit.path}. Use Download to export the updated file to disk.`
              : `Approved & applied modification to ${edit.path}.`
          );
        }

        setModifiedPaths((prev) => ({ ...prev, [edit.path]: true }));
        if (activeFilePath === edit.path) {
          setActiveFileContent(edit.updatedContent);
        }
        setPendingEdits((prev) => {
          const copy = { ...prev };
          delete copy[edit.path];
          return copy;
        });

        // Move to viewer or next pending diff
        const remaining = Object.keys(pendingEdits).filter((p) => p !== edit.path);
        if (remaining.length > 0) {
          setDiffTargetPath(remaining[0]);
          void openFilePreview(remaining[0]);
        } else {
          setDiffTargetPath(null);
          setCenterTab('viewer');
        }
      } finally {
        setWritingPath(null);
      }
    },
    [accessMode, mountKind, activeFilePath, pendingEdits, appendAudit, openFilePreview]
  );

  const handleDiscardEdit = useCallback(
    (path: string) => {
      setPendingEdits((prev) => {
        const copy = { ...prev };
        delete copy[path];
        return copy;
      });
      const remaining = Object.keys(pendingEdits).filter((p) => p !== path);
      if (remaining.length > 0) {
        setDiffTargetPath(remaining[0]);
      } else {
        setDiffTargetPath(null);
        setCenterTab('viewer');
      }
      setStatusNotice(`Discarded proposed modification for ${path}.`);
    },
    [pendingEdits]
  );

  const handleRevertFile = useCallback(
    async (path: string) => {
      const original = originalSnapshotsRef.current[path];
      if (original === undefined) return;
      setErrorBanner(null);

      const nativeHandle = fileHandlesRef.current.get(path);
      if (mountKind === 'native-fsa' && nativeHandle) {
        const writeRes = await writeFileContentNative(nativeHandle, original);
        if (!writeRes.ok) {
          setErrorBanner(writeRes.error || 'Failed to restore original file on disk.');
          return;
        }
      }

      memoryContentsRef.current[path] = original;
      if (activeFilePath === path) {
        setActiveFileContent(original);
        setManualDraft(original);
        setIsManualEditing(false);
      }
      setModifiedPaths((prev) => {
        const copy = { ...prev };
        delete copy[path];
        return copy;
      });
      appendAudit('revert', path, 'Restored original file content');
      setStatusNotice(`Reverted ${path} to its original mounted content.`);
    },
    [mountKind, activeFilePath, appendAudit]
  );

  const handleSaveManualEdit = useCallback(async () => {
    if (!activeFilePath) return;
    await handleApproveEdit({
      path: activeFilePath,
      rationale: 'Direct Chief Engineer edit',
      updatedContent: manualDraft,
    });
    setIsManualEditing(false);
  }, [activeFilePath, manualDraft, handleApproveEdit]);

  const handleCopyText = useCallback((label: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedPath(label);
    setTimeout(() => setCopiedPath((curr) => (curr === label ? null : curr)), 1600);
  }, []);

  const currentDiffEdit = useMemo(() => {
    if (diffTargetPath && pendingEdits[diffTargetPath]) {
      return pendingEdits[diffTargetPath];
    }
    return pendingEditList[0] || null;
  }, [diffTargetPath, pendingEdits, pendingEditList]);

  const activeDiffSummary = useMemo(() => {
    if (!currentDiffEdit) return null;
    const baseText =
      memoryContentsRef.current[currentDiffEdit.path] ??
      originalSnapshotsRef.current[currentDiffEdit.path] ??
      (activeFilePath === currentDiffEdit.path ? activeFileContent : '');
    return computeLineDiff(baseText, currentDiffEdit.updatedContent);
  }, [currentDiffEdit, activeFilePath, activeFileContent]);

  const renderTreeNodes = (nodes: FsNode[], depth = 0) => {
    return nodes.map((node) => {
      if (node.kind === 'directory') {
        const isExpanded = expandedDirs[node.path] ?? true;
        return (
          <div key={node.path}>
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() =>
                setExpandedDirs((prev) => ({ ...prev, [node.path]: !(prev[node.path] ?? true) }))
              }
              style={{ paddingLeft: `${depth * 14 + 10}px` }}
              className="w-full flex items-center gap-1.5 py-1.5 pr-2 text-left text-xs text-stone-300 hover:bg-amber-500/10 hover:text-amber-100 cursor-pointer"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-amber-400/75 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-stone-500 shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
              )}
              <span className="truncate font-medium">{node.name}</span>
            </button>
            {isExpanded && node.children && node.children.length > 0 && (
              <div>{renderTreeNodes(node.children, depth + 1)}</div>
            )}
          </div>
        );
      }

      const isActive = activeFilePath === node.path;
      const isChecked = selectedPaths.includes(node.path);
      const hasPendingDiff = Boolean(pendingEdits[node.path]);
      const isModified = Boolean(modifiedPaths[node.path]);

      return (
        <div
          key={node.path}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`flex items-center gap-1.5 py-1 pr-2 text-xs border-y border-transparent ${
            isActive
              ? 'bg-amber-500/18 text-amber-100 border-amber-500/30'
              : 'text-stone-300 hover:bg-white/[0.04]'
          }`}
        >
          <label className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggleFileSelected(node.path)}
              aria-label={`Select ${node.path} for B.A.R.B.I.`}
              className="peer sr-only"
            />
            <span className="w-3.5 h-3.5 border border-stone-600 bg-black/80 peer-checked:bg-amber-500 peer-checked:border-amber-400 peer-focus-visible:ring-1 peer-focus-visible:ring-amber-300 flex items-center justify-center">
              {isChecked && <Check className="w-2.5 h-2.5 text-stone-950 stroke-[3]" />}
            </span>
          </label>
          <button
            type="button"
            onClick={() => {
              void openFilePreview(node.path);
              if (pendingEdits[node.path]) {
                setDiffTargetPath(node.path);
              } else {
                setCenterTab('viewer');
              }
            }}
            className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left cursor-pointer"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <FileCode2
                className={`w-3.5 h-3.5 shrink-0 ${
                  hasPendingDiff
                    ? 'text-cyan-300'
                    : isModified
                      ? 'text-emerald-400'
                      : 'text-stone-400'
                }`}
              />
              <span className="truncate">{node.name}</span>
            </span>
            <span className="font-mono tabular-nums text-[10px] text-stone-500 shrink-0">
              {hasPendingDiff ? 'DIFF' : isModified ? 'SAVED' : formatFileSize(node.size)}
            </span>
          </button>
        </div>
      );
    });
  };

  if (!open) {
    return null;
  }

  return (
    <div
      id="barbi-fs-agent-panel"
      role="dialog"
      aria-modal="true"
      aria-label="B.A.R.B.I. File System Agent"
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-5"
    >
      {/* Hidden fallback inputs for cross-origin iframe previews or non-FSA browsers */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is standard in Chromium/WebKit/Firefox
        webkitdirectory=""
        onChange={handleFallbackInputChange}
        className="hidden"
        aria-hidden="true"
      />
      <input
        ref={filesInputRef}
        type="file"
        multiple
        onChange={handleFallbackInputChange}
        className="hidden"
        aria-hidden="true"
      />

      <div className="barbi-scifi-frame-wrap w-full max-w-[1380px] h-[min(860px,92vh)]">
        <div className="barbi-scifi-shell w-full h-full flex flex-col overflow-hidden text-stone-100">
          {/* Top Bar — 3 Clean Zones */}
          <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-amber-500/25 bg-black/45 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 flex items-center justify-center border border-amber-400/50 bg-amber-500/15 text-amber-300 shrink-0">
                <FolderOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold tracking-wide text-amber-100 whitespace-nowrap">
                  File System Agent
                </h2>
                <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-stone-400 truncate">
                  <span>{rootName ? rootName : 'No local workspace mounted'}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {mountKind === 'native-fsa'
                      ? 'File System Access API'
                      : mountKind === 'file-input'
                        ? 'Browser Folder Bridge'
                        : mountKind === 'sample-workspace'
                          ? 'Sample Engineering Project'
                          : 'Permission-Scoped Local Bridge'}
                  </span>
                  {rootName && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {projectStats.totalFiles} files / {selectedPaths.length} selected
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Interactive Security Guard Toggle */}
              <div
                role="group"
                aria-label="File write permission guard"
                className="flex items-center border border-amber-500/30 bg-black/55 p-0.5 text-[11px]"
              >
                <button
                  type="button"
                  onClick={() => {
                    setAccessMode('read');
                    appendAudit('permission', 'Write Guard', 'Switched to Read-Only Safe Mode');
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 whitespace-nowrap shrink-0 cursor-pointer ${
                    accessMode === 'read'
                      ? 'bg-amber-500/25 text-amber-100 font-medium'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  Read-Only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccessMode('readwrite');
                    appendAudit('permission', 'Write Guard', 'Authorized Approved-Write Mode');
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 whitespace-nowrap shrink-0 cursor-pointer ${
                    accessMode === 'readwrite'
                      ? 'bg-emerald-500/20 text-emerald-200 font-medium'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Unlock className="w-3 h-3" />
                  Approved Write
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleMountLocalFolder()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-400 text-stone-950 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Mount Folder
              </button>

              <button
                type="button"
                onClick={() => void handlePickLocalFiles()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-amber-500/40 bg-black/50 hover:bg-amber-500/15 text-amber-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                Pick Files
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close File System Agent"
                className="p-1.5 border border-stone-700 hover:border-amber-400/60 bg-black/50 text-stone-300 hover:text-amber-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Contextual Notice / Error Banner */}
          {(errorBanner || statusNotice) && (
            <div
              className={`flex items-center justify-between gap-3 px-5 py-2 text-xs border-b shrink-0 ${
                errorBanner
                  ? 'bg-red-950/55 border-red-500/40 text-red-200'
                  : 'bg-cyan-950/35 border-cyan-500/30 text-cyan-100'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {errorBanner ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                )}
                <span className="truncate">{errorBanner || statusNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setErrorBanner(null);
                  setStatusNotice(null);
                }}
                aria-label="Dismiss status notice"
                className="text-stone-400 hover:text-stone-100 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Main 3-Pane Body or Secure Onboarding Empty State */}
          {!rootName ? (
            <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
              <div className="max-w-2xl w-full border border-amber-500/25 bg-black/45 p-8">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck className="w-6 h-6 text-amber-400 shrink-0" />
                  <h3 className="text-lg font-semibold text-amber-100">
                    Permission-Scoped Local Workspace Access
                  </h3>
                </div>
                <p className="text-sm text-stone-300 leading-relaxed mb-6">
                  Mount any local project folder or pick individual files using the browser File
                  System Access API. B.A.R.B.I. only inspects files you explicitly select with
                  checkboxes, and every proposed modification requires your approval on a
                  line-by-line unified diff before writing.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7 border-y border-stone-800 py-5 text-xs">
                  <div>
                    <div className="font-semibold text-amber-200 mb-1">01. Browse Structure</div>
                    <p className="text-stone-400 leading-relaxed">
                      Recursively maps project folders while automatically skipping node_modules,
                      .git, and build artifacts.
                    </p>
                  </div>
                  <div>
                    <div className="font-semibold text-amber-200 mb-1">02. Scoped Selection</div>
                    <p className="text-stone-400 leading-relaxed">
                      Check exact files to share with B.A.R.B.I. for architecture reviews, bug
                      audits, or targeted refactors.
                    </p>
                  </div>
                  <div>
                    <div className="font-semibold text-amber-200 mb-1">03. Diff Approval Gate</div>
                    <p className="text-stone-400 leading-relaxed">
                      Inspect every added and removed line, approve writes to local disk, or revert
                      to original snapshots anytime.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleMountLocalFolder()}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-stone-950 whitespace-nowrap cursor-pointer"
                  >
                    <FolderPlus className="w-4 h-4" />
                    Mount Local Folder
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePickLocalFiles()}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium border border-amber-500/45 bg-black/60 hover:bg-amber-500/15 text-amber-100 whitespace-nowrap cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    Pick Local Files
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadSampleWorkspace}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium border border-cyan-500/45 bg-cyan-950/30 hover:bg-cyan-500/20 text-cyan-100 whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Load Sample Workspace
                  </button>
                </div>

                {capabilities.isEmbeddedIframe && (
                  <p className="mt-4 text-[11px] text-stone-400">
                    Running inside an embedded frame: Mount Folder uses the browser folder bridge
                    for reading, and approved edits can be exported to disk via Download. Open the
                    app in its own browser tab for direct in-place File System Access API disk
                    writes.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[270px_minmax(0,1fr)_350px] divide-y lg:divide-y-0 lg:divide-x divide-amber-500/20">
              {/* LEFT PANE: Project Explorer & Selection Scope */}
              <aside className="flex flex-col min-h-0 bg-black/35">
                <div className="p-3 border-b border-stone-800/90 space-y-2 shrink-0">
                  <div className="flex items-center justify-between text-[11px] text-stone-400 font-mono tabular-nums">
                    <span className="truncate font-semibold text-amber-200">{rootName}</span>
                    <span className="shrink-0">{formatFileSize(projectStats.totalBytes)}</span>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder="Filter files by name or path..."
                      aria-label="Filter mounted workspace files"
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-black/65 border border-stone-700 focus:border-amber-400 focus:outline-none text-stone-100 placeholder:text-stone-500"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-stone-400 font-mono tabular-nums">
                      Selected: <strong className="text-amber-300">{selectedPaths.length}</strong> /{' '}
                      {projectStats.totalFiles}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllVisible}
                        className="text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline cursor-pointer"
                      >
                        Select visible
                      </button>
                      <span aria-hidden="true" className="text-stone-600">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={handleClearSelection}
                        className="text-stone-400 hover:text-stone-200 underline-offset-2 hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto py-1.5">
                  {filteredTree.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-stone-500">
                      No files match "{filterQuery}".
                    </div>
                  ) : (
                    renderTreeNodes(filteredTree)
                  )}
                </div>

                {truncatedByLimit && (
                  <div className="px-3 py-2 text-[10px] text-amber-300/85 border-t border-stone-800 bg-amber-950/20 shrink-0">
                    Indexed first 600 source files (node_modules and .git skipped).
                  </div>
                )}
              </aside>

              {/* CENTER PANE: Source Viewer, Unified Diff Review, & Project Structure */}
              <section className="flex flex-col min-h-0 bg-black/20">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-stone-800/90 bg-black/35 shrink-0">
                  <div className="flex items-center gap-1" role="tablist" aria-label="Workspace view mode">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={centerTab === 'viewer'}
                      onClick={() => setCenterTab('viewer')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap cursor-pointer ${
                        centerTab === 'viewer'
                          ? 'bg-amber-500/20 text-amber-100 border border-amber-400/50 font-medium'
                          : 'text-stone-400 hover:text-stone-200 border border-transparent'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Source Viewer
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={centerTab === 'diff'}
                      onClick={() => setCenterTab('diff')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap cursor-pointer ${
                        centerTab === 'diff'
                          ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/50 font-medium'
                          : 'text-stone-400 hover:text-stone-200 border border-transparent'
                      }`}
                    >
                      <FileDiff className="w-3.5 h-3.5" />
                      Diff Review ({pendingEditList.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={centerTab === 'structure'}
                      onClick={() => setCenterTab('structure')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap cursor-pointer ${
                        centerTab === 'structure'
                          ? 'bg-amber-500/20 text-amber-100 border border-amber-400/50 font-medium'
                          : 'text-stone-400 hover:text-stone-200 border border-transparent'
                      }`}
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      Structure Map
                    </button>
                  </div>

                  {activeFilePath && centerTab === 'viewer' && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => toggleFileSelected(activeFilePath)}
                        className={`flex items-center gap-1 px-2.5 py-1 border whitespace-nowrap cursor-pointer ${
                          selectedPaths.includes(activeFilePath)
                            ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                            : 'border-stone-700 text-stone-300 hover:border-amber-400/40'
                        }`}
                      >
                        {selectedPaths.includes(activeFilePath) ? (
                          <>
                            <Check className="w-3 h-3" />
                            In Scope
                          </>
                        ) : (
                          'Add to Scope'
                        )}
                      </button>
                      {!activeFileIsBinary && !isManualEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setManualDraft(activeFileContent);
                            setIsManualEditing(true);
                          }}
                          className="px-2.5 py-1 border border-stone-700 hover:border-amber-400/50 text-stone-200 whitespace-nowrap cursor-pointer"
                        >
                          Edit File
                        </button>
                      )}
                      {isManualEditing && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleSaveManualEdit()}
                            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-medium whitespace-nowrap cursor-pointer"
                          >
                            Save Changes
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsManualEditing(false)}
                            className="px-2.5 py-1 border border-stone-700 text-stone-300 whitespace-nowrap cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {modifiedPaths[activeFilePath] && (
                        <>
                          <button
                            type="button"
                            onClick={() => downloadModifiedFile(activeFilePath, activeFileContent)}
                            className="flex items-center gap-1 px-2.5 py-1 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/15 whitespace-nowrap cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRevertFile(activeFilePath)}
                            className="flex items-center gap-1 px-2.5 py-1 border border-stone-700 text-stone-300 hover:text-amber-200 whitespace-nowrap cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Revert
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyText(activeFilePath, activeFileContent)}
                        className="flex items-center gap-1 px-2 py-1 border border-stone-700 text-stone-300 hover:text-amber-200 whitespace-nowrap cursor-pointer"
                        aria-label="Copy active file content"
                      >
                        {copiedPath === activeFilePath ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* VIEWER TAB */}
                {centerTab === 'viewer' && (
                  <div className="flex-1 min-h-0 flex flex-col">
                    {activeFilePath ? (
                      <>
                        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-stone-800/80 text-[11px] font-mono tabular-nums text-stone-400 shrink-0">
                          <span className="truncate text-amber-200">{activeFilePath}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span>{activeFileNode?.language || detectFileLanguage(activeFilePath)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{activeFileContent.split('\n').length} lines</span>
                            <span aria-hidden="true">·</span>
                            <span>{modifiedPaths[activeFilePath] ? 'Modified' : 'Synced'}</span>
                          </div>
                        </div>

                        {loadingFile ? (
                          <div className="flex-1 flex items-center justify-center text-xs text-stone-400">
                            Reading local file stream...
                          </div>
                        ) : isManualEditing ? (
                          <textarea
                            value={manualDraft}
                            onChange={(e) => setManualDraft(e.target.value)}
                            aria-label={`Edit ${activeFilePath}`}
                            spellCheck={false}
                            className="flex-1 w-full p-4 bg-black/70 text-stone-100 font-mono text-xs leading-6 resize-none focus:outline-none"
                          />
                        ) : (
                          <div className="flex-1 min-h-0 overflow-auto p-3 font-mono text-xs leading-6">
                            {activeFileContent.split('\n').map((line, idx) => (
                              <div key={idx} className="flex hover:bg-white/[0.03]">
                                <span className="w-11 pr-3 text-right select-none text-stone-600 tabular-nums shrink-0">
                                  {idx + 1}
                                </span>
                                <span className="whitespace-pre text-stone-200">{line || ' '}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-xs text-stone-500 p-6">
                        Select any file from the project tree to inspect its contents.
                      </div>
                    )}
                  </div>
                )}

                {/* DIFF REVIEW TAB */}
                {centerTab === 'diff' && (
                  <div className="flex-1 min-h-0 flex flex-col">
                    {currentDiffEdit && activeDiffSummary ? (
                      <>
                        <div className="p-3.5 border-b border-stone-800 bg-black/40 space-y-2.5 shrink-0">
                          {pendingEditList.length > 1 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {pendingEditList.map((edit) => (
                                <button
                                  key={edit.path}
                                  type="button"
                                  onClick={() => setDiffTargetPath(edit.path)}
                                  className={`px-2.5 py-1 text-[11px] font-mono cursor-pointer border ${
                                    currentDiffEdit.path === edit.path
                                      ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-100'
                                      : 'border-stone-700 text-stone-400 hover:text-stone-200'
                                  }`}
                                >
                                  {edit.path}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs font-mono text-cyan-200 truncate">
                                {currentDiffEdit.path}
                              </div>
                              <div className="text-xs text-stone-300 mt-0.5">
                                {currentDiffEdit.rationale}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                                +{activeDiffSummary.addedCount}
                              </span>
                              <span className="text-[11px] font-mono tabular-nums text-red-400">
                                -{activeDiffSummary.removedCount}
                              </span>
                              <button
                                type="button"
                                disabled={writingPath === currentDiffEdit.path}
                                onClick={() => void handleApproveEdit(currentDiffEdit)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-stone-950 whitespace-nowrap cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                {mountKind === 'native-fsa'
                                  ? 'Approve & Write to Disk'
                                  : 'Approve & Apply'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDiscardEdit(currentDiffEdit.path)}
                                className="px-2.5 py-1.5 text-xs border border-stone-700 hover:border-red-400/50 text-stone-300 hover:text-red-200 whitespace-nowrap cursor-pointer"
                              >
                                Discard
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 min-h-0 overflow-auto p-3 font-mono text-xs leading-6">
                          {activeDiffSummary.lines.map((line, idx) => (
                            <div
                              key={idx}
                              className={`flex ${
                                line.type === 'added'
                                  ? 'bg-emerald-500/12 text-emerald-200'
                                  : line.type === 'removed'
                                    ? 'bg-red-500/12 text-red-200'
                                    : 'text-stone-400'
                              }`}
                            >
                              <span className="w-10 pr-2 text-right select-none text-stone-600 tabular-nums shrink-0">
                                {line.oldLineNumber ?? ''}
                              </span>
                              <span className="w-10 pr-2 text-right select-none text-stone-600 tabular-nums shrink-0">
                                {line.newLineNumber ?? ''}
                              </span>
                              <span className="w-4 select-none font-bold shrink-0">
                                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                              </span>
                              <span className="whitespace-pre">{line.content || ' '}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-stone-400">
                        <FileDiff className="w-7 h-7 text-stone-600 mb-3" />
                        <p className="text-stone-300 font-medium mb-1">
                          No pending file modifications
                        </p>
                        <p className="max-w-sm text-stone-500">
                          Switch the B.A.R.B.I. panel on the right to Propose Edits and run an
                          instruction to review unified line-by-line diffs here before committing.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* STRUCTURE MAP TAB */}
                {centerTab === 'structure' && (
                  <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-3">
                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-stone-300">
                        <span>{projectStats.totalDirs} folders</span>
                        <span aria-hidden="true">·</span>
                        <span>{projectStats.totalFiles} files</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatFileSize(projectStats.totalBytes)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyText('project-tree', projectTreeText)}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-stone-700 hover:border-amber-400/50 text-stone-200 cursor-pointer"
                      >
                        {copiedPath === 'project-tree' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        Copy Tree
                      </button>
                    </div>

                    {projectStats.byExtension.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-stone-400">
                        {projectStats.byExtension.map((item) => (
                          <span key={item.ext}>
                            .{item.ext}: <strong className="text-amber-200">{item.count}</strong>
                          </span>
                        ))}
                      </div>
                    )}

                    <pre className="p-4 bg-black/55 border border-stone-800 font-mono text-xs leading-6 text-stone-200 overflow-x-auto">
                      {projectTreeText}
                    </pre>
                  </div>
                )}
              </section>

              {/* RIGHT PANE: B.A.R.B.I. Analysis, Modification Proposals & Audit Log */}
              <aside className="flex flex-col min-h-0 bg-black/40">
                <div className="p-4 border-b border-stone-800/90 space-y-3 shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold tracking-wide text-amber-200">
                      B.A.R.B.I. File Intelligence
                    </h3>
                    <span className="text-[11px] font-mono tabular-nums text-stone-400">
                      {selectedPaths.length} file(s) scoped
                    </span>
                  </div>

                  {/* Mode Switch */}
                  <div
                    role="group"
                    aria-label="B.A.R.B.I. File Agent mode"
                    className="grid grid-cols-2 border border-amber-500/30 bg-black/55 p-0.5 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => setAgentMode('analyze')}
                      className={`py-1.5 text-center whitespace-nowrap cursor-pointer ${
                        agentMode === 'analyze'
                          ? 'bg-amber-500/25 text-amber-100 font-medium'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      Analyze & Audit
                    </button>
                    <button
                      type="button"
                      onClick={() => setAgentMode('modify')}
                      className={`py-1.5 text-center whitespace-nowrap cursor-pointer ${
                        agentMode === 'modify'
                          ? 'bg-cyan-500/25 text-cyan-100 font-medium'
                          : 'text-stone-400 hover:text-stone-200'
                      }`}
                    >
                      Propose Edits
                    </button>
                  </div>

                  {/* Selected Files Scope Preview */}
                  <div className="max-h-20 overflow-y-auto border border-stone-800 bg-black/45 p-2 space-y-1">
                    {selectedPaths.length === 0 ? (
                      <div className="text-[11px] text-stone-500">
                        Check files in the project tree to grant B.A.R.B.I. read access.
                      </div>
                    ) : (
                      selectedPaths.map((path) => (
                        <div
                          key={path}
                          className="flex items-center justify-between gap-2 text-[11px] font-mono text-stone-300"
                        >
                          <span className="truncate">{path}</span>
                          <button
                            type="button"
                            onClick={() => toggleFileSelected(path)}
                            aria-label={`Remove ${path} from selection`}
                            className="text-stone-500 hover:text-red-300 cursor-pointer shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Quick Prompt Templates */}
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        setAgentMode('analyze');
                        setInstruction(
                          'Explain how the selected files fit into the project architecture and flag any risks.'
                        );
                      }}
                      className="px-2 py-1 border border-stone-700 hover:border-amber-400/50 text-stone-300 hover:text-amber-100 cursor-pointer"
                    >
                      Architecture Review
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAgentMode('modify');
                        setInstruction(
                          'Harden safety checks, clamp numeric bounds, and resolve any TODO items in the selected files.'
                        );
                      }}
                      className="px-2 py-1 border border-stone-700 hover:border-cyan-400/50 text-stone-300 hover:text-cyan-100 cursor-pointer"
                    >
                      Harden & Fix
                    </button>
                  </div>

                  <textarea
                    rows={3}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder={
                      agentMode === 'modify'
                        ? 'Describe the exact modification for B.A.R.B.I. to propose...'
                        : 'Ask B.A.R.B.I. to audit, explain, or trace the selected files...'
                    }
                    aria-label="Instruction for B.A.R.B.I. File System Agent"
                    className="w-full p-2.5 text-xs bg-black/65 border border-stone-700 focus:border-amber-400 focus:outline-none text-stone-100 placeholder:text-stone-500 resize-none"
                  />

                  <button
                    type="button"
                    disabled={analyzing || selectedPaths.length === 0}
                    onClick={() => void handleRunAnalysis()}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 whitespace-nowrap cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {analyzing
                      ? 'Analyzing Selected Scope...'
                      : agentMode === 'modify'
                        ? 'Generate Proposed Modifications'
                        : 'Run B.A.R.B.I. Analysis'}
                  </button>
                </div>

                {/* Output & Findings Scroll Area */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                  {analysisResult ? (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono text-stone-400">
                          <span className="text-amber-300 font-semibold">Analysis Summary</span>
                          <span>{analysisResult.model}</span>
                        </div>
                        <p className="text-xs text-stone-200 leading-relaxed">
                          {analysisResult.summary}
                        </p>
                      </div>

                      {pendingEditList.length > 0 && (
                        <div className="border border-cyan-500/40 bg-cyan-950/20 p-3 space-y-2">
                          <div className="text-xs font-semibold text-cyan-200">
                            Pending Approval ({pendingEditList.length})
                          </div>
                          {pendingEditList.map((edit) => (
                            <button
                              key={edit.path}
                              type="button"
                              onClick={() => {
                                setDiffTargetPath(edit.path);
                                setCenterTab('diff');
                              }}
                              className="w-full text-left p-2 border border-cyan-500/30 hover:bg-cyan-500/15 cursor-pointer"
                            >
                              <div className="text-[11px] font-mono text-cyan-200 truncate">
                                {edit.path}
                              </div>
                              <div className="text-[11px] text-stone-300 line-clamp-2 mt-0.5">
                                {edit.rationale}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {analysisResult.findings.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[11px] font-mono text-stone-400">
                            Findings ({analysisResult.findings.length})
                          </div>
                          {analysisResult.findings.map((item, idx) => (
                            <button
                              key={`${item.file}-${idx}`}
                              type="button"
                              onClick={() => {
                                if (allFileNodes.some((n) => n.path === item.file)) {
                                  void openFilePreview(item.file);
                                  setCenterTab('viewer');
                                }
                              }}
                              className="w-full text-left p-2.5 border border-stone-800 hover:border-amber-500/40 bg-black/40 cursor-pointer space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                                <span
                                  className={
                                    item.severity === 'high'
                                      ? 'text-red-400 font-semibold'
                                      : item.severity === 'medium'
                                        ? 'text-amber-300 font-semibold'
                                        : 'text-cyan-300'
                                  }
                                >
                                  {item.severity.toUpperCase()}
                                </span>
                                <span className="text-stone-500 truncate">{item.file}</span>
                              </div>
                              <div className="text-xs font-medium text-stone-100">{item.title}</div>
                              <div className="text-[11px] text-stone-400 leading-relaxed">
                                {item.detail}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs text-stone-400 leading-relaxed space-y-2">
                      <p className="text-stone-200 font-medium">Ready to inspect selected files</p>
                      <p>
                        B.A.R.B.I. will only read the files checked in the left explorer. Choose
                        Analyze & Audit for a read-only report, or Propose Edits to inspect unified
                        diffs before approving writes.
                      </p>
                    </div>
                  )}
                </div>

                {/* Collapsible Session Audit Trail */}
                <div className="border-t border-stone-800 shrink-0">
                  <button
                    type="button"
                    aria-expanded={showAuditLog}
                    onClick={() => setShowAuditLog((prev) => !prev)}
                    className="w-full flex items-center justify-between px-4 py-2 text-[11px] font-mono text-stone-400 hover:text-amber-200 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5" />
                      Session Audit Log ({auditLog.length})
                    </span>
                    {showAuditLog ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {showAuditLog && (
                    <div className="max-h-36 overflow-y-auto px-4 pb-3 space-y-1.5 text-[10px] font-mono tabular-nums">
                      {auditLog.length === 0 ? (
                        <div className="text-stone-500">No file events recorded yet.</div>
                      ) : (
                        auditLog.map((ev) => (
                          <div key={ev.id} className="text-stone-400 border-t border-stone-800/70 pt-1">
                            <span className="text-stone-500">{ev.timestamp}</span>{' '}
                            <span className="text-amber-300 uppercase">{ev.action}</span>{' '}
                            <span className="text-stone-200">{ev.target}</span>
                            <div className="text-stone-500 truncate">{ev.detail}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
