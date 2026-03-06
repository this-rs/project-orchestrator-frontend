// ============================================================================
// INTELLIGENCE VISUALIZATION — Types
// ============================================================================

import type { Node, Edge } from '@xyflow/react'

// ============================================================================
// LAYERS
// ============================================================================

export type IntelligenceLayer =
  | 'code'
  | 'pm'
  | 'knowledge'
  | 'fabric'
  | 'neural'
  | 'skills'

export interface LayerConfig {
  id: IntelligenceLayer
  label: string
  description: string
  color: string
  enabled: boolean
  zIndex: number
}

// ============================================================================
// GRAPH ENTITY TYPES
// ============================================================================

export type CodeEntityType = 'file' | 'function' | 'struct' | 'trait' | 'enum'
export type PMEntityType = 'plan' | 'task' | 'step' | 'milestone' | 'release' | 'commit'
export type KnowledgeEntityType = 'note' | 'decision' | 'constraint'
export type SkillEntityType = 'skill'
export type IntelligenceEntityType = CodeEntityType | PMEntityType | KnowledgeEntityType | SkillEntityType

export type FabricRelationType =
  | 'IMPORTS' | 'CALLS' | 'EXTENDS' | 'IMPLEMENTS'
  | 'TOUCHES' | 'CO_CHANGED' | 'AFFECTS' | 'DISCUSSED' | 'LINKED_TO'
export type NeuralRelationType = 'SYNAPSE'
export type SkillRelationType = 'HAS_MEMBER'
export type PMRelationType = 'CONTAINS' | 'DEPENDS_ON' | 'INFORMED_BY'
export type IntelligenceRelationType =
  | FabricRelationType | NeuralRelationType | SkillRelationType | PMRelationType

// ============================================================================
// NODE DATA
// ============================================================================

export interface BaseNodeData extends Record<string, unknown> {
  label: string
  entityType: IntelligenceEntityType
  layer: IntelligenceLayer
  entityId: string
}

export interface FileNodeData extends BaseNodeData {
  entityType: 'file'
  layer: 'code'
  path: string
  language?: string
  pagerank?: number
  betweenness?: number
  communityId?: number
  communityLabel?: string
  riskLevel?: 'critical' | 'high' | 'medium' | 'low'
}

export interface FunctionNodeData extends BaseNodeData {
  entityType: 'function'
  layer: 'code'
  filePath: string
  isAsync?: boolean
  complexity?: number
  visibility?: string
}

export interface StructNodeData extends BaseNodeData {
  entityType: 'struct'
  layer: 'code'
  filePath: string
}

export interface NoteNodeData extends BaseNodeData {
  entityType: 'note'
  layer: 'knowledge'
  noteType: string
  importance: string
  energy: number
  staleness: number
  status: string
  isConfirmed?: boolean
  isInvalidated?: boolean
  tags: string[]
}

export interface DecisionNodeData extends BaseNodeData {
  entityType: 'decision'
  layer: 'knowledge'
  status: string
  chosenOption?: string
}

export interface PlanNodeData extends BaseNodeData {
  entityType: 'plan'
  layer: 'pm'
  status: string
  priority: number
  taskCount?: number
}

export interface TaskNodeData extends BaseNodeData {
  entityType: 'task'
  layer: 'pm'
  status: string
  priority?: number
}

export interface SkillNodeData extends BaseNodeData {
  entityType: 'skill'
  layer: 'skills'
  status: string
  energy: number
  cohesion: number
  activationCount: number
  noteCount: number
}

export type IntelligenceNodeData =
  | FileNodeData
  | FunctionNodeData
  | StructNodeData
  | NoteNodeData
  | DecisionNodeData
  | PlanNodeData
  | TaskNodeData
  | SkillNodeData
  | BaseNodeData

// ============================================================================
// EDGE DATA
// ============================================================================

