import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createChatSession,
  extractGroundingMetadata,
  formatSourceHost,
  mergeGroundingMetadata,
  parseStoredSessions,
  sanitizeExternalHttpUrl,
  serializeSessionsForStorage,
} from './chatLogic.ts';

describe('Google Search Grounding pure logic', () => {
  it('sanitizes only http and https external URLs and rejects unsafe schemes', () => {
    assert.equal(sanitizeExternalHttpUrl('https://nodejs.org/en/about/previous-releases'), 'https://nodejs.org/en/about/previous-releases');
    assert.equal(sanitizeExternalHttpUrl('  http://example.com/docs  '), 'http://example.com/docs');
    assert.equal(sanitizeExternalHttpUrl('javascript:alert(1)'), null);
    assert.equal(sanitizeExternalHttpUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(sanitizeExternalHttpUrl('file:///etc/passwd'), null);
    assert.equal(sanitizeExternalHttpUrl('not a url'), null);
  });

  it('derives clean display hostnames from direct URLs and vertex redirect URLs', () => {
    assert.equal(formatSourceHost('https://www.typescriptlang.org/docs/handbook/intro.html'), 'typescriptlang.org');
    assert.equal(
      formatSourceHost(
        'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AWSHWqExampleToken',
        'nodejs.org'
      ),
      'nodejs.org'
    );
    assert.equal(
      formatSourceHost(
        'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AWSHWqExampleToken',
        'MDN Web Docs — developer.mozilla.org'
      ),
      'developer.mozilla.org'
    );
  });

  it('extracts and deduplicates webSearchQueries and groundingChunks from Gemini candidates', () => {
    const extracted = extractGroundingMetadata([
      {
        groundingMetadata: {
          webSearchQueries: ['latest Node.js LTS version', 'LATEST node.js lts version', 'TypeScript 5.8 release notes'],
          groundingChunks: [
            { web: { uri: 'https://nodejs.org/en/about/previous-releases', title: 'Node.js Previous Releases' } },
            { web: { uri: 'https://nodejs.org/en/about/previous-releases', title: 'Duplicate Node.js' } },
            { web: { uri: 'javascript:evil()', title: 'Malicious' } },
            {
              web: {
                uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123',
                title: 'typescriptlang.org',
              },
            },
          ],
        },
      },
    ]);

    assert.ok(extracted);
    assert.deepEqual(extracted.webSearchQueries, ['latest Node.js LTS version', 'TypeScript 5.8 release notes']);
    assert.equal(extracted.sources.length, 2);
    assert.equal(extracted.sources[0].domain, 'nodejs.org');
    assert.equal(extracted.sources[0].title, 'Node.js Previous Releases');
    assert.equal(extracted.sources[1].domain, 'typescriptlang.org');
  });

  it('merges streamed grounding metadata chunks without duplicates', () => {
    const chunk1 = extractGroundingMetadata({
      webSearchQueries: ['react 19 docs'],
      groundingChunks: [{ web: { uri: 'https://react.dev/blog', title: 'React Blog' } }],
    });
    const chunk2 = extractGroundingMetadata({
      webSearchQueries: ['react 19 docs', 'react compiler status'],
      groundingChunks: [
        { web: { uri: 'https://react.dev/blog', title: 'React Blog' } },
        { web: { uri: 'https://react.dev/learn/react-compiler', title: 'React Compiler' } },
      ],
    });

    const merged = mergeGroundingMetadata(chunk1, chunk2);
    assert.ok(merged);
    assert.deepEqual(merged.webSearchQueries, ['react 19 docs', 'react compiler status']);
    assert.equal(merged.sources.length, 2);
    assert.equal(merged.sources[1].uri, 'https://react.dev/learn/react-compiler');
  });

  it('preserves valid grounding sources across session storage serialization and strips unsafe links', () => {
    const session = createChatSession('2026-01-01T00:00:00.000Z');
    session.messages.push({
      id: 'ast-1',
      role: 'assistant',
      content: 'Node.js 22 LTS is active.',
      createdAt: '2026-01-01T00:00:05.000Z',
      grounding: {
        webSearchQueries: ['Node.js LTS'],
        sources: [
          { title: 'Node.js Releases', uri: 'https://nodejs.org/en', domain: 'nodejs.org' },
          { title: 'Unsafe', uri: 'javascript:alert(1)', domain: 'evil' },
        ],
      },
    });

    const serialized = serializeSessionsForStorage([session]);
    const restored = parseStoredSessions(serialized);
    assert.equal(restored.length, 1);
    const msg = restored[0].messages[0];
    assert.ok(msg.grounding);
    assert.equal(msg.grounding.sources.length, 1);
    assert.equal(msg.grounding.sources[0].uri, 'https://nodejs.org/en');
  });
});
