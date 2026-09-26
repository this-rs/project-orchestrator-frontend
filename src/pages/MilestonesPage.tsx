import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAtomValue } from 'jotai'
import { Trash2 } from 'lucide-react'
import { milestoneRefreshAtom, workspaceRefreshAtom } from '@/atoms'
import {
  BulkActionBar,
  ConfirmDialog,
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  FilterBar,
  ListGroup,
  PageShell,
  Select,
  StatusMenu,
  formatDay,
  getStatusMeta,
  getStatusOptions,
  groupBy,
  hitArea,
  textLink,
  RowCheckbox,
  ViewToggle,
  ProgressLine,
  Button,
  pluralize,
} from '@/components/ui'
import { api, workspacesApi, projectsApi } from '@/services'
import { useViewMode, useConfirmDialog, useToast, useMultiSelect, useWorkspaceSlug, useViewTransition, useWorkspace } from '@/hooks'
import { UniversalKanban, createMilestoneKanbanConfig } from '@/components/kanban'
import type { MilestoneWithProgress } from '@/components/kanban'
import type { MilestoneStatus } from '@/types'
import { workspacePath } from '@/utils/paths'

const statusOptions = [{ value: 'all', label: 'All statuses' }, ...getStatusOptions('milestone')]

const sourceOptions = [
  { value: 'all', label: 'All sources' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'project', label: 'Project' },
]

/** Group order in the list: active work first, finished last (collapsed). */
const GROUP_ORDER: MilestoneStatus[] = ['in_progress', 'open', 'planned', 'completed', 'closed']
const COLLAPSED_GROUPS: MilestoneStatus[] = ['completed', 'closed']

const isProjectMilestone = (m: MilestoneWithProgress) => (m.tags || []).some((t) => t.startsWith('project:'))
/** Backend sometimes sends `Completed` — normalise so filters, groups and board columns match. */
const normStatus = (s: string | undefined): MilestoneStatus => ((s || 'open').toLowerCase() as MilestoneStatus)