export interface IntelligenceEdgeData extends Record<string, unknown> {
  relationType: IntelligenceRelationType
  layer: IntelligenceLayer
  weight?: number
  confidence?: number
  count?: number
}

// ============================================================================
// REACTFLOW ALIASES
// ============================================================================

export type IntelligenceNode = Node<IntelligenceNodeData>
export type IntelligenceEdge = Edge<IntelligenceEdgeData>

// ============================================================================
// VISIBILITY MODES
// ============================================================================

export type VisibilityMode =
  | 'code_only'
  | 'pm_view'
  | 'knowledge_overlay'
  | 'neural_view'
  | 'fabric_view'
  | 'full_stack'
  | 'impact_mode'
  | 'skill_focus'
  | 'custom'

export interface VisibilityPreset {
  id: VisibilityMode
  label: string
  description: string
  layers: IntelligenceLayer[]
  icon: string
}

// ============================================================================
// INTELLIGENCE SUMMARY (from backend GET /api/projects/:slug/intelligence/summary)
// Matches Rust structs in project_handlers.rs
// ============================================================================

export interface HotspotEntry {
  path: string
  churn_score: number
}

export interface CodeLayerSummary {
  files: number
  functions: number
  communities: number
  hotspots: HotspotEntry[]
  orphans: number
}

export interface KnowledgeLayerSummary {
  notes: number
  decisions: number
  stale_count: number
  types_distribution: Record<string, number>
}

export interface FabricLayerSummary {
  co_changed_pairs: number
}

export interface NeuralLayerSummary {
  active_synapses: number
  avg_energy: number
  weak_synapses_ratio: number
  dead_notes_count: number
}

export interface SkillsLayerSummary {
  total: number
  active: number
  emerging: number
  avg_cohesion: number
  total_activations: number
}

export interface IntelligenceSummary {
  code: CodeLayerSummary
  knowledge: KnowledgeLayerSummary
  fabric: FabricLayerSummary
  neural: NeuralLayerSummary
  skills: SkillsLayerSummary
}

// ============================================================================
// EMBEDDINGS PROJECTION (from backend GET /api/projects/:slug/embeddings/projection)
// Used by VectorSpaceExplorer for UMAP 2D scatter visualization
// ============================================================================

export interface ProjectionPoint {
  id: string
  type: string        // 'note' | 'decision'
  x: number
  y: number
  z?: number          // present when projection_dimensions=3
  energy: number       // 0–1 note energy
  importance: string   // 'critical' | 'high' | 'medium' | 'low'
  tags: string[]
  content_preview: string
}

export interface ProjectionSynapse {
  source: string
  target: string
  weight: number       // 0–1 synapse weight
}

export interface ProjectionSkill {
  id: string
  name: string
  member_ids: string[]
  centroid_x: number
  centroid_y: number
  centroid_z?: number  // present when projection_dimensions=3
}

export interface EmbeddingsProjectionResponse {
  points: ProjectionPoint[]
  synapses: ProjectionSynapse[]
  skills: ProjectionSkill[]
  dimensions: number
  projection_dimensions: number  // 2 or 3
  method: string        // 'umap' | 'circular_fallback'
}

// ============================================================================
// PROJECT GRAPH (from backend GET /api/projects/:slug/graph)
// ============================================================================

export interface BackendGraphNode {
  id: string
  type: string
  label: string
  layer: string
  attributes?: Record<string, unknown>
}

export interface BackendGraphEdge {
  source: string
  target: string
  type: string
  layer: string
  attributes?: Record<string, unknown>
}

export interface BackendGraphCommunity {
  id: number
  label: string
  file_count: number
}

export interface BackendLayerStats {
  nodes: number
  edges: number
}

export interface ProjectGraphResponse {
  nodes: BackendGraphNode[]
  edges: BackendGraphEdge[]
  communities: BackendGraphCommunity[]
  stats: Record<string, BackendLayerStats>
}
