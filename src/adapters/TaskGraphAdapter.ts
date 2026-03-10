// ============================================================================
// TaskGraphAdapter — GraphAdapter<TaskGraphData> for task-level visualization
// ============================================================================
//
// Transforms a task's context (steps, decisions, notes, commits, affected files)
// into FractalNode[] / FractalLink[], filtered by enabled EntityGroups.
//
// Steps form an ordered DAG chain: step0 → step1 → step2 → ...
// Other entities (files, decisions, commits) attach as satellite nodes.
//
// Replaces TaskUniverse3D + useTaskUniverse with the unified adapter pattern.
// ============================================================================

import { ENTITY_COLORS } from '@/constants/intelligence'
import type { IntelligenceEntityType, IntelligenceLayer } from '@/types/intelligence'
import type { Step, Decision, Commit, Constraint } from '@/types'
import type {
  GraphAdapter,
  EntityGroup,
  FractalNode,
  FractalLink,
  ScaleLevel,
} from '@/types/fractal-graph'
import { getGroupsForScale, getEntityGroup } from '@/types/fractal-graph'

// ── Data bundle passed to the adapter ────────────────────────────────────────

export interface TaskGraphData {
  taskId: string
  taskTitle: string
  taskStatus: string
  taskPriority?: number
  steps: Step[]
  decisions: Decision[]
  constraints: Constraint[]
  commits: Commit[]
  affectedFiles: string[]
  /** Notes linked to this task (from enriched response or separate fetch) */
  notes: Array<{ id: string; content: string; note_type: string; importance?: string }>
  /** Map of commit SHA → list of file paths touched */
  commitFilesMap: Map<string, string[]>
}

// ── Layer mapping ────────────────────────────────────────────────────────────

const LAYER_MAP: Record<string, IntelligenceLayer> = {
  task: 'pm', step: 'pm', milestone: 'pm', release: 'pm', commit: 'pm',
  file: 'code', function: 'code', struct: 'code',
  note: 'knowledge', decision: 'knowledge', constraint: 'knowledge',
  chat_session: 'chat',
}

// ── Status → color / energy ──────────────────────────────────────────────────

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  in_progress: '#3B82F6',
  blocked: '#F59E0B',
  completed: '#22C55E',
  failed: '#EF4444',
}

const STEP_STATUS_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  in_progress: '#3B82F6',
  completed: '#22C55E',
  skipped: '#F59E0B',
}

function statusToEnergy(status: string | undefined): number {
  switch (status) {
    case 'in_progress': return 0.8
    case 'completed': return 0.3
    case 'blocked': return 0.7
    case 'failed': return 0.2
    case 'pending': return 0.5
    case 'skipped': return 0.1
    default: return 0.5
  }
}

function normalizeStepStatus(status: string): string {
  const s = status.toLowerCase()
  if (s === 'completed') return 'completed'
  if (s === 'inprogress' || s === 'in_progress') return 'in_progress'
  if (s === 'skipped') return 'skipped'
  return 'pending'
}

// ── Helper: create FractalNode ───────────────────────────────────────────────

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
    scaleLevel: 'task' as ScaleLevel,
    data,
    subtitle: opts?.subtitle,
    progress: opts?.progress,
    energy: opts?.energy ?? (data.energy as number | undefined),
    status: opts?.status,
    childCount: opts?.childCount,
  }
}

// ── Helper: create FractalLink ───────────────────────────────────────────────

function makeLink(
  source: string,
  target: string,
  type: FractalLink['type'],
  group: EntityGroup,
  weight?: number,
): FractalLink {
  return { source, target, type, group, weight }
}

// ============================================================================
// TaskGraphAdapter
// ============================================================================