export function MilestonesPage() {
  const [allMilestones, setAllMilestones] = useState<MilestoneWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useViewMode()
  const { navigate } = useViewTransition()
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()
  const activeWorkspace = useWorkspace()

  // Filters
  // Reference time for the "overdue" hint (captured once per mount — render stays pure)
  const [now] = useState(() => Date.now())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const msRefresh = useAtomValue(milestoneRefreshAtom)
  const wsRefresh = useAtomValue(workspaceRefreshAtom)

  const loadMilestones = useCallback(async () => {
    const isInitialLoad = allMilestones.length === 0
    if (isInitialLoad) setLoading(true)
    setError(null)
    try {
      // 1. Workspace milestones (+ progress), fetched in parallel
      const workspaceMilestones: MilestoneWithProgress[] = await workspacesApi
        .listMilestones(wsSlug)
        .then(async (res) => {
          const list = Array.isArray(res) ? res : res.items || []
          return Promise.all(
            list.map(async (milestone) => {
              const progress = await workspacesApi.getMilestoneProgress(milestone.id).catch(() => undefined)
              return {
                ...milestone,
                status: normStatus(milestone.status),
                progress,
                workspace_name: activeWorkspace?.name,
              }
            }),
          )
        })
        .catch(() => [])

      // 2. Project milestones (from workspace projects), fetched in parallel
      const projectMilestones: MilestoneWithProgress[] = await workspacesApi
        .listProjects(wsSlug)
        .then(async (projects) => {
          const perProject = await Promise.all(
            projects.map(async (project) => {
              try {
                const pmData = await projectsApi.listMilestones(project.id)
                return Promise.all(
                  (pmData.items || []).map(async (pm) => {
                    const progress = await projectsApi.getMilestoneProgress(pm.id).catch(() => undefined)
                    // Adapt project milestone to MilestoneWithProgress shape
                    return {
                      id: pm.id,
                      workspace_id: activeWorkspace?.id || '',
                      title: pm.title,
                      description: pm.description,
                      status: normStatus(pm.status),
                      target_date: pm.target_date,
                      closed_at: pm.closed_at,
                      created_at: pm.created_at,
                      tags: [`project:${project.name}`],
                      workspace_name: project.name,
                      progress,
                    } as MilestoneWithProgress
                  }),
                )
              } catch {
                return [] // Skip project milestones on error
              }
            }),
          )
          return perProject.flat()
        })
        .catch(() => [])

      setAllMilestones([...workspaceMilestones, ...projectMilestones])
    } catch {
      setError('Failed to load milestones')
    } finally {
      if (isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsSlug, activeWorkspace?.name, activeWorkspace?.id])

  useEffect(() => {
    loadMilestones()
  }, [loadMilestones, msRefresh, wsRefresh])

  // Source + search apply to both views; status only to the list (the board has columns)
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allMilestones.filter((m) => {
      if (sourceFilter === 'workspace' && isProjectMilestone(m)) return false
      if (sourceFilter === 'project' && !isProjectMilestone(m)) return false
      if (q && !`${m.title} ${m.description ?? ''} ${(m.tags || []).join(' ')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [allMilestones, sourceFilter, search])

  const filteredMilestones = useMemo(
    () => (statusFilter === 'all' ? baseFiltered : baseFiltered.filter((m) => normStatus(m.status) === statusFilter)),
    [baseFiltered, statusFilter],
  )

  const handleStatusChange = useCallback(
    async (milestoneId: string, newStatus: MilestoneStatus) => {
      const original = allMilestones.find((m) => m.id === milestoneId)
      const isProject = original ? isProjectMilestone(original) : false
      setAllMilestones((prev) => prev.map((m) => (m.id === milestoneId ? { ...m, status: newStatus } : m)))
      try {
        if (isProject) {
          await projectsApi.updateMilestone(milestoneId, { status: newStatus })
        } else {
          await workspacesApi.updateMilestone(milestoneId, { status: newStatus })
        }
        toast.success('Status updated')
      } catch {
        if (original) {
          setAllMilestones((prev) => prev.map((m) => (m.id === milestoneId ? original : m)))
        }
        toast.error('Failed to update status')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allMilestones],
  )

  /** Delete through the right endpoint (project milestones used to hit the workspace one → 404). */
  const deleteMilestone = (m: MilestoneWithProgress) =>
    isProjectMilestone(m) ? api.delete(`/milestones/${m.id}`) : workspacesApi.deleteMilestone(m.id)

  const handleDelete = async (milestone: MilestoneWithProgress) => {
    await deleteMilestone(milestone)
    setAllMilestones((prev) => prev.filter((m) => m.id !== milestone.id))
    toast.success('Milestone deleted')
  }

  // UniversalKanban config for milestones — wraps local data as a "fetchFn"
  const milestoneFetchFn = useCallback(
    async (params: Record<string, unknown>) => {
      const status = params.status as string
      const items = baseFiltered.filter((m) => normStatus(m.status) === status)
      return { items, total: items.length, limit: 100, offset: 0 }
    },
    [baseFiltered],
  )

  // Refetch the columns whenever the local data changes
  const milestoneRefreshKey = useMemo(
    () => baseFiltered.reduce((acc, m) => acc + m.id + m.status, '').length + msRefresh + wsRefresh + baseFiltered.length,
    [baseFiltered, msRefresh, wsRefresh],
  )

  const milestoneKanbanConfig = useMemo(
    () =>
      createMilestoneKanbanConfig({
        fetchFn: milestoneFetchFn,
        onStatusChange: (id, status) => handleStatusChange(id, status as MilestoneStatus),
      }),
    [milestoneFetchFn, handleStatusChange],
  )

  const multiSelect = useMultiSelect(filteredMilestones, (m) => m.id)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: `Delete ${pluralize(count, 'milestone')}?`,
      description: `This will permanently delete ${count} milestone${count > 1 ? 's' : ''}.`,
      onConfirm: async () => {
        const items = multiSelect.selectedItems
        confirmDialog.setProgress({ current: 0, total: items.length })
        for (let i = 0; i < items.length; i++) {
          await deleteMilestone(items[i])
          confirmDialog.setProgress({ current: i + 1, total: items.length })
        }
        const ids = new Set(items.map((m) => m.id))
        setAllMilestones((prev) => prev.filter((m) => !ids.has(m.id)))
        multiSelect.clear()
        toast.success(`Deleted ${count} milestone${count > 1 ? 's' : ''}`)
      },
    })
  }

  const isKanban = viewMode === 'kanban'
  const activeFilterCount = (sourceFilter !== 'all' ? 1 : 0) + (!isKanban && statusFilter !== 'all' ? 1 : 0)
  const activeLabels = [
    sourceFilter !== 'all' ? sourceOptions.find((o) => o.value === sourceFilter)?.label ?? '' : '',
    !isKanban && statusFilter !== 'all' ? statusOptions.find((o) => o.value === statusFilter)?.label ?? '' : '',
  ]
  const hasFilters = activeFilterCount > 0 || search.trim() !== ''
  const groups = useMemo(
    () => groupBy(filteredMilestones, (m) => normStatus(m.status), GROUP_ORDER),
    [filteredMilestones],
  )

  const clearFilters = () => {
    setSourceFilter('all')
    setStatusFilter('all')
  }

  return (
    <PageShell
      title="Milestones"
      description="Track milestones for this workspace"
      count={loading ? undefined : isKanban ? baseFiltered.length : filteredMilestones.length}
      width={isKanban ? 'full' : 'wide'}
      filters={
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search milestones…"
          activeCount={activeFilterCount}
          activeLabels={activeLabels}
          onClear={clearFilters}
          trailing={<ViewToggle value={viewMode} onChange={setViewMode} />}
          filters={
            <>
              <Select options={sourceOptions} value={sourceFilter} onChange={(value) => setSourceFilter(value)} />
              {!isKanban && (
                <Select options={statusOptions} value={statusFilter} onChange={(value) => setStatusFilter(value)} />
              )}
            </>
          }
        />
      }
    >
      {isKanban ? (
        <UniversalKanban
          config={milestoneKanbanConfig}
          onItemClick={(id) => {
            const m = allMilestones.find((x) => x.id === id)
            const path = m && isProjectMilestone(m) ? `/project-milestones/${id}` : `/milestones/${id}`
            navigate(workspacePath(wsSlug, path), { type: 'card-click' })
          }}
          refreshTrigger={milestoneRefreshKey}
        />
      ) : loading ? (
        <EntityListSkeleton rows={6} />
      ) : error ? (
        <ErrorState title="Failed to load" description={error} onRetry={loadMilestones} />
      ) : filteredMilestones.length === 0 ? (
        <EmptyState
          variant={!hasFilters ? 'milestones' : undefined}
          title={hasFilters ? 'No matching milestones' : 'No milestones yet'}
          description={
            hasFilters
              ? 'No milestones match the current search or filters.'
              : 'Milestones help track major goals across your projects.'
          }
          action={
            hasFilters ? (
              <Button size="sm" variant="secondary" onClick={() => { clearFilters(); setSearch('') }}>
                Clear
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-end px-1 pb-1.5 min-h-9 text-[11px]">
            <button type="button" onClick={multiSelect.toggleAll} className={`${hitArea} ${textLink}`}>
              {multiSelect.isAllSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          <div>
            {groups.map(({ key, items }) => (
              <ListGroup
                key={`${key}-${statusFilter}`}
                title={getStatusMeta('milestone', key).label}
                count={items.length}
                collapsible={COLLAPSED_GROUPS.includes(key)}
                defaultOpen={!COLLAPSED_GROUPS.includes(key) || statusFilter !== 'all'}
              >
                {items.map((milestone) => (
                  <MilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    wsSlug={wsSlug}
                    now={now}
                    selected={multiSelect.isSelected(milestone.id)}
                    onToggleSelect={(shiftKey) => multiSelect.toggle(milestone.id, shiftKey)}
                    onStatusChange={(s) => handleStatusChange(milestone.id, s)}
                    onDelete={() => handleDelete(milestone)}
                  />
                ))}
              </ListGroup>
            ))}
          </div>
        </>
      )}

      <BulkActionBar count={multiSelect.selectionCount} onDelete={handleBulkDelete} onClear={multiSelect.clear} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

// ── Milestone row ───────────────────────────────────────────────────────

interface MilestoneRowProps {
  milestone: MilestoneWithProgress
  wsSlug: string
  now: number
  selected: boolean
  onToggleSelect: (shiftKey: boolean) => void
  onStatusChange: (status: MilestoneStatus) => Promise<void>
  onDelete: () => Promise<void>
}

function MilestoneRow({ milestone, wsSlug, now, selected, onToggleSelect, onStatusChange, onDelete }: MilestoneRowProps) {
  const isProject = isProjectMilestone(milestone)
  const status = normStatus(milestone.status)
  const tags = (milestone.tags || []).filter((t) => !t.startsWith('project:'))
  const progress = milestone.progress
  const detailPath = isProject ? `/project-milestones/${milestone.id}` : `/milestones/${milestone.id}`
  const overdue =
    milestone.target_date && !['completed', 'closed'].includes(status) && new Date(milestone.target_date).getTime() < now

  return (
    <EntityRow
      title={milestone.title}
      href={workspacePath(wsSlug, detailPath)}
      viewTransitionName={`milestone-title-${milestone.id}`}
      selected={selected}
      muted={status === 'completed' || status === 'closed'}
      leading={<RowCheckbox checked={selected} onToggle={onToggleSelect} label={`Select ${milestone.title}`} />}
      trailing={
        progress && progress.total > 0 ? (
          <span title={`${progress.completed} of ${progress.total} tasks completed`}>
            {progress.completed}/{progress.total}
          </span>
        ) : undefined
      }
      description={milestone.description}
      meta={[
        <StatusMenu key="status" kind="milestone" status={status} onChange={onStatusChange} />,
        <span key="source" className="truncate max-w-[14rem]" title={milestone.workspace_name}>
          {isProject ? 'Project' : 'Workspace'}
          {milestone.workspace_name ? ` · ${milestone.workspace_name}` : ''}
        </span>,
        milestone.target_date ? (
          <span key="due" className={overdue ? 'text-amber-400' : undefined} title={new Date(milestone.target_date).toLocaleDateString()}>
            {overdue ? 'overdue ' : 'due '}
            {formatDay(milestone.target_date)}
          </span>
        ) : null,
        tags.length > 0 ? (
          <span key="tags" className="break-words">
            {tags.map((t) => `#${t}`).join(' ')}
          </span>
        ) : null,
      ]}
      context={
        progress && progress.total > 0 ? (
          <ProgressLine
            value={progress.percentage}
            label={`${Math.round(progress.percentage)}% complete`}
            className="max-w-xs"
          />
        ) : undefined
      }
      actions={[
        {
          label: 'Delete',
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: { title: 'Delete milestone?', description: 'This milestone will be permanently deleted.' },
        },
      ]}
    />
  )
}
