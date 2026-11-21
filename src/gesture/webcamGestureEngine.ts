import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  classifyHandLandmarks,
  HAND_CONNECTIONS,
  WEBCAM_GESTURE_REPOSITORIES,
  type HandPoseType,
  type LandmarkPoint,
} from './gestureClassifier';
import {
  computeOrbitDelta,
  computeTwoHandZoomDelta,
  detectHorizontalSwipe,
  getHandPalmCenter,
  smoothPoint,
  type NormalizedPoint,
} from './gestureNavigation';

export type GestureTriggerAction = HandPoseType | 'swipe_left' | 'swipe_right';

export interface WebcamTrackerCallbacks {
  onStatus: (status: string, tone?: 'info' | 'accent' | 'error') => void;
  onFrameLandmarks: (
    landmarks: LandmarkPoint[] | null,
    classified: ReturnType<typeof classifyHandLandmarks>,
    triggerAction: GestureTriggerAction | null,
    orbitDelta?: { dx: number; dy: number },
    extra?: {
      handCount: number;
      zoomDelta?: number;
      fps?: number;
      engineMode: 'mediapipe' | 'optical-motion';
      isGrabbingOrbit?: boolean;
    }
  ) => void;
}

class BarbiWebcamGestureEngine {
  private landmarker: HandLandmarker | null = null;
  private loadingPromise: Promise<HandLandmarker | null> | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  private rafId: number | null = null;
  private lastVideoTime = -1;
  private prevPinched = false;
  private pinchStartedAt = 0;
  private pinchMovedDist = 0;
  private lastActionTimestamps = new Map<string, number>();
  private poseHoldStarted: { pose: HandPoseType | null; startedAt: number } = { pose: null, startedAt: 0 };
  private smoothedCursor: NormalizedPoint | null = null;
  private prevOrbitCursor: NormalizedPoint | null = null;
  private prevTwoHandDist: number | null = null;
  private wristHistory: Array<{ x: number; y: number; t: number }> = [];
  private engineMode: 'mediapipe' | 'optical-motion' = 'mediapipe';
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private prevGrayFrame: Uint8ClampedArray | null = null;
  private frameCounter = 0;
  private lastFpsTick = 0;
  private currentFps = 0;

  getRepositories() {
    return WEBCAM_GESTURE_REPOSITORIES;
  }

  isRunning() {
    return this.running;
  }

  getMode() {
    return this.engineMode;
  }

