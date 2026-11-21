import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  Hand,
  HelpCircle,
  Pause,
  Play,
  PlayCircle,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { barbiWebcamGestureEngine } from '../gesture/webcamGestureEngine';
import { GESTURE_GUIDE_ITEMS } from '../gesture/gestureNavigation';
import { markOnboardingSeen, readOnboardingSeen } from '../gesture/gestureOnboardingLogic';
import { GestureOnboardingModal } from './GestureOnboardingModal';

export interface BarbiSphereNavBridge {
  orbit: (dRotY: number, dRotX: number) => void;
  zoomBy: (deltaZoom: number) => number;
  resetView: () => void;
  hoverAt: (normX: number, normY: number, isPinched?: boolean, label?: string) => string | null;
  selectHovered: () => string | null;
  cycleRing: (dir: -1 | 1) => string | null;
  hideReticle: () => void;
  setHudStatus: (label: string) => void;
  getCameraState: () => { rotX: number; rotY: number; zoom: number; hoveredNodeId: string | null };
  openCalibrationModal: () => void;
}

declare global {
  interface Window {
    __barbiSphereNav?: BarbiSphereNavBridge;
    __gestureNavOpen?: boolean;
  }
}

export function GestureNavHud() {
  const [isOpen, setIsOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [statusText, setStatusText] = useState('Ready — enable camera for MediaPipe hand tracking');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [poseLabel, setPoseLabel] = useState('Standby');
  const [handCount, setHandCount] = useState(0);
  const [zoomReadout, setZoomReadout] = useState('1.0x');
  const [engineLabel, setEngineLabel] = useState<'MediaPipe' | 'Optical'>('MediaPipe');
  const [lastActionFeedback, setLastActionFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPausedRef = useRef(false);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const flashAction = useCallback((label: string) => {
    setLastActionFeedback(label);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setLastActionFeedback(null);
    }, 1500);
  }, []);

  const stopCamera = useCallback(() => {
    barbiWebcamGestureEngine.stop(videoRef.current);
    setCameraActive(false);
    setIsStarting(false);
    setIsPaused(false);
    setHandCount(0);
    setPoseLabel('Standby');
    setStatusText('Camera stopped');
    window.__barbiSphereNav?.hideReticle();
    window.__barbiSphereNav?.setHudStatus('READY');
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (isStarting || cameraActive) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setErrorText(null);
    setIsStarting(true);
    setStatusText('Starting MediaPipe HandLandmarker...');

    const started = await barbiWebcamGestureEngine.start(video, canvas, {
      onStatus: (msg, tone) => {
        setStatusText(msg);
        if (tone === 'error') {
          setErrorText(msg);
        }
        setEngineLabel(barbiWebcamGestureEngine.getMode() === 'mediapipe' ? 'MediaPipe' : 'Optical');
      },
      onFrameLandmarks: (_lms, classified, triggerAction, orbitDelta, extra) => {
        if (isPausedRef.current) return;

        const hands = extra?.handCount ?? (classified ? 1 : 0);
        setHandCount(hands);
        if (extra?.engineMode) {
          setEngineLabel(extra.engineMode === 'mediapipe' ? 'MediaPipe' : 'Optical');
        }

        const nav = window.__barbiSphereNav;
        if (!nav) return;

        if (!classified) {
          setPoseLabel(hands === 0 ? 'Show hand to navigate' : 'Tracking...');
          return;
        }

        let displayPose = classified.poseLabel;
        if (extra?.zoomDelta && hands >= 2) {
          displayPose = extra.zoomDelta > 0 ? '2-Hand Zoom In' : '2-Hand Zoom Out';
        } else if (extra?.isGrabbingOrbit && classified.isPinched) {
          displayPose = 'Pinch & Orbit';
        } else if (extra?.isGrabbingOrbit) {
          displayPose = 'Two-Finger Orbit';
        }
        setPoseLabel(displayPose);

        // Update 3D spatial reticle & hovered node
        nav.hoverAt(classified.cursorX, classified.cursorY, classified.isPinched, displayPose);

        // Smooth 3D sphere orbit from pinch-drag or two-finger movement
        if (orbitDelta) {
          nav.orbit(orbitDelta.dx * 4.4, orbitDelta.dy * 3.1);
        }

        // Smooth 3D sphere zoom from 2-hand spread/pinch or thumbs up/down
        if (typeof extra?.zoomDelta === 'number' && extra.zoomDelta !== 0) {
          const nextZoom = nav.zoomBy(extra.zoomDelta);
          setZoomReadout(`${nextZoom.toFixed(1)}x`);
        } else {
          const cam = nav.getCameraState();
          setZoomReadout(`${cam.zoom.toFixed(1)}x`);
        }

        // Discrete gesture actions
        if (triggerAction === 'pinch_select') {
          const selected = nav.selectHovered();
          flashAction(selected ? `Selected ${selected}` : 'Node selected');
        } else if (triggerAction === 'swipe_left') {
          const next = nav.cycleRing(-1);
          flashAction(next ? `Ring ← ${next}` : 'Swipe Left');
        } else if (triggerAction === 'swipe_right') {
          const next = nav.cycleRing(1);
          flashAction(next ? `Ring → ${next}` : 'Swipe Right');
        } else if (triggerAction === 'fist_reset') {
          nav.resetView();
          setZoomReadout('1.0x');
          flashAction('Camera Reset');
        }
      },
    });

    setIsStarting(false);
    setCameraActive(started);
    if (started) {
      setShowGuide(false);
      window.__barbiSphereNav?.setHudStatus('LIVE');
    } else {
      window.__barbiSphereNav?.setHudStatus('READY');
    }
  }, [cameraActive, flashAction, isStarting]);

  // Listen for toggle events from the top-bar Gesture D3 button
  useEffect(() => {
    const onToggle = (ev: Event) => {
      const custom = ev as CustomEvent<{ open?: boolean; autoStart?: boolean }>;
      setIsOpen((prev) => {
        const next = typeof custom.detail?.open === 'boolean' ? custom.detail.open : !prev;
        window.__gestureNavOpen = next;
        if (next && !prev && !readOnboardingSeen()) {
          setShowOnboarding(true);
        }
        if (!next) {
          setShowOnboarding(false);
          barbiWebcamGestureEngine.stop(videoRef.current);
          setCameraActive(false);
          setIsStarting(false);
          window.__barbiSphereNav?.hideReticle();
          window.__barbiSphereNav?.setHudStatus('READY');
        }
        return next;
      });
    };
    const onOpenOnboarding = () => {
      setIsOpen(true);
      window.__gestureNavOpen = true;
      setShowOnboarding(true);
    };
    window.addEventListener('barbi:toggle-gesture-nav', onToggle);
    window.addEventListener('barbi:open-gesture-onboarding', onOpenOnboarding);
    return () => {
      window.removeEventListener('barbi:toggle-gesture-nav', onToggle);
      window.removeEventListener('barbi:open-gesture-onboarding', onOpenOnboarding);
    };
  }, []);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      barbiWebcamGestureEngine.stop(videoRef.current);
      window.__barbiSphereNav?.hideReticle();
    };
  }, []);

  const handleClose = () => {
    stopCamera();
    setShowOnboarding(false);
    setIsOpen(false);
    window.__gestureNavOpen = false;
  };

  const handleCloseOnboarding = useCallback(() => {
    markOnboardingSeen(true);
    setShowOnboarding(false);
  }, []);

  const handleOnboardingEnableCamera = useCallback(() => {
    markOnboardingSeen(true);
    setShowOnboarding(false);
    void startCamera();
  }, [startCamera]);

  const handleTogglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      window.__barbiSphereNav?.setHudStatus(next ? 'PAUSED' : 'LIVE');
      if (next) {
        window.__barbiSphereNav?.hideReticle();
      }
      return next;
    });
  };

  const handleResetView = () => {
    window.__barbiSphereNav?.resetView();
    setZoomReadout('1.0x');
    flashAction('Camera Reset');
  };

  if (!isOpen) return null;

  return (
    <>
    <aside
      id="mediapipe-gesture-hud"
      aria-label="MediaPipe Hand-Gesture 3D Navigation"
      className="fixed bottom-4 left-4 z-40 w-[min(calc(100vw-2rem),284px)] rounded-2xl overflow-hidden bg-[#090603]/92 backdrop-blur-2xl border border-amber-500/35 shadow-[0_20px_56px_rgba(0,0,0,0.88)] text-stone-100 select-none pointer-events-auto"
    >
      {/* Minimalist Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0">
          <Hand className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="text-[11.5px] font-semibold tracking-wide text-amber-50 truncate">
            Hand Navigation
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              cameraActive
                ? isPaused
                  ? 'bg-amber-400'
                  : 'bg-emerald-400 animate-pulse'
                : 'bg-stone-500'
            }`}
            title={cameraActive ? (isPaused ? 'Paused' : `${engineLabel} Live`) : 'Standby'}
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            id="btn-gesture-onboarding"
            type="button"
            onClick={() => setShowOnboarding(true)}
            title="Watch interactive gesture demo"
            aria-label="Watch interactive gesture demo"
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              showOnboarding
                ? 'bg-amber-500/20 text-amber-200'
                : 'text-amber-300/85 hover:text-amber-100 hover:bg-white/[0.08]'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
          </button>

          <button
            id="btn-gesture-guide-toggle"
            type="button"
            onClick={() => setShowGuide((prev) => !prev)}
            aria-pressed={showGuide}
            title="Toggle gesture guide"
            aria-label="Toggle gesture guide"
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              showGuide
                ? 'bg-amber-500/20 text-amber-200'
                : 'text-stone-400 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => window.__barbiSphereNav?.openCalibrationModal()}
            title="Open gesture simulator & calibration"
            aria-label="Open gesture simulator & calibration"
            className="p-1 rounded-md text-stone-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          <button
            id="btn-gesture-hud-close"
            type="button"
            onClick={handleClose}
            aria-label="Close hand navigation"
            className="p-1 rounded-md text-stone-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mirrored Camera + MediaPipe 21-Landmark Skeleton Viewport */}
      <div className="relative w-full aspect-[4/3] bg-black/80 overflow-hidden border-b border-white/[0.07]">
        <video
          ref={videoRef}
          id="mediapipe-pip-video"
          autoPlay
          playsInline
          muted
          className="hidden absolute inset-0 w-full h-full object-cover opacity-65 scale-x-[-1]"
        />
        <canvas
          ref={canvasRef}
          id="mediapipe-pip-canvas"
          width={320}
          height={240}
          className="relative z-10 w-full h-full block"
        />

        {/* Standby Overlay when camera is off */}
        {!cameraActive && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-4 text-center bg-black/55">
            <div className="w-10 h-10 rounded-xl bg-amber-500/14 border border-amber-400/35 flex items-center justify-center text-amber-300 mb-2.5">
              <Camera className="w-5 h-5" />
            </div>
            <p className="text-[11px] text-stone-300 leading-snug mb-3">
              Steer the 3D cognitive sphere with MediaPipe hand tracking.
            </p>
            <div className="flex items-center gap-2">
              <button
                id="btn-gesture-enable-camera"
                type="button"
                disabled={isStarting}
                onClick={() => void startCamera()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isStarting ? 'Starting...' : 'Enable Camera'}</span>
              </button>
              <button
                id="btn-gesture-standby-demo"
                type="button"
                onClick={() => setShowOnboarding(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.14] text-[11px] text-amber-100 transition-colors cursor-pointer"
              >
                <PlayCircle className="w-3.5 h-3.5 text-amber-300" />
                <span>Demo</span>
              </button>
            </div>
          </div>
        )}

        {/* Top-Right Compact Telemetry Pill when Live */}
        {cameraActive && (
          <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between text-[10px] font-mono-tech pointer-events-none">
            <span className="px-1.5 py-0.5 rounded bg-black/70 border border-amber-500/30 text-amber-200">
              {engineLabel} · {handCount} {handCount === 1 ? 'hand' : 'hands'}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-black/70 border border-white/15 text-stone-200 tabular-nums">
              {zoomReadout}
            </span>
          </div>
        )}

        {/* Live Pose & Action Feedback Strip */}
        {cameraActive && (
          <div className="absolute bottom-2 left-2 right-2 z-20 flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-black/75 border border-white/10 text-[10.5px] font-mono-tech pointer-events-none">
            <span className="text-amber-200 truncate">
              {isPaused ? 'Tracking paused' : poseLabel}
            </span>
            {lastActionFeedback && (
              <span className="text-emerald-300 font-semibold shrink-0">{lastActionFeedback}</span>
            )}
          </div>
        )}
      </div>

      {/* Error Message Banner */}
      {errorText && (
        <div
          role="alert"
          className="flex items-start gap-2 px-3 py-2 bg-red-950/50 border-b border-red-500/30 text-[11px] text-red-100 leading-snug"
        >
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <span className="flex-1">{errorText}</span>
        </div>
      )}

      {/* Collapsible Basic Hand-Gesture Navigation Guide */}
      {showGuide && (
        <div className="px-3 py-2.5 border-b border-white/[0.07] space-y-1.5 bg-black/30">
          <div className="text-[10px] font-mono-tech uppercase tracking-wider text-amber-300/80">
            3D Sphere Hand Gestures
          </div>
          <div className="space-y-1">
            {GESTURE_GUIDE_ITEMS.map((item) => (
              <div
                key={item.id}
                className="flex items-baseline justify-between gap-2 text-[11px] leading-tight"
                title={item.hint}
              >
                <span className="text-stone-200 font-medium">{item.gesture}</span>
                <span className="text-stone-400 font-mono-tech text-[10px] text-right">
                  {item.action}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compact Action Footer */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/40">
        {cameraActive ? (
          <>
            <div className="flex items-center gap-1.5">
              <button
                id="btn-gesture-pause"
                type="button"
                onClick={handleTogglePause}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[11px] text-stone-200 transition-colors cursor-pointer"
              >
                {isPaused ? <Play className="w-3 h-3 text-emerald-400" /> : <Pause className="w-3 h-3 text-amber-300" />}
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>

              <button
                id="btn-gesture-reset-view"
                type="button"
                onClick={handleResetView}
                title="Reset 3D sphere view"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-[11px] text-stone-300 hover:text-white transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            <button
              id="btn-gesture-stop-camera"
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-[11px] text-red-100 transition-colors cursor-pointer"
            >
              <CameraOff className="w-3 h-3" />
              <span>Stop</span>
            </button>
          </>
        ) : (
          <div className="w-full flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono-tech text-stone-400 truncate" title={statusText}>
              {statusText}
            </span>
            <button
              type="button"
              onClick={handleResetView}
              className="text-[10.5px] font-mono-tech text-amber-300 hover:text-amber-100 shrink-0 cursor-pointer"
            >
              Reset View
            </button>
          </div>
        )}
      </div>
    </aside>

    <GestureOnboardingModal
      isOpen={showOnboarding}
      cameraActive={cameraActive}
      onClose={handleCloseOnboarding}
      onEnableCamera={handleOnboardingEnableCamera}
    />
    </>
  );
}
