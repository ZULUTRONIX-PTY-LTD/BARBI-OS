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
import posthog, { isPostHogConfigured } from '../lib/posthog';

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
  reaBuildAgent: (payload: { prompt: string; allowAutoFailover?: boolean }) => Promise<Record<string, unknown>>;
  reaBuildSystem: (payload: { systemName: string; prompt: string; allowAutoFailover?: boolean }) => Promise<Record<string, unknown>>;
  reaListHosted: () => Promise<Awaited<ReturnType<typeof barbiApi.reaListHosted>> | null>;
  studioGenerateStudyPack: (payload: { topicTitle: string; materialText: string; allowAutoFailover?: boolean }) => Promise<Record<string, unknown>>;
  downloadBundleZip: (slug: string, files: Record<string, string>) => Promise<void>;
  openExternalSafely: (url: string) => void;
}

let bridgeMounted = false;
let boundDirectoryHandle: FileSystemDirectoryHandle | null = null;

function captureBarbiEvent(event: string, properties?: Record<string, string | number | boolean>): void {
  if (isPostHogConfigured) posthog.capture(event, properties);
}

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
        captureBarbiEvent('memory_saved');
      } catch {
        // Offline queue captures retries
      }
    },

    async deleteMemory(nodeKey) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.deleteMemory(nodeKey);
        captureBarbiEvent('memory_deleted');
      } catch {
        // Offline queue captures retries
      }
    },

    async semanticSearch(query) {
      if (!getCurrentFirebaseUser()) return [];
      try {
        const out = await barbiApi.semanticSearch(query, 6);
        const results = out.results || [];
        captureBarbiEvent('memory_search_completed', { result_count: results.length });
        return results;
      } catch {
        return [];
      }
    },

    async saveHabit(habit) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.saveHabit(habit);
        captureBarbiEvent('habit_saved');
      } catch {
        // Queued offline
      }
    },

    async deleteHabit(habitKey) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.deleteHabit(habitKey);
        captureBarbiEvent('habit_deleted');
      } catch {
        // Queued offline
      }
    },

    async logTimerSession(session) {
      if (!getCurrentFirebaseUser()) return;
      try {
        await barbiApi.logTimerSession(session);
        captureBarbiEvent('timer_session_logged');
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
          const backup = await barbiApi.exportBackup();
          captureBarbiEvent('backup_exported', { source: 'cloud' });
          return backup;
        } catch {
          // fallback below
        }
      }
      captureBarbiEvent('backup_exported', { source: 'local' });
      return localFallback;
    },

    async bindWindowsFolderSync() {
      const picker = (window as unknown as { showDirectoryPicker?: (opts?: unknown) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (typeof picker !== 'function') return null;
      try {
        boundDirectoryHandle = await picker({ mode: 'readwrite' });
        captureBarbiEvent('folder_sync_bound');
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
      const response = await barbiApi.chatTurn(payload);
      captureBarbiEvent('ai_chat_completed', {
        provider: response.provider,
        used_fallback: response.fallback,
        tool_count: response.toolInvocations.length,
      });
      return response;
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
        const result = await barbiApi.switchProvider(providerId);
        captureBarbiEvent('ai_provider_changed');
        return result;
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
        if (r.ok) captureBarbiEvent('telegram_message_sent');
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
      const result = await barbiApi.reaStudyUrl(payload);
      captureBarbiEvent('rea_generation_completed', { workflow: 'study_url' });
      return result;
    },

    async reaBuildAgent(payload) {
      const result = await barbiApi.reaBuildAgent(payload);
      captureBarbiEvent('rea_generation_completed', { workflow: 'build_agent' });
      return result;
    },

    async reaBuildSystem(payload) {
      const result = await barbiApi.reaBuildSystem(payload);
      captureBarbiEvent('rea_generation_completed', { workflow: 'build_system' });
      return result;
    },

    async reaListHosted() {
      try {
        return await barbiApi.reaListHosted();
      } catch {
        return null;
      }
    },

    async studioGenerateStudyPack(payload) {
      const result = await barbiApi.studioGenerateStudyPack(payload);
      captureBarbiEvent('study_pack_generated');
      return result;
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
      a.download = `${slug}-windows-web-system.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      captureBarbiEvent('bundle_downloaded', { file_count: Object.keys(files).length });
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
