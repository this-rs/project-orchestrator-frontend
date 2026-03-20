/**
 * ParticleViz — Drop-in React component for particle visualizations.
 *
 * Usage:
 *   <ParticleViz scene="focus" height={300} />
 *   <ParticleViz scene="delegation" loop cycleDuration={4} />
 *   <ParticleViz scene="embeddings" interactive onParticleClick={(meta) => navigate(`/code/${meta.filePath}`)} />
 *
 * Uses the ParticleScene interface (scenes/types.ts) via useParticleEngine hook.
 *
 * Features:
 *   - Registry-based scene instantiation (lazy, one instance per mount)
 *   - IntersectionObserver: pauses RAF when off-screen (via hook)
 *   - ResizeObserver + DPR scaling (via hook)
 *   - prefers-reduced-motion: static fallback (via hook)
 *   - Interactive mode: hit-testing, tooltips, hover highlights (opt-in)
 */

import { useRef, useMemo, useState, useCallback } from 'react';
import type { ParticleScene } from './scenes/types';
import { useParticleEngine } from './useParticleEngine';
import {
  FocusScene,
  PromptOutputScene,
  HumanAIScene,
  DelegationScene,
  DistributionScene,
  FeedbackLoopScene,
  MoatScene,
  EmbeddingsScene,
  AttentionScene,
  FineTuningScene,
  SignalNoiseScene,
  LeverageScene,
  SystemScene,
  ContextWindowScene,
  FocusSplitScene,
  PromptOutputPhaseScene,
  HumanAISplitScene,
  DelegationSplitScene,
} from './scenes';

// ── Scene Registry ──────────────────────────────────────────
// Each entry maps a string name → a factory that returns a ParticleScene instance.

const SCENE_REGISTRY: Record<string, () => ParticleScene> = {
  // Geometric scenes
  leverage: () => new LeverageScene(),
  system: () => new SystemScene(),
  'context-window': () => new ContextWindowScene(),
  // Flux scenes (split-panel, progress-driven)
  focus: () => new FocusScene(),
  'prompt-output': () => new PromptOutputScene(),
  'human-ai': () => new HumanAIScene(),
  delegation: () => new DelegationScene(),
  // Data-driven scenes
  embeddings: () => new EmbeddingsScene(),
  attention: () => new AttentionScene(),
  'fine-tuning': () => new FineTuningScene(),
  'signal-noise': () => new SignalNoiseScene(),
  // Network scenes
  distribution: () => new DistributionScene(),
  'feedback-loop': () => new FeedbackLoopScene(),
  moat: () => new MoatScene(),
  // Split-panel slide deck scenes
  'focus-split': () => new FocusSplitScene(),
  'prompt-output-phase': () => new PromptOutputPhaseScene(),
  'human-ai-split': () => new HumanAISplitScene(),
  'delegation-split': () => new DelegationSplitScene(),
};

// Cycle durations per scene (seconds)
const CYCLE_DURATIONS: Record<string, number> = {
  leverage: 8,
  system: 12,
  'context-window': 15,
  focus: 6,
  'prompt-output': 5,
  'human-ai': 8,
  delegation: 4,
  'focus-split': 6,
  'prompt-output-phase': 5,
  'human-ai-split': 8,
  'delegation-split': 4,
};

const DEFAULT_CYCLE = 10;

/**
 * Register a custom scene factory. Call before mounting ParticleViz.
 */
export function registerScene(
  type: string,
  factory: () => ParticleScene,
): void {
  SCENE_REGISTRY[type] = factory;
}

// ── Interaction callback type ────────────────────────────────

export interface ParticleHitInfo {
  id: number;
  group: number;
  metadata: Record<string, unknown>;
  x: number;
  y: number;
}

// ── Props ───────────────────────────────────────────────────

export interface ParticleVizProps {
  scene: string;
  data?: unknown;
  className?: string;
  width?: number | string;
  height?: number | string;
  autoplay?: boolean;
  loop?: boolean;
  /** Override cycle duration in seconds */
  cycleDuration?: number;
  /** External progress override (0..1). Disables internal time-based progress */
  progress?: number;
  onComplete?: () => void;
  /** Enable interactive mode: hit-testing, tooltips, hover highlights. Default false */
  interactive?: boolean;
  /** Called when a particle is clicked (interactive mode only) */
  onParticleClick?: (info: ParticleHitInfo) => void;
  /** Called when a particle is hovered (interactive mode only) */
  onParticleHover?: (info: ParticleHitInfo | null) => void;
  /** Externally controlled highlighted particle index */
  highlightedId?: number;
}

// ── Tooltip styles (cosmos/terminal design system) ──────────

const TOOLTIP_STYLE: React.CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
  zIndex: 10,
  background: 'rgba(0,0,0,0.85)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#ffffff',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '1.4',
  padding: '8px 12px',
  borderRadius: '4px',
  maxWidth: '240px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  transition: 'opacity 120ms ease-out',
};

