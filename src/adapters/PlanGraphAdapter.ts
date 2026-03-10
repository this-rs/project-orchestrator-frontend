// ============================================================================
// PlanGraphAdapter — GraphAdapter<PlanGraphData> for plan-level visualization
// ============================================================================
//
// Transforms the plan dependency graph (tasks, edges, conflicts) plus enriched
// secondary data (constraints, decisions, commits, chat sessions, feature graphs)
// into FractalNode[] / FractalLink[], filtered by enabled EntityGroups.
//
// Replaces the data transform logic in:
//   - usePlanUniverse.ts  (buildBaseGraph + buildFeatureGraphOverlay)
//   - PlanUniverse3D.tsx  (toIntelligenceNodes/Edges, FG overlay merging)
//
// The adapter is stateless — it receives all data and produces the graph.
// Data fetching remains in the hook (usePlanGraph).
// ============================================================================

import { ENTITY_COLORS } from '@/constants/intelligence'
import type { IntelligenceEntityType, IntelligenceLayer } from '@/types/intelligence'
import type {
  DependencyGraph,
  Constraint,
  Decision,
  Commit,
  FeatureGraphDetail,
  ChatSession,
} from '@/types'
import type {
  GraphAdapter,
  EntityGroup,
  FractalNode,
  FractalLink,
  ScaleLevel,
} from '@/types/fractal-graph'
import { getGroupsForScale, getEntityGroup } from '@/types/fractal-graph'

// ── Data bundle passed to the adapter ────────────────────────────────────────

export interface PlanGraphData {
  planId: string
  planTitle: string
  graph: DependencyGraph
  constraints: Constraint[]
  decisions: Decision[]
  commits: Commit[]
  chatSessions: ChatSession[]
  /** Map of commit SHA → list of file paths touched */
  commitFilesMap: Map<string, string[]>
  /** Fully-loaded feature graph details (for overlay groups) */
  featureGraphs: FeatureGraphDetail[]
  /** Which feature graphs are currently toggled on */
  activeFeatureGraphIds: Set<string>
}

// ── Layer mapping (entity type → intelligence layer) ─────────────────────────

const LAYER_MAP: Record<string, IntelligenceLayer> = {
  plan: 'pm',
  task: 'pm',
  step: 'pm',
  milestone: 'pm',
  release: 'pm',
  commit: 'pm',
  file: 'code',
  function: 'code',
  struct: 'code',
  trait: 'code',
  enum: 'code',
  feature_graph: 'code',
  note: 'knowledge',
  decision: 'knowledge',
  constraint: 'knowledge',
  chat_session: 'chat',
  skill: 'skills',
  protocol: 'behavioral',
  protocol_state: 'behavioral',
}

// ── Status → color / energy ──────────────────────────────────────────────────

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  in_progress: '#3B82F6',
  blocked: '#F59E0B',
  completed: '#22C55E',
  failed: '#EF4444',
}

function statusToEnergy(status: string | undefined): number {
  switch (status) {
    case 'in_progress': return 0.8
    case 'completed': return 0.3
    case 'blocked': return 0.7
    case 'failed': return 0.2
    case 'pending': return 0.5
    default: return 0.5
  }
}

// ── Suffix-matching for file paths ───────────────────────────────────────────

function resolveFileNodeId(fgPath: string, existingFilePaths: string[], existingNodeIds: Set<string>): string {
  if (existingNodeIds.has(`file:${fgPath}`)) return `file:${fgPath}`
  const match = existingFilePaths.find((bp) =>
    fgPath.endsWith(bp) || bp.endsWith(fgPath),
  )
  if (match) return `file:${match}`
  return `file:${fgPath}`
}

// ── Helper: create a FractalNode ─────────────────────────────────────────────

function makeNode(
  id: string,
  label: string,
  type: IntelligenceEntityType,
  data: Record<string, unknown>,
  opts?: {
    subtitle?: string
    progress?: number
    energy?: number
    status?: string
    color?: string
    drillTarget?: { level: ScaleLevel; id: string }
    childCount?: number
  },
): FractalNode {
  return {
    id,
    label,
    type,
    group: getEntityGroup(type),
    layer: LAYER_MAP[type] ?? 'pm',
    color: opts?.color ?? ENTITY_COLORS[type] ?? '#6B7280',
    scaleLevel: 'plan',
    data,
    subtitle: opts?.subtitle,
    progress: opts?.progress,
    energy: opts?.energy ?? (data.energy as number | undefined),
    status: opts?.status,
    drillTarget: opts?.drillTarget,
    childCount: opts?.childCount,
  }
}

