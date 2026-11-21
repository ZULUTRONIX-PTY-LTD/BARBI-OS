export type GestureStepId =
  | 'pinch_orbit'
  | 'two_finger_orbit'
  | 'pinch_select'
  | 'two_hand_zoom'
  | 'swipe_ring'
  | 'fist_reset';

export interface GestureOnboardingStep {
  id: GestureStepId;
  shortLabel: string;
  title: string;
  action: string;
  instruction: string;
  tip: string;
  durationMs: number;
}

export interface FingerCurlState {
  thumb: number; // 0 = extended, 1 = curled
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

export interface AnimatedHandPose {
  centerX: number; // 0..1 inside hand stage
  centerY: number; // 0..1 inside hand stage
  scale: number;
  tiltRad: number;
  mirror: boolean;
  fingerCurl: FingerCurlState;
  pinchAmount: number; // 0 = open, 1 = thumb + index touching
  isPinchGlow: boolean;
  holdProgress: number; // 0..1 circular hold progress (e.g. fist reset)
  swipeVelocity: number; // -1..1 horizontal swipe vector
}

export interface AnimatedSphereState {
  rotY: number;
  rotX: number;
  zoom: number;
  activeNodeIndex: number;
  selectedPulse: number; // 0..1 emerald lock-on ripple
  resetFlash: number; // 0..1 amber reset pulse
}

export interface AnimatedReticleState {
  visible: boolean;
  x: number; // -1..1 relative to sphere center
  y: number; // -1..1 relative to sphere center
  locked: boolean;
  pulse: number;
}

export interface AnimatedCaliperState {
  visible: boolean;
  leftX: number;
  rightX: number;
  y: number;
  zoomLabel: string;
}

export interface GestureAnimationFrame {
  stepId: GestureStepId;
  progress: number;
  phaseLabel: string;
  hands: AnimatedHandPose[];
  sphere: AnimatedSphereState;
  reticle: AnimatedReticleState;
  caliper: AnimatedCaliperState;
}

export interface HandLandmark2D {
  x: number;
  y: number;
}

export const ONBOARDING_STORAGE_KEY = 'barbi_gesture_onboarding_seen_v1';

export const GESTURE_ONBOARDING_STEPS: ReadonlyArray<GestureOnboardingStep> = [
  {
    id: 'pinch_orbit',
    shortLabel: 'Pinch Orbit',
    title: 'Pinch & Drag',
    action: 'Orbit 3D Sphere',
    instruction: 'Bring your thumb and index finger together, then glide your hand across the frame to rotate the sphere.',
    tip: 'Keep a steady pinch while panning — release when the sphere reaches your target angle.',
    durationMs: 3600,
  },
  {
    id: 'two_finger_orbit',
    shortLabel: 'Two Fingers',
    title: 'Two-Finger Glide',
    action: 'Smooth Orbit',
    instruction: 'Raise your index and middle fingers together and move smoothly to orbit without pinching.',
    tip: 'Great for relaxed browsing across dense orbital subsystems.',
    durationMs: 3600,
  },
  {
    id: 'pinch_select',
    shortLabel: 'Quick Pinch',
    title: 'Point & Quick Pinch',
    action: 'Select Node',
    instruction: 'Aim your index finger at any orbital node until the reticle snaps on, then tap thumb and index together.',
    tip: 'A brief tap under 0.35s selects; holding longer transitions smoothly into drag-orbit.',
    durationMs: 3400,
  },
  {
    id: 'two_hand_zoom',
    shortLabel: 'Zoom',
    title: 'Two-Hand Spread',
    action: 'Zoom In / Out',
    instruction: 'Show both hands and spread them apart to zoom closer into the sphere, or bring them together to zoom out.',
    tip: 'Prefer one hand? A steady Thumbs Up zooms in and Thumbs Down zooms out.',
    durationMs: 3800,
  },
  {
    id: 'swipe_ring',
    shortLabel: 'Wave',
    title: 'Quick Wave Left / Right',
    action: 'Cycle Command Ring',
    instruction: 'Sweep an open hand briskly left or right to step through active command ring subsystems.',
    tip: 'A clean horizontal flick triggers the ring step without disturbing camera pitch.',
    durationMs: 3200,
  },
  {
    id: 'fist_reset',
    shortLabel: 'Fist Reset',
    title: 'Closed Fist (Hold)',
    action: 'Reset Camera View',
    instruction: 'Close your hand into a fist and hold briefly for 0.6s to re-center orientation and reset zoom to 1.0x.',
    tip: 'Instant recovery whenever you orbit deep into the cognitive lattice.',
    durationMs: 3600,
  },
];

// Standard MediaPipe 21-landmark hand skeleton connections
export const HAND_SKELETON_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [5, 9], [9, 10], [10, 11], [11, 12], // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20], // Pinky & palm base
];

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothWindow(t: number, start: number, end: number): number {
  if (t <= start) return 0;
  if (t >= end) return 1;
  return easeInOutCubic((t - start) / (end - start));
}

