/**
 * EntityRenderer — card views for get_*, create_*, update_*, delete_* MCP tools.
 *
 * Renders single entities (plan, task, project, note, milestone, release, step, etc.)
 * as structured cards with typed fields, status badges, and metadata.
 */

import {
  StatusBadge, PriorityBadge, TagList, KVRow, SectionHeader,
  ProgressBar, TimeAgo, ShortId, McpContainer, truncate, EntityLink,
  ActionBadge, LinkedId, CollapsibleList, inferEntityTypeFromAction,
} from './utils'

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

function PlanCard({ data }: { data: Record<string, unknown> }) {
  const tasks = data.tasks as Record<string, unknown>[] | undefined
  const constraints = data.constraints as Record<string, unknown>[] | undefined
  const completedTasks = tasks?.filter(t => t.status === 'completed').length ?? 0
  const id = String(data.id ?? '')

  return (
    <McpContainer>
      <div className="flex items-center gap-2">
        <EntityLink entityType="plan" id={id}>
          <span className="text-gray-300 font-medium">{String(data.title ?? '')}</span>
        </EntityLink>
        {data.status ? <StatusBadge status={String(data.status)} /> : null}
        {typeof data.priority === 'number' && <PriorityBadge priority={data.priority as number} />}
      </div>

      {data.description ? (
        <div className="text-gray-500 text-[11px] mt-1">
          {truncate(String(data.description), 300)}
        </div>
      ) : null}

      <div className="space-y-0.5 mt-1.5">
        <ShortId id={String(data.id ?? '')} entityType="plan" />
        {data.project_id ? <KVRow label="project"><LinkedId field="project_id" value={String(data.project_id)} /></KVRow> : null}
        <KVRow label="created"><TimeAgo date={data.created_at as string} /></KVRow>
      </div>

      {tasks && tasks.length > 0 && (
        <div className="mt-2">
          <SectionHeader count={tasks.length}>Tasks</SectionHeader>
          <ProgressBar completed={completedTasks} total={tasks.length} />
          <div className="mt-1 space-y-0.5">
            <CollapsibleList
              items={tasks}
              limit={5}
              label="tasks"
              renderItem={(t) => (
                <div key={t.id as string} className="flex items-center gap-2 text-[11px]">
                  <StatusBadge status={(t.status as string) ?? 'pending'} />
                  <EntityLink entityType="task" id={String(t.id ?? '')}>
                    <span className="text-gray-400 truncate hover:text-indigo-400">{(t.title as string) || truncate((t.description as string) ?? '', 60)}</span>
                  </EntityLink>
                </div>
              )}
            />
          </div>
        </div>
      )}

      {constraints && constraints.length > 0 && (
        <div className="mt-2">
          <SectionHeader count={constraints.length}>Constraints</SectionHeader>
          <CollapsibleList
            items={constraints}
            limit={3}
            label="constraints"
            renderItem={(c, i) => (
              <div key={i} className="text-[11px] text-gray-500 flex items-center gap-1">
                <span className="text-amber-500">⚠</span>
                {truncate((c.description as string) ?? '', 100)}
              </div>
            )}
          />
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Task card
// ---------------------------------------------------------------------------

function TaskCard({ data }: { data: Record<string, unknown> }) {
  const steps = data.steps as Record<string, unknown>[] | undefined
  const decisions = data.decisions as Record<string, unknown>[] | undefined
  const criteria = data.acceptance_criteria as string[] | undefined
  const completedSteps = steps?.filter(s => s.status === 'completed').length ?? 0
  const id = String(data.id ?? '')

  return (
    <McpContainer>
      <div className="flex items-center gap-2">
        <EntityLink entityType="task" id={id}>
          <span className="text-gray-300 font-medium">
            {String(data.title ?? '') || truncate(String(data.description ?? ''), 80)}
          </span>
        </EntityLink>
        {data.status ? <StatusBadge status={String(data.status)} /> : null}
        {typeof data.priority === 'number' && <PriorityBadge priority={data.priority as number} />}
      </div>

      {data.description && data.title ? (
        <div className="text-gray-500 text-[11px] mt-1">
          {truncate(String(data.description), 300)}
        </div>
      ) : null}

      <div className="space-y-0.5 mt-1.5">
        <ShortId id={(data.id as string) ?? ''} entityType="task" />
        {data.plan_id ? <KVRow label="plan"><LinkedId field="plan_id" value={String(data.plan_id)} /></KVRow> : null}
        {Array.isArray(data.tags) && data.tags.length > 0 && (
          <TagList tags={data.tags as string[]} />
        )}
      </div>

      {criteria && criteria.length > 0 && (
        <div className="mt-2">
          <SectionHeader count={criteria.length}>Acceptance criteria</SectionHeader>
          <CollapsibleList
            items={criteria}
            limit={4}
            label="criteria"
            renderItem={(c, i) => (
              <li key={i} className="text-[11px] text-gray-500 flex items-start gap-1 list-none">
                <span className="text-gray-600 select-none">•</span>
                {c}
              </li>
            )}
          />
        </div>
      )}

      {steps && steps.length > 0 && (
        <div className="mt-2">
          <SectionHeader count={steps.length}>Steps</SectionHeader>
          <ProgressBar completed={completedSteps} total={steps.length} />
          <div className="mt-1 space-y-0.5">
            <CollapsibleList
              items={steps}
              limit={5}
              label="steps"
              renderItem={(s, i) => {
                const st = (s.status as string) ?? 'pending'
                const icon = st === 'completed' ? '✓' : st === 'in_progress' ? '▸' : st === 'skipped' ? '○' : '·'
                const color = st === 'completed' ? 'text-green-400' : st === 'in_progress' ? 'text-indigo-400' : 'text-gray-600'
                return (
                  <div key={s.id as string ?? i} className="flex items-start gap-1.5 text-[11px]">
                    <span className={`shrink-0 ${color}`}>{icon}</span>
                    <span className="text-gray-400">{truncate((s.description as string) ?? '', 100)}</span>
                  </div>
                )
              }}
            />
          </div>
        </div>
      )}

      {decisions && decisions.length > 0 && (
        <div className="mt-2">
          <SectionHeader count={decisions.length}>Decisions</SectionHeader>
          <CollapsibleList
            items={decisions}
            limit={3}
            label="decisions"
            renderItem={(d, i) => (
              <div key={i} className="text-[11px] text-gray-500 mt-1">
                <span className="text-gray-400">{truncate((d.description as string) ?? '', 100)}</span>
                {d.chosen_option ? (
                  <span className="ml-1 text-indigo-400">→ {String(d.chosen_option)}</span>
                ) : null}
              </div>
            )}
          />
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

function ProjectCard({ data }: { data: Record<string, unknown> }) {
  const slug = String(data.slug ?? '')
  return (
    <McpContainer>
      <div className="flex items-center gap-2">
        <EntityLink entityType="project" id={slug}>
          <span className="text-gray-300 font-medium">{String(data.name ?? '')}</span>
        </EntityLink>
        {slug ? (
          <span className="font-mono text-[10px] text-gray-600">{slug}</span>
        ) : null}
      </div>

      {data.description ? (
        <div className="text-gray-500 text-[11px] mt-1">
          {truncate(String(data.description), 200)}
        </div>
      ) : null}

      <div className="space-y-0.5 mt-1.5">
        {data.root_path ? <KVRow label="path"><span className="font-mono text-[10px]">{String(data.root_path)}</span></KVRow> : null}
        <KVRow label="synced"><TimeAgo date={data.last_synced as string} /></KVRow>
        <KVRow label="created"><TimeAgo date={data.created_at as string} /></KVRow>
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Note card
// ---------------------------------------------------------------------------

function NoteCard({ data }: { data: Record<string, unknown> }) {
  return (
    <McpContainer>
      <div className="flex items-center gap-2">
        {data.note_type ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-900/30 text-purple-400 border border-purple-800/20">
            {String(data.note_type)}
          </span>
        ) : null}
        {data.importance ? <StatusBadge status={String(data.importance)} /> : null}
        {data.status ? <StatusBadge status={String(data.status)} /> : null}
      </div>

      <div className="text-gray-400 mt-1 whitespace-pre-wrap text-[11px] max-h-40 overflow-y-auto">
        {truncate((data.content as string) ?? '', 500)}
      </div>

      {Array.isArray(data.tags) && data.tags.length > 0 && (
        <div className="mt-1.5">
          <TagList tags={data.tags as string[]} />
        </div>
      )}

      <div className="space-y-0.5 mt-1.5">
        <ShortId id={(data.id as string) ?? ''} entityType="note" />
        {data.project_id ? <KVRow label="project"><LinkedId field="project_id" value={String(data.project_id)} /></KVRow> : null}
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Milestone card
// ---------------------------------------------------------------------------

function MilestoneCard({ data }: { data: Record<string, unknown> }) {
  const tasks = data.tasks as Record<string, unknown>[] | undefined
  const completedTasks = tasks?.filter(t => t.status === 'completed').length ?? 0
  const id = String(data.id ?? '')

  return (
    <McpContainer>
      <div className="flex items-center gap-2">
        <EntityLink entityType="milestone" id={id}>
          <span className="text-gray-300 font-medium">{String(data.title ?? '')}</span>
        </EntityLink>
        {data.status ? <StatusBadge status={String(data.status)} /> : null}
      </div>

      {data.description ? (
        <div className="text-gray-500 text-[11px] mt-1">
          {truncate(String(data.description), 200)}
        </div>
      ) : null}

      <div className="space-y-0.5 mt-1.5">
        {data.target_date ? <KVRow label="target">{String(data.target_date).slice(0, 10)}</KVRow> : null}
        <ShortId id={(data.id as string) ?? ''} entityType="milestone" />
        {data.project_id ? <KVRow label="project"><LinkedId field="project_id" value={String(data.project_id)} /></KVRow> : null}
      </div>

      {tasks && tasks.length > 0 && (
        <div className="mt-2">
          <SectionHeader count={tasks.length}>Tasks</SectionHeader>
          <ProgressBar completed={completedTasks} total={tasks.length} />
          <div className="mt-1 space-y-0.5">
            <CollapsibleList
              items={tasks}
              limit={5}
              label="tasks"
              renderItem={(t) => (
                <div key={t.id as string} className="flex items-center gap-2 text-[11px]">
                  <StatusBadge status={(t.status as string) ?? 'pending'} />
                  <EntityLink entityType="task" id={String(t.id ?? '')}>
                    <span className="text-gray-400 truncate hover:text-indigo-400">{(t.title as string) || truncate((t.description as string) ?? '', 60)}</span>
                  </EntityLink>
                </div>
              )}
            />
          </div>
        </div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Release card
// ---------------------------------------------------------------------------

function ReleaseCard({ data }: { data: Record<string, unknown> }) {
  return (
    <McpContainer>
      <div className="flex items-center gap-2">
        <span className="font-mono text-indigo-400">{String(data.version ?? '')}</span>
        {data.title ? <span className="text-gray-300">{String(data.title)}</span> : null}
        {data.status ? <StatusBadge status={String(data.status)} /> : null}
      </div>

      {data.description ? (
        <div className="text-gray-500 text-[11px] mt-1">
          {truncate(String(data.description), 200)}
        </div>
      ) : null}

      <div className="space-y-0.5 mt-1.5">
        {data.target_date ? <KVRow label="target">{String(data.target_date).slice(0, 10)}</KVRow> : null}
        <ShortId id={(data.id as string) ?? ''} entityType="release" />
        {data.project_id ? <KVRow label="project"><LinkedId field="project_id" value={String(data.project_id)} /></KVRow> : null}
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Step card
// ---------------------------------------------------------------------------

function StepCard({ data }: { data: Record<string, unknown> }) {
  const status = (data.status as string) ?? 'pending'
  const taskId = data.task_id ? String(data.task_id) : undefined
  return (
    <McpContainer>
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={status} />
        <span className="text-gray-400 text-[11px]">
          {truncate((data.description as string) ?? '', 200)}
        </span>
        {taskId && (
          <ViewEntityButton entityType="task" entityId={taskId} label="View parent task" />
        )}
      </div>
      {data.verification ? (
        <KVRow label="verify"><span className="text-[10px]">{String(data.verification)}</span></KVRow>
      ) : null}
      <ShortId id={(data.id as string) ?? ''} />
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Success confirmation (for create_*, update_*, delete_* operations)
// ---------------------------------------------------------------------------

/** Extract entity type from action name (e.g. "create_plan" -> "plan") */
function entityTypeFromAction(action: string): string | undefined {
  const prefixes = ['create_', 'update_', 'delete_', 'get_', 'link_', 'add_', 'remove_', 'unlink_']
  for (const prefix of prefixes) {
    if (action.startsWith(prefix)) {
      const rest = action.slice(prefix.length)
      // Normalize compound names: "plan_status" -> "plan", "workspace_milestone" -> "milestone"
      if (rest.startsWith('plan')) return 'plan'
      if (rest.startsWith('task')) return 'task'
      if (rest.startsWith('project')) return 'project'
      if (rest.startsWith('milestone')) return 'milestone'
      if (rest.startsWith('workspace_milestone')) return 'milestone'
      if (rest.startsWith('workspace')) return 'workspace'
      if (rest.startsWith('note')) return 'note'
      if (rest.startsWith('release')) return 'release'
      if (rest.startsWith('step')) return undefined // no dedicated page
      if (rest.startsWith('constraint')) return undefined // lives on plan page
      if (rest.startsWith('decision')) return undefined // lives on task page
      if (rest.startsWith('commit')) return undefined
      return undefined
    }
  }
  return undefined
}

/**
 * Resolve the best navigable entity for an action + toolInput.
 * For steps → parent task, for decisions → parent task, for constraints → parent plan.
 * Returns { entityType, entityId, entityLabel } or null if no navigation is possible.
 */
function resolveNavigableEntity(
  action: string,
  toolInput?: Record<string, unknown>,
  data?: Record<string, unknown>,
): { entityType: string; entityId: string; entityLabel: string } | null {
  // 1. Direct entity from action (plan, task, etc.)
  const directType = entityTypeFromAction(action)
  if (directType) {
    const id = data?.id ? String(data.id) :
      data?.slug ? String(data.slug) :
      extractIdFromInput(action, toolInput)
    if (id) return { entityType: directType, entityId: id, entityLabel: directType.replace(/_/g, ' ') }
  }

  // 2. Fallback for steps → parent task
  if (action.includes('step')) {
    const taskId = (toolInput?.task_id ?? data?.task_id) as string | undefined
    if (taskId) return { entityType: 'task', entityId: String(taskId), entityLabel: 'parent task' }
  }

  // 3. Fallback for decisions → parent task
  if (action.includes('decision')) {
    const taskId = (toolInput?.task_id ?? data?.task_id) as string | undefined
    if (taskId) return { entityType: 'task', entityId: String(taskId), entityLabel: 'parent task' }
  }

  // 4. Fallback for constraints → parent plan
  if (action.includes('constraint')) {
    const planId = (toolInput?.plan_id ?? data?.plan_id) as string | undefined
    if (planId) return { entityType: 'plan', entityId: String(planId), entityLabel: 'parent plan' }
  }

  // 5. Fallback for commits → linked task or plan
  if (action.includes('commit')) {
    const taskId = (toolInput?.task_id ?? data?.task_id) as string | undefined
    if (taskId) return { entityType: 'task', entityId: String(taskId), entityLabel: 'linked task' }
    const planId = (toolInput?.plan_id ?? data?.plan_id) as string | undefined
    if (planId) return { entityType: 'plan', entityId: String(planId), entityLabel: 'linked plan' }
  }

  return null
}

/**
 * Extract the primary entity ID from toolInput based on the action.
 * For update_task → task_id, update_plan_status → plan_id, delete_note → note_id, etc.
 */
function extractIdFromInput(action: string, toolInput?: Record<string, unknown>): string | undefined {
  if (!toolInput) return undefined
  // Direct ID fields: task_id, plan_id, note_id, step_id, milestone_id, etc.
  const entityType = entityTypeFromAction(action)
  if (entityType) {
    const idField = `${entityType}_id`
    if (toolInput[idField]) return String(toolInput[idField])
  }
  // Common generic fields
  if (toolInput.plan_id) return String(toolInput.plan_id)
  if (toolInput.task_id) return String(toolInput.task_id)
  if (toolInput.note_id) return String(toolInput.note_id)
  if (toolInput.milestone_id) return String(toolInput.milestone_id)
  if (toolInput.release_id) return String(toolInput.release_id)
  if (toolInput.slug) return String(toolInput.slug)
  if (toolInput.id) return String(toolInput.id)
  return undefined
}

/**
 * Navigation button — prominent "View <entity> →" link for CRUD confirmations.
 */
function ViewEntityButton({ entityType, entityId, label }: {
  entityType: string; entityId: string; label?: string
}) {
  return (
    <EntityLink entityType={entityType} id={entityId}>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/25 hover:text-indigo-300 transition-colors cursor-pointer">
        {label || entityType.replace(/_/g, ' ')}
        <span className="font-mono text-[9px] opacity-70">{entityId.slice(0, 8)}</span>
        <span className="text-[10px]">→</span>
      </span>
    </EntityLink>
  )
}

function SuccessCard({ action, data, toolInput }: { action: string; data: Record<string, unknown>; toolInput?: Record<string, unknown> }) {
  const isDelete = action.startsWith('delete_')
  const isCreate = action.startsWith('create_')

  // Resolve the best navigable entity (direct or fallback to parent)
  const nav = resolveNavigableEntity(action, toolInput, data)
  const statusFromInput = toolInput?.status ? String(toolInput.status) : undefined

  // For simple { updated: true } or { deleted: true } or { added: true } responses
  if (data.updated === true || data.deleted === true || data.added === true) {
    return (
      <McpContainer>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] ${isDelete ? 'text-red-400' : 'text-green-400'}`}>
            {isDelete ? '✗' : '✓'}
          </span>
          <span className="text-gray-400">
            {isDelete ? 'Deleted' : 'Updated'}
          </span>
          {statusFromInput && <StatusBadge status={statusFromInput} />}
          {nav && (
            <ViewEntityButton entityType={nav.entityType} entityId={nav.entityId} label={`View ${nav.entityLabel}`} />
          )}
        </div>
      </McpContainer>
    )
  }

  // Determine a label for richer responses
  const verb = isCreate ? 'Created' : isDelete ? 'Deleted' : 'Updated'
  const title = (data.title ?? data.name ?? data.version ?? data.content ?? data.description) as string | undefined

  return (
    <McpContainer>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] ${isDelete ? 'text-red-400' : 'text-green-400'}`}>
          {isDelete ? '✗' : '✓'}
        </span>
        <span className="text-gray-400">{verb}</span>
        {title && (
          <span className="text-gray-300 font-medium truncate max-w-[200px]">{truncate(title, 60)}</span>
        )}
        {(data.status) ? <StatusBadge status={String(data.status)} /> : null}
        {nav && (
          <ViewEntityButton entityType={nav.entityType} entityId={nav.entityId} label={`View ${nav.entityLabel}`} />
        )}
      </div>
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Generic entity card (fallback)
// ---------------------------------------------------------------------------

/** Check if a field is an ID reference */
function isIdField(key: string): boolean {
  return key.endsWith('_id') && key !== 'id'
}

function GenericCard({ data }: { data: Record<string, unknown> }) {
  const priorityFields = ['title', 'name', 'version', 'content', 'description', 'status', 'slug', 'id']
  const fields = Object.entries(data).filter(([, v]) => v != null && v !== '')

  // Sort by priority
  fields.sort((a, b) => {
    const ai = priorityFields.indexOf(a[0])
    const bi = priorityFields.indexOf(b[0])
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  return (
    <McpContainer>
      {fields.slice(0, 8).map(([key, val]) => (
        <KVRow key={key} label={key}>
          {key === 'status' ? (
            <StatusBadge status={String(val)} />
          ) : isIdField(key) ? (
            <LinkedId field={key} value={String(val)} />
          ) : typeof val === 'object' ? (
            <span className="font-mono text-[10px]">{truncate(JSON.stringify(val), 120)}</span>
          ) : (
            <span>{truncate(String(val), 120)}</span>
          )}
        </KVRow>
      ))}
      {fields.length > 8 && (
        <div className="text-[10px] text-gray-600">+{fields.length - 8} more fields</div>
      )}
    </McpContainer>
  )
}

// ---------------------------------------------------------------------------
// Action → card dispatcher
// ---------------------------------------------------------------------------

/** Actions that get a dedicated card view */
const ENTITY_CARDS: Record<string, React.ComponentType<{ data: Record<string, unknown> }>> = {
  get_plan: PlanCard,
  get_task: TaskCard,
  get_project: ProjectCard,
  get_note: NoteCard,
  get_milestone: MilestoneCard,
  get_workspace_milestone: MilestoneCard,
  get_release: ReleaseCard,
  get_step: StepCard,
  get_constraint: ({ data }) => <GenericCard data={data} />,
  get_decision: ({ data }) => <GenericCard data={data} />,
  get_workspace: ({ data }) => <GenericCard data={data} />,
  get_component: ({ data }) => <GenericCard data={data} />,
  get_resource: ({ data }) => <GenericCard data={data} />,
  get_chat_session: ({ data }) => <GenericCard data={data} />,
}

// ---------------------------------------------------------------------------
// EntityRenderer export
// ---------------------------------------------------------------------------

export function EntityRenderer({ action, parsed, toolInput }: { action: string; parsed: unknown; toolInput?: Record<string, unknown> }) {
  if (!parsed || typeof parsed !== 'object') return null
  const data = parsed as Record<string, unknown>

  // Dedicated card for get_* actions
  const CardComp = ENTITY_CARDS[action]
  if (CardComp) {
    return (
      <div className="space-y-1.5">
        <ActionBadge action={action} />
        <CardComp data={data} />
      </div>
    )
  }

  // Create/update/delete confirmation
  if (action.startsWith('create_') || action.startsWith('update_') || action.startsWith('delete_') ||
      action.startsWith('link_') || action.startsWith('add_') || action.startsWith('remove_') ||
      action.startsWith('unlink_')) {
    // For create actions that return full entity data (not just {updated: true}),
    // show the entity card with action badge instead of just SuccessCard
    if (action.startsWith('create_') && data.id && (data.title || data.name || data.content || data.description)) {
      const entityType = inferEntityTypeFromAction(action)
      const getAction = entityType ? `get_${entityType}` : undefined
      // For steps, use StepCard directly (no get_step in ENTITY_CARDS match via entityType)
      const Card = action === 'create_step' ? StepCard :
        (getAction ? ENTITY_CARDS[getAction] : undefined)
      if (Card) {
        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <ActionBadge action={action} />
              <span className="text-green-400 text-[10px]">✓</span>
            </div>
            <Card data={data} />
          </div>
        )
      }
    }
    return (
      <div className="space-y-1.5">
        <ActionBadge action={action} />
        <SuccessCard action={action} data={data} toolInput={toolInput} />
      </div>
    )
  }

  // Fallback
  return (
    <div className="space-y-1.5">
      <ActionBadge action={action} />
      <GenericCard data={data} />
    </div>
  )
}