// ── Helper: create a FractalLink ─────────────────────────────────────────────

function makeLink(
  source: string,
  target: string,
  type: FractalLink['type'],
  group: EntityGroup,
  weight?: number,
  label?: string,
): FractalLink {
  return { source, target, type, group, weight, label }
}

// ── Edge group resolution ────────────────────────────────────────────────────
// Determines which EntityGroup an edge belongs to based on its relation type.

function edgeGroup(relationType: string): EntityGroup {
  switch (relationType) {
    case 'HAS_TASK':
    case 'DEPENDS_ON':
    case 'HAS_STEP':
      return 'core'
    case 'AFFECTS':
    case 'IMPORTS':
    case 'CALLS':
    case 'EXTENDS':
    case 'IMPLEMENTS':
      return 'code'
    case 'HAS_CONSTRAINT':
    case 'HAS_DECISION':
    case 'LINKED_TO':
    case 'INFORMED_BY':
      return 'knowledge'
    case 'TOUCHES':
    case 'CO_CHANGED':
    case 'LINKED_TO_TASK':
    case 'LINKED_TO_PLAN':
      return 'git'
    case 'DISCUSSED':
      return 'sessions'
    case 'HAS_FEATURE_GRAPH':
    case 'CONTAINS':
    case 'INCLUDES_ENTITY':
      return 'features'
    case 'HAS_STATE':
    case 'TRANSITION':
    case 'BELONGS_TO_SKILL':
    case 'HAS_MEMBER':
      return 'behavioral'
    default:
      return 'core'
  }
}

// ============================================================================
// PlanGraphAdapter
// ============================================================================