export function clampStepIndex(index: number, total = GESTURE_ONBOARDING_STEPS.length): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(total - 1, Math.floor(index)));
}

export function getNextStepIndex(
  current: number,
  direction: -1 | 1,
  total = GESTURE_ONBOARDING_STEPS.length
): number {
  if (total <= 0) return 0;
  const safeCurrent = clampStepIndex(current, total);
  return (safeCurrent + direction + total) % total;
}

export function readOnboardingSeen(storage?: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (!target) return false;
    return target.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingSeen(
  seen = true,
  storage?: Pick<Storage, 'setItem' | 'removeItem'> | null
): void {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    if (!target) return;
    if (seen) {
      target.setItem(ONBOARDING_STORAGE_KEY, '1');
    } else {
      target.removeItem(ONBOARDING_STORAGE_KEY);
    }
  } catch {
    // Ignore restricted storage environments
  }
}

/**
 * Deterministic keyframe evaluator for each gesture demonstration loop.
 * Takes normalized progress t in [0, 1] and outputs synchronized hand poses
 * and 3D sphere state so the animation is smooth, scannable, and scrubbable.
 */
export function evaluateGestureAnimationFrame(
  stepId: GestureStepId,
  rawProgress: number
): GestureAnimationFrame {
  const t = clamp01(rawProgress);

  switch (stepId) {
    case 'pinch_orbit': {
      // 0..0.16 close pinch, 0.16..0.78 orbit arc, 0.78..0.92 release, 0.92..1 reset
      const pinchIn = smoothWindow(t, 0.04, 0.16);
      const pinchOut = smoothWindow(t, 0.80, 0.92);
      const pinchAmount = clamp01(pinchIn * (1 - pinchOut));

      const dragPhase = smoothWindow(t, 0.16, 0.78);
      const angle = dragPhase * Math.PI * 2;
      const offsetX = Math.sin(angle) * 0.16;
      const offsetY = Math.sin(angle * 2) * 0.055;

      const phaseLabel =
        t < 0.16
          ? 'Pinch thumb & index'
          : t < 0.80
            ? 'Drag smoothly to orbit sphere'
            : 'Release pinch to hold angle';

      return {
        stepId,
        progress: t,
        phaseLabel,
        hands: [
          {
            centerX: 0.5 + offsetX,
            centerY: 0.56 + offsetY,
            scale: 1,
            tiltRad: offsetX * 0.7,
            mirror: false,
            fingerCurl: {
              thumb: lerp(0.15, 0.55, pinchAmount),
              index: lerp(0.1, 0.52, pinchAmount),
              middle: lerp(0.2, 0.35, pinchAmount),
              ring: lerp(0.32, 0.55, pinchAmount),
              pinky: lerp(0.38, 0.62, pinchAmount),
            },
            pinchAmount,
            isPinchGlow: pinchAmount > 0.7,
            holdProgress: 0,
            swipeVelocity: 0,
          },
        ],
        sphere: {
          rotY: 0.35 + offsetX * 5.2,
          rotX: 0.22 + offsetY * 4.4,
          zoom: 1.0,
          activeNodeIndex: 0,
          selectedPulse: 0,
          resetFlash: 0,
        },
        reticle: { visible: false, x: 0, y: 0, locked: false, pulse: 0 },
        caliper: { visible: false, leftX: 0, rightX: 0, y: 0.5, zoomLabel: '1.0x' },
      };
    }

    case 'two_finger_orbit': {
      // Index + middle raised, panning smoothly in a figure-8 arc
      const glide = t * Math.PI * 2;
      const dx = Math.sin(glide) * 0.18;
      const dy = Math.cos(glide) * 0.07;

      const phaseLabel =
        dx >= 0 ? 'Raise 2 fingers & glide right' : 'Glide left for smooth orbit';

      return {
        stepId,
        progress: t,
        phaseLabel,
        hands: [
          {
            centerX: 0.5 + dx,
            centerY: 0.57 + dy,
            scale: 1,
            tiltRad: dx * 0.65,
            mirror: false,
            fingerCurl: {
              thumb: 0.72,
              index: 0.04,
              middle: 0.04,
              ring: 0.92,
              pinky: 0.95,
            },
            pinchAmount: 0,
            isPinchGlow: false,
            holdProgress: 0,
            swipeVelocity: 0,
          },
        ],
        sphere: {
          rotY: 0.25 + dx * 5.6,
          rotX: 0.18 + dy * 4.0,
          zoom: 1.04,
          activeNodeIndex: 1,
          selectedPulse: 0,
          resetFlash: 0,
        },
        reticle: { visible: false, x: 0, y: 0, locked: false, pulse: 0 },
        caliper: { visible: false, leftX: 0, rightX: 0, y: 0.5, zoomLabel: '1.0x' },
      };
    }

    case 'pinch_select': {
      // 0..0.38 move index reticle to node, 0.38..0.56 quick pinch tap, 0.56..1 emerald selection pulse
      const aimT = smoothWindow(t, 0.05, 0.38);
      const tapIn = smoothWindow(t, 0.42, 0.52);
      const tapOut = smoothWindow(t, 0.52, 0.64);
      const pinchAmount = clamp01(tapIn * (1 - tapOut));
      const pulsePhase = t > 0.50 ? clamp01(1 - (t - 0.50) / 0.44) : 0;

      const reticleX = lerp(-0.42, 0.26, aimT);
      const reticleY = lerp(0.28, -0.18, aimT);
      const locked = aimT > 0.85;

      const phaseLabel =
        t < 0.38
          ? 'Point index finger at node'
          : t < 0.62
            ? 'Quick pinch to select'
            : 'Node activated';

      return {
        stepId,
        progress: t,
        phaseLabel,
        hands: [
          {
            centerX: lerp(0.38, 0.56, aimT),
            centerY: lerp(0.62, 0.52, aimT),
            scale: 1,
            tiltRad: lerp(-0.1, 0.08, aimT),
            mirror: false,
            fingerCurl: {
              thumb: lerp(0.25, 0.58, pinchAmount),
              index: lerp(0.04, 0.48, pinchAmount),
              middle: 0.88,
              ring: 0.92,
              pinky: 0.94,
            },
            pinchAmount,
            isPinchGlow: pinchAmount > 0.65,
            holdProgress: 0,
            swipeVelocity: 0,
          },
        ],
        sphere: {
          rotY: 0.55 + t * 0.25,
          rotX: 0.2,
          zoom: 1.05,
          activeNodeIndex: 2,
          selectedPulse: pulsePhase,
          resetFlash: 0,
        },
        reticle: {
          visible: true,
          x: reticleX,
          y: reticleY,
          locked,
          pulse: pulsePhase,
        },
        caliper: { visible: false, leftX: 0, rightX: 0, y: 0.5, zoomLabel: '1.0x' },
      };
    }

    case 'two_hand_zoom': {
      // 0..0.46 spread hands apart -> zoom in, 0.54..0.94 bring hands together -> zoom out
      const spreadIn = smoothWindow(t, 0.08, 0.46);
      const spreadOut = smoothWindow(t, 0.56, 0.92);
      const spread = clamp01(spreadIn - spreadOut);

      const halfGap = lerp(0.16, 0.32, spread);
      const zoom = Number(lerp(0.84, 1.56, spread).toFixed(2));

      const phaseLabel =
        t < 0.50
          ? `Spread both hands apart (${zoom.toFixed(1)}x)`
          : `Bring hands closer (${zoom.toFixed(1)}x)`;

      return {
        stepId,
        progress: t,
        phaseLabel,
        hands: [
          {
            centerX: 0.5 - halfGap,
            centerY: 0.58,
            scale: 0.78,
            tiltRad: -0.14 - spread * 0.1,
            mirror: true,
            fingerCurl: { thumb: 0.12, index: 0.08, middle: 0.08, ring: 0.1, pinky: 0.12 },
            pinchAmount: 0,
            isPinchGlow: false,
            holdProgress: 0,
            swipeVelocity: 0,
          },
          {
            centerX: 0.5 + halfGap,
            centerY: 0.58,
            scale: 0.78,
            tiltRad: 0.14 + spread * 0.1,
            mirror: false,
            fingerCurl: { thumb: 0.12, index: 0.08, middle: 0.08, ring: 0.1, pinky: 0.12 },
            pinchAmount: 0,
            isPinchGlow: false,
            holdProgress: 0,
            swipeVelocity: 0,
          },
        ],
        sphere: {
          rotY: 0.4 + t * 0.4,
          rotX: 0.24,
          zoom,
          activeNodeIndex: 3,
          selectedPulse: 0,
          resetFlash: 0,
        },
        reticle: { visible: false, x: 0, y: 0, locked: false, pulse: 0 },
        caliper: {
          visible: true,
          leftX: 0.5 - halfGap,
          rightX: 0.5 + halfGap,
          y: 0.52,
          zoomLabel: `${zoom.toFixed(1)}x`,
        },
      };
    }

    case 'swipe_ring': {
      // Brisk wave right (0.12..0.44) then wave left (0.58..0.90)
      const rightWave = smoothWindow(t, 0.12, 0.44);
      const leftWave = smoothWindow(t, 0.58, 0.90);
      const handX = 0.30 + rightWave * 0.40 - leftWave * 0.40;

      let swipeVelocity = 0;
      if (t >= 0.12 && t <= 0.44) {
        swipeVelocity = Math.sin(((t - 0.12) / 0.32) * Math.PI);
      } else if (t >= 0.58 && t <= 0.90) {
        swipeVelocity = -Math.sin(((t - 0.58) / 0.32) * Math.PI);
      }

      const activeNodeIndex = t < 0.34 ? 1 : t < 0.76 ? 2 : 1;
      const ringYaw = lerp(0.0, 1.05, rightWave) - lerp(0.0, 1.05, leftWave);

      const phaseLabel =
        t < 0.50 ? 'Quick wave right → next ring node' : 'Quick wave left ← previous node';

      return {
        stepId,
        progress: t,
        phaseLabel,
        hands: [
          {
            centerX: handX,
            centerY: 0.56 - Math.abs(swipeVelocity) * 0.04,
            scale: 0.96,
            tiltRad: swipeVelocity * 0.28,
            mirror: false,
            fingerCurl: { thumb: 0.08, index: 0.05, middle: 0.04, ring: 0.06, pinky: 0.08 },
            pinchAmount: 0,
            isPinchGlow: false,
            holdProgress: 0,
            swipeVelocity,
          },
        ],
        sphere: {
          rotY: 0.3 + ringYaw,
          rotX: 0.18,
          zoom: 1.02,
          activeNodeIndex,
          selectedPulse: Math.abs(swipeVelocity) > 0.65 ? 0.6 : 0,
          resetFlash: 0,
        },
        reticle: { visible: false, x: 0, y: 0, locked: false, pulse: 0 },
        caliper: { visible: false, leftX: 0, rightX: 0, y: 0.5, zoomLabel: '1.0x' },
      };
    }

    case 'fist_reset': {
      // 0..0.18 close fist, 0.18..0.68 hold progress fills, 0.68..0.92 snap sphere back to home
      const curl = smoothWindow(t, 0.05, 0.18) * (1 - smoothWindow(t, 0.86, 0.98));
      const holdProgress =
        t < 0.18 ? 0 : t <= 0.68 ? clamp01((t - 0.18) / 0.50) : t < 0.86 ? 1 : 0;
      const snap = smoothWindow(t, 0.68, 0.88);
      const resetFlash = t >= 0.68 && t <= 0.96 ? clamp01(1 - (t - 0.68) / 0.28) : 0;

      const phaseLabel =
        t < 0.18
          ? 'Close hand into a fist'
          : t < 0.68
            ? `Hold fist (${Math.round(holdProgress * 100)}%)`
            : 'Camera centered · 1.0x';

      return {
        stepId,
        progress: t,
        phaseLabel,
        hands: [
          {
            centerX: 0.5,
            centerY: 0.57,
            scale: 1,
            tiltRad: 0,
            mirror: false,
            fingerCurl: {
              thumb: lerp(0.12, 0.88, curl),
              index: lerp(0.06, 0.96, curl),
              middle: lerp(0.05, 0.98, curl),
              ring: lerp(0.06, 0.98, curl),
              pinky: lerp(0.08, 0.96, curl),
            },
            pinchAmount: 0,
            isPinchGlow: false,
            holdProgress,
            swipeVelocity: 0,
          },
        ],
        sphere: {
          rotY: lerp(1.32, 0.0, snap),
          rotX: lerp(0.68, 0.14, snap),
          zoom: Number(lerp(1.58, 1.0, snap).toFixed(2)),
          activeNodeIndex: 0,
          selectedPulse: 0,
          resetFlash,
        },
        reticle: { visible: false, x: 0, y: 0, locked: false, pulse: 0 },
        caliper: { visible: false, leftX: 0, rightX: 0, y: 0.5, zoomLabel: '1.0x' },
      };
    }
  }
}

