/**
 * useParticleEngine — React hook to drive a ParticleScene on a canvas.
 *
 * Handles:
 *   - ResizeObserver + DPR scaling
 *   - RAF loop with dt capping (50ms max → 20fps floor)
 *   - prefers-reduced-motion → static frame at progress=0.5
 *   - Scene lifecycle (init/dispose on swap)
 *   - Data forwarding via scene.setData()
 *   - IntersectionObserver → pause RAF when off-screen
 *   - Highlight rendering for interactive mode (glow ×2, size ×1.5)
 *   - Cleanup on unmount
 */

import { useEffect, useRef, useCallback } from 'react';
import type { ParticleScene } from './scenes/types';

export interface UseParticleEngineOptions {
  autoplay?: boolean;
  loop?: boolean;
  /** Cycle duration in seconds */
  cycleDuration?: number;
  /** External progress override (0..1). Disables internal time */
  externalProgress?: number;
  onComplete?: () => void;
  /** Index of highlighted particle (for interactive hover glow) */
  highlightedId?: number;
}

export interface UseParticleEngineReturn {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function useParticleEngine(
  containerRef: React.RefObject<HTMLDivElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  scene: ParticleScene | null,
  data?: unknown,
  options: UseParticleEngineOptions = {},
): void {
  const {
    autoplay = true,
    loop = true,
    cycleDuration = 10,
    externalProgress,
    onComplete,
    highlightedId,
  } = options;

  // Refs for mutable state accessed in RAF — avoids stale closures
  const visibleRef = useRef(true);
  const onCompleteRef = useRef(onComplete);
  const externalProgressRef = useRef(externalProgress);
  const highlightedIdRef = useRef(highlightedId);
  onCompleteRef.current = onComplete;
  externalProgressRef.current = externalProgress;
  highlightedIdRef.current = highlightedId;

  // Forward data to scene
  useEffect(() => {
    if (scene?.setData && data !== undefined) {
      scene.setData(data);
    }
  }, [scene, data]);

  // IntersectionObserver — track visibility via ref
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.1 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  // Setup canvas with HiDPI scaling
  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, w: number, h: number) => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return ctx;
    },
    [],
  );

  // Main effect: scene lifecycle + RAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !scene) return;

    let { width: cw, height: ch } = container.getBoundingClientRect();
    const ctx = setupCanvas(canvas, cw, ch);
    if (!ctx) return;

    // Detect reduced motion once
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    // Initialize scene
    scene.init(cw, ch);

    // Forward data if present at setup time
    if (scene.setData && data !== undefined) {
      scene.setData(data);
    }

    // ── Reduced motion: static frame at progress=0.5 ──────────
    if (prefersReducedMotion) {
      scene.update(0, 0.5, 0);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cw, ch);
      scene.draw(ctx, cw, ch);
      return () => scene.dispose();
    }

    // ── No autoplay: render at t=0, no loop ────────────────────
    if (!autoplay) {
      scene.update(0, 0, 0);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cw, ch);
      scene.draw(ctx, cw, ch);
      return () => scene.dispose();
    }

    // ── ResizeObserver ──────────────────────────────────────────
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: ew, height: eh } = entry.contentRect;
        if (ew > 0 && eh > 0 && (ew !== cw || eh !== ch)) {
          cw = ew;
          ch = eh;
          setupCanvas(canvas, cw, ch);
          scene.resize(cw, ch);
        }
      }
    });
    ro.observe(container);

    // ── RAF loop ─────────────────────────────────────────────────
    let rafId = 0;
    let startTime = 0;
    let lastTime = 0;
    let completeFired = false;

    const tick = (timestamp: number) => {
      if (!startTime) {
        startTime = timestamp;
        lastTime = timestamp;
      }

      // Pause when off-screen (read from ref — no stale closure)
      if (!visibleRef.current) {
        lastTime = timestamp;
        rafId = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = timestamp;

      const elapsed = (timestamp - startTime) / 1000;
      const rawProgress = elapsed / cycleDuration;
      const progress =
        externalProgressRef.current ??
        (loop ? rawProgress % 1 : Math.min(rawProgress, 1));
      const time = elapsed;

      scene.update(dt, progress, time);

      // Clear + draw
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, cw, ch);
      scene.draw(ctx, cw, ch);

      // ── Highlight overlay for interactive mode ────────────────
      const hId = highlightedIdRef.current;
      if (hId != null && scene.getPool) {
        const pool = scene.getPool();
        if (pool && hId >= 0 && hId < pool.particles.length) {
          const p = pool.particles[hId];
          if (p.active) {
            // Amplified glow: radius ×2, size ×1.5, opacity boost +0.3
            const highlightSize = p.size * 1.5;
            const highlightOpacity = Math.min(p.opacity + 0.3, 1);

            // Outer glow halo
            ctx.save();
            ctx.globalAlpha = highlightOpacity * 0.4;
            ctx.shadowColor = '#22d3ee';
            ctx.shadowBlur = p.size * 4;
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.arc(p.x, p.y, highlightSize * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Inner bright dot
            ctx.globalAlpha = highlightOpacity;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, highlightSize, 0, Math.PI * 2);
            ctx.fill();

            // Cyan ring accent
            ctx.globalAlpha = highlightOpacity * 0.6;
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, highlightSize + 4, 0, Math.PI * 2);
            ctx.stroke();

            ctx.restore();
          }
        }
      }

      // Completion (non-loop mode only)
      if (!loop && progress >= 1 && !completeFired) {
        completeFired = true;
        onCompleteRef.current?.();
        return; // stop RAF
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    // ── Cleanup ──────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      scene.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, autoplay, loop, cycleDuration, setupCanvas, canvasRef, containerRef]);
}
