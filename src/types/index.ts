export * from './chat'
export * from './events'

// ============================================================================
// ENUMS
// ============================================================================

export type PlanStatus = 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled'

export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'failed'

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export type MilestoneStatus = 'planned' | 'open' | 'in_progress' | 'completed' | 'closed'

export type ReleaseStatus = 'planned' | 'in_progress' | 'released' | 'cancelled'

export type NoteType =
  | 'guideline'
  | 'gotcha'
  | 'pattern'
  | 'context'
  | 'tip'
  | 'observation'
  | 'assertion'

export type NoteStatus = 'active' | 'needs_review' | 'stale' | 'obsolete' | 'archived'

export type NoteImportance = 'low' | 'medium' | 'high' | 'critical'

export type DecisionStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded'

export type ConstraintType = 'performance' | 'security' | 'style' | 'compatibility' | 'testing' | 'other'

export type ResourceType =
  | 'api_contract'
  | 'protobuf'
  | 'graphql_schema'
  | 'json_schema'
  | 'database_schema'
  | 'shared_types'
  | 'config'
  | 'documentation'
  | 'other'

export type ComponentType =
  | 'service'
  | 'frontend'
  | 'worker'
  | 'database'
  | 'message_queue'
  | 'cache'
  | 'gateway'
  | 'external'
  | 'other'

// ============================================================================
// CORE ENTITIES
// ============================================================================

export interface Workspace {
  id: string
  name: string
  slug: string
  description?: string
  created_at: string
  updated_at?: string
  metadata?: Record<string, unknown>
}

export interface Project {
  id: string
  name: string
  slug: string
  root_path: string
  description?: string
  created_at: string
  last_synced?: string
}

export interface Plan {
  id: string
  title: string
  description: string
  status: PlanStatus
  created_at: string
  created_by: string
  priority: number
  project_id?: string
}

export interface Task {
  id: string
  title?: string
  description: string
  status: TaskStatus
  assigned_to?: string
  priority?: number
  tags: string[]
  acceptance_criteria: string[]
  affected_files: string[]
  estimated_complexity?: number
  actual_complexity?: number
  created_at: string
  updated_at?: string
  started_at?: string
  completed_at?: string
}

export interface TaskWithPlan extends Task {
  plan_id: string
  plan_title: string
  plan_status?: string
}

// ============================================================================
// MILESTONE DETAIL (enriched responses from GET /milestones/:id and
// GET /workspace-milestones/:id)
// ============================================================================

export interface MilestoneStepSummary {
  id: string
  order: number
  description: string
  status: string
  verification?: string
}

export interface MilestoneTaskSummary {
  id: string
  title?: string
  description: string
  status: string
  priority?: number
  tags: string[]
  created_at: string
  completed_at?: string
  steps: MilestoneStepSummary[]
}

export interface MilestonePlanSummary {
  id: string
  title: string
  status?: string
  tasks: MilestoneTaskSummary[]
}

export interface MilestoneDetail extends WorkspaceMilestone {
  plans: MilestonePlanSummary[]
  progress: MilestoneProgress
}

export interface ProjectMilestoneDetail {
  milestone: Milestone
  plans: MilestonePlanSummary[]
  tasks: Task[]
  progress: MilestoneProgress
}

export interface Step {
  id: string
  order: number
  description: string
  status: StepStatus
  verification?: string
  created_at: string
  updated_at?: string
  completed_at?: string
}

export interface Decision {
  id: string
  description: string
  rationale: string
  alternatives: string[]
  chosen_option?: string
  decided_by: string
  decided_at: string
  status: DecisionStatus
}

export interface DecisionAffects {
  entity_type: string
  entity_id: string
  entity_name?: string
  impact_description?: string
}

export interface DecisionTimelineEntry {
  decision: Decision
  supersedes_chain?: string[]
  superseded_by?: string
}

export interface DecisionSearchHit {
  decision: Decision
  score: number
}

export interface Constraint {
  id: string
  constraint_type: ConstraintType
  description: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  enforced_by?: string
}

// ============================================================================
// KNOWLEDGE FABRIC — Neurons, Propagation, Context
// ============================================================================