/**
 * Synthesizes 21 anatomical MediaPipe-style 2D hand landmarks in [0..1] stage coordinates
 * from an AnimatedHandPose so the onboarding preview mirrors the exact landmark aesthetic
 * of the live webcam skeleton overlay.
 */
export function buildStylizedHandSkeleton(pose: AnimatedHandPose): HandLandmark2D[] {
  const s = pose.scale * 0.26;
  const mirrorSign = pose.mirror ? -1 : 1;
  const cos = Math.cos(pose.tiltRad);
  const sin = Math.sin(pose.tiltRad);

  const toStage = (lx: number, ly: number): HandLandmark2D => {
    const mx = lx * mirrorSign;
    const rx = mx * cos - ly * sin;
    const ry = mx * sin + ly * cos;
    return {
      x: pose.centerX + rx * s,
      y: pose.centerY + ry * s,
    };
  };

  // Wrist at bottom center of local hand coordinates (y points down)
  const wrist = toStage(0, 0.78);

  // Palm knuckles (MCPs)
  const thumbCmc = toStage(-0.34, 0.52);
  const indexMcp = toStage(-0.32, 0.02);
  const middleMcp = toStage(-0.08, -0.05);
  const ringMcp = toStage(0.16, 0.01);
  const pinkyMcp = toStage(0.37, 0.14);

  // Helper to articulate a 3-segment finger with curl in [0..1]
  const buildFinger = (
    baseX: number,
    baseY: number,
    splayAngle: number,
    length: number,
    curl: number
  ): [HandLandmark2D, HandLandmark2D, HandLandmark2D, HandLandmark2D] => {
    const c = clamp01(curl);
    // Extended points upward (-y); curled folds downward into the palm
    const dirX = Math.sin(splayAngle);
    const dirY = -Math.cos(splayAngle);

    const seg1 = length * 0.42 * lerp(1, 0.55, c);
    const seg2 = length * 0.32 * lerp(1, 0.25, c);
    const seg3 = length * 0.26 * lerp(1, -0.52, c);

    const pipX = baseX + dirX * seg1;
    const pipY = baseY + dirY * seg1 + c * 0.08;
    const dipX = pipX + dirX * seg2 * (1 - c * 0.45);
    const dipY = pipY + dirY * seg2 + c * 0.18;
    const tipX = dipX + dirX * seg3 * (1 - c * 0.5);
    const tipY = dipY + dirY * seg3 + c * 0.28;

    return [
      toStage(baseX, baseY),
      toStage(pipX, pipY),
      toStage(dipX, dipY),
      toStage(tipX, tipY),
    ];
  };

  const idx = buildFinger(-0.32, 0.02, -0.14, 0.96, pose.fingerCurl.index);
  const mid = buildFinger(-0.08, -0.05, 0.0, 1.06, pose.fingerCurl.middle);
  const rng = buildFinger(0.16, 0.01, 0.12, 0.95, pose.fingerCurl.ring);
  const pnk = buildFinger(0.37, 0.14, 0.26, 0.78, pose.fingerCurl.pinky);

  // Thumb articulates toward the index tip when pinching
  const pinch = clamp01(pose.pinchAmount);
  const tCurl = clamp01(pose.fingerCurl.thumb);

  const thumbMcpX = lerp(-0.56, -0.44, tCurl);
  const thumbMcpY = lerp(0.28, 0.30, tCurl);
  const thumbIpX = lerp(-0.74, -0.34, tCurl);
  const thumbIpY = lerp(0.02, 0.12, tCurl);

  // Base thumb tip before pinch convergence
  let thumbTipX = lerp(-0.84, -0.22, tCurl);
  let thumbTipY = lerp(-0.22, 0.16, tCurl);

  // Converge index tip & thumb tip cleanly at a crisp pinch contact point
  let indexTipStage = idx[3];
  let thumbTipStage = toStage(thumbTipX, thumbTipY);

  if (pinch > 0.01) {
    const meetPoint = toStage(-0.44, -0.42);
    indexTipStage = {
      x: lerp(idx[3].x, meetPoint.x, pinch),
      y: lerp(idx[3].y, meetPoint.y, pinch),
    };
    thumbTipStage = {
      x: lerp(thumbTipStage.x, meetPoint.x, pinch),
      y: lerp(thumbTipStage.y, meetPoint.y, pinch),
    };
  }

  return [
    wrist, // 0
    thumbCmc, // 1
    toStage(thumbMcpX, thumbMcpY), // 2
    toStage(thumbIpX, thumbIpY), // 3
    thumbTipStage, // 4
    indexMcp, // 5
    idx[1], // 6
    idx[2], // 7
    indexTipStage, // 8
    middleMcp, // 9
    mid[1], // 10
    mid[2], // 11
    mid[3], // 12
    ringMcp, // 13
    rng[1], // 14
    rng[2], // 15
    rng[3], // 16
    pinkyMcp, // 17
    pnk[1], // 18
    pnk[2], // 19
    pnk[3], // 20
  ];
}
