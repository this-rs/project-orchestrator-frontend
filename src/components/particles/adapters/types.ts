/**
 * Particle Viz — Scene Data Shapes
 *
 * Each type maps to a specific particle scene.
 * Adapters transform PO API responses into these shapes.
 *
 * Types are supersets of the corresponding Scene data interfaces:
 *   - EmbeddingsData  ⊇ EmbeddingsScene.EmbeddingsData
 *   - DistributionData ⊇ DistributionScene.DistributionData
 *   - FeedbackLoopData ⊇ FeedbackLoopScene.FeedbackLoopData
 *   - MoatData         ⊇ MoatScene.MoatData (scene pending)
 * Additional fields (depth, score, state, etc.) are for HUD overlays.
 */

// ── Embeddings (communities → cluster viz) ──────────────────
// Compatible with EmbeddingsScene.EmbeddingsData

export interface EmbeddingsFile {
  path: string;
  language?: string;
  isHotspot: boolean;
}

export interface EmbeddingsCluster {
  label: string;
  count: number;
  color: string;
  /** File-level detail for interactive mode */
  files?: EmbeddingsFile[];
  /** True for the orphan cluster (isolated particles) */
  isOrphan?: boolean;
}

export interface EmbeddingsData {
  clusters: EmbeddingsCluster[];
}

// ── Attention (impact → relevance viz) ──────────────────────
// Scene pending — standalone type

export interface AttentionToken {
  label: string;
  score: number;
  /** Metadata for interactive hit-testing (filePath, impactScore, etc.) */
  metadata?: Record<string, unknown>;
}

export interface AttentionData {
  totalTokens: number;
  relevantTokens: AttentionToken[];
  ignoredCount: number;
}

// ── Distribution (propagated notes → tree viz) ──────────────
// Compatible with DistributionScene.DistributionData (id, parent?, label?)

export interface DistributionNode {
  id: string;
  label: string;
  /** Parent node id — maps to DistributionScene's `parent` field */
  parent?: string;
  depth: number;
  score: number;
}

export interface DistributionData {
  nodes: DistributionNode[];
  maxReach: number;
}

// ── Delegation (waves → agent viz) ──────────────────────────

export interface DelegationTask {
  title: string;
  id: string;
  status: string;
  affected_files: string[];
}

export interface DelegationWave {
  waveNumber: number;
  agents: number;
  tasks: DelegationTask[];
}

export interface DelegationData {
  waves: DelegationWave[];
  totalTasks: number;
}

// ── Moat (summary → concentric layer viz) ───────────────────
// Scene pending — standalone type

export interface MoatLayer {
  name: string;
  count: number;
  /** Health score for this layer (0-1). 1 = healthy, 0 = critical */
  health: number;
}

export interface MoatData {
  layers: MoatLayer[];
  /** Global health score (0-1) aggregated across all layers */
  healthScore: number;
}

// ── Feedback Loop (protocol run → iteration viz) ────────────
// Compatible with FeedbackLoopScene.FeedbackLoopData (iterations?, labels?)

export type FeedbackIterationStatus = 'running' | 'completed' | 'failed';

export interface FeedbackIteration {
  label: string;
  state: string;
  timestamp: string;
  /** Duration spent in this state (ms) */
  duration_ms?: number;
  /** Status of this state visit */
  status?: FeedbackIterationStatus;
  /** State ID for FSM cross-referencing */
  state_id?: string;
}

export interface FeedbackLoopData {
  /** Number of iterations — maps to FeedbackLoopScene.iterations */
  iterations: number;
  /** Label per iteration — maps to FeedbackLoopScene.labels */
  labels: string[];
  /** Rich iteration details for HUD overlays */
  steps: FeedbackIteration[];
}