export interface NeuronActivationSource {
  type: 'direct' | 'propagated'
  via?: string // note id (only when propagated)
  hops?: number // (only when propagated)
}

export interface NeuronSearchResult {
  id: string
  content: string
  note_type: string
  importance: string
  activation_score: number
  source: NeuronActivationSource
  energy: number
  tags: string[]
  project_id?: string
}

export interface NeuronSearchResponse {
  results: NeuronSearchResult[]
  metadata: {
    total_activated: number
    direct_matches: number
    propagated_matches: number
    query_time_ms: number
    max_hops: number
    min_score: number
  }
}

export interface ReinforceResult {
  neurons_boosted: number
  synapses_reinforced: number
  energy_boost: number
  synapse_boost: number
}

export interface DecayResult {
  synapses_decayed: number
  synapses_pruned: number
  decay_amount: number
  prune_threshold: number
}

export interface EnergyUpdateResult {
  notes_updated: number
  half_life_days: number
}

export interface PropagatedNote extends Note {
  relevance_score: number
  propagation_path?: string
  relation_type?: string
  distance?: number
}

export interface ContextKnowledge {
  notes: Note[]
  decisions: Decision[]
  commits: Commit[]
  entity_type: string
  entity_id: string
}

export interface PropagatedKnowledge {
  notes: (Note & { source_relation: string })[]
  decisions: (Decision & { source_relation: string })[]
  relation_stats: { imports: number; co_changed: number; affects: number }
}

// ============================================================================
// RELEASES & MILESTONES
// ============================================================================

export interface Release {
  id: string
  version: string
  title?: string
  description?: string
  status: ReleaseStatus
  target_date?: string
  released_at?: string
  created_at: string
  project_id: string
}

export interface Milestone {
  id: string
  title: string
  description?: string
  status: MilestoneStatus
  target_date?: string
  closed_at?: string
  created_at: string
  project_id: string
}

export interface WorkspaceMilestone {
  id: string
  workspace_id: string
  title: string
  description?: string
  status: MilestoneStatus
  target_date?: string
  closed_at?: string
  created_at: string
  tags: string[]
}

// ============================================================================
// KNOWLEDGE NOTES
// ============================================================================

export type NoteScopeType =
  | 'workspace'
  | 'project'
  | 'module'
  | 'file'
  | 'function'
  | 'struct'
  | 'trait'

export interface NoteScope {
  type: NoteScopeType
  path?: string
}

export interface NoteAnchor {
  entity_type: string
  entity_id: string
  signature_hash?: string
  body_hash?: string
  last_verified: string
  is_valid: boolean
}

export interface Note {
  id: string
  project_id: string
  note_type: NoteType
  status: NoteStatus
  importance: NoteImportance
  scope?: NoteScope
  content: string
  tags: string[]
  anchors: NoteAnchor[]
  created_at: string
  created_by: string
  last_confirmed_at?: string
  staleness_score: number
  supersedes?: string
  superseded_by?: string
}

// ============================================================================
// WORKSPACE RESOURCES & COMPONENTS
// ============================================================================

export interface Resource {
  id: string
  workspace_id?: string
  project_id?: string
  name: string
  resource_type: ResourceType
  file_path: string
  url?: string
  format?: string
  version?: string
  description?: string
  created_at: string
  updated_at?: string
  metadata?: Record<string, unknown>
}

export interface Component {
  id: string
  workspace_id: string
  name: string
  component_type: ComponentType
  description?: string
  runtime?: string
  config?: Record<string, unknown>
  created_at: string
  tags: string[]
}

export interface ComponentDependency {
  from_id: string
  to_id: string
  protocol?: string
  required: boolean
}

// ============================================================================
// COMMITS
// ============================================================================

export interface Commit {
  sha: string
  message: string
  author?: string
  timestamp: string
  files_changed?: string[]
}

export interface CommitFile {
  file_path: string
  additions: number
  deletions: number
}

export interface FileHistoryEntry {
  commit_sha: string
  message: string
  author: string
  date: string
  additions: number
  deletions: number
}

export interface CoChangeEdge {
  file_a: string
  file_b: string
  co_change_count: number
  last_at?: string
}

