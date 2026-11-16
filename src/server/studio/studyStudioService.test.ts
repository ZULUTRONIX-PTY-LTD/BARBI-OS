import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeterministicFallbackStudyPack } from './studyStudioService.ts';

test('buildDeterministicFallbackStudyPack builds structured guide, flashcards, quiz, and explainer scenes', () => {
  const pack = buildDeterministicFallbackStudyPack(
    'SOM307B Thick-Walled Cylinders',
    'Lame equations describe radial and hoop stresses across pressurized cylinders. Hoop stress peaks at the inner bore wall. Always validate boundary pressures in Pascals.'
  );
  assert.equal(pack.title, 'SOM307B Thick-Walled Cylinders');
  assert.ok(pack.keyConcepts.length >= 3);
  assert.ok(pack.flashcards.length >= 3);
  assert.ok(pack.quiz.length >= 2);
  assert.ok(pack.explainerScenes.length >= 4);
  assert.equal(pack.quiz[0].options.length, 4);
});