export const PlanGraphAdapter: GraphAdapter<PlanGraphData> = {
  scaleLevel: 'plan',
  supportedGroups: getGroupsForScale('plan'),

  // ── toNodes ──────────────────────────────────────────────────────────────

  toNodes(data: PlanGraphData, enabledGroups: Set<EntityGroup>): FractalNode[] {
    const nodes: FractalNode[] = []
    const nodeIds = new Set<string>()
    const fileNodeIds = new Set<string>()

    const addNode = (node: FractalNode) => {
      if (nodeIds.has(node.id)) return
      nodeIds.add(node.id)
      // Only include if the node's group is enabled
      if (enabledGroups.has(node.group)) {
        nodes.push(node)
      }
    }

    const { planId, planTitle, graph, constraints, decisions, commits, chatSessions, commitFilesMap, featureGraphs, activeFeatureGraphIds } = data
    const tasks = graph.nodes || []

    // ── Plan center node (core) ────────────────────────────────────────────
    const completedTasks = tasks.filter((t) => t.status === 'completed').length
    addNode(makeNode(
      planId,
      planTitle,
      'plan',
      {
        energy: 1.0,
        task_count: tasks.length,
        completed_task_count: completedTasks,
        file_count: new Set(tasks.flatMap((t) => t.affected_files || [])).size,
      },
      {
        progress: tasks.length > 0 ? completedTasks / tasks.length : 0,
        energy: 1.0,
        childCount: tasks.length,
      },
    ))

    // ── Task nodes (core) ──────────────────────────────────────────────────
    for (const task of tasks) {
      const stepProgress = (task.step_count && task.step_count > 0)
        ? (task.completed_step_count ?? 0) / task.step_count
        : undefined

      addNode(makeNode(
        task.id,
        task.title || task.id.slice(0, 8),
        'task',
        {
          status: task.status,
          priority: task.priority,
          step_count: task.step_count,
          completed_step_count: task.completed_step_count,
          note_count: task.note_count,
          decision_count: task.decision_count,
          affected_file_count: (task.affected_files || []).length,
          session_count: task.session_count,
          tags: task.tags,
          acceptance_criteria: task.acceptance_criteria,
          assigned_to: task.assigned_to,
        },
        {
          color: TASK_STATUS_COLORS[task.status] ?? ENTITY_COLORS.task,
          status: task.status,
          energy: statusToEnergy(task.status),
          progress: stepProgress,
          drillTarget: { level: 'task', id: task.id },
          childCount: task.step_count,
        },
      ))

      // ── Step nodes (core group — child chain) ────────────────────────
      for (const step of task.steps || []) {
        const stepId = `step:${step.id}`
        addNode(makeNode(
          stepId,
          step.description.slice(0, 40),
          'step',
          {
            status: step.status,
            order: step.order,
            verification: step.verification,
            energy: statusToEnergy(step.status?.toLowerCase()),
          },
          {
            color: TASK_STATUS_COLORS[step.status?.toLowerCase()] ?? ENTITY_COLORS.step,
            status: step.status?.toLowerCase(),
            energy: statusToEnergy(step.status?.toLowerCase()),
            subtitle: step.verification ? `✓ ${step.verification.slice(0, 30)}` : undefined,
          },
        ))
      }

      // ── Affected files (code group) ────────────────────────────────────
      for (const filePath of task.affected_files || []) {
        const fileId = `file:${filePath}`
        if (!fileNodeIds.has(fileId)) {
          fileNodeIds.add(fileId)
          const parts = filePath.split('/')
          const fileName = parts[parts.length - 1] || filePath
          addNode(makeNode(fileId, fileName, 'file', { path: filePath, energy: 0.3 }, { subtitle: filePath, energy: 0.3 }))
        }
      }
    }

    // ── Constraints (knowledge group) ────────────────────────────────────
    for (const constraint of constraints) {
      const constraintId = `constraint:${constraint.id}`
      addNode(makeNode(
        constraintId,
        constraint.description.slice(0, 30),
        'constraint',
        { ...constraint, energy: 0.4 },
        { energy: 0.4, subtitle: constraint.constraint_type },
      ))
    }

    // ── Decisions (knowledge group) ──────────────────────────────────────
    for (const decision of decisions) {
      const decId = `decision:${decision.id}`
      const label = decision.chosen_option
        ? `${decision.description.slice(0, 20)} → ${decision.chosen_option}`
        : decision.description.slice(0, 30)
      addNode(makeNode(
        decId,
        label,
        'decision',
        { ...decision, energy: 0.5 },
        { energy: 0.5, status: (decision as unknown as { status?: string }).status },
      ))
    }

    // ── Commits (git group) ─────────────────────────────────────────────
    for (const commit of commits) {
      const commitId = `commit:${commit.sha}`
      addNode(makeNode(
        commitId,
        commit.sha.slice(0, 7) + (commit.message ? ` ${commit.message.slice(0, 20)}` : ''),
        'commit',
        { ...commit, energy: 0.2 },
        { energy: 0.2, subtitle: commit.message?.slice(0, 50) },
      ))

      // TOUCHES files from commits (git group → code nodes)
      const touchedFiles = commitFilesMap.get(commit.sha) || []
      for (const filePath of touchedFiles) {
        const fileId = `file:${filePath}`
        if (!fileNodeIds.has(fileId)) {
          fileNodeIds.add(fileId)
          const parts = filePath.split('/')
          const fileName = parts[parts.length - 1] || filePath
          addNode(makeNode(fileId, fileName, 'file', { path: filePath, energy: 0.3 }, { subtitle: filePath, energy: 0.3 }))
        }
      }
    }

    // ── Chat sessions (sessions group) ──────────────────────────────────
    for (const session of chatSessions) {
      const sessionId = `chat_session:${session.id}`
      const label = session.title || `Chat ${session.id.slice(0, 8)}`
      addNode(makeNode(
        sessionId,
        label.length > 30 ? label.slice(0, 29) + '\u2026' : label,
        'chat_session',
        {
          model: session.model,
          messageCount: session.message_count ?? 0,
          totalCostUsd: session.total_cost_usd ?? 0,
          energy: 0.4,
        },
        { energy: 0.4, subtitle: session.model },
      ))
    }

    // ── Feature graph overlays (features group) ─────────────────────────
    if (activeFeatureGraphIds.size > 0) {
      // Build suffix-matching index from existing file nodes
      const existingFilePaths: string[] = []
      for (const id of nodeIds) {
        if (id.startsWith('file:')) existingFilePaths.push(id.slice(5))
      }

      for (const fg of featureGraphs) {
        if (!activeFeatureGraphIds.has(fg.id)) continue

        // FG hub node
        const fgId = `feature_graph:${fg.id}`
        addNode(makeNode(
          fgId,
          fg.name,
          'feature_graph',
          {
            description: fg.description,
            entity_count: fg.entities?.length ?? fg.entity_count ?? 0,
            energy: 0.7,
          },
          { energy: 0.7 },
        ))

        // FG entities → connect to existing file nodes or create new
        for (const entity of fg.entities || []) {
          const eType = entity.entity_type.toLowerCase()
          if (eType === 'file' || eType === 'function') {
            const entityNodeId = eType === 'file'
              ? resolveFileNodeId(entity.entity_id, existingFilePaths, nodeIds)
              : entity.entity_id

            if (!nodeIds.has(entityNodeId)) {
              if (eType === 'file') {
                const parts = entity.entity_id.split('/')
                const fileName = entity.name || parts[parts.length - 1] || entity.entity_id
                addNode(makeNode(entityNodeId, fileName, 'file', { path: entity.entity_id, energy: 0.3 }, { subtitle: entity.entity_id, energy: 0.3 }))
              } else {
                const funcName = entity.name || entity.entity_id.split('::').pop() || entity.entity_id
                addNode(makeNode(entityNodeId, funcName, 'function', { energy: 0.3 }, { energy: 0.3 }))
              }
            }
          }
        }
      }
    }

    // ── Limit to ~200 nodes ─────────────────────────────────────────────
    if (nodes.length > 200) {
      const kept = new Set(nodes.slice(0, 200).map((n) => n.id))
      kept.add(planId)
      return nodes.filter((n) => kept.has(n.id))
    }

    return nodes
  },

  // ── toLinks ──────────────────────────────────────────────────────────────

  toLinks(data: PlanGraphData, enabledGroups: Set<EntityGroup>): FractalLink[] {
    const links: FractalLink[] = []
    const { planId, graph, constraints, decisions, commits, chatSessions, commitFilesMap, featureGraphs, activeFeatureGraphIds } = data
    const tasks = graph.nodes || []

    // We need the full node ID set (including all groups) to validate link endpoints
    const nodeIds = new Set<string>()
    nodeIds.add(planId)
    for (const t of tasks) {
      nodeIds.add(t.id)
      for (const s of t.steps || []) nodeIds.add(`step:${s.id}`)
      for (const f of t.affected_files || []) nodeIds.add(`file:${f}`)
    }
    for (const c of constraints) nodeIds.add(`constraint:${c.id}`)
    for (const d of decisions) nodeIds.add(`decision:${d.id}`)
    for (const c of commits) {
      nodeIds.add(`commit:${c.sha}`)
      for (const f of commitFilesMap.get(c.sha) || []) nodeIds.add(`file:${f}`)
    }
    for (const s of chatSessions) nodeIds.add(`chat_session:${s.id}`)

    // Build file suffix index for FG resolution
    const existingFilePaths: string[] = []
    for (const id of nodeIds) {
      if (id.startsWith('file:')) existingFilePaths.push(id.slice(5))
    }

    // FG nodes
    const fgEntityIdMap = new Map<string, string>()
    if (activeFeatureGraphIds.size > 0) {
      for (const fg of featureGraphs) {
        if (!activeFeatureGraphIds.has(fg.id)) continue
        const fgId = `feature_graph:${fg.id}`
        nodeIds.add(fgId)
        for (const entity of fg.entities || []) {
          const eType = entity.entity_type.toLowerCase()
          if (eType === 'file' || eType === 'function') {
            const resolved = eType === 'file'
              ? resolveFileNodeId(entity.entity_id, existingFilePaths, nodeIds)
              : entity.entity_id
            fgEntityIdMap.set(entity.entity_id, resolved)
            nodeIds.add(resolved)
          }
        }
      }
    }

    const addLink = (source: string, target: string, type: FractalLink['type'], weight?: number) => {
      const group = edgeGroup(type)
      if (!enabledGroups.has(group)) return
      if (!nodeIds.has(source) || !nodeIds.has(target)) return
      links.push(makeLink(source, target, type, group, weight))
    }

    // ── Core edges ──────────────────────────────────────────────────────
    for (const task of tasks) {
      addLink(planId, task.id, 'HAS_TASK')
    }
    for (const edge of graph.edges || []) {
      addLink(edge.from, edge.to, 'DEPENDS_ON')
    }

    // ── Step edges (task → steps) ────────────────────────────────────────
    for (const task of tasks) {
      for (const step of task.steps || []) {
        addLink(task.id, `step:${step.id}`, 'HAS_STEP')
      }
    }

    // ── Code edges (task → affected files) ──────────────────────────────
    for (const task of tasks) {
      for (const filePath of task.affected_files || []) {
        addLink(task.id, `file:${filePath}`, 'AFFECTS')
      }
    }

    // ── Knowledge edges ─────────────────────────────────────────────────
    for (const constraint of constraints) {
      addLink(planId, `constraint:${constraint.id}`, 'HAS_CONSTRAINT')
    }
    for (const decision of decisions) {
      const decId = `decision:${decision.id}`
      const taskId = (decision as unknown as { task_id?: string }).task_id
      const linkTarget = taskId && tasks.some((n) => n.id === taskId) ? taskId : planId
      addLink(linkTarget, decId, 'HAS_DECISION')
    }

    // ── Git edges ───────────────────────────────────────────────────────
    for (const commit of commits) {
      const commitId = `commit:${commit.sha}`
      addLink(planId, commitId, 'LINKED_TO')
      for (const filePath of commitFilesMap.get(commit.sha) || []) {
        addLink(commitId, `file:${filePath}`, 'TOUCHES')
      }
    }

    // ── Session edges ───────────────────────────────────────────────────
    for (const session of chatSessions) {
      addLink(planId, `chat_session:${session.id}`, 'DISCUSSED')
    }

    // ── Feature graph edges ─────────────────────────────────────────────
    if (activeFeatureGraphIds.size > 0) {
      for (const fg of featureGraphs) {
        if (!activeFeatureGraphIds.has(fg.id)) continue
        const fgId = `feature_graph:${fg.id}`
        addLink(planId, fgId, 'HAS_FEATURE_GRAPH')

        for (const entity of fg.entities || []) {
          const eType = entity.entity_type.toLowerCase()
          if (eType === 'file' || eType === 'function') {
            const resolved = fgEntityIdMap.get(entity.entity_id) ?? entity.entity_id
            addLink(fgId, resolved, 'CONTAINS')
          }
        }

        // FG internal relations
        for (const rel of fg.relations || []) {
          const rawSourceId = rel.source_type.toLowerCase() === 'file' ? `file:${rel.source_id}` : rel.source_id
          const rawTargetId = rel.target_type.toLowerCase() === 'file' ? `file:${rel.target_id}` : rel.target_id
          const sourceId = fgEntityIdMap.get(rel.source_id) ?? rawSourceId
          const targetId = fgEntityIdMap.get(rel.target_id) ?? rawTargetId
          if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
            links.push(makeLink(sourceId, targetId, rel.relation_type as FractalLink['type'], 'features'))
          }
        }
      }
    }

    return links
  },

  // ── countByGroup ─────────────────────────────────────────────────────────

  countByGroup(data: PlanGraphData): Record<EntityGroup, number> {
    const counts: Record<EntityGroup, number> = {
      core: 0,
      code: 0,
      knowledge: 0,
      git: 0,
      sessions: 0,
      features: 0,
      behavioral: 0,
    }

    const { graph, constraints, decisions, commits, chatSessions, featureGraphs } = data
    const tasks = graph.nodes || []

    // Core: plan (1) + tasks + steps
    let stepCount = 0
    for (const task of tasks) { stepCount += (task.steps || []).length }
    counts.core = 1 + tasks.length + stepCount

    // Code: unique files across all tasks
    const uniqueFiles = new Set<string>()
    for (const task of tasks) {
      for (const f of task.affected_files || []) uniqueFiles.add(f)
    }
    counts.code = uniqueFiles.size

    // Knowledge: constraints + decisions
    counts.knowledge = constraints.length + decisions.length

    // Git: commits (+ their touched files are already counted in code)
    counts.git = commits.length

    // Sessions
    counts.sessions = chatSessions.length

    // Features: feature graphs available (regardless of active state)
    counts.features = featureGraphs.length

    return counts
  },
}
