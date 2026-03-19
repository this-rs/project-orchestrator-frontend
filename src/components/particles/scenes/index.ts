export type { ParticleScene } from './types';
export { easeInOutCubic, easeInQuad, easeInOut, smoothstep, clamp, lerp } from './types';

export { DistributionScene } from './DistributionScene';
export type { DistributionData } from './DistributionScene';

export { FeedbackLoopScene } from './FeedbackLoopScene';
export type { FeedbackLoopData } from './FeedbackLoopScene';

export { MoatScene } from './MoatScene';
export type { MoatData } from './MoatScene';

export { LeverageScene } from './LeverageScene';
export { SystemScene } from './SystemScene';
export { ContextWindowScene } from './ContextWindowScene';

export { EmbeddingsScene } from './EmbeddingsScene';
export type { EmbeddingsData } from './EmbeddingsScene';

export { AttentionScene } from './AttentionScene';
export type { AttentionData } from './AttentionScene';

export { FineTuningScene } from './FineTuningScene';

export { SignalNoiseScene } from './SignalNoiseScene';

// ── Slide deck scenes (ambient, continuous) ─────────────────
export { FocusScene } from './FocusScene';
export { PromptOutputScene } from './PromptOutputScene';
export { HumanAIScene } from './HumanAIScene';
export { DelegationScene } from './DelegationScene';

// ── Slide deck scenes (split-panel, progress-driven) ────────
export {
  FocusSplitScene,
  PromptOutputPhaseScene,
  HumanAISplitScene,
  DelegationSplitScene,
} from './SlideDeckScenes';