export interface CoChanger {
  file_path: string
  co_change_count: number
  last_at?: string
}

// ============================================================================
// CODE STRUCTURE
// ============================================================================

export interface FileNode {
  path: string
  language: string
  hash: string
  last_parsed: string
  project_id?: string
}

export interface FunctionNode {
  name: string
  visibility: 'public' | 'private' | 'crate' | 'super'
  params: { name: string; type_annotation?: string }[]
  return_type?: string
  generics: string[]
  is_async: boolean
  is_unsafe: boolean
  complexity: number
  file_path: string
  line_start: number
  line_end: number
  docstring?: string
}

export interface StructNode {
  name: string
  visibility: 'public' | 'private' | 'crate' | 'super'
  generics: string[]
  file_path: string
  line_start: number
  line_end: number
  docstring?: string
}

export interface TraitNode {
  name: string
  visibility: 'public' | 'private' | 'crate' | 'super'
  generics: string[]
  file_path: string
  line_start: number
  line_end: number
  docstring?: string
  is_external: boolean
  source?: string
}

// ============================================================================
// CODE ANALYTICS
// ============================================================================

// --- Communities ---

export interface CodeCommunity {
  id: string
  label: string
  size: number
  key_files: string[]
  cohesion?: number
  enriched_by?: string
  members?: string[]
}

export interface CodeCommunities {
  communities: CodeCommunity[]
  total_files: number
  community_count: number
}

// --- Health ---

export interface GodFunction {
  name: string
  file: string
  in_degree: number
  out_degree: number
}

export interface CouplingMetrics {
  avg_clustering_coefficient: number
  max_clustering_coefficient: number
  most_coupled_file: string
}

export interface NeuralMetrics {
  active_synapses: number
  avg_energy: number
  weak_synapses_ratio: number
  dead_notes_count: number
}

export interface CodeHealth {
  god_functions: GodFunction[]
  god_function_count: number
  god_function_threshold: number
  orphan_files: string[]
  orphan_file_count: number
  coupling_metrics: CouplingMetrics
  circular_dependencies: string[]
  circular_dependency_count: number
  hotspots: ChangeHotspot[]
  knowledge_gaps: KnowledgeGap[]
  risk_assessment: RiskAssessmentSummary | null
  neural_metrics: NeuralMetrics
}

// --- Hotspots ---

export interface ChangeHotspot {
  path: string
  commit_count: number
  total_churn: number
  co_change_count: number
  churn_score: number
}

export interface HotspotsResponse {
  hotspots: ChangeHotspot[]
  total_files: number
  limit: number
}

// --- Knowledge Gaps ---

export interface KnowledgeGap {
  path: string
  note_count: number
  decision_count: number
  knowledge_density: number
}

export interface KnowledgeGapsResponse {
  knowledge_gaps: KnowledgeGap[]
  total_files: number
  limit: number
}

// --- Risk Assessment ---

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'

export interface RiskFactors {
  pagerank: number
  churn: number
  knowledge_gap: number
  betweenness: number
}

export interface RiskFile {
  path: string
  risk_score: number
  risk_level: RiskLevel
  factors: RiskFactors
}

export interface RiskAssessmentSummary {
  files_assessed?: number
  avg_risk_score: number
  max_risk_score?: number
  critical_count: number
  high_count: number
  medium_count: number
  low_count: number
}

export interface RiskAssessmentResponse {
  risk_files: RiskFile[]
  total_files: number
  limit: number
  summary: RiskAssessmentSummary
}

// --- Node Importance ---

export interface NodeImportanceMetrics {
  pagerank?: number
  betweenness?: number
  clustering_coefficient?: number | null
  community_id?: number | null
  in_degree: number
  out_degree: number
}

export interface NodeImportanceFabricMetrics {
  fabric_pagerank?: number | null
  fabric_betweenness?: number | null
  fabric_community_id?: number | null
  fabric_community_label?: string | null
}

export interface NodeImportancePercentiles {
  pagerank_p80: number
  pagerank_p95: number
  betweenness_p80: number
  betweenness_p95: number
}

