import type { LandmarkPoint } from './gestureClassifier';

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface OrbitStep {
  dRotY: number;
  dRotX: number;
}

export interface GestureGuideEntry {
  id: string;
  gesture: string;
  action: string;
  hint: string;
}

export const GESTURE_GUIDE_ITEMS: ReadonlyArray<GestureGuideEntry> = [
  {
    id: 'pinch_orbit',
    gesture: 'Pinch & Drag',
    action: 'Orbit 3D Sphere',
    hint: 'Hold thumb + index together and move hand',
  },
  {
    id: 'two_finger_orbit',
    gesture: 'Two Fingers',
    action: 'Smooth Orbit',
    hint: 'Raise index + middle fingers and pan',
  },
  {
    id: 'pinch_select',
    gesture: 'Quick Pinch',
    action: 'Select Node',
    hint: 'Point index at a node and tap thumb + index',
  },
  {
    id: 'two_hand_zoom',
    gesture: 'Two-Hand Spread / Thumbs',
    action: 'Zoom In / Out',
    hint: 'Move both hands apart/together, or thumbs up/down',
  },
  {
    id: 'swipe_ring',
    gesture: 'Quick Wave Left / Right',
    action: 'Cycle Command Ring',
    hint: 'Brisk horizontal hand sweep',
  },
  {
    id: 'fist_reset',
    gesture: 'Closed Fist (Hold)',
    action: 'Reset Camera View',
    hint: 'Hold fist for 0.6s to re-center sphere',
  },
];

export function smoothPoint(
  prev: NormalizedPoint | null,
  next: NormalizedPoint,
  alpha = 0.38
): NormalizedPoint {
  const clampedX = Math.max(0.02, Math.min(0.98, next.x));
  const clampedY = Math.max(0.02, Math.min(0.98, next.y));
  if (!prev) {
    return { x: clampedX, y: clampedY };
  }
  const a = Math.max(0.05, Math.min(1, alpha));
  return {
    x: prev.x * (1 - a) + clampedX * a,
    y: prev.y * (1 - a) + clampedY * a,
  };
}

/**
 * Converts normalized cursor displacement into damped 3D sphere yaw/pitch deltas.
 * Applies a small deadzone to filter webcam jitter and clamps sudden jumps when
 * tracking re-acquires a hand.
 */
export function computeOrbitDelta(
  prev: NormalizedPoint | null,
  curr: NormalizedPoint,
  options?: {
    deadzone?: number;
    maxNormStep?: number;
    sensitivityY?: number;
    sensitivityX?: number;
  }
): OrbitStep | null {
  if (!prev) return null;
  const deadzone = options?.deadzone ?? 0.004;
  const maxNormStep = options?.maxNormStep ?? 0.14;
  const sensitivityY = options?.sensitivityY ?? 4.2;
  const sensitivityX = options?.sensitivityX ?? 3.1;

  const rawDx = curr.x - prev.x;
  const rawDy = curr.y - prev.y;
  const mag = Math.hypot(rawDx, rawDy);

  if (mag < deadzone || mag > maxNormStep) {
    return null;
  }

  return {
    dRotY: Number((rawDx * sensitivityY).toFixed(4)),
    dRotX: Number((rawDy * sensitivityX).toFixed(4)),
  };
}

export function getHandPalmCenter(landmarks: LandmarkPoint[], mirrorX = true): NormalizedPoint | null {
  if (!Array.isArray(landmarks) || landmarks.length < 10) return null;
  const middleMcp = landmarks[9];
  const wrist = landmarks[0];
  if (!middleMcp || !wrist) return null;
  const rawX = (middleMcp.x + wrist.x) * 0.5;
  const rawY = (middleMcp.y + wrist.y) * 0.5;
  return {
    x: mirrorX ? 1 - rawX : rawX,
    y: rawY,
  };
}

/**
 * Computes zoom delta from the change in distance between two detected hands.
 * Spreading hands apart zooms in (+); bringing hands closer zooms out (-).
 */
export function computeTwoHandZoomDelta(
  prevDistance: number | null,
  handA: LandmarkPoint[],
  handB: LandmarkPoint[],
  options?: {
    deadzone?: number;
    maxStep?: number;
    sensitivity?: number;
  }
): { distance: number; zoomDelta: number } | null {
  const cA = getHandPalmCenter(handA, true);
  const cB = getHandPalmCenter(handB, true);
  if (!cA || !cB) return null;

  const distance = Math.hypot(cA.x - cB.x, cA.y - cB.y);
  if (prevDistance === null) {
    return { distance, zoomDelta: 0 };
  }

  const deadzone = options?.deadzone ?? 0.006;
  const maxStep = options?.maxStep ?? 0.22;
  const sensitivity = options?.sensitivity ?? 3.6;

  const diff = distance - prevDistance;
  if (Math.abs(diff) < deadzone || Math.abs(diff) > maxStep) {
    return { distance, zoomDelta: 0 };
  }

  return {
    distance,
    zoomDelta: Number((diff * sensitivity).toFixed(4)),
  };
}

export function detectHorizontalSwipe(
  history: ReadonlyArray<{ x: number; y?: number; t: number }>,
  options?: {
    minDeltaX?: number;
    maxDurationSec?: number;
    minPoints?: number;
  }
): 'swipe_left' | 'swipe_right' | null {
  const minPoints = options?.minPoints ?? 5;
  const minDeltaX = options?.minDeltaX ?? 0.26;
  const maxDurationSec = options?.maxDurationSec ?? 0.45;

  if (history.length < minPoints) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0.03 || dt > maxDurationSec) return null;

  const dx = last.x - first.x;
  const dy = typeof first.y === 'number' && typeof last.y === 'number' ? last.y - first.y : 0;

  if (Math.abs(dx) < minDeltaX) return null;
  if (Math.abs(dy) > Math.abs(dx) * 0.75) return null;

  return dx > 0 ? 'swipe_right' : 'swipe_left';
}

export function clampSphereZoom(zoom: number, minZoom = 0.48, maxZoom = 5.5): number {
  if (!Number.isFinite(zoom)) return 1.0;
  return Number(Math.max(minZoom, Math.min(maxZoom, zoom)).toFixed(3));
}
