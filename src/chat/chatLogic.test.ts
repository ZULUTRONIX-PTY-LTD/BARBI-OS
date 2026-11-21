import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMessageToSession,
  buildApiHistory,
  createChatSession,
  deriveSessionTitle,
  formatApiErrorMessage,
  formatLatencyLabel,
  parseInlineMarkdown,
  parseMarkdownBlocks,
  parseSseChunkBuffer,
  parseStoredSessions,
  serializeSessionsForStorage,
} from './chatLogic';

test('createChatSession and appendMessageToSession derive title from first user prompt', () => {
  const session = createChatSession('2026-11-19T10:00:00.000Z');
  assert.equal(session.title, 'New chat');
  assert.equal(session.messages.length, 0);

  const afterUser = appendMessageToSession(
    session,
    {
      id: 'm1',
      role: 'user',
      content: 'Explain Newton second law with equations',
      createdAt: '2026-11-19T10:00:05.000Z',
    },
    '2026-11-19T10:00:05.000Z'
  );
  assert.equal(afterUser.title, 'Explain Newton second law with equations');
  assert.equal(afterUser.messages.length, 1);

  const afterReply = appendMessageToSession(
    afterUser,
    {
      id: 'm2',
      role: 'assistant',
      content: 'Force equals mass times acceleration: `F = m * a`.',
      createdAt: '2026-11-19T10:00:07.000Z',
      model: 'gemini-4-hydrogen',
    },
    '2026-11-19T10:00:07.000Z'
  );
  assert.equal(afterReply.title, 'Explain Newton second law with equations');
  assert.equal(afterReply.messages.length, 2);
});

test('deriveSessionTitle truncates long prompts cleanly', () => {
  const longPrompt = 'Design a distributed fault-tolerant robotics control architecture for autonomous multi-agent swarms';
  const title = deriveSessionTitle(longPrompt, 32);
  assert.ok(title.length <= 32);
  assert.ok(title.endsWith('…'));
});

test('serializeSessionsForStorage strips streaming placeholders and round-trips cleanly', () => {
  const session = createChatSession('2026-11-19T10:00:00.000Z');
  const populated = {
    ...session,
    title: 'Saved Thread',
    messages: [
      { id: 'u1', role: 'user' as const, content: 'Hello', createdAt: '2026-11-19T10:00:01.000Z' },
      {
        id: 'a1',
        role: 'assistant' as const,
        content: 'Hi there!',
        createdAt: '2026-11-19T10:00:02.000Z',
        isStreaming: false,
      },
      {
        id: 'a2',
        role: 'assistant' as const,
        content: 'partial...',
        createdAt: '2026-11-19T10:00:03.000Z',
        isStreaming: true,
      },
    ],
  };

  const json = serializeSessionsForStorage([populated]);
  const restored = parseStoredSessions(json);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].messages.length, 2);
  assert.equal(restored[0].messages[1].content, 'Hi there!');
  assert.deepEqual(parseStoredSessions('not-valid-json'), []);
});

test('buildApiHistory excludes errored and streaming turns', () => {
  const history = buildApiHistory([
    { id: '1', role: 'user', content: 'First', createdAt: '' },
    { id: '2', role: 'assistant', content: 'Reply', createdAt: '' },
    { id: '3', role: 'assistant', content: 'Broken', createdAt: '', error: '503' },
    { id: '4', role: 'assistant', content: 'Streaming...', createdAt: '', isStreaming: true },
  ]);
  assert.deepEqual(history, [
    { role: 'user', content: 'First' },
    { role: 'assistant', content: 'Reply' },
  ]);
});

test('parseSseChunkBuffer handles split frames across chunks', () => {
  const chunk1 = 'event: meta\ndata: {"model":"gemini-4-hydrogen"}\n\nevent: delta\ndata: {"text":"Hel';
  const r1 = parseSseChunkBuffer('', chunk1);
  assert.equal(r1.events.length, 1);
  assert.equal(r1.events[0].event, 'meta');
  assert.deepEqual(r1.events[0].data, { model: 'gemini-4-hydrogen' });

  const chunk2 = 'lo world"}\n\nevent: done\ndata: {"reply":"Hello world"}\n\n';
  const r2 = parseSseChunkBuffer(r1.remainder, chunk2);
  assert.equal(r2.events.length, 2);
  assert.equal(r2.events[0].event, 'delta');
  assert.deepEqual(r2.events[0].data, { text: 'Hello world' });
  assert.equal(r2.events[1].event, 'done');
  assert.equal(r2.remainder, '');
});

test('parseMarkdownBlocks parses headings, lists, blockquotes, and fenced code blocks', () => {
  const md = [
    '## Overview',
    'A **bold** statement with `inline()`.',
    '',
    '- Point one',
    '- Point two',
    '',
    '1. Step alpha',
    '2. Step beta',
    '',
    '```ts',
    'const x = 42;',
    '```',
    '',
    '> Important note',
  ].join('\n');

  const blocks = parseMarkdownBlocks(md);
  assert.equal(blocks.length, 6);
  assert.deepEqual(blocks[0], { type: 'heading', level: 2, text: 'Overview' });
  assert.deepEqual(blocks[1], { type: 'paragraph', text: 'A **bold** statement with `inline()`.' });
  assert.deepEqual(blocks[2], { type: 'ul', items: ['Point one', 'Point two'] });
  assert.deepEqual(blocks[3], { type: 'ol', items: ['Step alpha', 'Step beta'] });
  assert.deepEqual(blocks[4], { type: 'code', language: 'ts', code: 'const x = 42;' });
  assert.deepEqual(blocks[5], { type: 'blockquote', text: 'Important note' });
});

test('parseInlineMarkdown tokenizes bold, italic, code, and links', () => {
  const nodes = parseInlineMarkdown('Use **Gemini** with `fetch()` and *fast* [docs](https://ai.google.dev).');
  assert.deepEqual(nodes, [
    { type: 'text', value: 'Use ' },
    { type: 'bold', value: 'Gemini' },
    { type: 'text', value: ' with ' },
    { type: 'code', value: 'fetch()' },
    { type: 'text', value: ' and ' },
    { type: 'italic', value: 'fast' },
    { type: 'text', value: ' ' },
    { type: 'link', label: 'docs', href: 'https://ai.google.dev' },
    { type: 'text', value: '.' },
  ]);
});

test('formatApiErrorMessage extracts JSON error payloads and classifies common failures', () => {
  const raw503 = '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}';
  assert.equal(formatApiErrorMessage(raw503), 'This model is currently experiencing high demand.');
  assert.match(formatApiErrorMessage('HTTP 429 RESOURCE_EXHAUSTED'), /quota|rate limit/i);
  assert.match(formatApiErrorMessage('HTTP 403 PERMISSION_DENIED'), /API key/i);
  assert.equal(formatLatencyLabel(850), '850ms');
  assert.equal(formatLatencyLabel(2340), '2.3s');
});
