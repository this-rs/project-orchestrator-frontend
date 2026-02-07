import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, LoadingPage, EmptyState, Badge, ProgressBar, InteractiveMilestoneStatusBadge, Pagination, ViewToggle, Select, ConfirmDialog, OverflowMenu, PageShell, SelectZone, BulkActionBar } from '@/components/ui'
import { workspacesApi } from '@/services'
import { usePagination, useViewMode, useConfirmDialog, useToast, useMultiSelect } from '@/hooks'
import { MilestoneKanbanBoard } from '@/components/kanban'
import type { MilestoneWithProgress } from '@/components/kanban'
import type { MilestoneStatus, Workspace } from '@/types'

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'planned', label: 'Planned' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
]

export function MilestonesPage() {
  const [allMilestones, setAllMilestones] = useState<MilestoneWithProgress[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const { page, pageSize, paginationProps } = usePagination()
  const [viewMode, setViewMode] = useViewMode()
  const navigate = useNavigate()
  const confirmDialog = useConfirmDialog()
  const toast = useToast()

  // Filters
  const [workspaceFilter, setWorkspaceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    async function fetchMilestones() {
      setLoading(true)
      try {
        const workspacesData = await workspacesApi.list()
        const workspacesList = workspacesData.items || []
        setWorkspaces(workspacesList)

        const milestones: MilestoneWithProgress[] = []

        for (const workspace of workspacesList) {
          try {
            const milestonesResponse = await workspacesApi.listMilestones(workspace.slug)
            const workspaceMilestones = Array.isArray(milestonesResponse)
              ? milestonesResponse
              : (milestonesResponse.items || [])

            for (const milestone of workspaceMilestones) {
              try {
                const progress = await workspacesApi.getMilestoneProgress(milestone.id)
                milestones.push({
                  ...milestone,
                  progress,
                  workspace_name: workspace.name,
                })
              } catch {
                milestones.push({
                  ...milestone,
                  workspace_name: workspace.name,
                })
              }
            }
          } catch (error) {
            console.error(`Failed to fetch milestones for workspace ${workspace.slug}:`, error)
            toast.error('Failed to load milestones')
          }
        }

        setAllMilestones(milestones)
      } catch (error) {
        console.error('Failed to fetch milestones:', error)
        toast.error('Failed to load milestones')
      } finally {
        setLoading(false)
      }
    }
    fetchMilestones()
  }, [])

  // Filtered milestones
  const filteredMilestones = useMemo(() => {
    let result = allMilestones
    if (workspaceFilter !== 'all') {
      result = result.filter((m) => m.workspace_id === workspaceFilter)
    }
    if (statusFilter !== 'all') {
      result = result.filter((m) => (m.status?.toLowerCase() || 'open') === statusFilter)
    }
    return result
  }, [allMilestones, workspaceFilter, statusFilter])

  // Client-side pagination (list mode only)
  const paginatedMilestones = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredMilestones.slice(start, start + pageSize)
  }, [filteredMilestones, page, pageSize])

  const handleStatusChange = useCallback(
    async (milestoneId: string, newStatus: MilestoneStatus) => {
      const original = allMilestones.find((m) => m.id === milestoneId)
      setAllMilestones((prev) =>
        prev.map((m) => (m.id === milestoneId ? { ...m, status: newStatus } : m))
      )
      try {
        await workspacesApi.updateMilestone(milestoneId, { status: newStatus })
        toast.success('Status updated')
      } catch (error) {
        if (original) {
          setAllMilestones((prev) =>
            prev.map((m) => (m.id === milestoneId ? original : m))
          )
        }
        console.error('Failed to update milestone status:', error)
        toast.error('Failed to update status')
      }
    },
    [allMilestones],
  )

  const multiSelect = useMultiSelect(paginatedMilestones, (m) => m.id)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: `Delete ${count} milestone${count > 1 ? 's' : ''}`,
      description: `This will permanently delete ${count} milestone${count > 1 ? 's' : ''}.`,
      onConfirm: async () => {
        const items = multiSelect.selectedItems
        confirmDialog.setProgress({ current: 0, total: items.length })
        for (let i = 0; i < items.length; i++) {
          await workspacesApi.deleteMilestone(items[i].id)
          confirmDialog.setProgress({ current: i + 1, total: items.length })
        }
        setAllMilestones((prev) => prev.filter((m) => !multiSelect.selectedIds.has(m.id)))
        multiSelect.clear()
        toast.success(`Deleted ${count} milestone${count > 1 ? 's' : ''}`)
      },
    })
  }

  if (loading) return <LoadingPage />

  const workspaceOptions = [
    { value: 'all', label: 'All Workspaces' },
    ...workspaces.map((w) => ({ value: w.id, label: w.name })),
  ]

  const hasFilters = workspaceFilter !== 'all' || statusFilter !== 'all'

  return (
    <PageShell
      title="Milestones"
      description="Track milestones across workspaces"
      actions={
        <ViewToggle value={viewMode} onChange={setViewMode} />
      }
    >
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4 sm:flex-wrap">
        <Select
          options={workspaceOptions}
          value={workspaceFilter}
          onChange={(e) => setWorkspaceFilter(e.target.value)}
          className="w-full sm:w-44"
        />
        {viewMode === 'list' && (
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-40"
          />
        )}
        {hasFilters && (
          <button
            onClick={() => { setWorkspaceFilter('all'); setStatusFilter('all') }}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {filteredMilestones.length === 0 ? (
        <EmptyState
          title="No milestones"
          description={hasFilters ? 'No milestones match the current filters.' : 'Milestones help track major goals across your projects.'}
        />
      ) : viewMode === 'kanban' ? (
        <MilestoneKanbanBoard
          milestones={filteredMilestones}
          onMilestoneStatusChange={handleStatusChange}
          onMilestoneClick={(id) => navigate(`/milestones/${id}`)}
        />
      ) : (
        <>
          {viewMode === 'list' && paginatedMilestones.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={multiSelect.toggleAll}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {multiSelect.isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
          <div className="space-y-4">
            {paginatedMilestones.map((milestone) => (
              <MilestoneCard
                selected={multiSelect.isSelected(milestone.id)}
                onToggleSelect={(shiftKey) => multiSelect.toggle(milestone.id, shiftKey)}
                key={milestone.id}
                milestone={milestone}
                onStatusChange={(newStatus) => handleStatusChange(milestone.id, newStatus)}
                onDelete={() => confirmDialog.open({
                  title: 'Delete Milestone',
                  description: 'This milestone will be permanently deleted.',
                  onConfirm: async () => {
                    await workspacesApi.deleteMilestone(milestone.id)
                    setAllMilestones(prev => prev.filter(m => m.id !== milestone.id))
                    toast.success('Milestone deleted')
                  },
                })}
              />
            ))}
          </div>
          <div className="mt-6">
            <Pagination {...paginationProps(filteredMilestones.length)} />
          </div>
        </>
      )}

      <BulkActionBar
        count={multiSelect.selectionCount}
        onDelete={handleBulkDelete}
        onClear={multiSelect.clear}
      />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

const milestoneStatusBarColor: Record<string, string> = {
  planned: 'bg-gray-400',
  open: 'bg-blue-400',
  in_progress: 'bg-yellow-400',
  completed: 'bg-green-400',
  closed: 'bg-purple-400',
}

function MilestoneCard({
  milestone,
  onStatusChange,
  onDelete,
  selected,
  onToggleSelect,
}: {
  milestone: MilestoneWithProgress
  onStatusChange: (status: MilestoneStatus) => Promise<void>
  onDelete: () => void
  selected?: boolean
  onToggleSelect?: (shiftKey: boolean) => void
}) {
  const tags = milestone.tags || []

  const statusKey = (milestone.status?.toLowerCase() || 'open')

  return (
    <Link to={`/milestones/${milestone.id}`}>
      <Card className={`transition-colors ${selected ? 'border-indigo-500/40 bg-indigo-500/[0.05]' : 'hover:border-indigo-500'}`}>
        <div className="flex">
          {onToggleSelect && (
            <SelectZone selected={!!selected} onToggle={onToggleSelect} />
          )}
          <div className={`w-1 shrink-0 ${!onToggleSelect ? 'rounded-l-xl' : ''} ${milestoneStatusBarColor[statusKey] || 'bg-gray-400'}`} />
          <div className="flex-1 p-3 md:p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-100 truncate min-w-0">{milestone.title}</h3>
                  <InteractiveMilestoneStatusBadge
                    status={milestone.status?.toLowerCase() as MilestoneStatus}
                    onStatusChange={onStatusChange}
                  />
                </div>
                {milestone.description && (
                  <p className="text-sm text-gray-400 line-clamp-2">{milestone.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                  {milestone.workspace_name && (
                    <span>Workspace: {milestone.workspace_name}</span>
                  )}
                  {milestone.target_date && (
                    <span>Target: {new Date(milestone.target_date).toLocaleDateString()}</span>
                  )}
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.slice(0, 4).map((tag, index) => (
                      <Badge key={`${tag}-${index}`} variant="default">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <OverflowMenu
                actions={[
                  { label: 'Delete', variant: 'danger', onClick: () => onDelete() },
                ]}
              />
            </div>

            {milestone.progress && (
              <div className="mt-3">
                <ProgressBar value={milestone.progress.percentage} showLabel size="sm" />
                <p className="text-xs text-gray-500 mt-1">
                  {milestone.progress.completed} / {milestone.progress.total} tasks completed
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
