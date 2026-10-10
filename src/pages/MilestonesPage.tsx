import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAtomValue } from 'jotai'
import { CalendarClock, Flag, FolderKanban, Tag, Trash2 } from 'lucide-react'
import { milestoneRefreshAtom, workspaceRefreshAtom } from '@/atoms'
import {
  BulkActionBar,
  ConfirmDialog,
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  Fact,
  ErrorState,
  FilterBar,
  FormDialog,
  ListGroup,
  PageShell,
  Select,
  StatusMenu,
  ToneText,
  formatAbsolute,
  formatDay,
  getStatusMeta,
  getStatusOptions,
  groupBy,
  RowCheckbox,
  ViewToggle,
  RelativeTime,
  TaskProgress,
  Button,
} from '@/components/ui'
import { api, workspacesApi, projectsApi } from '@/services'
import { useViewMode, useConfirmDialog, useFormDialog, useToast, useMultiSelect, useWorkspaceSlug, useViewTransition, useWorkspace } from '@/hooks'
import { CreateMilestoneForm } from '@/components/forms'
import { UniversalKanban, createMilestoneKanbanConfig } from '@/components/kanban'
import type { MilestoneWithProgress } from '@/components/kanban'
import type { MilestoneStatus } from '@/types'
import { workspacePath } from '@/utils/paths'
import { useT } from '@/i18n'
import { translateOptions, useStatusLabel } from '@/components/kanban/statusLabels'

/** Group order in the list: active work first, finished last (collapsed). */
const GROUP_ORDER: MilestoneStatus[] = ['in_progress', 'open', 'planned', 'completed', 'closed']
const COLLAPSED_GROUPS: MilestoneStatus[] = ['completed', 'closed']

const isProjectMilestone = (m: MilestoneWithProgress) => (m.tags || []).some((t) => t.startsWith('project:'))
/** Backend sometimes sends `Completed` — normalise so filters, groups and board columns match. */
const normStatus = (s: string | undefined): MilestoneStatus => ((s || 'open').toLowerCase() as MilestoneStatus)

