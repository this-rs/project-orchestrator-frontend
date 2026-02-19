import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { projectsApi } from '@/services'
import { workspacesApi } from '@/services/workspaces'
import { Card, CardContent, Button, LoadingPage, EmptyState, Badge, ConfirmDialog, FormDialog, OverflowMenu, PageShell, SelectZone, BulkActionBar } from '@/components/ui'
import { useConfirmDialog, useFormDialog, useToast, useMultiSelect, useWorkspaceSlug } from '@/hooks'
import { CreateProjectForm } from '@/components/forms'
import type { Project } from '@/types'

export function ProjectsPage() {
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const toast = useToast()
  const [formLoading, setFormLoading] = useState(false)
  const wsSlug = useWorkspaceSlug()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const data = await workspacesApi.listProjects(wsSlug)
      setProjects(data)
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [wsSlug])

  useEffect(() => { loadProjects() }, [loadProjects])

  const removeItems = (predicate: (p: Project) => boolean) => {
    setProjects((prev) => prev.filter((p) => !predicate(p)))
  }

  const form = CreateProjectForm({
    onSubmit: async (data) => {
      setFormLoading(true)
      try {
        const created = await projectsApi.create(data)
        await workspacesApi.addProject(wsSlug, created.id)
        toast.success('Project created')
        formDialog.close()
        loadProjects()
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
        const slugs = new Set(items.map((p) => p.slug))
        removeItems((p) => slugs.has(p.slug))
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
      {projects.length === 0 ? (
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
                wsSlug={wsSlug}
                selected={multiSelect.isSelected(project.slug)}
                onToggleSelect={(shiftKey) => multiSelect.toggle(project.slug, shiftKey)}
                key={project.id}
                project={project}
                onDelete={() => confirmDialog.open({
                  title: 'Delete Project',
                  description: 'This will permanently delete this project.',
                  onConfirm: async () => {
                    await projectsApi.delete(project.slug)
                    removeItems((p) => p.id === project.id)
                    toast.success('Project deleted')
                  },
                })}
              />
            ))}
          </div>
          {/* No infinite scroll needed — workspace projects count is small */}
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

function ProjectCard({ project, onDelete, selected, onToggleSelect, wsSlug }: { project: Project; onDelete: () => void; selected?: boolean; onToggleSelect?: (shiftKey: boolean) => void; wsSlug: string }) {
  return (
    <Link to={`/workspace/${wsSlug}/projects/${project.slug}`}>
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
