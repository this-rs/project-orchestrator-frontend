import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAtomValue } from 'jotai'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { milestoneRefreshAtom, workspaceRefreshAtom, activeWorkspaceAtom } from '@/atoms'
import { Card, EmptyState, Badge, ProgressBar, InteractiveMilestoneStatusBadge, ViewToggle, Select, ConfirmDialog, OverflowMenu, PageShell, SelectZone, BulkActionBar, SkeletonCard, ErrorState } from '@/components/ui'
import { workspacesApi, projectsApi } from '@/services'
import { useViewMode, useConfirmDialog, useToast, useMultiSelect, useWorkspaceSlug } from '@/hooks'
import { MilestoneKanbanBoard } from '@/components/kanban'
import { fadeInUp, staggerContainer, useReducedMotion } from '@/utils/motion'
import type { MilestoneWithProgress } from '@/components/kanban'
import type { MilestoneStatus } from '@/types'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useViewMode()
  const navigate = useNavigate()
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()
  const activeWorkspace = useAtomValue(activeWorkspaceAtom)
  const reducedMotion = useReducedMotion()

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const msRefresh = useAtomValue(milestoneRefreshAtom)
  const wsRefresh = useAtomValue(workspaceRefreshAtom)

  const loadMilestones = useCallback(async () => {
    const isInitialLoad = allMilestones.length === 0
    if (isInitialLoad) setLoading(true)
    setError(null)
    try {
      const milestones: MilestoneWithProgress[] = []

      // 1. Workspace milestones
      try {
        const milestonesResponse = await workspacesApi.listMilestones(wsSlug)
        const workspaceMilestones = Array.isArray(milestonesResponse)
          ? milestonesResponse
          : (milestonesResponse.items || [])

        for (const milestone of workspaceMilestones) {
          try {
            const progress = await workspacesApi.getMilestoneProgress(milestone.id)
            milestones.push({ ...milestone, progress, workspace_name: activeWorkspace?.name })
          } catch {
            milestones.push({ ...milestone, workspace_name: activeWorkspace?.name })
          }
        }
      } catch {
        // No workspace milestones
      }

      // 2. Project milestones (from workspace projects)
      try {
        const projects = await workspacesApi.listProjects(wsSlug)
        for (const project of projects) {
          try {
            const pmData = await projectsApi.listMilestones(project.id)
            const projectMilestones = pmData.items || []
            for (const pm of projectMilestones) {
              // Adapt project milestone to MilestoneWithProgress shape
              milestones.push({
                id: pm.id,
                workspace_id: activeWorkspace?.id || '',
                title: pm.title,
                description: pm.description,
                status: pm.status,
                target_date: pm.target_date,
                closed_at: pm.closed_at,
                created_at: pm.created_at,
                tags: [`project:${project.name}`],
                workspace_name: project.name,
              } as MilestoneWithProgress)
            }
          } catch {
            // Skip project milestones on error
          }
        }
      } catch {
        // No projects
      }

      setAllMilestones(milestones)
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

  // Filtered milestones
  const filteredMilestones = useMemo(() => {
    let result = allMilestones
    if (statusFilter !== 'all') {
      result = result.filter((m) => (m.status?.toLowerCase() || 'open') === statusFilter)
    }
    if (sourceFilter === 'workspace') {
      result = result.filter((m) => !m.tags?.some((t) => t.startsWith('project:')))
    } else if (sourceFilter === 'project') {
      result = result.filter((m) => m.tags?.some((t) => t.startsWith('project:')))
    }
    return result
  }, [allMilestones, statusFilter, sourceFilter])

  const handleStatusChange = useCallback(
    async (milestoneId: string, newStatus: MilestoneStatus) => {
      const original = allMilestones.find((m) => m.id === milestoneId)
      const isProjectMilestone = original?.tags?.some((t) => t.startsWith('project:'))
      setAllMilestones((prev) =>
        prev.map((m) => (m.id === milestoneId ? { ...m, status: newStatus } : m))
      )
      try {
        if (isProjectMilestone) {
          await projectsApi.updateMilestone(milestoneId, { status: newStatus })
        } else {
          await workspacesApi.updateMilestone(milestoneId, { status: newStatus })
        }
        toast.success('Status updated')
      } catch {
        if (original) {
          setAllMilestones((prev) =>
            prev.map((m) => (m.id === milestoneId ? original : m))
          )
        }
        toast.error('Failed to update status')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allMilestones],
  )

  const multiSelect = useMultiSelect(filteredMilestones, (m) => m.id)

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

  const sourceOptions = [
    { value: 'all', label: 'All Sources' },
    { value: 'workspace', label: 'Workspace' },
    { value: 'project', label: 'Project' },
  ]

  const hasFilters = statusFilter !== 'all' || sourceFilter !== 'all'
  const showListSkeleton = loading && viewMode === 'list'

  return (
    <PageShell
      title="Milestones"
      description="Track milestones for this workspace"
      actions={
        <ViewToggle value={viewMode} onChange={setViewMode} />
      }
    >
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4 sm:flex-wrap">
        <Select
          options={sourceOptions}
          value={sourceFilter}
          onChange={(value) => setSourceFilter(value)}
          className="w-full sm:w-40"
        />
        {viewMode === 'list' && (
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value)}
            className="w-full sm:w-40"
          />
        )}
        {hasFilters && (
          <button
            onClick={() => { setSourceFilter('all'); setStatusFilter('all') }}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {viewMode === 'kanban' ? (
        <MilestoneKanbanBoard
          milestones={filteredMilestones}
          onMilestoneStatusChange={handleStatusChange}
          onMilestoneClick={(id) => navigate(`/workspace/${wsSlug}/milestones/${id}`)}
        />
      ) : showListSkeleton ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Failed to load" description={error} onRetry={loadMilestones} />
      ) : filteredMilestones.length === 0 ? (
        <EmptyState
          title="No milestones"
          description={hasFilters ? 'No milestones match the current filters.' : 'Milestones help track major goals across your projects.'}
        />
      ) : (
        <>
          {filteredMilestones.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={multiSelect.toggleAll}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {multiSelect.isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
          <motion.div
            className="space-y-4"
            variants={reducedMotion ? undefined : staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {filteredMilestones.map((milestone) => (
                <motion.div key={milestone.id} variants={fadeInUp} exit="exit" layout={!reducedMotion}>
                  <MilestoneCard
                    wsSlug={wsSlug}
                    selected={multiSelect.isSelected(milestone.id)}
                    onToggleSelect={(shiftKey) => multiSelect.toggle(milestone.id, shiftKey)}
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
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
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
  wsSlug,
}: {
  milestone: MilestoneWithProgress
  onStatusChange: (status: MilestoneStatus) => Promise<void>
  onDelete: () => void
  selected?: boolean
  onToggleSelect?: (shiftKey: boolean) => void
  wsSlug: string
}) {
  const tags = milestone.tags || []
  const isProjectMilestone = tags.some((t) => t.startsWith('project:'))

  const statusKey = (milestone.status?.toLowerCase() || 'open')
  const detailPath = isProjectMilestone
    ? `/workspace/${wsSlug}/project-milestones/${milestone.id}`
    : `/workspace/${wsSlug}/milestones/${milestone.id}`

  return (
    <Link to={detailPath}>
      <Card className={`transition-colors ${selected ? 'border-indigo-500/40 bg-indigo-500/[0.05]' : 'hover:border-indigo-500'}`}>
        <div className="flex">
          {onToggleSelect && (
            <SelectZone selected={!!selected} onToggle={onToggleSelect} />
          )}
          <div className={`w-1 shrink-0 ${!onToggleSelect ? 'rounded-l-xl' : ''} ${milestoneStatusBarColor[statusKey] || 'bg-gray-400'}`} />
          <div className="flex-1 min-w-0 p-3 md:p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-100 truncate min-w-0">{milestone.title}</h3>
                  <InteractiveMilestoneStatusBadge
                    status={milestone.status?.toLowerCase() as MilestoneStatus}
                    onStatusChange={onStatusChange}
                  />
                  {isProjectMilestone ? (
                    <Badge variant="default">Project</Badge>
                  ) : (
                    <Badge variant="info">Workspace</Badge>
                  )}
                </div>
                {milestone.description && (
                  <p className="text-sm text-gray-400 line-clamp-2">{milestone.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                  {milestone.workspace_name && (
                    <span>{isProjectMilestone ? `Project: ${milestone.workspace_name}` : `Workspace: ${milestone.workspace_name}`}</span>
                  )}
                  {milestone.target_date && (
                    <span>Target: {new Date(milestone.target_date).toLocaleDateString()}</span>
                  )}
                </div>
                {tags.filter((t) => !t.startsWith('project:')).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.filter((t) => !t.startsWith('project:')).slice(0, 4).map((tag, index) => (
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
