import { useEffect, useState, useRef } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { Link } from 'react-router-dom'
import { projectsAtom, projectsLoadingAtom, projectRefreshAtom } from '@/atoms'
import { projectsApi } from '@/services'
import { Card, CardContent, Button, LoadingPage, EmptyState, Badge, Pagination, ConfirmDialog, FormDialog, OverflowMenu, PageShell, SelectZone, BulkActionBar } from '@/components/ui'
import { usePagination, useConfirmDialog, useFormDialog, useToast, useMultiSelect } from '@/hooks'
import { CreateProjectForm } from '@/components/forms'
import type { Project } from '@/types'

export function ProjectsPage() {
  const [projects, setProjects] = useAtom(projectsAtom)
  const [loading, setLoading] = useAtom(projectsLoadingAtom)
  const [total, setTotal] = useState(0)
  const { page, pageSize, offset, paginationProps } = usePagination()
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const toast = useToast()
  const [formLoading, setFormLoading] = useState(false)
  const projRefresh = useAtomValue(projectRefreshAtom)

  const fetchProjects = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await projectsApi.list({ limit: pageSize, offset })
      setProjects(response.items || [])
      setTotal(response.total || 0)
    } catch (error) {
      console.error('Failed to fetch projects:', error)
      toast.error('Failed to load projects')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const initialLoadDone = useRef(false)
  useEffect(() => {
    const silent = initialLoadDone.current
    fetchProjects(silent)
    initialLoadDone.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchProjects is intentionally excluded to avoid loop
  }, [setProjects, setLoading, page, pageSize, offset, projRefresh])

  const form = CreateProjectForm({
    onSubmit: async (data) => {
      setFormLoading(true)
      try {
        await projectsApi.create(data)
        toast.success('Project created')
        formDialog.close()
        fetchProjects()
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const openCreateDialog = () => {
    formDialog.open({ title: 'Create Project' })
  }

  const multiSelect = useMultiSelect(projects, (p) => p.slug)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: `Delete ${count} project${count > 1 ? 's' : ''}`,
      description: `This will permanently delete ${count} project${count > 1 ? 's' : ''}.`,
      onConfirm: async () => {
        const items = multiSelect.selectedItems
        confirmDialog.setProgress({ current: 0, total: items.length })
        for (let i = 0; i < items.length; i++) {
          await projectsApi.delete(items[i].slug)
          confirmDialog.setProgress({ current: i + 1, total: items.length })
        }
        setProjects((prev) => prev.filter((p) => !multiSelect.selectedIds.has(p.slug)))
        setTotal((prev) => prev - items.length)
        multiSelect.clear()
        toast.success(`Deleted ${count} project${count > 1 ? 's' : ''}`)
      },
    })
  }

  if (loading) return <LoadingPage />

  return (
    <PageShell
      title="Projects"
      description="Track your codebase projects"
      actions={<Button onClick={openCreateDialog}>Create Project</Button>}
    >
      {projects.length === 0 && total === 0 ? (
        <EmptyState
          title="No projects"
          description="Create a project to start tracking your codebase."
          action={<Button onClick={openCreateDialog}>Create Project</Button>}
        />
      ) : (
        <>
          {projects.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={multiSelect.toggleAll}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {multiSelect.isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {projects.map((project) => (
              <ProjectCard
                selected={multiSelect.isSelected(project.slug)}
                onToggleSelect={(shiftKey) => multiSelect.toggle(project.slug, shiftKey)}
                key={project.id}
                project={project}
                onDelete={() => confirmDialog.open({
                  title: 'Delete Project',
                  description: 'This will permanently delete this project.',
                  onConfirm: async () => {
                    await projectsApi.delete(project.slug)
                    setProjects(prev => prev.filter(p => p.id !== project.id))
                    toast.success('Project deleted')
                  },
                })}
              />
            ))}
          </div>
          <div className="mt-6">
            <Pagination {...paginationProps(total)} />
          </div>
        </>
      )}

      <BulkActionBar
        count={multiSelect.selectionCount}
        onDelete={handleBulkDelete}
        onClear={multiSelect.clear}
      />
      <FormDialog {...formDialog.dialogProps} onSubmit={form.submit} loading={formLoading}>
        {form.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

function ProjectCard({ project, onDelete, selected, onToggleSelect }: { project: Project; onDelete: () => void; selected?: boolean; onToggleSelect?: (shiftKey: boolean) => void }) {
  return (
    <Link to={`/projects/${project.slug}`}>
      <Card className={`h-full transition-colors ${selected ? 'border-indigo-500/40 bg-indigo-500/[0.05]' : 'hover:border-indigo-500'}`}>
        <div className="flex h-full">
          {onToggleSelect && (
            <SelectZone selected={!!selected} onToggle={onToggleSelect} />
          )}
          <div className="flex-1 min-w-0">
            <div className="h-0.5 bg-blue-500/50" />
            <CardContent>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-lg font-semibold text-gray-100 truncate min-w-0">{project.name}</h3>
                <OverflowMenu
                  actions={[
                    { label: 'Delete', variant: 'danger', onClick: () => onDelete() },
                  ]}
                />
              </div>
              {project.description && (
                <p className="text-sm text-gray-400 line-clamp-2 mb-3">{project.description}</p>
              )}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {project.last_synced
                    ? `Synced ${new Date(project.last_synced).toLocaleDateString()}`
                    : 'Never synced'}
                </span>
                {project.last_synced && <Badge variant="success">Synced</Badge>}
              </div>
            </CardContent>
          </div>
        </div>
      </Card>
    </Link>
  )
}
