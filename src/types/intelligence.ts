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
  | 'behavioral'
  | 'chat'

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

export type CodeEntityType = 'file' | 'function' | 'struct' | 'trait' | 'enum' | 'feature_graph'
export type PMEntityType = 'plan' | 'task' | 'step' | 'milestone' | 'release' | 'commit'
export type KnowledgeEntityType = 'note' | 'decision' | 'constraint'
export type SkillEntityType = 'skill'
export type BehavioralEntityType = 'protocol' | 'protocol_state'
export type ChatEntityType = 'chat_session'
export type IntelligenceEntityType = CodeEntityType | PMEntityType | KnowledgeEntityType | SkillEntityType | BehavioralEntityType | ChatEntityType

export type FabricRelationType =
  | 'IMPORTS' | 'CALLS' | 'EXTENDS' | 'IMPLEMENTS'
  | 'TOUCHES' | 'CO_CHANGED' | 'AFFECTS' | 'LINKED_TO'
  | 'INCLUDES_ENTITY'
export type NeuralRelationType = 'SYNAPSE'
export type SkillRelationType = 'HAS_MEMBER'
export type PMRelationType = 'CONTAINS' | 'DEPENDS_ON' | 'INFORMED_BY' | 'HAS_TASK' | 'HAS_STEP' | 'TARGETS_MILESTONE' | 'LINKED_TO_TASK' | 'LINKED_TO_PLAN' | 'HAS_CONSTRAINT' | 'HAS_DECISION' | 'HAS_FEATURE_GRAPH'
export type ChatRelationType = 'DISCUSSED'
export type BehavioralRelationType = 'HAS_STATE' | 'TRANSITION' | 'BELONGS_TO_SKILL'
export type IntelligenceRelationType =
  | FabricRelationType | NeuralRelationType | SkillRelationType | PMRelationType | BehavioralRelationType | ChatRelationType

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

export interface ProtocolNodeData extends BaseNodeData {
  entityType: 'protocol'
  layer: 'behavioral'
  category: string
  description?: string
  skillId?: string
  /** Set by WS events when a run is active for this protocol */
  runStatus?: RunStatus
}

// ============================================================================
// CONTEXT ROUTING — Types for protocol affinity routing
// ============================================================================

export interface ContextVector {
  phase: number
  structure: number
  domain: number
  resource: number
  lifecycle: number
}

export interface RelevanceVector {
  phase: number
  structure: number
  domain: number
  resource: number
  lifecycle: number
}

export interface DimensionWeights {
  phase: number
  structure: number
  domain: number
  resource: number
  lifecycle: number
}

export interface DimensionScore {
  name: string
  context_value: number
  relevance_value: number
  weight: number
  contribution: number
}

export interface AffinityScore {
  score: number
  dimensions: DimensionScore[]
  explanation: string
}

export interface RouteResult {
  protocol_id: string
  protocol_name: string
  protocol_category: string
  affinity: AffinityScore
  relevance_vector: RelevanceVector
}

export interface RouteResponse {
  context: ContextVector
  weights: DimensionWeights
  results: RouteResult[]
  total_evaluated: number
}

export interface ProtocolStateNodeData extends BaseNodeData {
  entityType: 'protocol_state'
  layer: 'behavioral'
  stateType: string
  action?: string
}

