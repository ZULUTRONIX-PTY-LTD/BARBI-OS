export interface QueuedMutation {
  id: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  queuedAt: string;
}

const STORAGE_KEY = 'barbi_offline_sync_queue_v1';

function getStorage(storage?: Pick<Storage, 'getItem' | 'setItem'>): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function readOfflineQueue(storage?: Pick<Storage, 'getItem' | 'setItem'>): QueuedMutation[] {
  const st = getStorage(storage);
  if (!st) return [];
  try {
    const raw = st.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineMutation(
  mutation: Omit<QueuedMutation, 'id' | 'queuedAt'>,
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): QueuedMutation[] {
  const st = getStorage(storage);
  const current = readOfflineQueue(st || undefined);
  const next: QueuedMutation[] = [
    ...current.slice(-49),
    {
      ...mutation,
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      queuedAt: new Date().toISOString(),
    },
  ];
  if (st) {
    try {
      st.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors cleanly
    }
  }
  return next;
}

export function clearOfflineQueueIds(
  processedIds: Set<string>,
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): QueuedMutation[] {
  const st = getStorage(storage);
  const remaining = readOfflineQueue(st || undefined).filter((item) => !processedIds.has(item.id));
  if (st) {
    try {
      st.setItem(STORAGE_KEY, JSON.stringify(remaining));
    } catch {
      // Ignore quota errors cleanly
    }
  }
  return remaining;
}

export async function flushOfflineQueue(
  executor: (item: QueuedMutation) => Promise<boolean>,
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): Promise<{ synced: number; remaining: number }> {
  const items = readOfflineQueue(storage);
  if (items.length === 0) return { synced: 0, remaining: 0 };

  const processed = new Set<string>();
  for (const item of items) {
    try {
      const ok = await executor(item);
      if (ok) {
        processed.add(item.id);
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  const remaining = clearOfflineQueueIds(processed, storage);
  return { synced: processed.size, remaining: remaining.length };
}
