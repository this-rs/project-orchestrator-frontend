// ============================================================================
// Fractal Graph Type System — Unified multi-scale graph visualization
// ============================================================================
//
// Normalizes all graph data across scale levels (workspace → project → plan →
// task) into a single type contract. Each level reproduces the same triplet of
// views (DAG, Waves, 3D Universe) with toggleable entity groups.
//
// Replaces the ad-hoc types in:
//   - usePlanUniverse (UniverseNode/UniverseLink)
//   - useTaskUniverse (UniverseNode/UniverseLink)
//   - DependencyGraphView (TaskNodeData)
//   - IntelligenceGraphPage (IntelligenceNode/IntelligenceEdge)
// ============================================================================

import type { IntelligenceEntityType, IntelligenceRelationType, IntelligenceLayer } from './intelligence'

// ── Scale levels ────────────────────────────────────────────────────────────

/** Hierarchical scale levels — each level has its own graph content */
export type ScaleLevel = 'workspace' | 'project' | 'plan' | 'task'

/** What each scale level shows as primary nodes */
export const SCALE_LEVEL_PRIMARY: Record<ScaleLevel, string> = {
  workspace: 'projects',
  project: 'plans + milestones',
  plan: 'tasks',
  task: 'steps',
}

// ── Entity groups (toggleable overlays) ─────────────────────────────────────

/**
 * Entity groups are toggleable categories of nodes/edges.
 * - `core`: always-on primary entities for the current scale level
 * - Others: optional overlays that enrich the graph
 */
export type EntityGroup =
  | 'core'        // Primary entities (tasks in plan, steps in task, etc.)
  | 'code'        // Files, functions, structs
  | 'knowledge'   // Notes, decisions, constraints
  | 'git'         // Commits + TOUCHES edges
  | 'sessions'    // Chat sessions + discussed files
  | 'features'    // Feature graphs (overlay)
  | 'behavioral'  // Protocols, skills

/** Display mode for a non-core entity group */
export type GroupMode = 'off' | 'connections' | 'expanded'

/** Configuration for a single entity group */
export interface EntityGroupConfig {
  id: EntityGroup
  label: string
  /** Lucide icon name */
  icon: string
  /** Whether this group is enabled by default */
  defaultEnabled: boolean
  /** Which scale levels support this group */
  availableAt: ScaleLevel[]
  /** Entity types that belong to this group */
  entityTypes: IntelligenceEntityType[]
  /** Relation types that belong to this group */
  relationTypes: IntelligenceRelationType[]
}

/** Default entity group configurations */
export const ENTITY_GROUP_CONFIGS: EntityGroupConfig[] = [
  {
    id: 'core',
    label: 'Core',
    icon: 'Circle',
    defaultEnabled: true,
    availableAt: ['workspace', 'project', 'plan', 'task'],
    entityTypes: ['plan', 'task', 'step', 'milestone', 'release'],
    relationTypes: ['DEPENDS_ON', 'HAS_TASK', 'HAS_STEP', 'CONTAINS'],
  },
  {
    id: 'code',
    label: 'Code',
    icon: 'Code',
    defaultEnabled: false,
    availableAt: ['project', 'plan', 'task'],
    entityTypes: ['file', 'function', 'struct', 'trait', 'enum'],
    relationTypes: ['IMPORTS', 'CALLS', 'EXTENDS', 'IMPLEMENTS'],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    icon: 'BookOpen',
    defaultEnabled: false,
    availableAt: ['project', 'plan', 'task'],
    entityTypes: ['note', 'decision', 'constraint'],
    relationTypes: ['LINKED_TO', 'AFFECTS', 'INFORMED_BY', 'HAS_CONSTRAINT', 'HAS_DECISION'],
  },
  {
    id: 'git',
    label: 'Git',
    icon: 'GitCommit',
    defaultEnabled: false,
    availableAt: ['project', 'plan', 'task'],
    entityTypes: ['commit'],
    relationTypes: ['TOUCHES', 'CO_CHANGED', 'LINKED_TO_TASK', 'LINKED_TO_PLAN'],
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: 'MessageCircle',
    defaultEnabled: false,
    availableAt: ['project', 'plan', 'task'],
    entityTypes: ['chat_session'],
    relationTypes: ['DISCUSSED'],
  },
  {
    id: 'features',
    label: 'Features',
    icon: 'Network',
    defaultEnabled: false,
    availableAt: ['project', 'plan', 'task'],
    entityTypes: ['feature_graph'],
    relationTypes: ['INCLUDES_ENTITY', 'HAS_FEATURE_GRAPH'],
  },
  {
    id: 'behavioral',
    label: 'Behavioral',
    icon: 'Workflow',
    defaultEnabled: false,
    availableAt: ['project', 'plan', 'task'],
    entityTypes: ['protocol', 'protocol_state', 'skill'],
    relationTypes: ['HAS_STATE', 'TRANSITION', 'BELONGS_TO_SKILL', 'HAS_MEMBER'],
  },
]

