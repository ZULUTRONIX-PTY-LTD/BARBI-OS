import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GESTURE_ONBOARDING_STEPS,
  HAND_SKELETON_CONNECTIONS,
  ONBOARDING_STORAGE_KEY,
  buildStylizedHandSkeleton,
  clampStepIndex,
  evaluateGestureAnimationFrame,
  getNextStepIndex,
  markOnboardingSeen,
  readOnboardingSeen,
} from './gestureOnboardingLogic.ts';
import { GESTURE_GUIDE_ITEMS } from './gestureNavigation.ts';

describe('gestureOnboardingLogic', () => {
  it('covers every supported hand gesture from GESTURE_GUIDE_ITEMS in order', () => {
    assert.equal(GESTURE_ONBOARDING_STEPS.length, GESTURE_GUIDE_ITEMS.length);
    const stepIds = GESTURE_ONBOARDING_STEPS.map((s) => s.id);
    const guideIds = GESTURE_GUIDE_ITEMS.map((g) => g.id);
    assert.deepEqual(stepIds, guideIds);
  });

  it('produces valid 21-landmark hand skeletons and finite coordinates across all steps and keyframes', () => {
    const sampleTimes = [0, 0.15, 0.35, 0.5, 0.72, 0.95, 1];
    for (const step of GESTURE_ONBOARDING_STEPS) {
      for (const t of sampleTimes) {
        const frame = evaluateGestureAnimationFrame(step.id, t);
        assert.equal(frame.stepId, step.id);
        assert.ok(frame.phaseLabel.length > 0);
        assert.ok(frame.hands.length >= 1 && frame.hands.length <= 2);
        assert.ok(Number.isFinite(frame.sphere.rotX));
        assert.ok(Number.isFinite(frame.sphere.rotY));
        assert.ok(frame.sphere.zoom >= 0.5 && frame.sphere.zoom <= 2.5);

        for (const hand of frame.hands) {
          const landmarks = buildStylizedHandSkeleton(hand);
          assert.equal(landmarks.length, 21);
          for (const lm of landmarks) {
            assert.ok(Number.isFinite(lm.x));
            assert.ok(Number.isFinite(lm.y));
          }
        }
      }
    }
    assert.equal(HAND_SKELETON_CONNECTIONS.length, 21);
  });

  it('pinch_orbit converges thumb tip (4) and index tip (8) during active drag and rotates sphere', () => {
    const start = evaluateGestureAnimationFrame('pinch_orbit', 0.0);
    const mid = evaluateGestureAnimationFrame('pinch_orbit', 0.35);

    assert.equal(start.hands[0].isPinchGlow, false);
    assert.equal(mid.hands[0].isPinchGlow, true);
    assert.notEqual(mid.sphere.rotY, start.sphere.rotY);

    const openLms = buildStylizedHandSkeleton(start.hands[0]);
    const pinchedLms = buildStylizedHandSkeleton(mid.hands[0]);
    const openDist = Math.hypot(openLms[4].x - openLms[8].x, openLms[4].y - openLms[8].y);
    const pinchedDist = Math.hypot(
      pinchedLms[4].x - pinchedLms[8].x,
      pinchedLms[4].y - pinchedLms[8].y
    );
    assert.ok(pinchedDist < openDist * 0.25, 'Thumb and index tips should converge during pinch');
  });

  it('two_hand_zoom renders two hands, enables caliper readout, and increases sphere zoom when spreading', () => {
    const narrow = evaluateGestureAnimationFrame('two_hand_zoom', 0.05);
    const wide = evaluateGestureAnimationFrame('two_hand_zoom', 0.46);

    assert.equal(narrow.hands.length, 2);
    assert.equal(wide.hands.length, 2);
    assert.equal(wide.caliper.visible, true);
    assert.ok(wide.sphere.zoom > narrow.sphere.zoom + 0.5);
    assert.ok(
      wide.hands[1].centerX - wide.hands[0].centerX >
        narrow.hands[1].centerX - narrow.hands[0].centerX
    );
  });

  it('pinch_select locks reticle and triggers selection pulse after quick pinch tap', () => {
    const aiming = evaluateGestureAnimationFrame('pinch_select', 0.15);
    const tapped = evaluateGestureAnimationFrame('pinch_select', 0.55);

    assert.equal(aiming.reticle.visible, true);
    assert.equal(aiming.reticle.locked, false);
    assert.equal(tapped.reticle.locked, true);
    assert.ok(tapped.sphere.selectedPulse > 0.5);
  });

  it('fist_reset fills holdProgress then snaps sphere back to 1.0x center', () => {
    const holding = evaluateGestureAnimationFrame('fist_reset', 0.50);
    const resetDone = evaluateGestureAnimationFrame('fist_reset', 0.90);

    assert.ok(holding.hands[0].holdProgress > 0.5);
    assert.ok(holding.sphere.zoom > 1.3);
    assert.equal(resetDone.sphere.zoom, 1);
    assert.equal(resetDone.sphere.rotY, 0);
  });

  it('navigates and clamps step indices safely', () => {
    assert.equal(clampStepIndex(-4), 0);
    assert.equal(clampStepIndex(99), GESTURE_ONBOARDING_STEPS.length - 1);
    assert.equal(getNextStepIndex(0, -1), GESTURE_ONBOARDING_STEPS.length - 1);
    assert.equal(getNextStepIndex(GESTURE_ONBOARDING_STEPS.length - 1, 1), 0);
  });

  it('persists onboarding seen flag cleanly in storage', () => {
    const store = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    assert.equal(readOnboardingSeen(fakeStorage), false);
    markOnboardingSeen(true, fakeStorage);
    assert.equal(store.get(ONBOARDING_STORAGE_KEY), '1');
    assert.equal(readOnboardingSeen(fakeStorage), true);
    markOnboardingSeen(false, fakeStorage);
    assert.equal(readOnboardingSeen(fakeStorage), false);
  });
});
