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
}

export interface Constraint {
  id: string
  constraint_type: ConstraintType
  description: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  enforced_by?: string
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

export interface FeatureGraphDetail extends FeatureGraph {
  entities: FeatureGraphEntity[]
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
