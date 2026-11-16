import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHandLandmarks, type LandmarkPoint } from './gestureClassifier.ts';

function buildBaseHand(): LandmarkPoint[] {
  // 21 landmarks normalized [0..1] in upright open-palm posture
  return [
    { x: 0.50, y: 0.80 }, // 0 wrist
    { x: 0.43, y: 0.74 }, // 1 thumb_cmc
    { x: 0.37, y: 0.66 }, // 2 thumb_mcp
    { x: 0.33, y: 0.58 }, // 3 thumb_ip
    { x: 0.28, y: 0.50 }, // 4 thumb_tip
    { x: 0.44, y: 0.56 }, // 5 index_mcp
    { x: 0.44, y: 0.42 }, // 6 index_pip
    { x: 0.44, y: 0.32 }, // 7 index_dip
    { x: 0.44, y: 0.22 }, // 8 index_tip
    { x: 0.50, y: 0.54 }, // 9 middle_mcp
    { x: 0.50, y: 0.39 }, // 10 middle_pip
    { x: 0.50, y: 0.28 }, // 11 middle_dip
    { x: 0.50, y: 0.19 }, // 12 middle_tip
    { x: 0.56, y: 0.56 }, // 13 ring_mcp
    { x: 0.56, y: 0.42 }, // 14 ring_pip
    { x: 0.56, y: 0.31 }, // 15 ring_dip
    { x: 0.56, y: 0.22 }, // 16 ring_tip
    { x: 0.62, y: 0.60 }, // 17 pinky_mcp
    { x: 0.63, y: 0.48 }, // 18 pinky_pip
    { x: 0.64, y: 0.39 }, // 19 pinky_dip
    { x: 0.65, y: 0.31 }, // 20 pinky_tip
  ];
}

test('classifyHandLandmarks detects open palm, two-finger orbit, pinch hysteresis, and fist', () => {
  const openPalm = buildBaseHand();
  const resOpen = classifyHandLandmarks(openPalm, false);
  assert.ok(resOpen);
  assert.equal(resOpen.pose, 'open_palm');
  assert.equal(resOpen.isPinched, false);

  // Two-finger peace/orbit (curl ring & pinky)
  const twoFinger = buildBaseHand();
  twoFinger[16] = { x: 0.56, y: 0.68 };
  twoFinger[20] = { x: 0.62, y: 0.70 };
  const resTwo = classifyHandLandmarks(twoFinger, false);
  assert.ok(resTwo);
  assert.equal(resTwo.pose, 'two_finger_orbit');

  // Pinch (bring thumb tip 4 right next to index tip 8)
  const pinch = buildBaseHand();
  pinch[4] = { x: 0.445, y: 0.23 };
  const resPinch = classifyHandLandmarks(pinch, false);
  assert.ok(resPinch);
  assert.equal(resPinch.isPinched, true);
  assert.equal(resPinch.pose, 'pinch_select');

  // Fist (curl all fingers + thumb inward)
  const fist = buildBaseHand();
  fist[4] = { x: 0.52, y: 0.66 };
  fist[8] = { x: 0.45, y: 0.68 };
  fist[12] = { x: 0.50, y: 0.69 };
  fist[16] = { x: 0.55, y: 0.70 };
  fist[20] = { x: 0.60, y: 0.71 };
  const resFist = classifyHandLandmarks(fist, false);
  assert.ok(resFist);
  assert.equal(resFist.pose, 'fist_reset');
});
