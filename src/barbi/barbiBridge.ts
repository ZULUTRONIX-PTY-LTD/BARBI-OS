import JSZip from 'jszip';
import { barbiApi, syncPendingOfflineMutations } from '../api/barbiClient';
import { barbiWebcamGestureEngine, type WebcamTrackerCallbacks } from '../gesture/webcamGestureEngine';
import {
  getCurrentFirebaseUser,
  signInWithGoogle,
  signOutBarbi,
  subscribeAuthState,
} from '../lib/firebase';
import { barbiVoiceEngine } from '../voice/voiceEngine';

export interface BarbiBridgeApi {
  voice: typeof barbiVoiceEngine;
  webcamGesture: {
    start: (video: HTMLVideoElement, canvas: HTMLCanvasElement, callbacks: WebcamTrackerCallbacks) => Promise<boolean>;
    stop: (video?: HTMLVideoElement | null) => void;
    isRunning: () => boolean;
    getMode: () => string;
    getRepositories: typeof barbiWebcamGestureEngine.getRepositories;
  };
  getAuthUser: () => { uid: string; email: string; displayName: string } | null;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  bootstrapWorkspace: () => Promise<Record<string, unknown> | null>;
  saveMemory: (node: Record<string, unknown>) => Promise<void>;
  deleteMemory: (nodeKey: string) => Promise<void>;
  semanticSearch: (query: string) => Promise<Array<Record<string, unknown>>>;
  saveHabit: (habit: Record<string, unknown>) => Promise<void>;
  deleteHabit: (habitKey: string) => Promise<void>;
  logTimerSession: (session: Record<string, unknown>) => Promise<void>;
  saveSettings: (settings: Record<string, unknown>, voiceSettings: Record<string, unknown>) => Promise<void>;
  exportBackup: (localFallback: Record<string, unknown>) => Promise<Record<string, unknown>>;
  bindWindowsFolderSync: () => Promise<string | null>;
  writeLocalWindowsSnapshot: (snapshot: Record<string, unknown>) => Promise<boolean>;
  hasBoundWindowsFolder: () => boolean;
  chatTurn: (payload: Record<string, unknown>) => Promise<Awaited<ReturnType<typeof barbiApi.chatTurn>>>;
  getProviders: () => Promise<Awaited<ReturnType<typeof barbiApi.getProviders>> | null>;
  updateProviderPrefs: (prefs: Parameters<typeof barbiApi.updateProviderPrefs>[0]) => Promise<unknown>;
  switchProvider: (providerId: string) => Promise<unknown>;
  searchGithubRepos: (query: string) => Promise<Awaited<ReturnType<typeof barbiApi.githubSearch>> | null>;
  fetchWeather: (lat: number, lon: number) => Promise<Record<string, unknown> | null>;
  fetchTelemetry: () => Promise<Awaited<ReturnType<typeof barbiApi.telemetry>> | null>;
  sendTelegram: (text: string, chatId?: string) => Promise<boolean>;
  fetchConversationMessages: (key: string) => Promise<Array<Record<string, unknown>> | null>;
  reaStudyUrl: (payload: { target: string; notes?: string; allowAutoFailover?: boolean }) => Promise<Record<string, unknown>>;
  reaSyncGithubRepo: (repo?: string) => Promise<{ reaRepo: Record<string, unknown> } | null>;
  reaBuildAgent: (payload: { prompt: string; reaRepoUrl?: string; platforms?: string[]; allowAutoFailover?: boolean }) => Promise<Record<string, unknown>>;
  reaBuildSystem: (payload: { systemName: string; prompt: string; platforms?: string[]; reaRepoUrl?: string; allowAutoFailover?: boolean }) => Promise<Record<string, unknown>>;
  reaListHosted: () => Promise<Awaited<ReturnType<typeof barbiApi.reaListHosted>> | null>;
  reaGetHostedBundle: (slug: string) => Promise<Awaited<ReturnType<typeof barbiApi.reaGetHostedBundle>> | null>;
  studioGenerateStudyPack: (payload: { topicTitle: string; materialText: string; allowAutoFailover?: boolean }) => Promise<Record<string, unknown>>;
  downloadBundleZip: (slug: string, files: Record<string, string>) => Promise<void>;
  openExternalSafely: (url: string) => void;
}

let bridgeMounted = false;
let boundDirectoryHandle: FileSystemDirectoryHandle | null = null;

