import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearOfflineQueueIds,
  enqueueOfflineMutation,
  flushOfflineQueue,
  readOfflineQueue,
} from './offlineQueue.ts';

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test('enqueueOfflineMutation and readOfflineQueue persist ordered operations', () => {
  const storage = createMemoryStorage();
  enqueueOfflineMutation({ endpoint: '/api/habits', method: 'POST', body: { title: 'Test 1' } }, storage);
  enqueueOfflineMutation({ endpoint: '/api/memories', method: 'POST', body: { label: 'Node A' } }, storage);

  const items = readOfflineQueue(storage);
  assert.equal(items.length, 2);
  assert.equal(items[0].endpoint, '/api/habits');
  assert.equal(items[1].endpoint, '/api/memories');
});

test('flushOfflineQueue syncs succeeding mutations and retains failed ones', async () => {
  const storage = createMemoryStorage();
  enqueueOfflineMutation({ endpoint: '/api/habits', method: 'POST', body: { id: 1 } }, storage);
  enqueueOfflineMutation({ endpoint: '/api/memories', method: 'POST', body: { id: 2 } }, storage);

  let calls = 0;
  const result = await flushOfflineQueue(async () => {
    calls++;
    return calls === 1; // First succeeds, second stops flush cleanly
  }, storage);

  assert.equal(result.synced, 1);
  assert.equal(result.remaining, 1);
  assert.equal(readOfflineQueue(storage)[0].endpoint, '/api/memories');

  clearOfflineQueueIds(new Set(readOfflineQueue(storage).map((x) => x.id)), storage);
  assert.equal(readOfflineQueue(storage).length, 0);
});
