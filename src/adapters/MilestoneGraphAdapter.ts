// ============================================================================
// MilestoneGraphAdapter — GraphAdapter<MilestoneGraphData> for milestone-level
// ============================================================================
//
// Transforms a milestone's enriched data (plans with tasks and steps) into
// FractalNode[] / FractalLink[], filtered by enabled EntityGroups.
//
// Milestone graph structure:
//   - Milestone center node (core)
//   - Plan nodes (core) — linked to milestone via CONTAINS
//   - Task nodes (core) — nested inside plans via HAS_TASK
//   - Inter-task DEPENDS_ON edges (if tasks share the same plan dependency graph)
//
// Uses the enriched MilestoneDetail response that already includes
// plans[].tasks[].steps[] — no extra backend endpoint needed.
// ============================================================================

import { ENTITY_COLORS } from '@/constants/intelligence'
import type { IntelligenceEntityType, IntelligenceLayer } from '@/types/intelligence'
import type { MilestonePlanSummary, MilestoneProgress } from '@/types'
import type {
  GraphAdapter,
  EntityGroup,
  FractalNode,
  FractalLink,
  ScaleLevel,
} from '@/types/fractal-graph'
import { getGroupsForScale, getEntityGroup } from '@/types/fractal-graph'

// ── Data bundle passed to the adapter ────────────────────────────────────────

export interface MilestoneGraphData {
  milestoneId: string
  milestoneTitle: string
  milestoneStatus: string
  plans: MilestonePlanSummary[]
  progress: MilestoneProgress
}

// ── Layer mapping ────────────────────────────────────────────────────────────

const LAYER_MAP: Record<string, IntelligenceLayer> = {
  milestone: 'pm', plan: 'pm', task: 'pm', step: 'pm',
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

function statusToEnergy(status: string | undefined): number {
  switch (status) {
    case 'in_progress': return 0.8
    case 'completed': return 0.3
    case 'blocked': return 0.7
    case 'failed': return 0.2
    case 'approved': return 0.6
    case 'draft': return 0.4
    case 'pending': return 0.5
    default: return 0.5
  }
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
    scaleLevel: 'project' as ScaleLevel, // Milestones are at project scale
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

  // ── toNodes ──────────────────────────────────────────────────────────────

  toNodes(data: MilestoneGraphData, enabledGroups: Set<EntityGroup>): FractalNode[] {
    const nodes: FractalNode[] = []
    const nodeIds = new Set<string>()

    const addNode = (node: FractalNode) => {
      if (nodeIds.has(node.id)) return
      nodeIds.add(node.id)
      if (enabledGroups.has(node.group)) {
        nodes.push(node)
      }
    }

    const { milestoneId, milestoneTitle, milestoneStatus, plans, progress } = data

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
      }
    }

    // ── Limit to ~200 nodes ──────────────────────────────────────────────
    if (nodes.length > 200) {
      const kept = new Set(nodes.slice(0, 200).map((n) => n.id))
      kept.add(milestoneId)
      return nodes.filter((n) => kept.has(n.id))
    }

    return nodes
  },

  // ── toLinks ──────────────────────────────────────────────────────────────

  toLinks(data: MilestoneGraphData, enabledGroups: Set<EntityGroup>): FractalLink[] {
    const links: FractalLink[] = []
    const { milestoneId, plans } = data

    // Build nodeId set
    const nodeIds = new Set<string>()
    nodeIds.add(milestoneId)
    for (const plan of plans) {
      nodeIds.add(plan.id)
      for (const task of plan.tasks) nodeIds.add(task.id)
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
      }
    }

    return links
  },

  // ── countByGroup ─────────────────────────────────────────────────────────

  countByGroup(data: MilestoneGraphData): Record<EntityGroup, number> {
    const totalTasks = data.plans.reduce((sum, p) => sum + p.tasks.length, 0)

    return {
      core: 1 + data.plans.length + totalTasks, // milestone + plans + tasks
      code: 0,
      knowledge: 0,
      git: 0,
      sessions: 0,
      features: 0,
      behavioral: 0,
    }
  },
}
