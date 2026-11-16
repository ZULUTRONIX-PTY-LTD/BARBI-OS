import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VECTOR_DIMENSIONS,
  classifyMemoryNodeMeta,
  cosineSimilarity,
  detectContradictionOrProgression,
  deterministicEmbed768,
  toPgVectorLiteral,
} from './vectorMath';

test('deterministicEmbed768 produces unit-normalized 768-dim vectors with higher similarity for related text', () => {
  const v1 = deterministicEmbed768('Autonomous solar powered distributed edge surveillance node ESP32-P4 LoRa');
  const v2 = deterministicEmbed768('Solar edge surveillance system with ESP32-P4 and SX1262 LoRa transceiver');
  const v3 = deterministicEmbed768('Baked chocolate soufflé recipe with vanilla cream');

  assert.equal(v1.length, VECTOR_DIMENSIONS);
  const mag = Math.sqrt(v1.reduce((acc, x) => acc + x * x, 0));
  assert.ok(Math.abs(mag - 1.0) < 0.01);

  const simRelated = cosineSimilarity(v1, v2);
  const simUnrelated = cosineSimilarity(v1, v3);
  assert.ok(simRelated > simUnrelated, `Expected ${simRelated} > ${simUnrelated}`);

  const literal = toPgVectorLiteral(v1);
  assert.ok(literal.startsWith('[') && literal.endsWith(']'));
  assert.equal(literal.split(',').length, VECTOR_DIMENSIONS);
});

test('detectContradictionOrProgression identifies factual and quantitative contradictions', () => {
  const c1 = detectContradictionOrProgression(
    'Final-year BEngTech Mechanical Engineering student at TUT, not yet graduated, 3 modules outstanding.',
    'Graduated from TUT BEngTech Mechanical Engineering with all modules finished.'
  );
  assert.equal(c1.relation, 'CONTRADICTION');

  const c2 = detectContradictionOrProgression(
    'Solar edge surveillance node budget target is R8000 with 48 hours autonomy.',
    'Solar edge surveillance node budget target is R15000 with 72 hours autonomy.'
  );
  assert.equal(c2.relation, 'CONTRADICTION');

  const p1 = detectContradictionOrProgression(
    'ZULUTRONIX builds autonomous solar edge surveillance nodes using ESP32-P4.',
    'ZULUTRONIX autonomous solar edge surveillance nodes integrate pan-tilt actuation housings.'
  );
  assert.equal(p1.relation, 'PROGRESSION');
});

test('classifyMemoryNodeMeta maps domain keywords cleanly', () => {
  assert.deepEqual(classifyMemoryNodeMeta('Completed SolidWorks CSWP and TUT BEngTech module'), {
    category: 'CREDENTIAL',
    domain: 'academic',
  });
  assert.deepEqual(classifyMemoryNodeMeta('ZULUTRONIX SHAP-ZX1 CAN bus firmware update'), {
    category: 'PROJECT',
    domain: 'enterprise',
  });
});