export function installBarbiBridge(onSyncEvent?: (detail: { user: unknown; workspace?: Record<string, unknown> }) => void): void {
  if (bridgeMounted) return;
  bridgeMounted = true;

  const bridge: BarbiBridgeApi = {
    voice: barbiVoiceEngine,

    webcamGesture: {
      start: (video, canvas, callbacks) => barbiWebcamGestureEngine.start(video, canvas, callbacks),
      stop: (video) => barbiWebcamGestureEngine.stop(video),
      isRunning: () => barbiWebcamGestureEngine.isRunning(),
      getMode: () => barbiWebcamGestureEngine.getMode(),
      getRepositories: () => barbiWebcamGestureEngine.getRepositories(),
    },

    getAuthUser() {
      const u = getCurrentFirebaseUser();
      if (!u) return null;
      return {
        uid: u.uid,
        email: u.email || '',
        displayName: u.displayName || 'Treasure Trinity Zulu',
      };
    },

    async signIn() {
      try {
        const u = await signInWithGoogle();
        if (!u) return false;
        await syncPendingOfflineMutations();
        const ws = await this.bootstrapWorkspace();
        onSyncEvent?.({ user: u, workspace: ws || undefined });
        return true;
      } catch (err) {
        console.warn('Google sign-in aborted or unavailable:', err);
        return false;
      }
    },

    async signOut() {
      await signOutBarbi();
      onSyncEvent?.({ user: null });
    },

    async bootstrapWorkspace() {
      if (!getCurrentFirebaseUser()) return null;
      try {
        return await barbiApi.bootstrap();
      } catch (err) {
        console.warn('Workspace bootstrap warning:', err);
        return null;
      }
    },

    async saveMemory(node) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.saveMemory(node);
      } catch {
        // Offline queue captures retries
      }
    },

    async deleteMemory(nodeKey) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.deleteMemory(nodeKey);
      } catch {
        // Offline queue captures retries
      }
    },

    async semanticSearch(query) {
      if (!getCurrentFirebaseUser()) return [];
      try {
        const out = await barbiApi.semanticSearch(query, 6);
        return out.results || [];
      } catch {
        return [];
      }
    },

    async saveHabit(habit) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.saveHabit(habit);
      } catch {
        // Queued offline
      }
    },

    async deleteHabit(habitKey) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.deleteHabit(habitKey);
      } catch {
        // Queued offline
      }
    },

    async logTimerSession(session) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.logTimerSession(session);
      } catch {
        // Queued offline
      }
    },

    async saveSettings(settings, voiceSettings) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.saveSettings(settings, voiceSettings);
      } catch {
        // Queued offline
      }
    },

    async exportBackup(localFallback) {
      if (getCurrentFirebaseUser()) {
        try {
          return await barbiApi.exportBackup();
        } catch {
          // fallback below
        }
      }
      return localFallback;
    },

    async bindWindowsFolderSync() {
      const picker = (window as unknown as { showDirectoryPicker?: (opts?: unknown) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (typeof picker !== 'function') return null;
      try {
        boundDirectoryHandle = await picker({ mode: 'readwrite' });
        return boundDirectoryHandle.name || 'Windows Local Folder';
      } catch {
        return null;
      }
    },

    hasBoundWindowsFolder() {
      return Boolean(boundDirectoryHandle);
    },

    async writeLocalWindowsSnapshot(snapshot) {
      if (!boundDirectoryHandle) return false;
      try {
        const fileHandle = await boundDirectoryHandle.getFileHandle('barbi-archivex-snapshot.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(snapshot, null, 2));
        await writable.close();
        return true;
      } catch {
        return false;
      }
    },

    async chatTurn(payload) {
      return barbiApi.chatTurn(payload);
    },

    async getProviders() {
      try {
        return await barbiApi.getProviders();
      } catch {
        return null;
      }
    },

    async updateProviderPrefs(prefs) {
      try {
        return await barbiApi.updateProviderPrefs(prefs);
      } catch {
        return null;
      }
    },

    async switchProvider(providerId) {
      try {
        return await barbiApi.switchProvider(providerId);
      } catch {
        return null;
      }
    },

    async searchGithubRepos(query) {
      try {
        return await barbiApi.githubSearch(query);
      } catch {
        return null;
      }
    },

    async fetchWeather(lat, lon) {
      try {
        return await barbiApi.weather(lat, lon);
      } catch {
        return null;
      }
    },

    async fetchTelemetry() {
      try {
        return await barbiApi.telemetry();
      } catch {
        return null;
      }
    },

    async sendTelegram(text, chatId) {
      try {
        const r = await barbiApi.sendTelegram(text, chatId);
        return Boolean(r.ok);
      } catch {
        return false;
      }
    },

    async fetchConversationMessages(key) {
      if (!getCurrentFirebaseUser()) return null;
      try {
        const res = await barbiApi.getConversationMessages(key);
        return res.messages || null;
      } catch {
        return null;
      }
    },

    async reaStudyUrl(payload) {
      return barbiApi.reaStudyUrl(payload);
    },

    async reaSyncGithubRepo(repo) {
      try {
        return await barbiApi.reaSyncGithubRepo(repo);
      } catch {
        return null;
      }
    },

    async reaBuildAgent(payload) {
      return barbiApi.reaBuildAgent(payload);
    },

    async reaBuildSystem(payload) {
      return barbiApi.reaBuildSystem(payload);
    },

    async reaListHosted() {
      try {
        return await barbiApi.reaListHosted();
      } catch {
        return null;
      }
    },

    async reaGetHostedBundle(slug) {
      try {
        return await barbiApi.reaGetHostedBundle(slug);
      } catch {
        return null;
      }
    },

    async studioGenerateStudyPack(payload) {
      return barbiApi.studioGenerateStudyPack(payload);
    },

    async downloadBundleZip(slug: string, files: Record<string, string>) {
      const zip = new JSZip();
      Object.entries(files).forEach(([filePath, content]) => {
        zip.file(filePath, content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-multiplatform-system.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    openExternalSafely(url: string) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
  };

  (window as unknown as { BarbiBridge: BarbiBridgeApi }).BarbiBridge = bridge;

  subscribeAuthState(async (user) => {
    if (user) {
      await syncPendingOfflineMutations();
      const ws = await bridge.bootstrapWorkspace();
      const w = window as unknown as { __onBarbiWorkspaceSynced?: (ws: Record<string, unknown>, u: unknown) => void };
      if (ws && typeof w.__onBarbiWorkspaceSynced === 'function') {
        w.__onBarbiWorkspaceSynced(ws, user);
      }
      onSyncEvent?.({ user, workspace: ws || undefined });
    } else {
      const w = window as unknown as { __onBarbiWorkspaceSynced?: (ws: Record<string, unknown> | null, u: unknown) => void };
      if (typeof w.__onBarbiWorkspaceSynced === 'function') {
        w.__onBarbiWorkspaceSynced(null, null);
      }
      onSyncEvent?.({ user: null });
    }
  });
}