export interface ChatSessionNodeData extends BaseNodeData {
  entityType: 'chat_session'
  layer: 'chat'
  model?: string
  messageCount: number
  totalCostUsd: number
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
  | ProtocolNodeData
  | ProtocolStateNodeData
  | ChatSessionNodeData
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
  | 'behavioral_view'
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

export interface BehavioralLayerSummary {
  protocols: number
  states: number
  transitions: number
  system_protocols: number
  business_protocols: number
  skill_linked: number
}

export interface PmLayerSummary {
  plans: number
  tasks: number
  tasks_completed: number
  tasks_in_progress: number
  steps: number
  milestones: number
  releases: number
  completion_rate: number
}

export interface ChatLayerSummary {
  sessions: number
  total_messages: number
  total_cost_usd: number
  discussed_entity_count: number
}

export interface IntelligenceSummary {
  code: CodeLayerSummary
  knowledge: KnowledgeLayerSummary
  fabric: FabricLayerSummary
  neural: NeuralLayerSummary
  skills: SkillsLayerSummary
  behavioral: BehavioralLayerSummary
  pm?: PmLayerSummary
  chat?: ChatLayerSummary
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

// ============================================================================
// WORKSPACE GRAPH (from backend GET /api/workspaces/:slug/graph)
// ============================================================================

export interface ProjectGraphMeta {
  id: string
  name: string
  slug: string
  node_count: number
  edge_count: number
}

export interface WorkspaceGraphResponse {
  projects: ProjectGraphMeta[]
  nodes: BackendGraphNode[]
  edges: BackendGraphEdge[]
  communities: BackendGraphCommunity[]
  stats: Record<string, BackendLayerStats>
  cross_project_edges: BackendGraphEdge[]
}

// ============================================================================
// WORKSPACE INTELLIGENCE SUMMARY (aggregated across projects)
// ============================================================================

export interface ProjectIntelligenceSummary {
  project_id: string
  project_name: string
  project_slug: string
  summary: IntelligenceSummary
}

export interface WorkspaceIntelligenceSummary {
  aggregated: IntelligenceSummary
  per_project: ProjectIntelligenceSummary[]
}

// ============================================================================
// PROTOCOL (Pattern Federation) — API response types
// ============================================================================

export interface ProtocolStateApi {
  id: string
  protocol_id: string
  name: string
  description: string
  state_type: string  // 'start' | 'intermediate' | 'terminal'
  action?: string
}

export interface ProtocolTransitionApi {
  id: string
  protocol_id: string
  from_state: string
  to_state: string
  trigger: string
  guard?: string
}

export interface ProtocolDetailApi {
  id: string
  name: string
  description: string
  project_id: string
  skill_id?: string
  entry_state: string
  terminal_states: string[]
  protocol_category: string  // 'system' | 'business'
  created_at: string
  updated_at: string
  states: ProtocolStateApi[]
  transitions: ProtocolTransitionApi[]
}

// ============================================================================
// PROTOCOL RUNS (FSM execution instances)
// ============================================================================

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export interface StateVisit {
  state_id: string
  state_name: string
  entered_at: string
  trigger?: string
}

export interface ProtocolRunApi {
  id: string
  protocol_id: string
  plan_id?: string
  task_id?: string
  current_state: string
  states_visited: StateVisit[]
  status: RunStatus
  started_at: string
  completed_at?: string
  error?: string
  triggered_by: string
}

export interface ProtocolRunProgress {
  run_id: string
  state_name: string
  sub_action: string
  processed: number
  total: number
  display: string
  elapsed_ms: number
}

// ============================================================================
// PATTERN COMPOSER — Compose & Simulate types
// ============================================================================

export interface ComposeStateInline {
  name: string
  description?: string
  state_type?: 'start' | 'intermediate' | 'terminal'
  action?: string
}

export interface ComposeTransitionInline {
  from_state: string
  to_state: string
  trigger: string
  guard?: string
}

export interface NoteStateBinding {
  note_id: string
  state_name: string
}

export interface ComposeProtocolRequest {
  project_id: string
  name: string
  description?: string
  category?: 'system' | 'business'
  notes: NoteStateBinding[]
  states: ComposeStateInline[]
  transitions: ComposeTransitionInline[]
  relevance_vector?: RelevanceVector
  triggers?: { pattern_type: string; pattern_value: string; confidence_threshold?: number }[]
}

export interface ComposeResponse {
  protocol_id: string
  skill_id: string
  states_created: number
  transitions_created: number
  notes_linked: number
}

export interface SimulateRequest {
  protocol_id: string
  context?: ContextVector
  plan_id?: string
}

export interface SimulateResponse {
  score: number
  dimensions: DimensionScore[]
  would_activate: boolean
  explanation: string
  context_used: ContextVector
}
