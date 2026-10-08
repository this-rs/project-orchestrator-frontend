/**
 * Files that draw an entity of a referenceable kind WITHOUT declaring it, each
 * with the reason. This list is a ratchet: it can only get shorter.
 * `RATCHET_MAX` must equal its length; adding an exception means raising that
 * number in the same diff, which a reviewer will see. Declare the element
 * instead (see the top of `refSource.ts`).
 */
export const RATCHET_MAX = 8

export const COVERAGE_EXCEPTIONS: Record<string, { kinds: string[]; why: string }> = {
  'src/components/discussions/LinkedDiscussions.tsx': {
    kinds: ['plan'],
    why: 'A link inside a sentence ("busy on plan X"): text, not an entity block. The plan is declared on its own page and rows.',
  },
  'src/components/runner/RunnerHeader.tsx': {
    kinds: ['plan'],
    why: 'Runner dashboard header: an "Open plan" menu action, not the plan drawn. Follow-up: declare the runner header as the plan.',
  },
  'src/components/runner/WaveAgentCard.tsx': {
    kinds: ['task'],
    why: 'Runner agent card (an agent working on a task): navigation to the task, which is declared on its page. Follow-up.',
  },
  'src/components/today/MiniThreadGraph.tsx': {
    kinds: ['plan'],
    why: 'A whole-block link around a graph, inside a thread row whose title (ThreadRow / PlanRunRow) is declared as the plan.',
  },
  'src/components/today/PlanStateBar.tsx': {
    kinds: ['plan'],
    why: 'A whole-block link around a state bar, inside a thread row whose title is declared as the plan.',
  },
  'src/pages/MilestoneDetailPage.tsx': {
    kinds: ['plan', 'task'],
    why: 'Navigation from graph clicks only; the plans and tasks it lists are drawn by expandable/index.tsx, which is declared.',
  },
  'src/pages/TaskDetailPage.tsx': {
    kinds: ['plan'],
    why: 'Parent breadcrumb link to the plan, inside a page whose header and dependency rows declare the task.',
  },
  'src/pages/TasksPage.tsx': {
    kinds: ['plan'],
    why: 'Inline link to the parent plan in the meta line of a declared task row.',
  },
}