export interface NodeImportance {
  node: string
  node_type: string
  risk_level?: RiskLevel
  summary?: string
  message?: string
  metrics: NodeImportanceMetrics
  fabric_metrics?: NodeImportanceFabricMetrics
  percentiles?: NodeImportancePercentiles
}

// --- Heritage (Class Hierarchy) ---

export interface ClassHierarchy {
  type_name: string
  parents: string[]
  children: string[]
  depth: number
}

export interface SubclassesResponse {
  class_name: string
  subclasses: string[]
  total: number
}

export interface InterfaceImplementorsResponse {
  interface_name: string
  implementors: string[]
  total: number
}

// --- Process Detection ---

export interface ProcessSummary {
  id: string
  label: string
  total: number
}

export interface ProcessesResponse {
  processes: ProcessSummary[]
  total: number
}

export interface EntryPoint {
  id: string
  score: number
  type?: string
}

export interface EntryPointsResponse {
  entry_points: EntryPoint[]
  total: number
}

// ============================================================================
// NEURAL SKILLS
// ============================================================================

export type SkillStatus = 'emerging' | 'active' | 'dormant' | 'archived' | 'imported'

export type SkillTriggerPatternType = 'regex' | 'file_glob' | 'semantic' | 'mcp_action'

export interface SkillTriggerPattern {
  pattern_type: SkillTriggerPatternType
  pattern_value: string
  confidence_threshold: number
  quality_score?: number | null
}

export interface Skill {
  id: string
  project_id: string
  name: string
  description?: string
  status: SkillStatus
  trigger_patterns: SkillTriggerPattern[]
  context_template?: string | null
  energy: number
  cohesion: number
  coverage: number
  note_count: number
  decision_count: number
  activation_count: number
  hit_rate: number
  last_activated?: string | null
  version: number
  fingerprint?: string | null
  imported_at?: string | null
  is_validated: boolean
  tags: string[]
  created_at: string
  updated_at: string
}

/** GET /skills/:id/members → { notes: Note[], decisions: Decision[] } */
export interface SkillMembers {
  notes: Note[]
  decisions: Decision[]
}

// --- Skill Health ---

export type SkillHealthRecommendation = 'healthy' | 'needs_attention' | 'at_risk' | 'should_archive'

export interface SkillHealth {
  skill_id: string
  skill_name: string
  status: string
  activation_count: number
  hit_rate: number
  energy: number
  cohesion: number
  note_count: number
  decision_count: number
  days_since_import?: number | null
  is_validated: boolean
  in_probation: boolean
  probation_days_remaining?: number | null
  recommendation: SkillHealthRecommendation
  explanation: string
}

// --- Skill Activation ---

export type ActivationSource = 'direct' | { propagated: { via: string; hops: number } }

export interface ActivatedNote {
  note: Note
  activation_score: number
  source: ActivationSource
  entity_type: string
}

export interface SkillActivationResult {
  skill: Skill
  activated_notes: ActivatedNote[]
  relevant_decisions: Decision[]
  context_text: string
  confidence: number
}

// --- Skill Package (Export/Import) ---

export interface PortableSkillTrigger {
  pattern_type: SkillTriggerPatternType
  pattern_value: string
  confidence_threshold: number
}

export interface PortableSkill {
  name: string
  description?: string
  trigger_patterns: PortableSkillTrigger[]
  context_template?: string | null
  tags: string[]
  cohesion: number
}

export interface PortableNote {
  note_type: NoteType
  importance: NoteImportance
  content: string
  tags: string[]
}

export interface PortableDecision {
  description: string
  rationale: string
  alternatives: string[]
  chosen_option?: string | null
}

export interface SkillPackageMetadata {
  format: string
  exported_at: string
  source_project?: string | null
  stats: {
    note_count: number
    decision_count: number
    trigger_count: number
    activation_count: number
  }
}

export interface SkillPackage {
  schema_version: number
  metadata: SkillPackageMetadata
  skill: PortableSkill
  notes: PortableNote[]
  decisions: PortableDecision[]
}

// --- Skill Import ---

export interface ImportConflict {
  skill_name: string
  existing_skill_id: string
  strategy_applied: 'skip' | 'merge' | 'replace'
}

