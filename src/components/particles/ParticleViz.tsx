/**
 * ParticleViz — Drop-in React component for particle visualizations.
 *
 * Usage:
 *   <ParticleViz scene="focus" height={300} />
 *   <ParticleViz scene="delegation" loop cycleDuration={4} />
 *
 * Uses the ParticleScene interface (scenes/types.ts) via useParticleEngine hook.
 *
 * Features:
 *   - Registry-based scene instantiation (lazy, one instance per mount)
 *   - IntersectionObserver: pauses RAF when off-screen (via hook)
 *   - ResizeObserver + DPR scaling (via hook)
 *   - prefers-reduced-motion: static fallback (via hook)
 */

import { useRef, useMemo } from 'react';
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
}

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
}: ParticleVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Delegate all engine logic to the hook
  useParticleEngine(containerRef, canvasRef, sceneInstance, data, {
    autoplay,
    loop,
    cycleDuration: cycle,
    externalProgress,
    onComplete,
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
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
}

export default ParticleViz;