export const TaskGraphAdapter: GraphAdapter<TaskGraphData> = {
  scaleLevel: 'task',
  supportedGroups: getGroupsForScale('task'),

  // ── toNodes ──────────────────────────────────────────────────────────────

  toNodes(data: TaskGraphData, enabledGroups: Set<EntityGroup>): FractalNode[] {
    const nodes: FractalNode[] = []
    const nodeIds = new Set<string>()
    const fileNodeIds = new Set<string>()

    const addNode = (node: FractalNode) => {
      if (nodeIds.has(node.id)) return
      nodeIds.add(node.id)
      if (enabledGroups.has(node.group)) {
        nodes.push(node)
      }
    }

    const { taskId, taskTitle, taskStatus, taskPriority, steps, decisions, constraints, commits, affectedFiles, notes, commitFilesMap } = data

    // ── Task center node (core) ──────────────────────────────────────────
    const completedSteps = steps.filter((s) => normalizeStepStatus(s.status) === 'completed').length
    addNode(makeNode(
      taskId,
      taskTitle,
      'task',
      {
        status: taskStatus,
        priority: taskPriority,
        step_count: steps.length,
        completed_step_count: completedSteps,
        decision_count: decisions.length,
        affected_file_count: affectedFiles.length,
        commit_count: commits.length,
        note_count: notes.length,
        energy: 1.0,
      },
      {
        color: TASK_STATUS_COLORS[taskStatus] ?? ENTITY_COLORS.task,
        status: taskStatus,
        energy: 1.0,
        progress: steps.length > 0 ? completedSteps / steps.length : undefined,
        childCount: steps.length,
      },
    ))

    // ── Step nodes (core) — ordered chain ────────────────────────────────
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order)
    for (const step of sortedSteps) {
      const normalizedStatus = normalizeStepStatus(step.status)
      addNode(makeNode(
        `step:${step.id}`,
        `#${step.order} ${step.description.slice(0, 35)}`,
        'step',
        {
          status: normalizedStatus,
          order: step.order,
          description: step.description,
          verification: step.verification,
          energy: statusToEnergy(normalizedStatus),
        },
        {
          color: STEP_STATUS_COLORS[normalizedStatus] ?? ENTITY_COLORS.step,
          status: normalizedStatus,
          energy: statusToEnergy(normalizedStatus),
          subtitle: step.verification?.slice(0, 40),
        },
      ))
    }

    // ── Affected files (code group) ──────────────────────────────────────
    for (const filePath of affectedFiles) {
      const fileId = `file:${filePath}`
      if (!fileNodeIds.has(fileId)) {
        fileNodeIds.add(fileId)
        const parts = filePath.split('/')
        const fileName = parts[parts.length - 1] || filePath
        addNode(makeNode(fileId, fileName, 'file', { path: filePath, energy: 0.3 }, { subtitle: filePath, energy: 0.3 }))
      }
    }

    // ── Constraints (knowledge group) ────────────────────────────────────
    for (const constraint of constraints) {
      addNode(makeNode(
        `constraint:${constraint.id}`,
        constraint.description.slice(0, 30),
        'constraint',
        { ...constraint, energy: 0.4 },
        { energy: 0.4, subtitle: constraint.constraint_type },
      ))
    }

    // ── Decisions (knowledge group) ──────────────────────────────────────
    for (const decision of decisions) {
      const label = decision.chosen_option
        ? `${decision.description.slice(0, 20)} → ${decision.chosen_option}`
        : decision.description.slice(0, 30)
      addNode(makeNode(
        `decision:${decision.id}`,
        label,
        'decision',
        { ...decision, energy: 0.5 },
        { energy: 0.5, status: decision.status },
      ))
    }

    // ── Notes (knowledge group) ──────────────────────────────────────────
    for (const note of notes) {
      addNode(makeNode(
        `note:${note.id}`,
        note.content.slice(0, 30),
        'note',
        { note_type: note.note_type, importance: note.importance, energy: 0.4 },
        { energy: 0.4, subtitle: note.note_type },
      ))
    }

    // ── Commits (git group) ──────────────────────────────────────────────
    for (const commit of commits) {
      addNode(makeNode(
        `commit:${commit.sha}`,
        commit.sha.slice(0, 7) + (commit.message ? ` ${commit.message.slice(0, 20)}` : ''),
        'commit',
        { ...commit, energy: 0.2 },
        { energy: 0.2, subtitle: commit.message?.slice(0, 50) },
      ))

      // TOUCHES files from commits
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

    // ── Limit to ~100 nodes ──────────────────────────────────────────────
    if (nodes.length > 100) {
      const kept = new Set(nodes.slice(0, 100).map((n) => n.id))
      kept.add(taskId)
      return nodes.filter((n) => kept.has(n.id))
    }

    return nodes
  },

  // ── toLinks ──────────────────────────────────────────────────────────────

  toLinks(data: TaskGraphData, enabledGroups: Set<EntityGroup>): FractalLink[] {
    const links: FractalLink[] = []
    const { taskId, steps, decisions, constraints, commits, affectedFiles, notes, commitFilesMap } = data

    // Build nodeId set for link validation
    const nodeIds = new Set<string>()
    nodeIds.add(taskId)
    for (const s of steps) nodeIds.add(`step:${s.id}`)
    for (const f of affectedFiles) nodeIds.add(`file:${f}`)
    for (const c of constraints) nodeIds.add(`constraint:${c.id}`)
    for (const d of decisions) nodeIds.add(`decision:${d.id}`)
    for (const n of notes) nodeIds.add(`note:${n.id}`)
    for (const c of commits) {
      nodeIds.add(`commit:${c.sha}`)
      for (const f of commitFilesMap.get(c.sha) || []) nodeIds.add(`file:${f}`)
    }

    const addLink = (source: string, target: string, type: FractalLink['type'], group: EntityGroup) => {
      if (!enabledGroups.has(group)) return
      if (!nodeIds.has(source) || !nodeIds.has(target)) return
      links.push(makeLink(source, target, type, group))
    }

    // ── Core edges ───────────────────────────────────────────────────────

    // Task → first step
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order)
    if (sortedSteps.length > 0) {
      addLink(taskId, `step:${sortedSteps[0].id}`, 'HAS_STEP', 'core')
    }

    // Step chain: step0 → step1 → step2 → ...
    for (let i = 0; i < sortedSteps.length - 1; i++) {
      addLink(`step:${sortedSteps[i].id}`, `step:${sortedSteps[i + 1].id}`, 'HAS_STEP', 'core')
    }

    // ── Code edges (task → affected files) ───────────────────────────────
    for (const filePath of affectedFiles) {
      addLink(taskId, `file:${filePath}`, 'AFFECTS', 'code')
    }

    // ── Knowledge edges ──────────────────────────────────────────────────
    for (const constraint of constraints) {
      addLink(taskId, `constraint:${constraint.id}`, 'HAS_CONSTRAINT', 'knowledge')
    }
    for (const decision of decisions) {
      addLink(taskId, `decision:${decision.id}`, 'HAS_DECISION', 'knowledge')
    }
    for (const note of notes) {
      addLink(taskId, `note:${note.id}`, 'LINKED_TO', 'knowledge')
    }

    // ── Git edges ────────────────────────────────────────────────────────
    for (const commit of commits) {
      addLink(taskId, `commit:${commit.sha}`, 'LINKED_TO', 'git')
      for (const filePath of commitFilesMap.get(commit.sha) || []) {
        addLink(`commit:${commit.sha}`, `file:${filePath}`, 'TOUCHES', 'git')
      }
    }

    return links
  },

  // ── countByGroup ─────────────────────────────────────────────────────────

  countByGroup(data: TaskGraphData): Record<EntityGroup, number> {
    const counts: Record<EntityGroup, number> = {
      core: 0,
      code: 0,
      knowledge: 0,
      git: 0,
      sessions: 0,
      features: 0,
      behavioral: 0,
    }

    // Core: task (1) + steps
    counts.core = 1 + data.steps.length

    // Code: affected files
    counts.code = data.affectedFiles.length

    // Knowledge: decisions + notes + constraints
    counts.knowledge = data.decisions.length + data.notes.length + data.constraints.length

    // Git: commits
    counts.git = data.commits.length

    return counts
  },
}