  async ensureHandLandmarker(onStatus?: (s: string) => void): Promise<HandLandmarker | null> {
    if (this.landmarker) return this.landmarker;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      const wasmBases = [
        '/mediapipe-wasm',
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm',
      ];
      const modelUrl =
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

      for (const base of wasmBases) {
        try {
          onStatus?.(
            `Loading MediaPipe HandLandmarker (${base.startsWith('/') ? 'local WASM' : 'CDN WASM'})...`
          );
          const vision = await FilesetResolver.forVisionTasks(base);
          for (const delegate of ['GPU', 'CPU'] as const) {
            try {
              this.landmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: modelUrl, delegate },
                runningMode: 'VIDEO',
                numHands: 2,
                minHandDetectionConfidence: 0.48,
                minHandPresenceConfidence: 0.45,
                minTrackingConfidence: 0.45,
              });
              this.engineMode = 'mediapipe';
              return this.landmarker;
            } catch {
              // Try CPU fallback or next WASM base
            }
          }
        } catch {
          // Try next WASM base
        }
      }
      this.engineMode = 'optical-motion';
      return null;
    })();

    return this.loadingPromise;
  }

  private canFireAction(action: string, cooldownMs: number): boolean {
    const now = performance.now();
    const last = this.lastActionTimestamps.get(action) || 0;
    if (now - last < cooldownMs) return false;
    this.lastActionTimestamps.set(action, now);
    return true;
  }

  async start(
    videoEl: HTMLVideoElement,
    canvasEl: HTMLCanvasElement,
    callbacks: WebcamTrackerCallbacks
  ): Promise<boolean> {
    if (this.running) {
      this.stop(videoEl);
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      callbacks.onStatus('Camera API (getUserMedia) is unavailable in this browser context.', 'error');
      return false;
    }

    try {
      callbacks.onStatus('Requesting webcam access...', 'info');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });
      this.stream = stream;
      videoEl.srcObject = stream;
      videoEl.classList.remove('hidden');
      await videoEl.play().catch(() => {});

      const model = await this.ensureHandLandmarker((msg) => callbacks.onStatus(msg, 'info'));
      if (model) {
        callbacks.onStatus('MediaPipe HandLandmarker active — pinch-drag to orbit, spread 2 hands to zoom, fist to reset.', 'accent');
      } else {
        callbacks.onStatus('MediaPipe model unreachable — optical motion fallback active.', 'info');
      }

      this.running = true;
      this.lastVideoTime = -1;
      this.smoothedCursor = null;
      this.prevOrbitCursor = null;
      this.prevTwoHandDist = null;
      this.wristHistory = [];
      this.frameCounter = 0;
      this.lastFpsTick = performance.now();
      this.currentFps = 0;

      const loop = () => {
        if (!this.running) return;
        this.processFrame(videoEl, canvasEl, callbacks);
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error && /NotAllowed|Permission|denied/i.test(err.name + ' ' + err.message)
          ? 'Camera permission denied. Allow camera access in your browser to use hand-gesture navigation.'
          : `Camera unavailable: ${(err as Error)?.message || err}`;
      callbacks.onStatus(msg, 'error');
      return false;
    }
  }

  stop(videoEl?: HTMLVideoElement | null): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.classList.add('hidden');
    }
    this.prevPinched = false;
    this.pinchStartedAt = 0;
    this.pinchMovedDist = 0;
    this.smoothedCursor = null;
    this.prevOrbitCursor = null;
    this.prevTwoHandDist = null;
    this.wristHistory = [];
    this.prevGrayFrame = null;
  }

  private processFrame(
    videoEl: HTMLVideoElement,
    canvasEl: HTMLCanvasElement,
    callbacks: WebcamTrackerCallbacks
  ): void {
    if (videoEl.readyState < 2 || !videoEl.videoWidth || !videoEl.videoHeight) return;
    if (videoEl.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = videoEl.currentTime;

    const nowMs = performance.now();
    this.frameCounter += 1;
    if (nowMs - this.lastFpsTick >= 1000) {
      this.currentFps = Math.round((this.frameCounter * 1000) / (nowMs - this.lastFpsTick));
      this.frameCounter = 0;
      this.lastFpsTick = nowMs;
    }

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const w = canvasEl.width;
    const h = canvasEl.height;

    if (this.landmarker) {
      try {
        const results = this.landmarker.detectForVideo(videoEl, nowMs);
        const allHands = (results?.landmarks ?? []) as LandmarkPoint[][];
        const primaryHand = allHands[0];

        ctx.clearRect(0, 0, w, h);

        if (primaryHand && primaryHand.length >= 21) {
          const classified = classifyHandLandmarks(primaryHand, this.prevPinched, true);
          this.drawLiveLandmarks(ctx, w, h, primaryHand, classified?.isPinched || false, true);

          let zoomDelta = 0;

          // Two-hand spread/pinch zoom when 2 hands are visible
          if (allHands.length >= 2 && allHands[1]?.length >= 21) {
            this.drawLiveLandmarks(ctx, w, h, allHands[1], false, false);
            const twoHand = computeTwoHandZoomDelta(this.prevTwoHandDist, allHands[0], allHands[1]);
            if (twoHand) {
              this.prevTwoHandDist = twoHand.distance;
              zoomDelta = twoHand.zoomDelta;
              this.drawTwoHandZoomBridge(ctx, w, h, allHands[0], allHands[1]);
            }
          } else {
            this.prevTwoHandDist = null;
          }

          if (classified) {
            const smoothed = smoothPoint(
              this.smoothedCursor,
              { x: classified.cursorX, y: classified.cursorY },
              0.42
            );
            this.smoothedCursor = smoothed;

            const smoothedClassified = {
              ...classified,
              cursorX: smoothed.x,
              cursorY: smoothed.y,
            };

            let triggered: GestureTriggerAction | null = null;
            let orbitDelta: { dx: number; dy: number } | undefined;
            let isGrabbingOrbit = false;

            // Pinch: quick pinch selects hovered node; pinch + drag orbits the 3D sphere smoothly
            if (classified.isPinched) {
              if (!this.prevPinched) {
                this.pinchStartedAt = nowMs;
                this.pinchMovedDist = 0;
                this.prevOrbitCursor = smoothed;
              } else if (this.prevOrbitCursor) {
                const step = computeOrbitDelta(this.prevOrbitCursor, smoothed, {
                  deadzone: 0.0035,
                  sensitivityY: 1,
                  sensitivityX: 1,
                });
                if (step) {
                  this.pinchMovedDist += Math.hypot(step.dRotY, step.dRotX);
                  orbitDelta = { dx: step.dRotY, dy: step.dRotX };
                  isGrabbingOrbit = true;
                }
                this.prevOrbitCursor = smoothed;
              }
            } else {
              // Released pinch: if it was a brief stationary tap, fire node selection
              if (
                this.prevPinched &&
                nowMs - this.pinchStartedAt <= 420 &&
                this.pinchMovedDist < 0.04 &&
                this.canFireAction('pinch_select', 650)
              ) {
                triggered = 'pinch_select';
              }
              this.pinchStartedAt = 0;
              this.pinchMovedDist = 0;

              // Continuous two-finger smooth orbit
              if (classified.pose === 'two_finger_orbit') {
                if (this.prevOrbitCursor) {
                  const step = computeOrbitDelta(this.prevOrbitCursor, smoothed, {
                    deadzone: 0.0035,
                    sensitivityY: 1,
                    sensitivityX: 1,
                  });
                  if (step) {
                    orbitDelta = { dx: step.dRotY, dy: step.dRotX };
                    isGrabbingOrbit = true;
                  }
                }
                this.prevOrbitCursor = smoothed;
              } else {
                this.prevOrbitCursor = null;
              }
            }
            this.prevPinched = classified.isPinched;

            // Horizontal wrist swipe detector (when not actively pinch-dragging)
            if (!classified.isPinched && allHands.length === 1) {
              const nowSec = nowMs / 1000;
              const mirrorWristX = 1 - primaryHand[0].x;
              const wristY = primaryHand[0].y;
              this.wristHistory.push({ x: mirrorWristX, y: wristY, t: nowSec });
              this.wristHistory = this.wristHistory.filter((p) => nowSec - p.t <= 0.45);
              const swipe = detectHorizontalSwipe(this.wristHistory);
              if (swipe && this.canFireAction('swipe', 850)) {
                triggered = swipe;
                this.wristHistory = [];
              }
            } else {
              this.wristHistory = [];
            }

            // Sustained hold poses: Fist -> Reset View, Thumbs Up/Down -> Zoom In/Out, Open Palm -> Voice
            if (this.poseHoldStarted.pose !== classified.pose) {
              this.poseHoldStarted = { pose: classified.pose, startedAt: nowMs };
            } else if (!triggered && allHands.length === 1) {
              const heldMs = nowMs - this.poseHoldStarted.startedAt;
              if (classified.pose === 'fist_reset' && heldMs >= 580 && this.canFireAction('fist_reset', 1600)) {
                triggered = 'fist_reset';
              } else if (classified.pose === 'thumbs_up' && heldMs >= 220) {
                zoomDelta = 0.045;
              } else if (classified.pose === 'thumbs_down' && heldMs >= 220) {
                zoomDelta = -0.045;
              } else if (classified.pose === 'open_palm' && heldMs >= 950 && this.canFireAction('open_palm', 3000)) {
                triggered = 'open_palm';
              }
            }

            callbacks.onFrameLandmarks(primaryHand, smoothedClassified, triggered, orbitDelta, {
              handCount: allHands.length,
              zoomDelta: zoomDelta !== 0 ? zoomDelta : undefined,
              fps: this.currentFps,
              engineMode: this.engineMode,
              isGrabbingOrbit,
            });
            return;
          }
        }

        this.prevPinched = false;
        this.prevOrbitCursor = null;
        this.prevTwoHandDist = null;
        this.wristHistory = [];
        callbacks.onFrameLandmarks(null, null, null, undefined, {
          handCount: 0,
          fps: this.currentFps,
          engineMode: this.engineMode,
        });
        return;
      } catch {
        // Fall back seamlessly to optical motion centroid if WASM frame fails
      }
    }

    this.processOpticalMotionFallback(videoEl, ctx, w, h, callbacks);
  }

  private processOpticalMotionFallback(
    videoEl: HTMLVideoElement,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    callbacks: WebcamTrackerCallbacks
  ): void {
    const sw = 80;
    const sh = 60;
    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = sw;
      this.offscreenCanvas.height = sh;
    }
    const oCtx = this.offscreenCanvas.getContext('2d');
    if (!oCtx) return;
    oCtx.drawImage(videoEl, 0, 0, sw, sh);
    const img = oCtx.getImageData(0, 0, sw, sh).data;
    const gray = new Uint8ClampedArray(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
      gray[i] = (img[i * 4] * 3 + img[i * 4 + 1] * 6 + img[i * 4 + 2]) / 10;
    }
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    if (this.prevGrayFrame) {
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const idx = y * sw + x;
          if (Math.abs(gray[idx] - this.prevGrayFrame[idx]) > 24) {
            sumX += 1 - x / sw;
            sumY += y / sh;
            count++;
          }
        }
      }
    }
    this.prevGrayFrame = gray;

    ctx.clearRect(0, 0, w, h);

    if (count > 22) {
      const cx = sumX / count;
      const cy = sumY / count;
      const smoothed = smoothPoint(this.smoothedCursor, { x: cx, y: cy }, 0.32);
      const step = computeOrbitDelta(this.smoothedCursor, smoothed, {
        deadzone: 0.006,
        sensitivityY: 1,
        sensitivityX: 1,
      });
      this.smoothedCursor = smoothed;

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(smoothed.x * w, smoothed.y * h, 14, 0, Math.PI * 2);
      ctx.stroke();

      callbacks.onFrameLandmarks(
        null,
        {
          cursorX: smoothed.x,
          cursorY: smoothed.y,
          palmScale: 0.2,
          pinchRatio: 0.6,
          isPinched: false,
          pose: 'pointer',
          poseLabel: 'Optical Motion',
          extendedFingers: { thumb: false, index: true, middle: false, ring: false, pinky: false },
        },
        null,
        step ? { dx: step.dRotY, dy: step.dRotX } : undefined,
        {
          handCount: 1,
          fps: this.currentFps,
          engineMode: 'optical-motion',
        }
      );
    }
  }

  private drawLiveLandmarks(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    landmarks: LandmarkPoint[],
    isPinched: boolean,
    isPrimary: boolean
  ): void {
    ctx.strokeStyle = isPinched
      ? '#f59e0b'
      : isPrimary
        ? 'rgba(251, 191, 36, 0.85)'
        : 'rgba(52, 211, 153, 0.8)';
    ctx.lineWidth = 2;
    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const s = landmarks[startIdx];
      const e = landmarks[endIdx];
      if (!s || !e) continue;
      ctx.beginPath();
      ctx.moveTo((1 - s.x) * w, s.y * h);
      ctx.lineTo((1 - e.x) * w, e.y * h);
      ctx.stroke();
    }
    landmarks.forEach((pt, idx) => {
      const isTip = idx === 4 || idx === 8 || idx === 12 || idx === 16 || idx === 20;
      ctx.fillStyle = isTip ? (isPinched ? '#fbbf24' : '#34d399') : '#fef3c7';
      ctx.beginPath();
      ctx.arc((1 - pt.x) * w, pt.y * h, isTip ? 3.8 : 2.1, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawTwoHandZoomBridge(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    handA: LandmarkPoint[],
    handB: LandmarkPoint[]
  ): void {
    const a = getHandPalmCenter(handA, true);
    const b = getHandPalmCenter(handB, true);
    if (!a || !b) return;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
    ctx.restore();
  }
}

export const barbiWebcamGestureEngine = new BarbiWebcamGestureEngine();
