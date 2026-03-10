// ============================================================================
// MilestoneGraphAdapter — GraphAdapter<MilestoneGraphData> for milestone-level
// ============================================================================
//
// Transforms a milestone's enriched data into FractalNode[] / FractalLink[],
// filtered by enabled EntityGroups.
//
// Milestone graph structure:
//   - Milestone center node (core)
//   - Plan nodes (core) — linked to milestone via CONTAINS
//   - Task nodes (core) — nested inside plans via HAS_TASK
//   - Step nodes (core) — ordered chain within each task via HAS_STEP
//   - File nodes (code) — affected_files from tasks
//   - Decision nodes (knowledge) — linked to tasks
//   - Note nodes (knowledge) — linked to tasks
//   - Commit nodes (git) — linked to tasks, TOUCHES files
// ============================================================================

import { ENTITY_COLORS } from '@/constants/intelligence'
import type { IntelligenceEntityType, IntelligenceLayer } from '@/types/intelligence'
import type { MilestonePlanSummary, MilestoneProgress, Decision, Commit, Constraint, ChatSession, FeatureGraphDetail } from '@/types'
import type {
  GraphAdapter,
  EntityGroup,
  FractalNode,
  FractalLink,
  ScaleLevel,
} from '@/types/fractal-graph'
import { getGroupsForScale, getEntityGroup } from '@/types/fractal-graph'

// ── Per-task enrichment (fetched by useMilestoneGraphData) ───────────────────

export interface TaskEnrichment {
  affectedFiles: string[]
  decisions: Decision[]
  commits: Commit[]
  notes: Array<{ id: string; content: string; note_type: string; importance?: string }>
  commitFilesMap: Map<string, string[]>
}

// ── Per-plan enrichment (fetched by useMilestoneGraphData) ───────────────────

export interface PlanEnrichment {
  constraints: Constraint[]
  commits: Commit[]
  commitFilesMap: Map<string, string[]>
}

// ── Data bundle passed to the adapter ────────────────────────────────────────

export interface MilestoneGraphData {
  milestoneId: string
  milestoneTitle: string
  milestoneStatus: string
  plans: MilestonePlanSummary[]
  progress: MilestoneProgress
  /** Per-task enrichment data (affected_files, commits, decisions, notes) */
  taskEnrichments: Map<string, TaskEnrichment>
  /** Per-plan enrichment data (constraints, plan-level commits) */
  planEnrichments: Map<string, PlanEnrichment>
  /** Chat sessions from the project (sessions group) */
  chatSessions: ChatSession[]
  /** Feature graphs from the project (features group) */
  featureGraphs: FeatureGraphDetail[]
}

// ── Layer mapping ────────────────────────────────────────────────────────────

const LAYER_MAP: Record<string, IntelligenceLayer> = {
  milestone: 'pm', plan: 'pm', task: 'pm', step: 'pm',
  file: 'code', function: 'code', struct: 'code',
  feature_graph: 'code',
  note: 'knowledge', decision: 'knowledge', constraint: 'knowledge',
  commit: 'pm',
  chat_session: 'chat',
  skill: 'skills',
  protocol: 'behavioral', protocol_state: 'behavioral',
}

// ── Status → color / energy ──────────────────────────────────────────────────

const PLAN_STATUS_COLORS: Record<string, string> = {
  draft: '#9CA3AF',
  approved: '#3B82F6',
  in_progress: '#818CF8',
  completed: '#22C55E',
  cancelled: '#EF4444',
}

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
    case 'approved': return 0.6
    case 'draft': return 0.4
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    scaleLevel: 'project' as ScaleLevel,
    data,
    subtitle: opts?.subtitle,
    progress: opts?.progress,
    energy: opts?.energy ?? (data.energy as number | undefined),
    status: opts?.status,
    drillTarget: opts?.drillTarget,
    childCount: opts?.childCount,
  }
}

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
// MilestoneGraphAdapter
// ============================================================================

