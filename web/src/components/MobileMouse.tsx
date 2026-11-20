import React, { useRef, useState, useEffect } from 'react';
import { Volume2, Volume1, VolumeX } from 'lucide-react';

// SENSITIVITY CONSTANT: Tweak here for laptop-grade cursor control
const SENSITIVITY = 1.35;

interface MobileMouseProps {
  onMouseMove: (dx: number, dy: number) => void;
  onMouseClick: (button: 'left' | 'right') => void;
  onMouseDown: (button: 'left' | 'right') => void;
  onMouseUp: (button: 'left' | 'right') => void;
  onMouseScroll: (dy: number) => void;
  onKeyPress: (key: string) => void;
}

interface PointerData {
  id: number;
  zone: 'upper' | 'btn-left' | 'btn-right';
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  lastClientX: number;
  lastClientY: number;
  startTime: number;
  totalDistance: number;
  hasMoved: boolean;
  active: boolean;
  alpha: number;
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
  pointerId: number;
}

export const MobileMouse: React.FC<MobileMouseProps> = ({
  onMouseMove,
  onMouseClick,
  onMouseDown,
  onMouseUp,
  onMouseScroll,
  onKeyPress
}) => {
  const padRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [leftPressed, setLeftPressed] = useState(false);
  const [rightPressed, setRightPressed] = useState(false);
  const [volFeedback, setVolFeedback] = useState<string>('');

  const triggerVol = (key: string, label: string) => {
    onKeyPress(key);
    setVolFeedback(label);
    setTimeout(() => setVolFeedback(''), 700);
  };

  // Active pointers map: pointerId -> PointerData
  const pointersRef = useRef<Map<number, PointerData>>(new Map());

  // Glowing footprint trails array
  const trailsRef = useRef<TrailPoint[]>([]);

  // RAF motion accumulator
  const pendingDxRef = useRef<number>(0);
  const pendingDyRef = useRef<number>(0);
  const remainderXRef = useRef<number>(0);
  const remainderYRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  // Scroll tracking for 2-finger gesture
  const lastTwoFingerAvgYRef = useRef<number | null>(null);

  // Tap tracking
  const lastTapTimeRef = useRef<number>(0);

  const addTrailPoint = (clientX: number, clientY: number, pointerId: number) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    trailsRef.current.push({ x, y, alpha: 1.0, pointerId });
    if (trailsRef.current.length > 120) {
      trailsRef.current.shift();
    }
  };

  // Canvas drawing & touch footprint line animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const pad = padRef.current;
    if (!canvas || !pad) return;

    let animId: number;

    const resize = () => {
      if (pad && canvas) {
        const rect = pad.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const renderLoop = () => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Group trails by pointerId
        const trailsByPointer: { [id: number]: TrailPoint[] } = {};
        for (const p of trailsRef.current) {
          if (!trailsByPointer[p.pointerId]) trailsByPointer[p.pointerId] = [];
          trailsByPointer[p.pointerId].push(p);
        }

        // 1. Draw glowing footprint lines for each finger
        Object.values(trailsByPointer).forEach((trails) => {
          if (trails.length > 1) {
            for (let i = 1; i < trails.length; i++) {
              const p1 = trails[i - 1];
              const p2 = trails[i];
              const avgAlpha = (p1.alpha + p2.alpha) / 2;

              if (avgAlpha > 0.02) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(56, 189, 248, ${avgAlpha * 0.95})`;
                ctx.lineWidth = 4 * avgAlpha;
                ctx.lineCap = 'round';
                ctx.shadowColor = '#38bdf8';
                ctx.shadowBlur = 10 * avgAlpha;
                ctx.stroke();
                ctx.restore();
              }
            }
          }

          // 2. Draw glowing touch circle at current pointer position
          if (trails.length > 0) {
            const head = trails[trails.length - 1];
            if (head.alpha > 0.04) {
              ctx.save();
              ctx.shadowColor = '#38bdf8';
              ctx.shadowBlur = 14 * head.alpha;

              // Outer translucent glow ring
              ctx.beginPath();
              ctx.arc(head.x, head.y, 14, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(56, 189, 248, ${0.28 * head.alpha})`;
              ctx.fill();

              // Inner bright core
              ctx.beginPath();
              ctx.arc(head.x, head.y, 6, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(56, 189, 248, ${0.9 * head.alpha})`;
              ctx.fill();
              ctx.restore();
            }
          }
        });

        // Decay trail alphas smoothly
        for (let i = 0; i < trailsRef.current.length; i++) {
          trailsRef.current[i].alpha *= 0.88;
        }
        trailsRef.current = trailsRef.current.filter((p) => p.alpha > 0.02);
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  // Flush batched mouse moves via requestAnimationFrame
  const scheduleMoveFlush = () => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      const totalX = pendingDxRef.current + remainderXRef.current;
      const totalY = pendingDyRef.current + remainderYRef.current;

      const sendX = Math.round(totalX);
      const sendY = Math.round(totalY);

      remainderXRef.current = totalX - sendX;
      remainderYRef.current = totalY - sendY;

      pendingDxRef.current = 0;
      pendingDyRef.current = 0;
      rafIdRef.current = null;

      if (sendX !== 0 || sendY !== 0) {
        onMouseMove(sendX, sendY);
      }
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!padRef.current) return;

    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    const rect = padRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    addTrailPoint(e.clientX, e.clientY, e.pointerId);

    const isLowerZone = y >= rect.height * 0.65;
    let zone: 'upper' | 'btn-left' | 'btn-right' = 'upper';

    if (isLowerZone) {
      if (x < rect.width * 0.5) {
        zone = 'btn-left';
        setLeftPressed(true);
        onMouseDown('left');
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch {}
        }
      } else {
        zone = 'btn-right';
        setRightPressed(true);
        onMouseDown('right');
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(10); } catch {}
        }
      }
    }

    pointersRef.current.set(e.pointerId, {
      id: e.pointerId,
      zone,
      x,
      y,
      clientX: e.clientX,
      clientY: e.clientY,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      startTime: performance.now(),
      totalDistance: 0,
      hasMoved: false,
      active: true,
      alpha: 1.0
    });

    // Check if 2 pointers are in upper zone for scrolling start
    const upperPointers = Array.from(pointersRef.current.values()).filter(p => p.active && p.zone === 'upper');
    if (upperPointers.length === 2) {
      lastTwoFingerAvgYRef.current = (upperPointers[0].clientY + upperPointers[1].clientY) / 2;
    } else {
      lastTwoFingerAvgYRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const p = pointersRef.current.get(e.pointerId);
    if (!p || !p.active || !padRef.current) return;

    const rect = padRef.current.getBoundingClientRect();
    p.x = e.clientX - rect.left;
    p.y = e.clientY - rect.top;

    // Process coalesced events for highest accuracy
    // @ts-ignore
    const events: PointerEvent[] = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e.nativeEvent];

    // Add trail points for footprint line
    for (const ev of events) {
      addTrailPoint(ev.clientX, ev.clientY, e.pointerId);
    }

    // If pointer is in upper movement zone
    if (p.zone === 'upper') {
      const upperPointers = Array.from(pointersRef.current.values()).filter(it => it.active && it.zone === 'upper');

      // Two-finger scroll
      if (upperPointers.length === 2) {
        p.clientX = e.clientX;
        p.clientY = e.clientY;
        const currentAvgY = (upperPointers[0].clientY + upperPointers[1].clientY) / 2;
        if (lastTwoFingerAvgYRef.current !== null) {
          const deltaY = (currentAvgY - lastTwoFingerAvgYRef.current) * 1.6;
          onMouseScroll(deltaY);
        }
        lastTwoFingerAvgYRef.current = currentAvgY;
        return;
      }

      // Single finger cursor movement
      if (upperPointers.length === 1) {
        // First move after pointerdown must have delta 0 (no jumping)
        if (!p.hasMoved) {
          p.hasMoved = true;
          p.lastClientX = e.clientX;
          p.lastClientY = e.clientY;
          p.clientX = e.clientX;
          p.clientY = e.clientY;
          return;
        }

        for (const ev of events) {
          const rawDx = ev.clientX - p.lastClientX;
          const rawDy = ev.clientY - p.lastClientY;
          p.lastClientX = ev.clientX;
          p.lastClientY = ev.clientY;

          const dist = Math.hypot(rawDx, rawDy);
          p.totalDistance += dist;

          if (dist === 0) continue;

          // Light acceleration curve
          const accel = Math.min(2.5, Math.max(1.0, 1.0 + (dist - 1.2) * 0.12));

          pendingDxRef.current += rawDx * SENSITIVITY * accel;
          pendingDyRef.current += rawDy * SENSITIVITY * accel;
        }

        p.clientX = e.clientX;
        p.clientY = e.clientY;
        scheduleMoveFlush();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;

    p.active = false;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    // Button zone release
    if (p.zone === 'btn-left') {
      setLeftPressed(false);
      onMouseUp('left');
    } else if (p.zone === 'btn-right') {
      setRightPressed(false);
      onMouseUp('right');
    } else if (p.zone === 'upper') {
      const elapsed = performance.now() - p.startTime;

      // Tap detection (minimal movement within 220ms)
      if (p.totalDistance < 9 && elapsed < 220) {
        // If 2 upper fingers were tapped simultaneously
        const remainingUpper = Array.from(pointersRef.current.values()).filter(it => it.zone === 'upper');
        if (remainingUpper.length >= 2) {
          onMouseClick('right');
        } else {
          // Single tap or double tap
          const now = performance.now();
          if (now - lastTapTimeRef.current < 300) {
            onMouseClick('left');
            lastTapTimeRef.current = 0;
          } else {
            lastTapTimeRef.current = now;
            onMouseClick('left');
          }
        }
      }
    }

    const activeUpper = Array.from(pointersRef.current.values()).filter(it => it.active && it.zone === 'upper');
    if (activeUpper.length < 2) {
      lastTwoFingerAvgYRef.current = null;
    }
  };

  return (
    <div className="trackpad-full-container">
      {/* Sound Volume Control Bar */}
      <div className="trackpad-sound-bar">
        <div className="sound-buttons-row">
          <button
            type="button"
            className="btn-vol btn-vol-mute"
            onClick={() => triggerVol('VOL_MUTE', 'Mute')}
            title="Mute / Unmute"
          >
            <VolumeX size={15} />
            <span>Mute</span>
          </button>

          <button
            type="button"
            className="btn-vol"
            onClick={() => triggerVol('VOL_DOWN', 'Vol -')}
            title="Decrease Volume"
          >
            <Volume1 size={15} />
            <span>Vol -</span>
          </button>

          <button
            type="button"
            className="btn-vol"
            onClick={() => triggerVol('VOL_UP', 'Vol +')}
            title="Increase Volume"
          >
            <Volume2 size={15} />
            <span>Vol +</span>
          </button>
        </div>
        {volFeedback && <span className="vol-feedback-tag">{volFeedback}</span>}
      </div>

      {/* Main Trackpad Surface */}
      <div
        ref={padRef}
        className="trackpad-full-surface"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Glowing footprint trail line canvas */}
        <canvas ref={canvasRef} className="trackpad-touch-canvas" />

        {/* 65% Height Divider: vertical line down to bottom edge at horizontal center */}
        <div className="trackpad-inner-divider" />

        {/* Lower Left Zone */}
        <div className={`trackpad-zone-label zone-left ${leftPressed ? 'pressed' : ''}`}>
          <span>Left</span>
        </div>

        {/* Lower Right Zone */}
        <div className={`trackpad-zone-label zone-right ${rightPressed ? 'pressed' : ''}`}>
          <span>Right</span>
        </div>
      </div>
    </div>
  );
};