// ── Component ───────────────────────────────────────────────

export function ParticleViz({
  scene: sceneType,
  data,
  className = '',
  width = '100%',
  height = 400,
  autoplay = true,
  loop = true,
  cycleDuration,
  progress: externalProgress,
  onComplete,
  interactive = false,
  onParticleClick,
  onParticleHover,
  highlightedId,
}: ParticleVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
    visible: boolean;
  }>({ text: '', x: 0, y: 0, visible: false });

  // Internal highlighted particle index (from hover)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Resolved highlight: external prop takes precedence
  const effectiveHighlightId = highlightedId ?? hoveredIndex;

  // Instantiate scene (memoized by type)
  const sceneInstance = useMemo<ParticleScene | null>(() => {
    const factory = SCENE_REGISTRY[sceneType];
    if (!factory) {
      console.warn(`[ParticleViz] Unknown scene type: "${sceneType}"`);
      return null;
    }
    return factory();
  }, [sceneType]);

  const cycle = cycleDuration ?? CYCLE_DURATIONS[sceneType] ?? DEFAULT_CYCLE;

  // Interaction callbacks — stable refs to avoid re-renders
  const onParticleClickRef = useRef(onParticleClick);
  onParticleClickRef.current = onParticleClick;
  const onParticleHoverRef = useRef(onParticleHover);
  onParticleHoverRef.current = onParticleHover;

  // Throttled mousemove handler for hit-testing
  const lastMoveTime = useRef(0);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!interactive || !sceneInstance?.getPool) return;

      // Throttle to 16ms (60fps)
      const now = performance.now();
      if (now - lastMoveTime.current < 16) return;
      lastMoveTime.current = now;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const pool = sceneInstance.getPool();
      if (!pool) return;

      const hit = pool.hitTest(mouseX, mouseY, 15);

      if (hit) {
        // Find index for highlight
        const particles = pool.particles;
        let hitIndex: number | null = null;
        for (let i = 0; i < particles.length; i++) {
          if (particles[i] === hit) {
            hitIndex = i;
            break;
          }
        }

        setHoveredIndex(hitIndex);
        setTooltip({
          text:
            (hit.metadata?.label as string) ??
            (hit.metadata?.name as string) ??
            `Group ${hit.group}`,
          x: mouseX,
          y: mouseY,
          visible: true,
        });

        const info: ParticleHitInfo = {
          id: hitIndex ?? -1,
          group: hit.group,
          metadata: hit.metadata,
          x: hit.x,
          y: hit.y,
        };
        onParticleHoverRef.current?.(info);

        // Set cursor
        canvas.style.cursor = 'pointer';
      } else {
        if (tooltip.visible) {
          setHoveredIndex(null);
          setTooltip((prev) => ({ ...prev, visible: false }));
          onParticleHoverRef.current?.(null);
        }
        canvas.style.cursor = 'default';
      }
    },
    [interactive, sceneInstance, tooltip.visible],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!interactive || !sceneInstance?.getPool) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const pool = sceneInstance.getPool();
      if (!pool) return;

      const hit = pool.hitTest(mouseX, mouseY, 15);
      if (hit) {
        const particles = pool.particles;
        let hitIndex = -1;
        for (let i = 0; i < particles.length; i++) {
          if (particles[i] === hit) {
            hitIndex = i;
            break;
          }
        }

        onParticleClickRef.current?.({
          id: hitIndex,
          group: hit.group,
          metadata: hit.metadata,
          x: hit.x,
          y: hit.y,
        });
      }
    },
    [interactive, sceneInstance],
  );

  const handleMouseLeave = useCallback(() => {
    if (!interactive) return;
    setHoveredIndex(null);
    setTooltip((prev) => ({ ...prev, visible: false }));
    onParticleHoverRef.current?.(null);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = 'default';
    }
  }, [interactive]);

  // Delegate all engine logic to the hook
  useParticleEngine(containerRef, canvasRef, sceneInstance, data, {
    autoplay,
    loop,
    cycleDuration: cycle,
    externalProgress,
    onComplete,
    highlightedId: effectiveHighlightId ?? undefined,
  });

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#000',
        borderRadius: '8px',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={interactive ? handleMouseMove : undefined}
        onClick={interactive ? handleClick : undefined}
        onMouseLeave={interactive ? handleMouseLeave : undefined}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
      {/* Tooltip overlay — HTML div positioned above canvas */}
      {interactive && tooltip.visible && (
        <div
          style={{
            ...TOOLTIP_STYLE,
            left: Math.min(
              tooltip.x + 12,
              (containerRef.current?.clientWidth ?? 300) - 200,
            ),
            top: tooltip.y - 36,
            opacity: tooltip.visible ? 1 : 0,
          }}
        >
          <span style={{ color: '#22d3ee', marginRight: '6px' }}>●</span>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

export default ParticleViz;