export const MilestoneGraphAdapter: GraphAdapter<MilestoneGraphData> = {
  scaleLevel: 'project',
  supportedGroups: getGroupsForScale('project'),
  defaultGroupMode: 'connections',

  // ── toNodes ──────────────────────────────────────────────────────────────

  toNodes(data: MilestoneGraphData, enabledGroups: Set<EntityGroup>): FractalNode[] {
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

    const { milestoneId, milestoneTitle, milestoneStatus, plans, progress, taskEnrichments, planEnrichments, chatSessions, featureGraphs } = data

    // ── Milestone center node (core) ─────────────────────────────────────
    const totalTasks = plans.reduce((sum, p) => sum + p.tasks.length, 0)
    addNode(makeNode(
      milestoneId,
      milestoneTitle,
      'milestone',
      {
        status: milestoneStatus,
        plan_count: plans.length,
        task_count: totalTasks,
        completed_task_count: progress.completed,
        energy: 1.0,
      },
      {
        energy: 1.0,
        status: milestoneStatus,
        progress: progress.percentage / 100,
        childCount: plans.length,
      },
    ))

    // ── Plan nodes (core) ────────────────────────────────────────────────
    for (const plan of plans) {
      const completedTasks = plan.tasks.filter((t) => t.status === 'completed').length
      const planProgress = plan.tasks.length > 0 ? completedTasks / plan.tasks.length : 0

      addNode(makeNode(
        plan.id,
        plan.title,
        'plan',
        {
          status: plan.status,
          task_count: plan.tasks.length,
          completed_task_count: completedTasks,
          energy: 0.8,
        },
        {
          color: PLAN_STATUS_COLORS[plan.status ?? 'draft'] ?? ENTITY_COLORS.plan,
          status: plan.status,
          energy: statusToEnergy(plan.status),
          progress: planProgress,
          drillTarget: { level: 'plan', id: plan.id },
          childCount: plan.tasks.length,
        },
      ))

      // ── Task nodes (core) ──────────────────────────────────────────────
      for (const task of plan.tasks) {
        const completedSteps = task.steps.filter((s) =>
          s.status.toLowerCase() === 'completed',
        ).length
        const stepProgress = task.steps.length > 0 ? completedSteps / task.steps.length : undefined

        addNode(makeNode(
          task.id,
          task.title || task.description.slice(0, 30),
          'task',
          {
            status: task.status,
            priority: task.priority,
            step_count: task.steps.length,
            completed_step_count: completedSteps,
            tags: task.tags,
            energy: statusToEnergy(task.status),
          },
          {
            color: TASK_STATUS_COLORS[task.status] ?? ENTITY_COLORS.task,
            status: task.status,
            energy: statusToEnergy(task.status),
            progress: stepProgress,
            drillTarget: { level: 'task', id: task.id },
            childCount: task.steps.length,
          },
        ))

        // ── Step nodes (core) — ordered chain within task ────────────────
        const sortedSteps = [...task.steps].sort((a, b) => a.order - b.order)
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

        // ── Enrichment data (affected_files, decisions, commits, notes) ──
        const enrichment = taskEnrichments.get(task.id)
        if (enrichment) {
          // Affected files (code group)
          for (const filePath of enrichment.affectedFiles) {
            const fileId = `file:${filePath}`
            if (!fileNodeIds.has(fileId)) {
              fileNodeIds.add(fileId)
              const parts = filePath.split('/')
              const fileName = parts[parts.length - 1] || filePath
              addNode(makeNode(fileId, fileName, 'file', { path: filePath, energy: 0.3 }, { subtitle: filePath, energy: 0.3 }))
            }
          }

          // Decisions (knowledge group)
          for (const decision of enrichment.decisions) {
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

          // Notes (knowledge group)
          for (const note of enrichment.notes) {
            addNode(makeNode(
              `note:${note.id}`,
              note.content.slice(0, 30),
              'note',
              { note_type: note.note_type, importance: note.importance, energy: 0.4 },
              { energy: 0.4, subtitle: note.note_type },
            ))
          }

          // Commits (git group)
          for (const commit of enrichment.commits) {
            addNode(makeNode(
              `commit:${commit.sha}`,
              commit.sha.slice(0, 7) + (commit.message ? ` ${commit.message.slice(0, 20)}` : ''),
              'commit',
              { ...commit, energy: 0.2 },
              { energy: 0.2, subtitle: commit.message?.slice(0, 50) },
            ))

            // TOUCHES files from commits
            const touchedFiles = enrichment.commitFilesMap.get(commit.sha) || []
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
        }
      }
    }

    // ── Plan-level enrichments (constraints, plan-level commits) ────────
    for (const plan of plans) {
      const planEnrichment = planEnrichments.get(plan.id)
      if (!planEnrichment) continue

      // Constraints (knowledge group)
      for (const constraint of planEnrichment.constraints) {
        const constraintId = `constraint:${constraint.id}`
        addNode(makeNode(
          constraintId,
          constraint.description.slice(0, 30),
          'constraint',
          { ...constraint, energy: 0.4 },
          { energy: 0.4, subtitle: constraint.constraint_type },
        ))
      }

      // Plan-level commits (git group) — deduplicated with task-level commits
      for (const commit of planEnrichment.commits) {
        addNode(makeNode(
          `commit:${commit.sha}`,
          commit.sha.slice(0, 7) + (commit.message ? ` ${commit.message.slice(0, 20)}` : ''),
          'commit',
          { ...commit, energy: 0.2 },
          { energy: 0.2, subtitle: commit.message?.slice(0, 50) },
        ))

        // TOUCHES files from plan-level commits
        const touchedFiles = planEnrichment.commitFilesMap.get(commit.sha) || []
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

    // ── Feature graphs (features group) ─────────────────────────────────
    for (const fg of featureGraphs) {
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
          const entityNodeId = eType === 'file' ? `file:${entity.entity_id}` : entity.entity_id
          if (!nodeIds.has(entityNodeId)) {
            if (eType === 'file') {
              const parts = entity.entity_id.split('/')
              const fileName = entity.name || parts[parts.length - 1] || entity.entity_id
              if (!fileNodeIds.has(entityNodeId)) {
                fileNodeIds.add(entityNodeId)
                addNode(makeNode(entityNodeId, fileName, 'file', { path: entity.entity_id, energy: 0.3 }, { subtitle: entity.entity_id, energy: 0.3 }))
              }
            } else {
              const funcName = entity.name || entity.entity_id.split('::').pop() || entity.entity_id
              addNode(makeNode(entityNodeId, funcName, 'function', { energy: 0.3 }, { energy: 0.3 }))
            }
          }
        }
      }
    }

    // ── Limit to ~300 nodes ──────────────────────────────────────────────
    if (nodes.length > 300) {
      const kept = new Set(nodes.slice(0, 300).map((n) => n.id))
      kept.add(milestoneId)
      return nodes.filter((n) => kept.has(n.id))
    }

    return nodes
  },

  // ── toLinks ──────────────────────────────────────────────────────────────

  toLinks(data: MilestoneGraphData, enabledGroups: Set<EntityGroup>): FractalLink[] {
    const links: FractalLink[] = []
    const { milestoneId, plans, taskEnrichments, planEnrichments, chatSessions, featureGraphs } = data

    // Build nodeId set for link validation
    const nodeIds = new Set<string>()
    nodeIds.add(milestoneId)
    for (const plan of plans) {
      nodeIds.add(plan.id)
      for (const task of plan.tasks) {
        nodeIds.add(task.id)
        for (const step of task.steps) nodeIds.add(`step:${step.id}`)
        const enrichment = taskEnrichments.get(task.id)
        if (enrichment) {
          for (const f of enrichment.affectedFiles) nodeIds.add(`file:${f}`)
          for (const d of enrichment.decisions) nodeIds.add(`decision:${d.id}`)
          for (const n of enrichment.notes) nodeIds.add(`note:${n.id}`)
          for (const c of enrichment.commits) {
            nodeIds.add(`commit:${c.sha}`)
            for (const f of enrichment.commitFilesMap.get(c.sha) || []) nodeIds.add(`file:${f}`)
          }
        }
      }
      // Plan enrichment nodeIds
      const planEnrichment = planEnrichments.get(plan.id)
      if (planEnrichment) {
        for (const c of planEnrichment.constraints) nodeIds.add(`constraint:${c.id}`)
        for (const c of planEnrichment.commits) {
          nodeIds.add(`commit:${c.sha}`)
          for (const f of planEnrichment.commitFilesMap.get(c.sha) || []) nodeIds.add(`file:${f}`)
        }
      }
    }
    // Session nodeIds
    for (const s of chatSessions) nodeIds.add(`chat_session:${s.id}`)
    // Feature graph nodeIds
    for (const fg of featureGraphs) {
      nodeIds.add(`feature_graph:${fg.id}`)
      for (const entity of fg.entities || []) {
        const eType = entity.entity_type.toLowerCase()
        if (eType === 'file') nodeIds.add(`file:${entity.entity_id}`)
        else if (eType === 'function') nodeIds.add(entity.entity_id)
      }
    }

    const addLink = (source: string, target: string, type: FractalLink['type'], group: EntityGroup) => {
      if (!enabledGroups.has(group)) return
      if (!nodeIds.has(source) || !nodeIds.has(target)) return
      links.push(makeLink(source, target, type, group))
    }

    // ── Core edges ───────────────────────────────────────────────────────

    // Milestone → Plans
    for (const plan of plans) {
      addLink(milestoneId, plan.id, 'CONTAINS', 'core')

      // Plan → Tasks
      for (const task of plan.tasks) {
        addLink(plan.id, task.id, 'HAS_TASK', 'core')

        // Task → first step, then step chain
        const sortedSteps = [...task.steps].sort((a, b) => a.order - b.order)
        if (sortedSteps.length > 0) {
          addLink(task.id, `step:${sortedSteps[0].id}`, 'HAS_STEP', 'core')
        }
        for (let i = 0; i < sortedSteps.length - 1; i++) {
          addLink(`step:${sortedSteps[i].id}`, `step:${sortedSteps[i + 1].id}`, 'HAS_STEP', 'core')
        }

        // ── Task enrichment edges ────────────────────────────────────────
        const enrichment = taskEnrichments.get(task.id)
        if (enrichment) {
          // Code edges (task → affected files)
          for (const filePath of enrichment.affectedFiles) {
            addLink(task.id, `file:${filePath}`, 'AFFECTS', 'code')
          }

          // Knowledge edges
          for (const decision of enrichment.decisions) {
            addLink(task.id, `decision:${decision.id}`, 'HAS_DECISION', 'knowledge')
          }
          for (const note of enrichment.notes) {
            addLink(task.id, `note:${note.id}`, 'LINKED_TO', 'knowledge')
          }

          // Git edges
          for (const commit of enrichment.commits) {
            addLink(task.id, `commit:${commit.sha}`, 'LINKED_TO', 'git')
            for (const filePath of enrichment.commitFilesMap.get(commit.sha) || []) {
              addLink(`commit:${commit.sha}`, `file:${filePath}`, 'TOUCHES', 'git')
            }
          }
        }
      }

      // ── Plan enrichment edges (constraints, plan-level commits) ────────
      const planEnrichment = planEnrichments.get(plan.id)
      if (planEnrichment) {
        // Knowledge edges (plan → constraints)
        for (const constraint of planEnrichment.constraints) {
          addLink(plan.id, `constraint:${constraint.id}`, 'HAS_CONSTRAINT', 'knowledge')
        }

        // Git edges (plan → plan-level commits)
        for (const commit of planEnrichment.commits) {
          addLink(plan.id, `commit:${commit.sha}`, 'LINKED_TO', 'git')
          for (const filePath of planEnrichment.commitFilesMap.get(commit.sha) || []) {
            addLink(`commit:${commit.sha}`, `file:${filePath}`, 'TOUCHES', 'git')
          }
        }
      }
    }

    // ── Session edges (milestone → chat sessions) ────────────────────────
    for (const session of chatSessions) {
      addLink(milestoneId, `chat_session:${session.id}`, 'DISCUSSED', 'sessions')
    }

    // ── Feature graph edges (milestone → feature graphs → entities) ──────
    for (const fg of featureGraphs) {
      const fgId = `feature_graph:${fg.id}`
      addLink(milestoneId, fgId, 'HAS_FEATURE_GRAPH', 'features')

      for (const entity of fg.entities || []) {
        const eType = entity.entity_type.toLowerCase()
        if (eType === 'file' || eType === 'function') {
          const entityNodeId = eType === 'file' ? `file:${entity.entity_id}` : entity.entity_id
          addLink(fgId, entityNodeId, 'CONTAINS', 'features')
        }
      }

      // FG internal relations
      for (const rel of fg.relations || []) {
        const sourceId = rel.source_type.toLowerCase() === 'file' ? `file:${rel.source_id}` : rel.source_id
        const targetId = rel.target_type.toLowerCase() === 'file' ? `file:${rel.target_id}` : rel.target_id
        if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
          links.push(makeLink(sourceId, targetId, rel.relation_type as FractalLink['type'], 'features'))
        }
      }
    }

    return links
  },

  // ── countByGroup ─────────────────────────────────────────────────────────

  countByGroup(data: MilestoneGraphData): Record<EntityGroup, number> {
    let totalSteps = 0
    let totalDecisions = 0
    let totalNotes = 0
    let totalConstraints = 0
    let totalCommits = 0
    const totalTasks = data.plans.reduce((sum, p) => sum + p.tasks.length, 0)
    const fileSet = new Set<string>()
    const commitSet = new Set<string>()

    for (const plan of data.plans) {
      // Plan-level enrichment
      const planEnrichment = data.planEnrichments.get(plan.id)
      if (planEnrichment) {
        totalConstraints += planEnrichment.constraints.length
        for (const c of planEnrichment.commits) commitSet.add(c.sha)
        for (const files of planEnrichment.commitFilesMap.values()) {
          for (const f of files) fileSet.add(f)
        }
      }

      for (const task of plan.tasks) {
        totalSteps += task.steps.length
        const enrichment = data.taskEnrichments.get(task.id)
        if (enrichment) {
          for (const f of enrichment.affectedFiles) fileSet.add(f)
          totalDecisions += enrichment.decisions.length
          totalNotes += enrichment.notes.length
          for (const c of enrichment.commits) commitSet.add(c.sha)
          for (const files of enrichment.commitFilesMap.values()) {
            for (const f of files) fileSet.add(f)
          }
        }
      }
    }
    totalCommits = commitSet.size

    return {
      core: 1 + data.plans.length + totalTasks + totalSteps, // milestone + plans + tasks + steps
      code: fileSet.size,
      knowledge: totalDecisions + totalNotes + totalConstraints,
      git: totalCommits,
      sessions: data.chatSessions.length,
      features: data.featureGraphs.length,
      behavioral: 0,
    }
  },
}
