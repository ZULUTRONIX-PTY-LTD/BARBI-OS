import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSphereZoom,
  computeOrbitDelta,
  computeTwoHandZoomDelta,
  detectHorizontalSwipe,
  smoothPoint,
} from './gestureNavigation.ts';
import type { LandmarkPoint } from './gestureClassifier.ts';

function makeHandAt(centerX: number, centerY: number): LandmarkPoint[] {
  const pts: LandmarkPoint[] = [];
  for (let i = 0; i < 21; i += 1) {
    pts.push({ x: centerX, y: centerY });
  }
  return pts;
}

test('smoothPoint blends coordinates with EMA alpha and clamps bounds', () => {
  const first = smoothPoint(null, { x: 1.4, y: -0.2 }, 0.4);
  assert.deepEqual(first, { x: 0.98, y: 0.02 });

  const next = smoothPoint({ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.3 }, 0.5);
  assert.ok(Math.abs(next.x - 0.6) < 1e-6);
  assert.ok(Math.abs(next.y - 0.4) < 1e-6);
});

test('computeOrbitDelta filters micro-jitter and ignores sudden hand re-entry jumps', () => {
  // Micro-jitter below deadzone -> null
  assert.equal(computeOrbitDelta({ x: 0.5, y: 0.5 }, { x: 0.501, y: 0.501 }), null);

  // Huge jump above maxNormStep -> null (hand lost and reappeared elsewhere)
  assert.equal(computeOrbitDelta({ x: 0.1, y: 0.5 }, { x: 0.85, y: 0.5 }), null);

  // Smooth pan -> proportional yaw & pitch delta
  const step = computeOrbitDelta({ x: 0.5, y: 0.5 }, { x: 0.55, y: 0.47 });
  assert.ok(step);
  assert.ok(step.dRotY > 0);
  assert.ok(step.dRotX < 0);
});

test('computeTwoHandZoomDelta returns positive zoom on spread and negative on pinch', () => {
  const leftA = makeHandAt(0.35, 0.5);
  const rightA = makeHandAt(0.65, 0.5);
  const initial = computeTwoHandZoomDelta(null, leftA, rightA);
  assert.ok(initial);
  assert.equal(initial.zoomDelta, 0);
  assert.ok(Math.abs(initial.distance - 0.3) < 1e-6);

  // Spread hands apart (0.30 -> 0.42)
  const leftSpread = makeHandAt(0.29, 0.5);
  const rightSpread = makeHandAt(0.71, 0.5);
  const spreadRes = computeTwoHandZoomDelta(initial.distance, leftSpread, rightSpread);
  assert.ok(spreadRes);
  assert.ok(spreadRes.zoomDelta > 0);

  // Bring hands closer (0.42 -> 0.32)
  const closerRes = computeTwoHandZoomDelta(spreadRes.distance, makeHandAt(0.34, 0.5), makeHandAt(0.66, 0.5));
  assert.ok(closerRes);
  assert.ok(closerRes.zoomDelta < 0);
});

test('detectHorizontalSwipe distinguishes left/right sweeps and rejects vertical motion', () => {
  const rightSweep = [
    { x: 0.2, y: 0.5, t: 1.0 },
    { x: 0.3, y: 0.5, t: 1.06 },
    { x: 0.4, y: 0.51, t: 1.12 },
    { x: 0.52, y: 0.5, t: 1.18 },
    { x: 0.62, y: 0.49, t: 1.24 },
  ];
  assert.equal(detectHorizontalSwipe(rightSweep), 'swipe_right');

  const leftSweep = rightSweep.map((p, idx) => ({
    x: 0.7 - idx * 0.1,
    y: 0.5,
    t: p.t,
  }));
  assert.equal(detectHorizontalSwipe(leftSweep), 'swipe_left');

  const verticalMove = [
    { x: 0.5, y: 0.2, t: 1.0 },
    { x: 0.52, y: 0.35, t: 1.06 },
    { x: 0.54, y: 0.5, t: 1.12 },
    { x: 0.56, y: 0.65, t: 1.18 },
    { x: 0.58, y: 0.8, t: 1.24 },
  ];
  assert.equal(detectHorizontalSwipe(verticalMove), null);
});

test('clampSphereZoom clamps bounds cleanly', () => {
  assert.equal(clampSphereZoom(0.1), 0.48);
  assert.equal(clampSphereZoom(9.9), 5.5);
  assert.equal(clampSphereZoom(1.75), 1.75);
});
