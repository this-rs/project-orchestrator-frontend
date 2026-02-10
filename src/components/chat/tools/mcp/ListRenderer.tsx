/**
 * ListRenderer — rich table views for list_* MCP tools.
 *
 * Handles: list_projects, list_plans, list_tasks, list_chat_sessions,
 * list_chat_messages, list_notes, list_steps, list_milestones, list_releases,
 * list_constraints, list_workspace_projects, etc.
 */

import {
  StatusBadge, PriorityBadge, TagList, TimeAgo, ShortId,
  PaginationInfo, McpContainer, truncate, EntityLink,
  highlightSearchTerms, LinkedId, inferEntityTypeFromAction,
} from './utils'

// ---------------------------------------------------------------------------
// Column config per entity type
// ---------------------------------------------------------------------------

interface ListData {
  items: Record<string, unknown>[]
  total?: number
  offset?: number
  limit?: number
}

/** Try to extract a standard list structure from the parsed result */
function extractListData(parsed: unknown): ListData | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>

  // Standard: { items: [...], total, offset, limit }
  if (Array.isArray(obj.items)) {
    return {
      items: obj.items as Record<string, unknown>[],
      total: typeof obj.total === 'number' ? obj.total : undefined,
      offset: typeof obj.offset === 'number' ? obj.offset : undefined,
      limit: typeof obj.limit === 'number' ? obj.limit : undefined,
    }
  }

  // Chat messages: { messages: [...], total_count, has_more, offset, limit }
  if (Array.isArray(obj.messages)) {
    return {
      items: obj.messages as Record<string, unknown>[],
      total: typeof obj.total_count === 'number' ? obj.total_count : undefined,
      offset: typeof obj.offset === 'number' ? obj.offset : undefined,
      limit: typeof obj.limit === 'number' ? obj.limit : undefined,
    }
  }

  // Search results & other named collections:
  // decisions, notes, hits, steps, tasks, constraints, milestones, releases, etc.
  const collectionKeys = [
    'decisions', 'notes', 'hits', 'steps', 'tasks', 'constraints',
    'milestones', 'releases', 'components', 'resources', 'sessions',
    'workspaces', 'projects', 'plans',
  ]
  for (const key of collectionKeys) {
    if (Array.isArray(obj[key])) {
      return {
        items: obj[key] as Record<string, unknown>[],
        total: typeof obj.total === 'number' ? obj.total : (obj[key] as unknown[]).length,
      }
    }
  }

  // Direct array
  if (Array.isArray(parsed)) {
    return { items: parsed as Record<string, unknown>[] }
  }

  return null
}

// ---------------------------------------------------------------------------
// Shared row props
// ---------------------------------------------------------------------------

interface RowProps {
  item: Record<string, unknown>
  searchQuery?: string
}

// ---------------------------------------------------------------------------
// Highlight helper — applies search highlighting or returns truncated text
// ---------------------------------------------------------------------------

function hl(text: string, query: string | undefined, maxLen?: number): React.ReactNode {
  const t = maxLen ? truncate(text, maxLen) : text
  return query ? highlightSearchTerms(t, query) : t
}

// ---------------------------------------------------------------------------
// Project row
// ---------------------------------------------------------------------------

