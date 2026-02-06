import { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { Link } from 'react-router-dom'
import { projectsAtom, projectsLoadingAtom } from '@/atoms'
import { projectsApi } from '@/services'
import { Card, CardContent, Button, LoadingPage, EmptyState, Badge, Pagination, ConfirmDialog, FormDialog, OverflowMenu, PageShell } from '@/components/ui'
import { usePagination, useConfirmDialog, useFormDialog, useToast } from '@/hooks'
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

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const response = await projectsApi.list({ limit: pageSize, offset })
      setProjects(response.items || [])
      setTotal(response.total || 0)
    } catch (error) {
      console.error('Failed to fetch projects:', error)
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [setProjects, setLoading, page, pageSize, offset])

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
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

      <FormDialog {...formDialog.dialogProps} onSubmit={form.submit} loading={formLoading}>
        {form.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  return (
    <Link to={`/projects/${project.slug}`}>
      <Card className="h-full hover:border-indigo-500 transition-colors">
        <div className="h-0.5 bg-blue-500/50" />
        <CardContent>
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-lg font-semibold text-gray-100">{project.name}</h3>
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
      </Card>
    </Link>
  )
}
