import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  classifyHandLandmarks,
  HAND_CONNECTIONS,
  WEBCAM_GESTURE_REPOSITORIES,
  type HandPoseType,
  type LandmarkPoint,
} from './gestureClassifier';

export interface WebcamTrackerCallbacks {
  onStatus: (status: string, tone?: 'info' | 'accent' | 'error') => void;
  onFrameLandmarks: (
    landmarks: LandmarkPoint[] | null,
    classified: ReturnType<typeof classifyHandLandmarks>,
    triggerAction: HandPoseType | 'swipe_left' | 'swipe_right' | null,
    orbitDelta?: { dx: number; dy: number }
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
  private lastActionTimestamps = new Map<string, number>();
  private poseHoldStarted: { pose: HandPoseType | null; startedAt: number } = { pose: null, startedAt: 0 };
  private prevOrbitCursor: { x: number; y: number } | null = null;
  private wristHistory: Array<{ x: number; t: number }> = [];
  private engineMode: 'mediapipe' | 'optical-motion' = 'mediapipe';
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private prevGrayFrame: Uint8ClampedArray | null = null;

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
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm',
      ];
      const modelUrl =
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

      for (const base of wasmBases) {
        try {
          onStatus?.(`Loading 21-landmark neural tracker (${base.startsWith('/') ? 'local WASM' : 'CDN WASM'})...`);
          const vision = await FilesetResolver.forVisionTasks(base);
          try {
            this.landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
              runningMode: 'VIDEO',
              numHands: 1,
              minHandDetectionConfidence: 0.45,
              minHandPresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
            });
            this.engineMode = 'mediapipe';
            return this.landmarker;
          } catch {
            // Fallback to CPU delegate for headless/software-WebGL systems
            this.landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
              runningMode: 'VIDEO',
              numHands: 1,
              minHandDetectionConfidence: 0.45,
              minHandPresenceConfidence: 0.45,
              minTrackingConfidence: 0.45,
            });
            this.engineMode = 'mediapipe';
            return this.landmarker;
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
      callbacks.onStatus('Browser camera API (getUserMedia) unavailable in this context.', 'error');
      return false;
    }

    try {
      callbacks.onStatus('Requesting laptop webcam access...', 'info');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      this.stream = stream;
      videoEl.srcObject = stream;
      videoEl.classList.remove('hidden');
      await videoEl.play().catch(() => {});

      const model = await this.ensureHandLandmarker((msg) => callbacks.onStatus(msg, 'info'));
      if (model) {
        callbacks.onStatus('LIVE MediaPipe HandLandmarker active — point, pinch, ✌️ orbit, ✋ voice, ✊ reset.', 'accent');
      } else {
        callbacks.onStatus('MediaPipe model offline — Optical Motion Centroid tracker active on laptop camera.', 'info');
      }

      this.running = true;
      this.lastVideoTime = -1;
      this.prevOrbitCursor = null;
      this.wristHistory = [];

      const loop = () => {
        if (!this.running) return;
        this.processFrame(videoEl, canvasEl, callbacks);
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
      return true;
    } catch (err) {
      callbacks.onStatus(`Camera permission denied or unavailable: ${(err as Error)?.message || err}`, 'error');
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
    this.prevOrbitCursor = null;
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

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const w = canvasEl.width;
    const h = canvasEl.height;

    if (this.landmarker) {
      try {
        const results = this.landmarker.detectForVideo(videoEl, performance.now());
        const lms = results?.landmarks?.[0] as LandmarkPoint[] | undefined;

        ctx.clearRect(0, 0, w, h);
        this.drawOverlayGrid(ctx, w, h);

        if (lms && lms.length >= 21) {
          const classified = classifyHandLandmarks(lms, this.prevPinched, true);
          this.drawLiveLandmarks(ctx, w, h, lms, classified?.isPinched || false);

          if (classified) {
            let triggered: HandPoseType | 'swipe_left' | 'swipe_right' | null = null;
            let orbitDelta: { dx: number; dy: number } | undefined;

            // Pinch edge trigger
            if (classified.isPinched && !this.prevPinched && this.canFireAction('pinch_select', 700)) {
              triggered = 'pinch_select';
            }
            this.prevPinched = classified.isPinched;

            // Continuous two-finger smooth orbit
            if (classified.pose === 'two_finger_orbit') {
              if (this.prevOrbitCursor) {
                const dx = classified.cursorX - this.prevOrbitCursor.x;
                const dy = classified.cursorY - this.prevOrbitCursor.y;
                if (Math.hypot(dx, dy) > 0.004) {
                  orbitDelta = { dx, dy };
                }
              }
              this.prevOrbitCursor = { x: classified.cursorX, y: classified.cursorY };
            } else {
              this.prevOrbitCursor = null;
            }

            // Horizontal wrist swipe detector (Left / Right)
            const nowSec = performance.now() / 1000;
            const mirrorWristX = 1 - lms[0].x;
            this.wristHistory.push({ x: mirrorWristX, t: nowSec });
            this.wristHistory = this.wristHistory.filter((p) => nowSec - p.t <= 0.45);
            if (this.wristHistory.length >= 5) {
              const first = this.wristHistory[0];
              const last = this.wristHistory[this.wristHistory.length - 1];
              const dx = last.x - first.x;
              if (Math.abs(dx) > 0.28 && this.canFireAction('swipe', 900)) {
                triggered = dx > 0 ? 'swipe_right' : 'swipe_left';
                this.wristHistory = [];
              }
            }

            // Sustained hold poses (Open Palm -> Voice Toggle, Fist -> Reset, Thumbs -> Glow)
            if (this.poseHoldStarted.pose !== classified.pose) {
              this.poseHoldStarted = { pose: classified.pose, startedAt: performance.now() };
            } else if (!triggered && performance.now() - this.poseHoldStarted.startedAt >= 550) {
              if (classified.pose === 'open_palm' && this.canFireAction('open_palm', 2400)) {
                triggered = 'open_palm';
              } else if (classified.pose === 'fist_reset' && this.canFireAction('fist_reset', 1600)) {
                triggered = 'fist_reset';
              } else if (classified.pose === 'thumbs_up' && this.canFireAction('thumbs_up', 650)) {
                triggered = 'thumbs_up';
              } else if (classified.pose === 'thumbs_down' && this.canFireAction('thumbs_down', 650)) {
                triggered = 'thumbs_down';
              }
            }

            callbacks.onFrameLandmarks(lms, classified, triggered, orbitDelta);
            return;
          }
        }
        callbacks.onFrameLandmarks(null, null, null);
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
    this.drawOverlayGrid(ctx, w, h);

    if (count > 22) {
      const cx = sumX / count;
      const cy = sumY / count;
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx * w, cy * h, 14, 0, Math.PI * 2);
      ctx.stroke();
      callbacks.onFrameLandmarks(
        null,
        {
          cursorX: cx,
          cursorY: cy,
          palmScale: 0.2,
          pinchRatio: 0.6,
          isPinched: false,
          pose: 'pointer',
          poseLabel: 'Optical Motion',
          extendedFingers: { thumb: false, index: true, middle: false, ring: false, pinky: false },
        },
        null
      );
    }
  }

  private drawOverlayGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  private drawLiveLandmarks(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    landmarks: LandmarkPoint[],
    isPinched: boolean
  ): void {
    ctx.strokeStyle = isPinched ? '#f59e0b' : '#00e5ff';
    ctx.lineWidth = 2.2;
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
      ctx.fillStyle = isTip ? (isPinched ? '#f59e0b' : '#38bdf8') : '#fde68a';
      ctx.beginPath();
      ctx.arc((1 - pt.x) * w, pt.y * h, isTip ? 4.4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

export const barbiWebcamGestureEngine = new BarbiWebcamGestureEngine();