export function MilestonesPage() {
  const { t } = useT()
  const statusLabel = useStatusLabel()
  const statusOptions = [{ value: 'all', label: t('milestones.allStatuses') }, ...translateOptions(getStatusOptions('milestone'), statusLabel)]
  const sourceOptions = [
    { value: 'all', label: t('milestones.sources.all') },
    { value: 'workspace', label: t('milestones.sources.workspace') },
    { value: 'project', label: t('milestones.sources.project') },
  ]
  const [allMilestones, setAllMilestones] = useState<MilestoneWithProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useViewMode()
  const { navigate } = useViewTransition()
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
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
      setError('load')
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
        toast.success(t('tasks.toast.statusUpdated'))
      } catch {
        if (original) {
          setAllMilestones((prev) => prev.map((m) => (m.id === milestoneId ? original : m)))
        }
        toast.error(t('tasks.toast.statusFailed'))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allMilestones, t],
  )

  /** Delete through the right endpoint (project milestones used to hit the workspace one → 404). */
  const deleteMilestone = (m: MilestoneWithProgress) =>
    isProjectMilestone(m) ? api.delete(`/milestones/${m.id}`) : workspacesApi.deleteMilestone(m.id)

  const handleDelete = async (milestone: MilestoneWithProgress) => {
    await deleteMilestone(milestone)
    setAllMilestones((prev) => prev.filter((m) => m.id !== milestone.id))
    toast.success(t('milestones.toast.deleted'))
  }

  // Workspace milestones are created here (project milestones from their project page).
  const createForm = CreateMilestoneForm({
    onSubmit: async (data) => {
      await workspacesApi.createMilestone(wsSlug, data)
      toast.success(t('milestones.toast.created'))
      await loadMilestones()
    },
  })
  const openCreate = () => formDialog.open({ title: t('milestones.new') })

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
      title: t(count === 1 ? 'milestones.confirm.bulkTitle.one' : 'milestones.confirm.bulkTitle.other', { count }),
      description: t(count === 1 ? 'milestones.confirm.bulkBody.one' : 'milestones.confirm.bulkBody.other', { count }),
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
        toast.success(t(count === 1 ? 'milestones.toast.deletedMany.one' : 'milestones.toast.deletedMany.other', { count }))
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
      title={t('nav.concepts.objectives')}
      description={t('milestones.description')}
      intro="objectives"
      count={loading ? undefined : isKanban ? baseFiltered.length : filteredMilestones.length}
      width={isKanban ? 'full' : 'wide'}
      actions={
        <Button size="sm" onClick={openCreate}>
          {t('milestones.new')}
        </Button>
      }
      filters={
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('milestones.searchPlaceholder')}
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
        <ErrorState title={t('milestones.loadFailedTitle')} description={t('milestones.loadFailed')} onRetry={loadMilestones} />
      ) : filteredMilestones.length === 0 ? (
        <EmptyState
          size={hasFilters ? 'md' : 'page'}
          variant={!hasFilters ? 'milestones' : 'search'}
          title={hasFilters ? t('milestones.empty.filteredTitle') : t('milestones.empty.pristineTitle')}
          description={
            hasFilters
              ? t('milestones.empty.filteredBody')
              : t('milestones.empty.pristineBody')
          }
          action={
            hasFilters ? (
              <Button size="sm" variant="secondary" onClick={() => { clearFilters(); setSearch('') }}>
                {t('tasks.actions.clear')}
              </Button>
            ) : (
              <Button size="sm" onClick={openCreate}>
                {t('milestones.new')}
              </Button>
            )
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-end pb-1.5">
            <Button size="sm" variant="ghost" flat onClick={multiSelect.toggleAll}>
              {multiSelect.isAllSelected ? t('tasks.actions.deselectAll') : t('tasks.actions.selectAll')}
            </Button>
          </div>
          <div>
            {groups.map(({ key, items }) => (
              <ListGroup
                key={`${key}-${statusFilter}`}
                title={statusLabel(key, getStatusMeta('milestone', key).label)}
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
      <FormDialog {...formDialog.dialogProps} onSubmit={createForm.submit}>
        {createForm.fields}
      </FormDialog>
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
  const { t } = useT()
  const isProject = isProjectMilestone(milestone)
  const status = normStatus(milestone.status)
  const tags = (milestone.tags || []).filter((tag) => !tag.startsWith('project:'))
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
      leading={<RowCheckbox checked={selected} onToggle={onToggleSelect} label={t('milestones.select', { title: milestone.title })} />}
      trailing={<RelativeTime date={milestone.created_at} />}
      description={milestone.description}
      tone={overdue ? 'warning' : getStatusMeta('milestone', status).tone}
      status={[<StatusMenu key="status" kind="milestone" icon status={status} onChange={onStatusChange} />]}
      meta={[
        <Fact key="source" icon={isProject ? FolderKanban : Flag} title={milestone.workspace_name} truncateAt="max-w-[14rem]">
          {isProject ? t('milestones.sources.project') : t('milestones.sources.workspace')}
          {milestone.workspace_name ? ` · ${milestone.workspace_name}` : ''}
        </Fact>,
        // The due date is a fact; once overdue it is a warning (tone glyph + word, the rail says it too).
        milestone.target_date ? (
          overdue ? (
            <ToneText
              key="due"
              tone="warning"
              icon
              label={<span title={formatAbsolute(milestone.target_date)}>{t('milestones.overdue', { date: formatDay(milestone.target_date) })}</span>}
            />
          ) : (
            <Fact key="due" icon={CalendarClock} title={formatAbsolute(milestone.target_date)}>
              {t('milestones.due', { date: formatDay(milestone.target_date) })}
            </Fact>
          )
        ) : null,
        tags.length > 0 ? (
          <Fact key="tags" icon={Tag}>
            {tags.map((tag) => `#${tag}`).join(' ')}
          </Fact>
        ) : null,
      ]}
      context={<TaskProgress counts={progress ? { blocked: 0, failed: 0, ...progress } : undefined} />}
      actions={[
        {
          label: t('tasks.actions.delete'),
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: { title: t('milestones.confirm.deleteTitle'), description: t('milestones.confirm.deleteBody') },
        },
      ]}
    />
  )
}
