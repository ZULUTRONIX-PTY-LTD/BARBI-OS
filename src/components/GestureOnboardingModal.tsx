import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Hand,
  Pause,
  Play,
  RotateCw,
  X,
} from 'lucide-react';
import {
  GESTURE_ONBOARDING_STEPS,
  HAND_SKELETON_CONNECTIONS,
  buildStylizedHandSkeleton,
  evaluateGestureAnimationFrame,
  getNextStepIndex,
  type AnimatedHandPose,
  type GestureAnimationFrame,
} from '../gesture/gestureOnboardingLogic';

export interface GestureOnboardingModalProps {
  isOpen: boolean;
  cameraActive: boolean;
  onClose: () => void;
  onEnableCamera: () => void;
}

function drawHandOnCanvas(
  ctx: CanvasRenderingContext2D,
  pose: AnimatedHandPose,
  originX: number,
  originY: number,
  stageW: number,
  stageH: number
) {
  const landmarks = buildStylizedHandSkeleton(pose);
  const pts = landmarks.map((lm) => ({
    x: originX + lm.x * stageW,
    y: originY + lm.y * stageH,
  }));

  // Swipe velocity chevrons behind the hand when waving
  if (Math.abs(pose.swipeVelocity) > 0.12) {
    const dir = pose.swipeVelocity > 0 ? 1 : -1;
    const mag = Math.min(1, Math.abs(pose.swipeVelocity));
    const cx = originX + pose.centerX * stageW;
    const cy = originY + pose.centerY * stageH - stageH * 0.06;

    ctx.save();
    for (let i = 0; i < 3; i += 1) {
      const trailOffset = -dir * (28 + i * 16);
      const alpha = (0.55 - i * 0.15) * mag;
      ctx.strokeStyle = `rgba(251, 191, 36, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + trailOffset - dir * 7, cy - 11);
      ctx.lineTo(cx + trailOffset, cy);
      ctx.lineTo(cx + trailOffset - dir * 7, cy + 11);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Soft ambient glow behind palm center
  const palm = pts[9];
  const glow = ctx.createRadialGradient(palm.x, palm.y, 4, palm.x, palm.y, stageH * 0.24);
  glow.addColorStop(0, pose.isPinchGlow ? 'rgba(251, 191, 36, 0.22)' : 'rgba(245, 158, 11, 0.12)');
  glow.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(palm.x, palm.y, stageH * 0.24, 0, Math.PI * 2);
  ctx.fill();

  // Skeleton bones
  ctx.save();
  ctx.strokeStyle = pose.isPinchGlow ? 'rgba(252, 211, 77, 0.92)' : 'rgba(245, 158, 11, 0.72)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const [a, b] of HAND_SKELETON_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
    ctx.stroke();
  }
  ctx.restore();

  // Joint landmark dots
  const tipIndices = new Set([4, 8, 12, 16, 20]);
  for (let i = 0; i < pts.length; i += 1) {
    const isTip = tipIndices.has(i);
    const isPinchTip = pose.isPinchGlow && (i === 4 || i === 8);
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, isPinchTip ? 4.2 : isTip ? 3.2 : 2.1, 0, Math.PI * 2);
    ctx.fillStyle = isPinchTip
      ? '#34d399'
      : isTip
        ? '#fde68a'
        : 'rgba(245, 158, 11, 0.88)';
    ctx.fill();
  }

  // Pinch contact halo between thumb tip (4) and index tip (8)
  if (pose.pinchAmount > 0.45) {
    const mx = (pts[4].x + pts[8].x) * 0.5;
    const my = (pts[4].y + pts[8].y) * 0.5;
    const r = 9 + (1 - pose.pinchAmount) * 10;
    ctx.save();
    ctx.strokeStyle = pose.isPinchGlow
      ? `rgba(52, 211, 153, ${(0.85 * pose.pinchAmount).toFixed(3)})`
      : `rgba(251, 191, 36, ${(0.7 * pose.pinchAmount).toFixed(3)})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Fist-hold progress ring
  if (pose.holdProgress > 0.02) {
    const r = Math.min(stageW, stageH) * 0.23;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = pose.holdProgress >= 0.98 ? '#34d399' : '#fbbf24';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(
      palm.x,
      palm.y,
      r,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * Math.min(1, pose.holdProgress)
    );
    ctx.stroke();
    ctx.restore();
  }
}

function drawCognitiveSpherePreview(
  ctx: CanvasRenderingContext2D,
  frame: GestureAnimationFrame,
  cx: number,
  cy: number,
  baseRadius: number
) {
  const { rotY, rotX, zoom, activeNodeIndex, selectedPulse, resetFlash } = frame.sphere;
  const radius = baseRadius * Math.max(0.68, Math.min(1.42, zoom));

  const project = (x: number, y: number, z: number) => {
    // Rotate around Y (yaw)
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x1 = x * cosY - z * sinY;
    const z1 = x * sinY + z * cosY;

    // Rotate around X (pitch)
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const y2 = y * cosX - z1 * sinX;
    const z2 = y * sinX + z1 * cosX;

    const perspective = 3.2 / (3.2 - z2 * 0.9);
    return {
      sx: cx + x1 * radius * perspective,
      sy: cy + y2 * radius * perspective,
      depth: z2,
      scale: perspective,
    };
  };

  // Ambient sphere core glow
  const coreGlow = ctx.createRadialGradient(cx, cy, 4, cx, cy, radius * 1.35);
  coreGlow.addColorStop(
    0,
    resetFlash > 0.1
      ? `rgba(52, 211, 153, ${(0.24 * resetFlash).toFixed(3)})`
      : 'rgba(245, 158, 11, 0.18)'
  );
  coreGlow.addColorStop(0.55, 'rgba(245, 158, 11, 0.05)');
  coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = coreGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2);
  ctx.fill();

  // Latitude rings
  const latitudes = [-0.55, 0, 0.55];
  for (const lat of latitudes) {
    const rLat = Math.sqrt(Math.max(0, 1 - lat * lat));
    ctx.beginPath();
    const segments = 44;
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const p = project(Math.cos(a) * rLat, lat, Math.sin(a) * rLat);
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    }
    ctx.strokeStyle =
      lat === 0 ? 'rgba(251, 191, 36, 0.42)' : 'rgba(245, 158, 11, 0.18)';
    ctx.lineWidth = lat === 0 ? 1.35 : 1;
    ctx.stroke();
  }

  // Meridian rings
  const meridians = 6;
  for (let m = 0; m < meridians; m += 1) {
    const phi = (m / meridians) * Math.PI;
    ctx.beginPath();
    const segments = 40;
    for (let i = 0; i <= segments; i += 1) {
      const theta = (i / segments) * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      const p = project(x, y, z);
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    }
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Outer silhouette hairline
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle =
    resetFlash > 0.15
      ? `rgba(52, 211, 153, ${(0.35 + resetFlash * 0.55).toFixed(3)})`
      : 'rgba(251, 191, 36, 0.34)';
  ctx.lineWidth = 1.25;
  ctx.stroke();

  // Reset pulse expanding wave
  if (resetFlash > 0.04) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (1 + (1 - resetFlash) * 0.42), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(52, 211, 153, ${(resetFlash * 0.7).toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // 6 Orbital Subsystem Nodes along the equatorial & tilted rings
  const nodeDefs = [
    { a: 0.2, y: 0.0, label: 'CHAT' },
    { a: 1.25, y: 0.15, label: 'REA' },
    { a: 2.3, y: -0.18, label: 'STUDIO' },
    { a: 3.35, y: 0.08, label: 'VAULT' },
    { a: 4.4, y: -0.12, label: 'NEXUS' },
    { a: 5.45, y: 0.04, label: 'CORE' },
  ];

  const projectedNodes = nodeDefs
    .map((n, idx) => {
      const rRing = Math.sqrt(Math.max(0.2, 1 - n.y * n.y));
      const p = project(Math.cos(n.a) * rRing, n.y, Math.sin(n.a) * rRing);
      return { ...p, idx, label: n.label };
    })
    .sort((a, b) => a.depth - b.depth);

  let lockedNodePos: { sx: number; sy: number } | null = null;
  for (const node of projectedNodes) {
    const isActive = node.idx === activeNodeIndex;
    const alpha = Math.max(0.32, Math.min(1, 0.58 + node.depth * 0.42));
    const dotR = (isActive ? 5.2 : 3.2) * node.scale;

    if (isActive) {
      lockedNodePos = { sx: node.sx, sy: node.sy };
      ctx.beginPath();
      ctx.arc(node.sx, node.sy, dotR + 6, 0, Math.PI * 2);
      ctx.fillStyle =
        selectedPulse > 0.1
          ? `rgba(52, 211, 153, ${(0.28 + selectedPulse * 0.32).toFixed(3)})`
          : 'rgba(251, 191, 36, 0.22)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(node.sx, node.sy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = isActive
      ? selectedPulse > 0.1
        ? '#34d399'
        : '#fde68a'
      : `rgba(245, 158, 11, ${alpha.toFixed(3)})`;
    ctx.fill();
  }

  // Aiming / Selection reticle for quick-pinch step
  if (frame.reticle.visible) {
    const rx =
      frame.reticle.locked && lockedNodePos
        ? lockedNodePos.sx
        : cx + frame.reticle.x * radius;
    const ry =
      frame.reticle.locked && lockedNodePos
        ? lockedNodePos.sy
        : cy + frame.reticle.y * radius;

    ctx.save();
    const ringColor =
      frame.reticle.pulse > 0.1
        ? '#34d399'
        : frame.reticle.locked
          ? '#fde68a'
          : 'rgba(251, 191, 36, 0.8)';
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(rx, ry, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair ticks
    const tick = 4;
    ctx.beginPath();
    ctx.moveTo(rx - 16, ry);
    ctx.lineTo(rx - 16 + tick, ry);
    ctx.moveTo(rx + 16 - tick, ry);
    ctx.lineTo(rx + 16, ry);
    ctx.moveTo(rx, ry - 16);
    ctx.lineTo(rx, ry - 16 + tick);
    ctx.moveTo(rx, ry + 16 - tick);
    ctx.lineTo(rx, ry + 16);
    ctx.stroke();

    // Selection confirmation ripple
    if (frame.reticle.pulse > 0.02) {
      const expand = 12 + (1 - frame.reticle.pulse) * 26;
      ctx.strokeStyle = `rgba(52, 211, 153, ${(frame.reticle.pulse * 0.9).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, expand, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Subtle core nucleus dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = '#fbbf24';
  ctx.fill();
}

export function GestureOnboardingModal({
  isOpen,
  cameraActive,
  onClose,
  onEnableCamera,
}: GestureOnboardingModalProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef(0);
  const stepIndexRef = useRef(0);
  const isPlayingRef = useRef(true);
  const autoAdvanceRef = useRef(false);
  const lastPhaseRef = useRef('');

  const currentStep = GESTURE_ONBOARDING_STEPS[stepIndex] ?? GESTURE_ONBOARDING_STEPS[0];

  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    autoAdvanceRef.current = autoAdvance;
  }, [autoAdvance]);

  const selectStep = useCallback((idx: number) => {
    setStepIndex(idx);
    stepIndexRef.current = idx;
    progressRef.current = 0;
    setProgress(0);
  }, []);

  const stepBy = useCallback((dir: -1 | 1) => {
    const next = getNextStepIndex(stepIndexRef.current, dir);
    selectStep(next);
  }, [selectStep]);

  // Reset to step 0 when opened fresh
  useEffect(() => {
    if (isOpen) {
      progressRef.current = 0;
      setProgress(0);
      setIsPlaying(true);
      isPlayingRef.current = true;
    }
  }, [isOpen]);

  // Keyboard navigation while modal is open
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepBy(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBy(-1);
      } else if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, stepBy]);

  // Real-time 60fps interactive demonstration renderer
  useEffect(() => {
    if (!isOpen) return;

    let rafId = 0;
    let lastTs = performance.now();
    let uiSyncAccum = 0;

    const renderFrame = (now: number) => {
      const dt = Math.min(80, Math.max(0, now - lastTs));
      lastTs = now;

      const activeStep =
        GESTURE_ONBOARDING_STEPS[stepIndexRef.current] ?? GESTURE_ONBOARDING_STEPS[0];

      if (isPlayingRef.current) {
        let nextP = progressRef.current + dt / activeStep.durationMs;
        if (nextP >= 1) {
          if (autoAdvanceRef.current) {
            const nextIdx = getNextStepIndex(stepIndexRef.current, 1);
            stepIndexRef.current = nextIdx;
            setStepIndex(nextIdx);
          }
          nextP = nextP % 1;
        }
        progressRef.current = nextP;
      }

      const stepForDraw =
        GESTURE_ONBOARDING_STEPS[stepIndexRef.current] ?? GESTURE_ONBOARDING_STEPS[0];
      const frame = evaluateGestureAnimationFrame(stepForDraw.id, progressRef.current);

      uiSyncAccum += dt;
      if (uiSyncAccum >= 65 || frame.phaseLabel !== lastPhaseRef.current) {
        uiSyncAccum = 0;
        setProgress(progressRef.current);
        if (frame.phaseLabel !== lastPhaseRef.current) {
          lastPhaseRef.current = frame.phaseLabel;
          setPhaseLabel(frame.phaseLabel);
        }
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(320, Math.round(rect.width));
        const h = Math.max(180, Math.round(rect.height));

        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);

          // Obsidian spatial stage background
          const bg = ctx.createLinearGradient(0, 0, w, h);
          bg.addColorStop(0, '#0c0805');
          bg.addColorStop(0.5, '#090603');
          bg.addColorStop(1, '#0e0905');
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, w, h);

          // Subtle technical coordinate grid
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.05)';
          ctx.lineWidth = 1;
          const stepPx = 28;
          for (let gx = stepPx; gx < w; gx += stepPx) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
          }
          for (let gy = stepPx; gy < h; gy += stepPx) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
          }

          // Vertical divider between Hand Tracking & 3D Sphere Response
          const midX = w * 0.5;
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.14)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(midX, 18);
          ctx.lineTo(midX, h - 18);
          ctx.stroke();
          ctx.setLineDash([]);

          // Zone captions
          ctx.font = '600 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = 'rgba(251, 191, 36, 0.62)';
          ctx.textAlign = 'left';
          ctx.fillText('HAND GESTURE', 14, 20);
          ctx.textAlign = 'right';
          ctx.fillText('3D SPHERE RESPONSE', w - 14, 20);

          // Caliper line for 2-hand zoom gesture
          if (frame.caliper.visible) {
            const lx = frame.caliper.leftX * midX;
            const rx = frame.caliper.rightX * midX;
            const cy = frame.caliper.y * h;
            ctx.save();
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.72)';
            ctx.lineWidth = 1.4;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(lx + 10, cy);
            ctx.lineTo(rx - 10, cy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
            ctx.fillStyle = '#34d399';
            ctx.textAlign = 'center';
            ctx.fillText(frame.caliper.zoomLabel, (lx + rx) * 0.5, cy - 8);
            ctx.restore();
          }

          // Draw animated hand skeleton(s) in left half
          for (const hand of frame.hands) {
            drawHandOnCanvas(ctx, hand, 0, 8, midX, h - 16);
          }

          // Directional flow indicator on divider
          ctx.save();
          ctx.fillStyle = 'rgba(10, 7, 4, 0.92)';
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(midX, h * 0.5, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(midX - 3, h * 0.5 - 3.5);
          ctx.lineTo(midX + 2.5, h * 0.5);
          ctx.lineTo(midX - 3, h * 0.5 + 3.5);
          ctx.stroke();
          ctx.restore();

          // Draw synchronized 3D cognitive sphere in right half
          const sphereCx = midX + (w - midX) * 0.52;
          const sphereCy = h * 0.51;
          const sphereBaseR = Math.min(w - midX, h) * (w < 420 ? 0.27 : 0.31);
          drawCognitiveSpherePreview(ctx, frame, sphereCx, sphereCy, sphereBaseR);

          // Live zoom readout badge in bottom-right of sphere zone
          ctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = 'rgba(214, 211, 209, 0.72)';
          ctx.textAlign = 'right';
          ctx.fillText(`ZOOM ${frame.sphere.zoom.toFixed(1)}x`, w - 14, h - 12);

          ctx.restore();
        }
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, [isOpen]);

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    progressRef.current = ratio;
    setProgress(ratio);
  };

  if (!isOpen) return null;

  return (
    <div
      id="gesture-onboarding-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gesture-onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[620px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-[#0a0704]/96 border border-amber-500/35 shadow-[0_28px_84px_rgba(0,0,0,0.92)] text-stone-100">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-amber-300 shrink-0">
              <Hand className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="gesture-onboarding-title"
                className="text-sm font-semibold tracking-wide text-amber-50 truncate"
              >
                3D Hand-Gesture Guide
              </h2>
              <p className="text-[11px] text-stone-400 truncate">
                Interactive MediaPipe sphere controls
              </p>
            </div>
          </div>

          <button
            id="btn-onboarding-close"
            type="button"
            onClick={onClose}
            aria-label="Close gesture guide"
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Dual-Zone Animation Stage */}
        <div className="px-5 pt-4">
          <div className="relative rounded-xl overflow-hidden border border-amber-500/25 bg-black">
            <canvas
              ref={canvasRef}
              id="gesture-onboarding-canvas"
              className="w-full h-[228px] sm:h-[252px] block"
              aria-label={`Animated demonstration of ${currentStep.title} to ${currentStep.action}`}
            />

            {/* Bottom Stage Playback & Interactive Timeline Overlay */}
            <div className="flex items-center gap-2.5 px-3 py-2 bg-[#090603]/90 border-t border-white/[0.07]">
              <button
                id="btn-onboarding-play-pause"
                type="button"
                onClick={() => setIsPlaying((prev) => !prev)}
                aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
                className="p-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] text-amber-200 transition-colors cursor-pointer shrink-0"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono-tech">
                  <span id="gesture-onboarding-phase" className="text-amber-200 truncate">
                    {phaseLabel || currentStep.action}
                  </span>
                  <span className="text-stone-400 tabular-nums shrink-0">
                    {stepIndex + 1} / {GESTURE_ONBOARDING_STEPS.length}
                  </span>
                </div>
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Scrub gesture animation timeline"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                  onClick={handleScrub}
                  className="h-1.5 w-full rounded-full bg-white/[0.1] overflow-hidden cursor-pointer"
                >
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-75"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>

              <button
                id="btn-onboarding-tour"
                type="button"
                onClick={() => setAutoAdvance((prev) => !prev)}
                aria-pressed={autoAdvance}
                title="Automatically cycle through all 6 gestures"
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-mono-tech border transition-colors cursor-pointer shrink-0 ${
                  autoAdvance
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                    : 'bg-white/[0.04] border-white/[0.1] text-stone-400 hover:text-stone-200'
                }`}
              >
                <RotateCw className="w-3 h-3" />
                <span>Auto</span>
              </button>
            </div>
          </div>
        </div>

        {/* Selectable Gesture Strip */}
        <div className="px-5 pt-3.5">
          <div
            role="tablist"
            aria-label="Supported hand gestures"
            className="grid grid-cols-3 sm:grid-cols-6 gap-1.5"
          >
            {GESTURE_ONBOARDING_STEPS.map((step, idx) => {
              const active = idx === stepIndex;
              return (
                <button
                  key={step.id}
                  id={`btn-onboarding-step-${step.id}`}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => selectStep(idx)}
                  className={`px-2 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-amber-500/18 border-amber-400/55 text-amber-100 shadow-[0_0_16px_rgba(245,158,11,0.14)]'
                      : 'bg-white/[0.03] border-white/[0.08] text-stone-400 hover:text-stone-200 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="text-[9.5px] font-mono-tech text-amber-400/80">
                    0{idx + 1}
                  </div>
                  <div className="text-[11px] font-medium truncate">{step.shortLabel}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Focused Instruction & Tip */}
        <div className="px-5 py-3.5">
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3 className="text-sm font-semibold text-white">{currentStep.title}</h3>
            <span className="text-[11px] font-mono-tech text-amber-300 uppercase tracking-wider">
              {currentStep.action}
            </span>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed">{currentStep.instruction}</p>
          <p className="mt-1.5 text-[11px] text-stone-400 leading-snug">
            <span className="text-amber-300/90 font-medium">Tip:</span> {currentStep.tip}
          </p>
        </div>

        {/* Footer Controls */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-t border-white/[0.08] bg-black/35">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="btn-onboarding-prev"
              type="button"
              onClick={() => stepBy(-1)}
              aria-label="Previous gesture"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs text-stone-200 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prev</span>
            </button>
            <button
              id="btn-onboarding-next"
              type="button"
              onClick={() => stepBy(1)}
              aria-label="Next gesture"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-xs text-stone-200 transition-colors cursor-pointer"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-onboarding-skip"
              type="button"
              onClick={onClose}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-stone-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              {cameraActive ? 'Close' : 'Skip'}
            </button>
            {!cameraActive && (
              <button
                id="btn-onboarding-enable-camera"
                type="button"
                onClick={onEnableCamera}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span>Enable Camera</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
