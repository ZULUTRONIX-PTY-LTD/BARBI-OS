export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

export type HandPoseType =
  | 'pointer'
  | 'pinch_select'
  | 'open_palm'
  | 'two_finger_orbit'
  | 'fist_reset'
  | 'thumbs_up'
  | 'thumbs_down';

export interface ClassifiedGestureFrame {
  cursorX: number;
  cursorY: number;
  palmScale: number;
  pinchRatio: number;
  isPinched: boolean;
  pose: HandPoseType;
  poseLabel: string;
  extendedFingers: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
}

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const WEBCAM_GESTURE_REPOSITORIES = [
  {
    name: 'google-ai-edge/mediapipe-samples-web',
    url: 'https://github.com/google-ai-edge/mediapipe-samples-web',
    stack: '@mediapipe/tasks-vision (WASM + HandLandmarker)',
    purpose: 'Official 21-landmark real-time laptop webcam skeletal hand tracking engine integrated into B.A.R.B.I.',
  },
  {
    name: 'collidingScopes/threejs-handtracking-101',
    url: 'https://github.com/collidingScopes/threejs-handtracking-101',
    stack: 'Three.js + MediaPipe Hands + Vanilla JS',
    purpose: 'Interactive 3D sphere resizing & pinch-based spatial manipulation using a standard laptop camera.',
  },
  {
    name: 'ghosheh33/3D-Hand-Control-Project',
    url: 'https://github.com/ghosheh33/3D-Hand-Control-Project',
    stack: 'Three.js + Browser Webcam',
    purpose: 'Zero-specialized-hardware 3D viewport orbit, zoom, and rotation via browser webcam.',
  },
  {
    name: 'rnnh-code/object-pick-with-hands',
    url: 'https://github.com/rnnh-code/object-pick-with-hands',
    stack: 'Three.js + MediaPipe Hands',
    purpose: 'Pinch-to-grab, drag, and release spatial node interaction patterns.',
  },
  {
    name: 'ossamamehmood/holoflux-gesture-engine',
    url: 'https://github.com/ossamamehmood/holoflux-gesture-engine',
    stack: 'GLSL Particle Shaders + AI Hand Tracking',
    purpose: 'Real-time particle cluster choreography reactive to webcam hand landmarks.',
  },
] as const;

function dist2D(a: LandmarkPoint, b: LandmarkPoint): number {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

function isFingerExtended(landmarks: LandmarkPoint[], tipIdx: number, pipIdx: number, mcpIdx: number): boolean {
  const wrist = landmarks[0];
  const tip = landmarks[tipIdx];
  const pip = landmarks[pipIdx];
  const mcp = landmarks[mcpIdx];
  if (!wrist || !tip || !pip || !mcp) return false;
  return dist2D(wrist, tip) > dist2D(wrist, pip) * 1.12 && dist2D(wrist, tip) > dist2D(wrist, mcp) * 1.25;
}

export function classifyHandLandmarks(
  landmarks: LandmarkPoint[],
  prevPinched = false,
  mirrorX = true
): ClassifiedGestureFrame | null {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return null;

  const wrist = landmarks[0];
  const thumbCmc = landmarks[1];
  const thumbMcp = landmarks[2];
  const thumbIp = landmarks[3];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];

  const palmScale = Math.max(0.05, dist2D(wrist, middleMcp));
  const rawPinch = dist2D(thumbTip, indexTip) / palmScale;
  const pinchRatio = Number(Math.max(0.05, Math.min(1.5, rawPinch)).toFixed(3));

  const indexExt = isFingerExtended(landmarks, 8, 6, 5);
  const middleExt = isFingerExtended(landmarks, 12, 10, 9);
  const ringExt = isFingerExtended(landmarks, 16, 14, 13);
  const pinkyExt = isFingerExtended(landmarks, 20, 18, 17);
  const thumbExt = dist2D(thumbTip, pinkyMcp) > dist2D(thumbMcp, pinkyMcp) * 1.25 && dist2D(thumbTip, thumbCmc) > palmScale * 0.65;

  // Dual-threshold pinch hysteresis prevents jitter and suppresses closed-fist false positives
  const indexOutOfPalm = dist2D(wrist, indexTip) > palmScale * 1.05 || middleExt || ringExt || pinkyExt;
  const isPinched = indexOutOfPalm && (prevPinched ? pinchRatio < 0.48 : pinchRatio < 0.38);

  const rawCursorX = mirrorX ? 1 - indexTip.x : indexTip.x;
  const cursorX = Math.max(0.02, Math.min(0.98, rawCursorX));
  const cursorY = Math.max(0.02, Math.min(0.98, indexTip.y));

  let pose: HandPoseType = 'pointer';
  let poseLabel = 'Pointer ☝️';

  if (isPinched) {
    pose = 'pinch_select';
    poseLabel = 'Pinch 🤏';
  } else if (indexExt && middleExt && ringExt && pinkyExt) {
    pose = 'open_palm';
    poseLabel = 'Open Palm ✋';
  } else if (indexExt && middleExt && !ringExt && !pinkyExt) {
    pose = 'two_finger_orbit';
    poseLabel = 'Two-Finger ✌️';
  } else if (!indexExt && !middleExt && !ringExt && !pinkyExt && thumbExt) {
    if (thumbTip.y < thumbIp.y - palmScale * 0.14) {
      pose = 'thumbs_up';
      poseLabel = 'Thumbs Up 👍';
    } else if (thumbTip.y > thumbIp.y + palmScale * 0.14) {
      pose = 'thumbs_down';
      poseLabel = 'Thumbs Down 👎';
    } else {
      pose = 'fist_reset';
      poseLabel = 'Fist ✊';
    }
  } else if (!indexExt && !middleExt && !ringExt && !pinkyExt) {
    pose = 'fist_reset';
    poseLabel = 'Fist ✊';
  }

  return {
    cursorX,
    cursorY,
    palmScale,
    pinchRatio,
    isPinched,
    pose,
    poseLabel,
    extendedFingers: {
      thumb: thumbExt,
      index: indexExt,
      middle: middleExt,
      ring: ringExt,
      pinky: pinkyExt,
    },
  };
}