export interface SkillImportResult {
  skill_id: string
  notes_created: number
  decisions_imported: number
  synapses_created: number
  conflict?: ImportConflict | null
  was_merged: boolean
  source_project?: string | null
}

// --- Skill Requests ---

export interface CreateSkillRequest {
  project_id: string
  name: string
  description?: string
  tags?: string[]
  trigger_patterns?: SkillTriggerPattern[]
  context_template?: string
}

export interface ImportSkillRequest {
  project_id: string
  package: SkillPackage
  conflict_strategy?: 'skip' | 'merge' | 'replace'
}

// --- Skill Detection ---

export interface SkillDetectionResult {
  status: 'Success' | 'InsufficientData'
  skills_detected: number
  skills_created: number
  skills_updated: number
  total_notes: number
  total_synapses: number
  modularity: number
  message: string
  skill_ids: string[]
  elapsed_ms: number
}

// ============================================================================
// FEATURE GRAPHS
// ============================================================================

export type FeatureGraphRole =
  | 'entry_point'
  | 'core_logic'
  | 'data_model'
  | 'trait_contract'
  | 'api_surface'
  | 'support'

export interface FeatureGraph {
  id: string
  name: string
  description?: string
  project_id: string
  created_at: string
  entity_count?: number
  entry_function?: string
  build_depth?: number
}

export interface FeatureGraphEntity {
  entity_type: string
  entity_id: string
  name?: string
  role?: FeatureGraphRole | string
}

export interface FeatureGraphRelation {
  source_type: string
  source_id: string
  target_type: string
  target_id: string
  relation_type: string
}

export interface FeatureGraphDetail extends FeatureGraph {
  entities: FeatureGraphEntity[]
  relations?: FeatureGraphRelation[]
}

export interface CreateFeatureGraphRequest {
  name: string
  description?: string
  project_id: string
}

export interface AutoBuildFeatureGraphRequest {
  name: string
  description?: string
  project_id: string
  entry_function: string
  depth?: number
  include_relations?: string[]
  filter_community?: boolean
}

export interface AddFeatureGraphEntityRequest {
  entity_type: 'file' | 'function' | 'struct' | 'trait' | 'enum'
  entity_id: string
  role?: FeatureGraphRole
}

export interface AddFeatureGraphEntityResponse {
  added: boolean
  feature_graph_id: string
  entity_type: string
  entity_id: string
  role?: string
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  has_more?: boolean
}

export interface DependencyGraphNode {
  id: string
  title?: string
  status: TaskStatus
  priority?: number
}

export interface DependencyGraphEdge {
  from: string
  to: string
}

export interface DependencyGraph {
  nodes: DependencyGraphNode[]
  edges: DependencyGraphEdge[]
}

export interface MilestoneProgress {
  total: number
  completed: number
  in_progress: number
  pending: number
  percentage: number
}

export interface StepProgress {
  total: number
  completed: number
  percentage: number
}

export interface WorkspaceOverview {
  workspace: Workspace
  projects: Project[]
  milestones: WorkspaceMilestone[]
  resources: Resource[]
  components: Component[]
}

export interface ProjectRoadmap {
  milestones: {
    milestone: Milestone
    tasks: Task[]
    progress: MilestoneProgress
  }[]
  releases: {
    release: Release
    tasks: Task[]
    commits: Commit[]
  }[]
  progress: {
    total_tasks: number
    completed_tasks: number
    in_progress_tasks: number
    pending_tasks: number
    percentage: number
  }
  dependency_graph: DependencyGraph
}

export interface PlanDetails extends Plan {
  tasks: Task[]
  constraints: Constraint[]
  decisions: Decision[]
}

export interface TaskDetails extends Task {
  steps: Step[]
  decisions: Decision[]
  commits: Commit[]
  blockers: Task[]
  blocking: Task[]
}

// ============================================================================
// AUTH
// ============================================================================

/** Auth mode: 'required' = login needed, 'none' = open access */
export type AuthMode = 'required' | 'none'

/** Auth provider type returned by GET /auth/providers */
export type AuthProviderType = 'password' | 'oidc'