/** Get entity group configs available at a given scale level */
export function getGroupsForScale(level: ScaleLevel): EntityGroupConfig[] {
  return ENTITY_GROUP_CONFIGS.filter((g) => g.availableAt.includes(level))
}

/** Get the EntityGroup a given entity type belongs to */
export function getEntityGroup(entityType: IntelligenceEntityType): EntityGroup {
  for (const config of ENTITY_GROUP_CONFIGS) {
    if (config.entityTypes.includes(entityType)) {
      return config.id
    }
  }
  return 'core' // fallback
}

// ── Unified node & link types ───────────────────────────────────────────────

/**
 * FractalNode — normalized graph node used by ALL views (DAG, Waves, 3D).
 *
 * Extends the existing UniverseNode shape with group, scale, and drill-down
 * metadata. Compatible with react-force-graph-3d (id, label, color, data)
 * and can be converted to ReactFlow nodes for DAG views.
 */
export interface FractalNode {
  /** Unique node ID (format: `{entityType}:{entityId}`, e.g. `task:uuid`, `file:path`) */
  id: string
  /** Display label */
  label: string
  /** Entity type — drives icon/shape in nodeObjects.ts */
  type: IntelligenceEntityType
  /** Which entity group this node belongs to (for toggle filtering) */
  group: EntityGroup
  /** Which layer (for layer-based filtering, compatible with intelligence graph) */
  layer: IntelligenceLayer
  /** Node color (from ENTITY_COLORS) */
  color: string
  /** Scale level this node lives at */
  scaleLevel: ScaleLevel
  /** Arbitrary entity-specific data (status, priority, energy, etc.) */
  data: Record<string, unknown>
  /** How many child entities (for LOD aggregation display) */
  childCount?: number
  /** Drill-down target — double-click zooms into this */
  drillTarget?: {
    level: ScaleLevel
    id: string
  }
  /** Optional subtitle (e.g. status, file path) */
  subtitle?: string
  /** Progress (0-1) for entities that track completion (tasks, plans) */
  progress?: number
  /** Energy value (0-1) for knowledge entities */
  energy?: number
  /** Status string for badge display */
  status?: string
}

/**
 * FractalLink — normalized graph edge used by ALL views.
 *
 * Compatible with react-force-graph-3d (source, target) and can be
 * converted to ReactFlow edges for DAG views.
 */
export interface FractalLink {
  /** Source node ID */
  source: string
  /** Target node ID */
  target: string
  /** Relation type — drives edge style from EDGE_STYLES */
  type: IntelligenceRelationType
  /** Which entity group this edge belongs to (for toggle filtering) */
  group: EntityGroup
  /** Optional weight (e.g. synapse strength, co-change count) */
  weight?: number
  /** Optional label */
  label?: string
}

// ── GraphAdapter interface ──────────────────────────────────────────────────

