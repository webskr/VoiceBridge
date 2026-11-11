import React, { useRef, useState, useEffect } from 'react';
import { 
  MousePointer, 
  Volume2, 
  Volume1, 
  VolumeX 
} from 'lucide-react';

interface MobileMouseProps {
  onMouseMove: (dx: number, dy: number) => void;
  onMouseClick: (button: 'left' | 'right') => void;
  onMouseScroll: (dy: number) => void;
  onKeyPress: (key: string) => void;
  onPause: () => void;
  onResume: () => void;
  onDisconnect: () => void;
  isPaused: boolean;
}

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
  touchId: number;
}

export const MobileMouse: React.FC<MobileMouseProps> = ({
  onMouseMove,
  onMouseClick,
  onMouseScroll,
  onKeyPress
}) => {
  const padRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailsRef = useRef<TrailPoint[]>([]);
  const animFrameRef = useRef<number | null>(null);

  const lastTouchRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const [sensitivity] = useState(2.2);
  const [activeFeedback, setActiveFeedback] = useState<string>('');

  const showFeedback = (text: string) => {
    setActiveFeedback(text);
    setTimeout(() => setActiveFeedback(''), 700);
  };

  // Canvas size sync & trail fade animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      if (padRef.current && canvas) {
        const rect = padRef.current.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Continuous render loop for smooth fading footprints
    const renderLoop = () => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Group trails by touchId so multiple fingers draw their own continuous lines
        const trailsByTouch: { [id: number]: TrailPoint[] } = {};
        for (const p of trailsRef.current) {
          if (!trailsByTouch[p.touchId]) trailsByTouch[p.touchId] = [];
          trailsByTouch[p.touchId].push(p);
        }

        // Draw footprint glowing trail lines for EACH finger
        Object.values(trailsByTouch).forEach(trails => {
          if (trails.length > 1) {
            for (let i = 1; i < trails.length; i++) {
              const p1 = trails[i - 1];
              const p2 = trails[i];
              const avgAlpha = (p1.alpha + p2.alpha) / 2;

              if (avgAlpha > 0.02) {
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = `rgba(56, 189, 248, ${avgAlpha})`;
                ctx.lineWidth = 4 * avgAlpha;
                ctx.lineCap = 'round';
                ctx.shadowColor = '#38bdf8';
                ctx.shadowBlur = 8 * avgAlpha;
                ctx.stroke();
              }
            }
          }

          // Draw Glowing Finger Footprint Dot at head of each finger
          if (trails.length > 0) {
            const head = trails[trails.length - 1];
            if (head.alpha > 0.05) {
              ctx.beginPath();
              ctx.arc(head.x, head.y, 9 * head.alpha, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(56, 189, 248, ${head.alpha})`;
              ctx.shadowColor = '#38bdf8';
              ctx.shadowBlur = 14 * head.alpha;
              ctx.fill();
            }
          }
        });

        // Decay alphas for smooth disappear
        for (let i = 0; i < trailsRef.current.length; i++) {
          trailsRef.current[i].alpha *= 0.90;
        }

        // Filter dead points
        trailsRef.current = trailsRef.current.filter(p => p.alpha > 0.02);
      }
      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const addTrailPoint = (clientX: number, clientY: number, touchId: number) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    trailsRef.current.push({ x, y, alpha: 1.0, touchId });
    if (trailsRef.current.length > 80) {
      trailsRef.current.shift();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      addTrailPoint(t.clientX, t.clientY, t.identifier);
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2) {
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      lastTouchRef.current = { x: 0, y: avgY, time: Date.now() };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Add neon trail point for all active touches (both 1-finger and 2-finger)
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      addTrailPoint(t.clientX, t.clientY, t.identifier);
    }

    if (!lastTouchRef.current) return;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = (touch.clientX - lastTouchRef.current.x) * sensitivity;
      const dy = (touch.clientY - lastTouchRef.current.y) * sensitivity;

      onMouseMove(dx, dy);
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    } else if (e.touches.length === 2) {
      // 2 finger vertical scroll with double neon trail
      const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dy = (avgY - lastTouchRef.current.y) * 25;
      onMouseScroll(dy);
      lastTouchRef.current = { x: 0, y: avgY, time: Date.now() };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartPosRef.current && lastTouchRef.current) {
      const elapsed = Date.now() - lastTouchRef.current.time;
      const movedX = Math.abs(lastTouchRef.current.x - touchStartPosRef.current.x);
      const movedY = Math.abs(lastTouchRef.current.y - touchStartPosRef.current.y);

      // Tap detection (minimal movement within 250ms)
      if (elapsed < 250 && movedX < 10 && movedY < 10) {
        // Check if tap was in the bottom half of trackpad
        if (padRef.current) {
          const rect = padRef.current.getBoundingClientRect();
          const relativeY = touchStartPosRef.current.y - rect.top;
          const relativeX = touchStartPosRef.current.x - rect.left;

          // If tapped in lower half
          if (relativeY > rect.height * 0.70) {
            if (relativeX < rect.width * 0.5) {
              onMouseClick('left');
              showFeedback('Left Click');
              lastTouchRef.current = null;
              touchStartPosRef.current = null;
              return;
            } else {
              onMouseClick('right');
              showFeedback('Right Click');
              lastTouchRef.current = null;
              touchStartPosRef.current = null;
              return;
            }
          }
        }

        // Tap in upper main area defaults to Left Click
        onMouseClick('left');
        showFeedback('Tap Click');
      }
    }
    lastTouchRef.current = null;
    touchStartPosRef.current = null;
  };

  return (
    <div className="mobile-mouse-container">
      {/* Sound Volume Control Bar */}
      <div className="sound-control-card">
        <div className="sound-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Volume2 size={16} className="text-cyan" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>PC Sound Volume</span>
          </div>
          {activeFeedback && <span className="vol-feedback-tag">{activeFeedback}</span>}
        </div>

        <div className="sound-buttons-row">
          <button
            type="button"
            className="btn-vol btn-vol-mute"
            onClick={() => { onKeyPress('VOL_MUTE'); showFeedback('Mute Toggle'); }}
            title="Mute / Unmute"
          >
            <VolumeX size={18} />
            <span>Mute</span>
          </button>

          <button
            type="button"
            className="btn-vol btn-vol-down"
            onClick={() => { onKeyPress('VOL_DOWN'); showFeedback('Volume -'); }}
            title="Decrease Volume"
          >
            <Volume1 size={18} />
            <span>Vol -</span>
          </button>

          <button
            type="button"
            className="btn-vol btn-vol-up"
            onClick={() => { onKeyPress('VOL_UP'); showFeedback('Volume +'); }}
            title="Increase Volume"
          >
            <Volume2 size={18} />
            <span>Vol +</span>
          </button>
        </div>
      </div>

      {/* Main Trackpad Surface with Dual-Finger Neon Footprint Canvas */}
      <div
        ref={padRef}
        className="trackpad-surface"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="trackpad-canvas" />

        <div className="trackpad-hint">
          <MousePointer size={36} className="trackpad-icon" />
          <p>Trackpad Area</p>
          <span>1 finger move • 2 fingers scroll</span>
        </div>

        {/* Integrated Bottom Physical Click Partition (Horizontal Split Line) */}
        <div className="trackpad-bottom-buttons">
          <button
            type="button"
            className="trackpad-half-btn btn-left-half"
            onClick={() => { onMouseClick('left'); showFeedback('Left Click'); }}
          >
            LEFT CLICK
          </button>

          <div className="trackpad-divider-line" />

          <button
            type="button"
            className="trackpad-half-btn btn-right-half"
            onClick={() => { onMouseClick('right'); showFeedback('Right Click'); }}
          >
            RIGHT CLICK
          </button>
        </div>
      </div>
    </div>
  );
};