function ProjectRow({ item, searchQuery }: RowProps) {
  const slug = String(item.slug ?? '')
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.02] rounded">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <EntityLink entityType="project" id={slug}>
            <span className="text-gray-300 font-medium truncate">
              {hl(String(item.name ?? ''), searchQuery)}
            </span>
          </EntityLink>
          <span className="text-[10px] font-mono text-gray-600">{slug}</span>
        </div>
        {item.description ? (
          <div className="text-[10px] text-gray-600 truncate mt-0.5">
            {hl(String(item.description), searchQuery, 80)}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <TimeAgo date={item.last_synced as string} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plan row
// ---------------------------------------------------------------------------

function PlanRow({ item, searchQuery }: RowProps) {
  const id = String(item.id ?? '')
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.02] rounded">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <EntityLink entityType="plan" id={id}>
            <span className="text-gray-300 font-medium truncate">
              {hl(String(item.title ?? '') || 'Untitled plan', searchQuery)}
            </span>
          </EntityLink>
          {item.status ? <StatusBadge status={String(item.status)} /> : null}
          {typeof item.priority === 'number' && <PriorityBadge priority={item.priority as number} />}
        </div>
        {item.description && searchQuery ? (
          <div className="text-[10px] text-gray-600 truncate mt-0.5">
            {hl(String(item.description), searchQuery, 100)}
          </div>
        ) : null}
      </div>
      <ShortId id={id} entityType="plan" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({ item, searchQuery }: RowProps) {
  const id = String(item.id ?? '')
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.02] rounded">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <EntityLink entityType="task" id={id}>
            <span className="text-gray-300 font-medium truncate">
              {hl(String(item.title ?? '') || truncate(String(item.description ?? ''), 60), searchQuery)}
            </span>
          </EntityLink>
          {item.status ? <StatusBadge status={String(item.status)} /> : null}
          {typeof item.priority === 'number' && <PriorityBadge priority={item.priority as number} />}
        </div>
        {Array.isArray(item.tags) && item.tags.length > 0 && (
          <div className="mt-1">
            <TagList tags={item.tags as string[]} />
          </div>
        )}
      </div>
      <ShortId id={id} entityType="task" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat session row
// ---------------------------------------------------------------------------

function SessionRow({ item, searchQuery }: RowProps) {
  const cost = item.total_cost_usd as number | undefined
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.02] rounded">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-gray-300 truncate">
            {hl(String(item.title ?? '') || String(item.preview ?? '') || 'Untitled session', searchQuery)}
          </span>
          {item.model ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-900/30 text-indigo-400 border border-indigo-800/20">
              {String(item.model)}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-600">
          {typeof item.message_count === 'number' && (
            <span>{item.message_count} msg{(item.message_count as number) !== 1 ? 's' : ''}</span>
          )}
          {cost != null && cost > 0 && <span>${cost.toFixed(4)}</span>}
          <TimeAgo date={(item.updated_at ?? item.created_at) as string} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat message row (mini timeline)
// ---------------------------------------------------------------------------

function MessageRow({ item, searchQuery }: RowProps) {
  const role = item.role as string
  const content = item.content as string ?? ''
  const isUser = role === 'user'

  return (
    <div className={`flex gap-2 px-2 py-1 ${isUser ? '' : 'pl-4'}`}>
      <span className={`shrink-0 text-[10px] font-mono w-6 ${
        isUser ? 'text-blue-500' : 'text-green-500'
      }`}>
        {isUser ? 'USR' : 'AST'}
      </span>
      <span className={`text-gray-400 break-all ${isUser ? '' : 'text-gray-500'}`}>
        {hl(content, searchQuery, 200)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Note row
// ---------------------------------------------------------------------------

function NoteRow({ item, searchQuery }: RowProps) {
  const id = String(item.id ?? '')
  return (
    <EntityLink entityType="note" id={id}>
      <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.02] rounded">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {item.note_type ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-900/30 text-purple-400 border border-purple-800/20">
                {String(item.note_type)}
              </span>
            ) : null}
            {item.importance ? <StatusBadge status={String(item.importance)} /> : null}
            {item.status ? <StatusBadge status={String(item.status)} /> : null}
          </div>
          <div className="text-gray-400 mt-0.5 truncate">
            {hl((item.content as string) ?? '', searchQuery, 120)}
          </div>
          {Array.isArray(item.tags) && item.tags.length > 0 && (
            <div className="mt-1">
              <TagList tags={item.tags as string[]} />
            </div>
          )}
        </div>
        <ShortId id={id} entityType="note" />
      </div>
    </EntityLink>
  )
}

// ---------------------------------------------------------------------------
// Step row
// ---------------------------------------------------------------------------

function StepRow({ item, index, searchQuery }: RowProps & { index: number }) {
  const status = item.status as string ?? 'pending'
  const icon = status === 'completed' ? '\u2713' : status === 'skipped' ? '\u25CB' : status === 'in_progress' ? '\u25B8' : '\u00B7'
  const color = status === 'completed' ? 'text-green-400' : status === 'in_progress' ? 'text-indigo-400' : 'text-gray-600'

  return (
    <div className="flex items-start gap-2 px-2 py-1 hover:bg-white/[0.02] rounded">
      <span className={`shrink-0 font-mono text-[10px] ${color}`}>{icon}</span>
      <span className="text-gray-600 shrink-0 text-[10px] font-mono w-4">{index + 1}.</span>
      <span className="text-gray-400 break-all flex-1">
        {hl((item.description as string) ?? '', searchQuery, 120)}
      </span>
      {item.task_id ? <LinkedId field="task_id" value={String(item.task_id)} /> : null}
      <StatusBadge status={status} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Milestone row
// ---------------------------------------------------------------------------

function MilestoneRow({ item, searchQuery }: RowProps) {
  const id = String(item.id ?? '')
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.02] rounded">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <EntityLink entityType="milestone" id={id}>
            <span className="text-gray-300 font-medium truncate">
              {hl(String(item.title ?? ''), searchQuery)}
            </span>
          </EntityLink>
          {item.status ? <StatusBadge status={String(item.status)} /> : null}
        </div>
        {item.description && searchQuery ? (
          <div className="text-[10px] text-gray-600 truncate mt-0.5">
            {hl(String(item.description), searchQuery, 100)}
          </div>
        ) : null}
        {item.target_date ? (
          <div className="text-[10px] text-gray-600 mt-0.5">
            target: {String(item.target_date).slice(0, 10)}
          </div>
        ) : null}
      </div>
      <ShortId id={id} entityType="milestone" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Release row
// ---------------------------------------------------------------------------

function ReleaseRow({ item, searchQuery }: RowProps) {
  const id = String(item.id ?? '')
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.02] rounded">
      <span className="font-mono text-indigo-400 text-[11px] shrink-0">
        {String(item.version ?? '')}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <EntityLink entityType="release" id={id}>
            <span className="text-gray-300 truncate">
              {hl(String(item.title ?? ''), searchQuery)}
            </span>
          </EntityLink>
          {item.status ? <StatusBadge status={String(item.status)} /> : null}
        </div>
        {item.description && searchQuery ? (
          <div className="text-[10px] text-gray-600 truncate mt-0.5">
            {hl(String(item.description), searchQuery, 100)}
          </div>
        ) : null}
      </div>
      <ShortId id={id} entityType="release" />
      <TimeAgo date={String(item.target_date ?? item.created_at ?? '')} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Constraint row
// ---------------------------------------------------------------------------

function ConstraintRow({ item, searchQuery }: RowProps) {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.02] rounded">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {item.constraint_type ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-900/30 text-amber-400 border border-amber-800/20">
              {String(item.constraint_type)}
            </span>
          ) : null}
          {item.severity ? <StatusBadge status={String(item.severity)} /> : null}
        </div>
        <div className="text-gray-400 mt-0.5 truncate">
          {hl((item.description as string) ?? '', searchQuery, 120)}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generic row (fallback)
// ---------------------------------------------------------------------------

function GenericRow({ item, searchQuery, action }: RowProps & { action?: string }) {
  const title = (item.title ?? item.name ?? item.content ?? item.description ?? item.id) as string
  const entityType = action ? inferEntityTypeFromAction(action) : undefined
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.02] rounded">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {item.id && entityType ? (
            <EntityLink entityType={entityType} id={String(item.id)}>
              <span className="text-gray-300 truncate">{hl(truncate(String(title), 100), searchQuery)}</span>
            </EntityLink>
          ) : (
            <span className="text-gray-300 truncate">{hl(truncate(String(title), 100), searchQuery)}</span>
          )}
          {item.status ? <StatusBadge status={String(item.status)} /> : null}
        </div>
      </div>
      {item.id ? <ShortId id={String(item.id)} entityType={entityType ?? undefined} /> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action -> row component mapping
// ---------------------------------------------------------------------------

type RowComponent = React.ComponentType<{ item: Record<string, unknown>; index: number; searchQuery?: string; action?: string }>

const ROW_MAP: Record<string, RowComponent> = {
  list_projects: ({ item, searchQuery }) => <ProjectRow item={item} searchQuery={searchQuery} />,
  list_plans: ({ item, searchQuery }) => <PlanRow item={item} searchQuery={searchQuery} />,
  list_project_plans: ({ item, searchQuery }) => <PlanRow item={item} searchQuery={searchQuery} />,
  list_tasks: ({ item, searchQuery }) => <TaskRow item={item} searchQuery={searchQuery} />,
  list_chat_sessions: ({ item, searchQuery }) => <SessionRow item={item} searchQuery={searchQuery} />,
  list_chat_messages: ({ item, searchQuery }) => <MessageRow item={item} searchQuery={searchQuery} />,
  list_notes: ({ item, searchQuery }) => <NoteRow item={item} searchQuery={searchQuery} />,
  list_project_notes: ({ item, searchQuery }) => <NoteRow item={item} searchQuery={searchQuery} />,
  list_steps: ({ item, index, searchQuery }) => <StepRow item={item} index={index} searchQuery={searchQuery} />,
  list_milestones: ({ item, searchQuery }) => <MilestoneRow item={item} searchQuery={searchQuery} />,
  list_workspace_milestones: ({ item, searchQuery }) => <MilestoneRow item={item} searchQuery={searchQuery} />,
  list_all_workspace_milestones: ({ item, searchQuery }) => <MilestoneRow item={item} searchQuery={searchQuery} />,
  list_releases: ({ item, searchQuery }) => <ReleaseRow item={item} searchQuery={searchQuery} />,
  list_constraints: ({ item, searchQuery }) => <ConstraintRow item={item} searchQuery={searchQuery} />,
  list_workspaces: ({ item, searchQuery, action }) => <GenericRow item={item} searchQuery={searchQuery} action={action} />,
  list_workspace_projects: ({ item, searchQuery }) => <ProjectRow item={item} searchQuery={searchQuery} />,
  list_resources: ({ item, searchQuery, action }) => <GenericRow item={item} searchQuery={searchQuery} action={action} />,
  list_components: ({ item, searchQuery, action }) => <GenericRow item={item} searchQuery={searchQuery} action={action} />,
  // Search results
  search_decisions: ({ item, searchQuery, action }) => <GenericRow item={item} searchQuery={searchQuery} action={action} />,
  search_notes: ({ item, searchQuery }) => <NoteRow item={item} searchQuery={searchQuery} />,
  get_notes_needing_review: ({ item, searchQuery }) => <NoteRow item={item} searchQuery={searchQuery} />,
  get_entity_notes: ({ item, searchQuery }) => <NoteRow item={item} searchQuery={searchQuery} />,
  get_propagated_notes: ({ item, searchQuery }) => <NoteRow item={item} searchQuery={searchQuery} />,
  get_context_notes: ({ item, searchQuery }) => <NoteRow item={item} searchQuery={searchQuery} />,
}

// ---------------------------------------------------------------------------
// ListRenderer export
// ---------------------------------------------------------------------------

export function ListRenderer({ action, parsed, toolInput }: { action: string; parsed: unknown; toolInput?: Record<string, unknown> }) {
  const data = extractListData(parsed)
  const searchQuery = (toolInput?.query ?? toolInput?.search) as string | undefined

  if (!data || data.items.length === 0) {
    return (
      <McpContainer>
        <div className="text-gray-600 italic px-2 py-1">No results</div>
      </McpContainer>
    )
  }

  const RowComp = ROW_MAP[action] ?? (({ item, searchQuery: sq, action: a }: { item: Record<string, unknown>; searchQuery?: string; action?: string }) => <GenericRow item={item} searchQuery={sq} action={a} />)

  return (
    <McpContainer>
      <div className="flex items-center gap-2 px-2 py-0.5">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-gray-400 border border-white/[0.04]">
          {data.items.length}{data.total != null && data.total > data.items.length ? ` / ${data.total}` : ''} result{data.items.length !== 1 ? 's' : ''}
        </span>
        {searchQuery && (
          <span className="text-[10px] text-gray-600 italic truncate">
            matching &ldquo;{searchQuery}&rdquo;
          </span>
        )}
      </div>
      <div className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto">
        {data.items.map((item, i) => (
          <RowComp key={(item.id as string) ?? i} item={item} index={i} searchQuery={searchQuery} action={action} />
        ))}
      </div>
      <PaginationInfo total={data.total} offset={data.offset} limit={data.limit} shown={data.items.length} />
    </McpContainer>
  )
}