/**
 * GraphAdapter<TData> — transforms any scale level's API data into
 * FractalNode[] + FractalLink[], filtered by enabled entity groups.
 *
 * Each scale level implements this interface:
 *   - PlanGraphAdapter: plan dependency graph → fractal nodes/links
 *   - TaskGraphAdapter: task context → fractal nodes/links
 *   - MilestoneGraphAdapter: milestone detail → fractal nodes/links
 *   - WorkspaceGraphAdapter: workspace topology → fractal nodes/links
 */
export interface GraphAdapter<TData> {
  /** Which scale level this adapter serves */
  scaleLevel: ScaleLevel

  /** Entity groups supported at this scale level */
  supportedGroups: EntityGroupConfig[]

  /**
   * Default mode for non-core groups (overrides `defaultEnabled` from config).
   * If set, non-core groups start in this mode instead of 'off'.
   * Useful for milestone/project levels where enrichment should be visible immediately.
   */
  defaultGroupMode?: GroupMode

  /**
   * Transform raw API data into graph nodes, filtered by enabled groups.
   * Only nodes belonging to an enabled group are returned.
   */
  toNodes(data: TData, enabledGroups: Set<EntityGroup>): FractalNode[]

  /**
   * Transform raw API data into graph links, filtered by enabled groups.
   * An edge is included if BOTH its source and target nodes are in an enabled group.
   */
  toLinks(data: TData, enabledGroups: Set<EntityGroup>): FractalLink[]

  /**
   * Count entities per group (for the EntityGroupPanel chip badges).
   * Returns totals regardless of which groups are currently enabled.
   */
  countByGroup(data: TData): Record<EntityGroup, number>
}

// ── Fractal navigation state ────────────────────────────────────────────────

/** Breadcrumb entry for fractal drill-down navigation */
export interface FractalBreadcrumb {
  level: ScaleLevel
  id: string
  label: string
}

/** State of the fractal navigation stack */
export interface FractalNavigationState {
  /** Current scale level being viewed */
  currentLevel: ScaleLevel
  /** ID of the entity being viewed at the current level */
  currentId: string
  /** Navigation breadcrumb trail */
  breadcrumbs: FractalBreadcrumb[]
}

// ── View mode ───────────────────────────────────────────────────────────────

/** Available view modes for the unified graph section */
export type FractalViewMode = 'dag' | 'waves' | '3d'

/** Which views are available at each scale level */
export const SCALE_LEVEL_VIEWS: Record<ScaleLevel, FractalViewMode[]> = {
  workspace: ['3d'],
  project: ['3d'],
  plan: ['dag', 'waves', '3d'],
  task: ['dag', '3d'],
}

// ── Utility: filter nodes/links by enabled groups ───────────────────────────

/** Filter nodes by enabled groups */
export function filterNodesByGroups(
  nodes: FractalNode[],
  enabledGroups: Set<EntityGroup>,
): FractalNode[] {
  return nodes.filter((n) => enabledGroups.has(n.group))
}

/** Filter links by enabled groups (both endpoints must be in enabled groups) */
export function filterLinksByGroups(
  links: FractalLink[],
  enabledGroups: Set<EntityGroup>,
  nodeIds: Set<string>,
): FractalLink[] {
  return links.filter(
    (l) => enabledGroups.has(l.group) && nodeIds.has(l.source) && nodeIds.has(l.target),
  )
}

// ── Backward compatibility: convert FractalNode to existing types ───────────

/** Convert FractalNode to the legacy UniverseNode shape (for existing 3D views) */
export function toUniverseNode(node: FractalNode): {
  id: string
  label: string
  type: string
  data: Record<string, unknown>
  color: string
} {
  return {
    id: node.id,
    label: node.label,
    type: node.type,
    data: node.data,
    color: node.color,
  }
}

/** Convert FractalLink to the legacy UniverseLink shape */
export function toUniverseLink(link: FractalLink): {
  source: string
  target: string
  type: string
} {
  return {
    source: link.source,
    target: link.target,
    type: link.type,
  }
}