/** Single auth provider info from GET /auth/providers */
export interface AuthProviderInfo {
  id: string
  name: string
  type: AuthProviderType
}

/** Response from GET /auth/providers */
export interface AuthProvidersResponse {
  auth_required: boolean
  providers: AuthProviderInfo[]
  allow_registration: boolean
}

/** POST /auth/login request body */
export interface LoginRequest {
  email: string
  password: string
}

/** POST /auth/register request body */
export interface RegisterRequest {
  email: string
  password: string
  name: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
  picture_url?: string
  /** True when this user is the root account (configured in config.yaml). */
  is_root?: boolean
}

export interface AuthTokenResponse {
  token: string
  user: AuthUser
}

export interface AuthUrlResponse {
  auth_url: string
}

export interface RefreshTokenResponse {
  token: string
}

// ============================================================================
// API REQUESTS
// ============================================================================

export interface CreateWorkspaceRequest {
  name: string
  slug?: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface CreateProjectRequest {
  name: string
  slug?: string
  root_path: string
  description?: string
}

export interface CreatePlanRequest {
  title: string
  description: string
  priority?: number
  project_id?: string
}

export interface CreateTaskRequest {
  title?: string
  description: string
  priority?: number
  tags?: string[]
  acceptance_criteria?: string[]
  affected_files?: string[]
  dependencies?: string[]
  estimated_complexity?: number
}

export interface UpdateTaskRequest {
  title?: string
  status?: TaskStatus
  assigned_to?: string
  priority?: number
  tags?: string[]
  actual_complexity?: number
}

export interface CreateNoteRequest {
  project_id: string
  note_type: NoteType
  content: string
  importance?: NoteImportance
  tags?: string[]
  anchors?: Omit<NoteAnchor, 'last_verified' | 'is_valid'>[]
}

export interface CreateReleaseRequest {
  version: string
  title?: string
  description?: string
  target_date?: string
}

export interface CreateMilestoneRequest {
  title: string
  description?: string
  target_date?: string
}

export interface CreateResourceRequest {
  name: string
  resource_type: ResourceType
  file_path: string
  url?: string
  format?: string
  version?: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface CreateComponentRequest {
  name: string
  component_type: ComponentType
  description?: string
  runtime?: string
  config?: Record<string, unknown>
  tags?: string[]
}

// ============================================================================
// ADMIN
// ============================================================================

export interface SyncResult {
  files_synced: number
  files_skipped: number
  files_deleted: number
  symbols_deleted: number
  errors: string[]
}

export interface WatchStatus {
  running: boolean
  watched_paths: string[]
}

export interface BackfillJobStatus {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress?: { current: number; total: number; percentage: number }
  started_at?: string
  finished_at?: string
  error?: string
}

export interface MeilisearchStats {
  code_documents: number
  is_indexing: boolean
}

export interface BackfillDecisionEmbeddingsResult {
  decisions_processed: number
  embeddings_created: number
}

export interface BackfillDiscussedResult {
  sessions_processed: number
  entities_found: number
  relations_created: number
}

export interface BackfillTouchesResult {
  commits_parsed: number
  commits_backfilled: number
  touches_created: number
}

export interface FabricScoresResult {
  nodes_updated: number
  computation_ms: number
  fabric_scores_computed: boolean
  communities: number
  components: number
  churn_scores_computed: number
  knowledge_density_computed: number
  risk_scores_computed: number
}

export interface BootstrapKnowledgeFabricResult {
  steps_completed: {
    step: string
    commits_parsed?: number
    commits_backfilled?: number
    touches_created?: number
    decisions_processed?: number
    embeddings_created?: number
    sessions_processed?: number
    entities_found?: number
    relations_created?: number
    nodes_updated?: number
    communities?: number
    files_scored?: number
  }[]
  steps_failed: { step: string; error: string }[]
  total_time_ms: number
}

export interface SkillMaintenanceResult {
  level: string
  lifecycle: string
  synapses_decayed: number
  synapses_pruned: number
  evolution: unknown
  skills_detected: number
  warnings: string[]
  elapsed_ms: number
}

export type MaintenanceLevel = 'hourly' | 'daily' | 'weekly' | 'full'
