/**
 * ProgressRenderer — views for progress-related MCP tools.
 *
 * Handles: get_step_progress, get_milestone_progress,
 * get_workspace_milestone_progress, get_project_roadmap,
 * get_dependency_graph, get_critical_path, get_task_context,
 * get_task_blockers, get_tasks_blocked_by.
 */

import {
  StatusBadge, ProgressBar, SectionHeader, McpContainer, truncate,
  EntityLink, CollapsibleList, LinkedId,
} from './utils'

// ---------------------------------------------------------------------------
// Step / milestone progress
// ---------------------------------------------------------------------------

function StepProgress({ data }: { data: Record<string, unknown> }) {
  const completed = (data.completed ?? 0) as number
  const total = (data.total ?? 0) as number
  const steps = (data.steps ?? []) as Record<string, unknown>[]

  return (
    <McpContainer>
      <ProgressBar completed={completed} total={total} />

      {steps.length > 0 && (
        <div className="space-y-0.5 mt-1.5 max-h-48 overflow-y-auto">
          {steps.map((s, i) => {
            const st = (s.status as string) ?? 'pending'
            const icon = st === 'completed' ? '✓' : st === 'in_progress' ? '▸' : st === 'skipped' ? '○' : '·'
            const color = st === 'completed' ? 'text-green-400' : st === 'in_progress' ? 'text-indigo-400' : 'text-gray-600'
            return (
              <div key={s.id as string ?? i} className="flex items-start gap-1.5 text-[11px]">
                <span className={`shrink-0 ${color}`}>{icon}</span>
                <span className="text-gray-400 flex-1">{truncate((s.description as string) ?? '', 120)}</span>
                <StatusBadge status={st} />
              </div>
            )
          })}
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------------

function DependencyGraph({ data }: { data: Record<string, unknown> }) {
  // Handle various response formats
  const nodes = (data.nodes ?? data.tasks ?? data.items ?? []) as Record<string, unknown>[]
  const edges = (data.edges ?? data.dependencies ?? []) as Record<string, unknown>[]

  // Build edge map: task_id → [depends_on_ids]
  const depsOf = new Map<string, string[]>()
  const depBy = new Map<string, string[]>()
  for (const e of edges) {
    const from = String(e.from ?? e.source ?? e.dependency_id ?? '')
    const to = String(e.to ?? e.target ?? e.task_id ?? '')
    if (from && to) {
      depsOf.set(to, [...(depsOf.get(to) ?? []), from])
      depBy.set(from, [...(depBy.get(from) ?? []), to])
    }
  }

  // Sort: tasks with no deps first (roots), then by dep count
  const sorted = [...nodes].sort((a, b) => {
    const aDeps = (depsOf.get(String(a.id ?? '')) ?? []).length
    const bDeps = (depsOf.get(String(b.id ?? '')) ?? []).length
    return aDeps - bDeps
  })

  return (
    <McpContainer>
      <div className="flex items-center gap-3 text-[10px] text-gray-600">
        <span>{nodes.length} task{nodes.length !== 1 ? 's' : ''}</span>
        <span>{edges.length} dependenc{edges.length !== 1 ? 'ies' : 'y'}</span>
      </div>

      {sorted.length > 0 && (
        <div className="space-y-0.5 mt-1.5 max-h-56 overflow-y-auto">
          <CollapsibleList
            items={sorted}
            limit={10}
            label="tasks"
            renderItem={(n, i) => {
              const id = String(n.id ?? '')
              const deps = depsOf.get(id) ?? []
              const blocks = depBy.get(id) ?? []
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-0.5 text-[11px]">
                  <StatusBadge status={(n.status as string) ?? 'pending'} />
                  <EntityLink entityType="task" id={id}>
                    <span className="text-gray-400 truncate hover:text-indigo-400">
                      {(n.title as string) || truncate((n.description as string) ?? '', 50)}
                    </span>
                  </EntityLink>
                  {deps.length > 0 && (
                    <span className="text-[9px] text-gray-600 shrink-0" title={`Depends on ${deps.length} task(s)`}>
                      ← {deps.length}
                    </span>
                  )}
                  {blocks.length > 0 && (
                    <span className="text-[9px] text-amber-600 shrink-0" title={`Blocks ${blocks.length} task(s)`}>
                      → {blocks.length}
                    </span>
                  )}
                </div>
              )
            }}
          />
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Critical path
// ---------------------------------------------------------------------------

function CriticalPath({ data }: { data: Record<string, unknown> }) {
  const path = (data.path ?? data.critical_path ?? data.tasks ?? []) as Record<string, unknown>[]
  const totalEstimate = data.total_estimate as number | undefined

  return (
    <McpContainer>
      <SectionHeader count={path.length}>Critical path</SectionHeader>
      {totalEstimate != null && (
        <div className="text-[10px] text-gray-600">estimated: {totalEstimate} units</div>
      )}
      {path.length > 0 && (
        <div className="space-y-0.5 mt-1 max-h-48 overflow-y-auto">
          {path.map((n, i) => {
            const id = String(n.id ?? '')
            return (
              <div key={i} className="flex items-center gap-2 px-2 py-0.5 text-[11px]">
                <span className="text-gray-600 font-mono shrink-0 w-4 text-right">{i + 1}.</span>
                <StatusBadge status={(n.status as string) ?? 'pending'} />
                <EntityLink entityType="task" id={id}>
                  <span className="text-gray-400 truncate hover:text-indigo-400">
                    {(n.title as string) || truncate((n.description as string) ?? '', 60)}
                  </span>
                </EntityLink>
                {i < path.length - 1 && (
                  <span className="text-gray-700 text-[9px] shrink-0">→</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Task blockers / blocked by
// ---------------------------------------------------------------------------

function TaskBlockers({ data, label }: { data: unknown; label: string }) {
  const tasks = Array.isArray(data) ? data as Record<string, unknown>[] :
    (data as Record<string, unknown>)?.blockers ?? (data as Record<string, unknown>)?.blocked ?? []
  const list = Array.isArray(tasks) ? tasks as Record<string, unknown>[] : []

  if (list.length === 0) {
    return (
      <McpContainer>
        <div className="text-gray-600 italic">No {label.toLowerCase()}</div>
      </McpContainer>
    )
  }

  return (
    <McpContainer>
      <SectionHeader count={list.length}>{label}</SectionHeader>
      <div className="space-y-0.5 max-h-32 overflow-y-auto">
        {list.map((t, i) => {
          const id = String(t.id ?? '')
          return (
            <div key={i} className="flex items-center gap-2 px-2 py-0.5 text-[11px]">
              <StatusBadge status={(t.status as string) ?? 'pending'} />
              <EntityLink entityType="task" id={id}>
                <span className="text-gray-400 truncate hover:text-indigo-400">
                  {(t.title as string) || truncate((t.description as string) ?? '', 60)}
                </span>
              </EntityLink>
            </div>
          )
        })}
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Task context (rich context view)
// ---------------------------------------------------------------------------

function TaskContext({ data }: { data: Record<string, unknown> }) {
  const task = (data.task ?? data) as Record<string, unknown>
  const plan = data.plan as Record<string, unknown> | undefined
  const constraints = (data.constraints ?? []) as Record<string, unknown>[]
  const decisions = (data.decisions ?? []) as Record<string, unknown>[]
  const notes = (data.notes ?? []) as Record<string, unknown>[]

  return (
    <McpContainer>
      <div className="flex items-center gap-2">
        <EntityLink entityType="task" id={String(task.id ?? '')}>
          <span className="text-gray-300 font-medium hover:text-indigo-400">
            {String(task.title ?? '') || truncate(String(task.description ?? ''), 60)}
          </span>
        </EntityLink>
        {task.status ? <StatusBadge status={String(task.status)} /> : null}
      </div>

      {plan && (
        <div className="text-[10px] text-gray-600 mt-0.5 flex items-center gap-1">
          <span>Plan:</span>
          <EntityLink entityType="plan" id={String(plan.id ?? '')}>
            <span className="hover:text-indigo-400">{(plan.title as string) || 'Untitled'}</span>
          </EntityLink>
          {plan.id ? <LinkedId field="plan_id" value={String(plan.id)} /> : null}
        </div>
      )}

      {constraints.length > 0 && (
        <div className="mt-1">
          <SectionHeader count={constraints.length}>Constraints</SectionHeader>
          {constraints.map((c, i) => (
            <div key={i} className="text-[10px] text-gray-500 flex items-center gap-1">
              <span className="text-amber-500">⚠</span>
              {truncate((c.description as string) ?? '', 80)}
            </div>
          ))}
        </div>
      )}

      {decisions.length > 0 && (
        <div className="mt-1">
          <SectionHeader count={decisions.length}>Decisions</SectionHeader>
          {decisions.map((d, i) => (
            <div key={i} className="text-[10px] text-gray-500">
              {truncate((d.description as string) ?? '', 80)}
              {d.chosen_option ? <span className="text-indigo-400 ml-1">→ {String(d.chosen_option)}</span> : null}
            </div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-1">
          <SectionHeader count={notes.length}>Notes</SectionHeader>
          {notes.map((n, i) => (
            <div key={i} className="text-[10px] text-gray-500">
              {truncate((n.content as string) ?? '', 100)}
            </div>
          ))}
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

function Roadmap({ data }: { data: Record<string, unknown> }) {
  const milestones = (data.milestones ?? []) as Record<string, unknown>[]
  const releases = (data.releases ?? []) as Record<string, unknown>[]

  return (
    <McpContainer>
      {milestones.length > 0 && (
        <div>
          <SectionHeader count={milestones.length}>Milestones</SectionHeader>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-2 px-2 text-[11px]">
                <StatusBadge status={(m.status as string) ?? 'planned'} />
                <EntityLink entityType="milestone" id={String(m.id ?? '')}>
                  <span className="text-gray-400 truncate hover:text-indigo-400">{String(m.title ?? '')}</span>
                </EntityLink>
                {m.progress != null && (
                  <span className="text-gray-600 text-[10px] font-mono shrink-0">{String(m.progress)}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {releases.length > 0 && (
        <div>
          <SectionHeader count={releases.length}>Releases</SectionHeader>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {releases.map((r, i) => (
              <div key={i} className="flex items-center gap-2 px-2 text-[11px]">
                <span className="font-mono text-indigo-400">{String(r.version ?? '')}</span>
                <StatusBadge status={String(r.status ?? 'planned')} />
                {r.title ? <span className="text-gray-400 truncate">{String(r.title)}</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const PROGRESS_RENDERERS: Record<string, React.ComponentType<{ data: unknown }>> = {
  get_step_progress: ({ data }) => <StepProgress data={(data ?? {}) as Record<string, unknown>} />,
  get_milestone_progress: ({ data }) => <StepProgress data={(data ?? {}) as Record<string, unknown>} />,
  get_workspace_milestone_progress: ({ data }) => <StepProgress data={(data ?? {}) as Record<string, unknown>} />,
  get_dependency_graph: ({ data }) => <DependencyGraph data={(data ?? {}) as Record<string, unknown>} />,
  get_critical_path: ({ data }) => <CriticalPath data={(data ?? {}) as Record<string, unknown>} />,
  get_task_blockers: ({ data }) => <TaskBlockers data={data} label="Blockers" />,
  get_tasks_blocked_by: ({ data }) => <TaskBlockers data={data} label="Blocked tasks" />,
  get_task_context: ({ data }) => <TaskContext data={(data ?? {}) as Record<string, unknown>} />,
  get_task_prompt: ({ data }) => {
    const text = typeof data === 'string' ? data : (data as Record<string, unknown>)?.prompt as string ?? JSON.stringify(data)
    return (
      <McpContainer>
        <pre className="text-[10px] text-gray-500 whitespace-pre-wrap max-h-48 overflow-y-auto">
          {truncate(text, 2000)}
        </pre>
      </McpContainer>
    )
  },
  get_project_roadmap: ({ data }) => <Roadmap data={(data ?? {}) as Record<string, unknown>} />,
  get_next_task: ({ data }) => {
    const task = (data ?? {}) as Record<string, unknown>
    return (
      <McpContainer>
        <div className="flex items-center gap-2">
          <span className="text-gray-300 font-medium">
            {String(task.title ?? '') || truncate(String(task.description ?? ''), 80)}
          </span>
          {task.status ? <StatusBadge status={String(task.status)} /> : null}
        </div>
      </McpContainer>
    )
  },
}

export function ProgressRenderer({ action, parsed }: { action: string; parsed: unknown; toolInput?: Record<string, unknown> }) {
  const Comp = PROGRESS_RENDERERS[action]
  if (!Comp) return null
  return <Comp data={parsed} />
}
