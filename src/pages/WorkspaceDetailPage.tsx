import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Card, CardHeader, CardTitle, CardContent, LoadingPage, Badge, Button, ConfirmDialog, FormDialog, LinkEntityDialog, ProgressBar, PageHeader, SectionNav } from '@/components/ui'
import { workspacesApi, projectsApi } from '@/services'
import { useConfirmDialog, useFormDialog, useLinkDialog, useToast, useSectionObserver } from '@/hooks'
import { workspaceRefreshAtom, projectRefreshAtom, milestoneRefreshAtom, taskRefreshAtom } from '@/atoms'
import { CreateMilestoneForm, CreateResourceForm, CreateComponentForm } from '@/components/forms'
import type { Workspace, Project, WorkspaceMilestone, Resource, Component, MilestoneProgress } from '@/types'

// API response structure
interface WorkspaceOverviewResponse {
  workspace: Workspace
  projects: Project[]
  milestones: WorkspaceMilestone[]
  resources: Resource[]
  components: Component[]
  progress: { completed_tasks: number; total_tasks: number; percentage: number }
}

export function WorkspaceDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const confirmDialog = useConfirmDialog()
  const milestoneFormDialog = useFormDialog()
  const resourceFormDialog = useFormDialog()
  const componentFormDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const workspaceRefresh = useAtomValue(workspaceRefreshAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const [formLoading, setFormLoading] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [milestones, setMilestones] = useState<(WorkspaceMilestone & { progress?: MilestoneProgress })[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [overallProgress, setOverallProgress] = useState<{ completed_tasks: number; total_tasks: number; percentage: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!slug) return
      // Only show loading spinner on initial load, not on WS-triggered refreshes
      const isInitialLoad = !workspace
      if (isInitialLoad) setLoading(true)
      try {
        const overviewData = await workspacesApi.getOverview(slug) as unknown as WorkspaceOverviewResponse

        setWorkspace(overviewData.workspace)
        setProjects(overviewData.projects || [])
        setResources(overviewData.resources || [])
        setComponents(overviewData.components || [])
        setOverallProgress(overviewData.progress || null)

        // Use milestones from overview and fetch progress for each
        const milestoneItems = overviewData.milestones || []
        const milestonesWithProgress = await Promise.all(
          milestoneItems.map(async (m) => {
            try {
              const progress = await workspacesApi.getMilestoneProgress(m.id)
              return { ...m, progress }
            } catch {
              return { ...m, progress: undefined }
            }
          })
        )
        setMilestones(milestonesWithProgress)
      } catch (error) {
        console.error('Failed to fetch workspace:', error)
      } finally {
        if (isInitialLoad) setLoading(false)
      }
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace is a data object (would cause infinite loop)
  }, [slug, workspaceRefresh, projectRefresh, milestoneRefresh, taskRefresh])

  const milestoneForm = CreateMilestoneForm({
    onSubmit: async (data) => {
      if (!slug) return
      setFormLoading(true)
      try {
        const newMilestone = await workspacesApi.createMilestone(slug, data)
        setMilestones((prev) => [...prev, { ...newMilestone, progress: undefined }])
        milestoneFormDialog.close()
        toast.success('Milestone added')
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const resourceForm = CreateResourceForm({
    onSubmit: async (data) => {
      if (!slug) return
      setFormLoading(true)
      try {
        const newResource = await workspacesApi.createResource(slug, data)
        setResources((prev) => [...prev, newResource])
        resourceFormDialog.close()
        toast.success('Resource added')
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const componentForm = CreateComponentForm({
    onSubmit: async (data) => {
      if (!slug) return
      setFormLoading(true)
      try {
        const newComponent = await workspacesApi.createComponent(slug, data)
        setComponents((prev) => [...prev, newComponent])
        componentFormDialog.close()
        toast.success('Component added')
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const sectionIds = ['overview', 'projects', 'milestones', 'resources', 'components']
  const activeSection = useSectionObserver(sectionIds)

  if (loading || !workspace) return <LoadingPage />

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: 'Projects', count: projects.length },
    { id: 'milestones', label: 'Milestones', count: milestones.length },
    { id: 'resources', label: 'Resources', count: resources.length },
    { id: 'components', label: 'Components', count: components.length },
  ]

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={workspace.name}
        description={workspace.description}
        overflowActions={[
          { label: 'Delete', variant: 'danger', onClick: () => confirmDialog.open({
            title: 'Delete Workspace',
            description: 'This will permanently delete this workspace. Projects will not be deleted.',
            onConfirm: async () => { await workspacesApi.delete(workspace.slug); toast.success('Workspace deleted'); navigate('/workspaces') }
          }) }
        ]}
      />

      <SectionNav sections={sections} activeSection={activeSection} />

      {/* Overview */}
      <section id="overview" className="scroll-mt-20">
        {/* Overall Progress */}
        {overallProgress && overallProgress.total_tasks > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Overall Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar value={overallProgress.percentage} showLabel size="lg" />
              <p className="mt-2 text-sm text-gray-400">
                {overallProgress.completed_tasks} / {overallProgress.total_tasks} tasks completed
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mt-6">
          <StatCard label="Projects" value={projects.length} />
          <StatCard label="Milestones" value={milestones.length} />
          <StatCard label="Resources" value={resources.length} />
          <StatCard label="Components" value={components.length} />
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="scroll-mt-20" data-tour="workspace-projects-grid">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Projects</CardTitle>
            <Button size="sm" onClick={() => linkDialog.open({
              title: 'Add Project to Workspace',
              submitLabel: 'Add',
              fetchOptions: async () => {
                const data = await projectsApi.list()
                const existingIds = new Set(projects.map(p => p.id))
                return (data.items || [])
                  .filter(p => !existingIds.has(p.id))
                  .map(p => ({ value: p.id, label: p.name, description: p.slug }))
              },
              onLink: async (projectId) => {
                await workspacesApi.addProject(workspace.slug, projectId)
                const data = await projectsApi.list()
                const proj = (data.items || []).find(p => p.id === projectId)
                if (proj) setProjects(prev => [...prev, proj])
                toast.success('Project added')
              },
            })}>Add Project</Button>
          </div>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-gray-500 text-sm">No projects in this workspace</p>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 bg-white/[0.06] rounded-lg"
                >
                  <Link
                    to={`/projects/${project.slug}`}
                    className="font-medium text-gray-200 hover:text-indigo-400 transition-colors flex-1 min-w-0"
                  >
                    {project.name}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-500 hidden sm:inline">{project.slug}</span>
                    <button
                      onClick={async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        await workspacesApi.removeProject(workspace.slug, project.id)
                        setProjects(prev => prev.filter(p => p.id !== project.id))
                        toast.success('Project removed')
                      }}
                      className="text-gray-500 hover:text-red-400 text-sm px-1"
                      title="Remove from workspace"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </section>

      {/* Milestones */}
      <section id="milestones" className="scroll-mt-20" data-tour="workspace-milestones">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Milestones</CardTitle>
            <Button size="sm" onClick={() => milestoneFormDialog.open({ title: 'Add Milestone' })}>Add Milestone</Button>
          </div>
        </CardHeader>
        <CardContent>
          {milestones.length === 0 ? (
            <p className="text-gray-500 text-sm">No milestones defined</p>
          ) : (
            <div className="space-y-4">
              {milestones.map((milestone) => (
                <Link
                  key={milestone.id}
                  to={`/milestones/${milestone.id}`}
                  className="block p-4 bg-white/[0.06] rounded-lg hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-medium text-gray-200 truncate min-w-0">{milestone.title}</span>
                    <Badge variant={milestone.status?.toLowerCase() === 'open' ? 'info' : 'success'}>
                      {milestone.status}
                    </Badge>
                  </div>
                  {milestone.progress && (
                    <div className="space-y-1">
                      <ProgressBar value={milestone.progress.percentage} showLabel />
                      <p className="text-xs text-gray-500">
                        {milestone.progress.completed} / {milestone.progress.total} tasks completed
                      </p>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </section>

      {/* Resources & Components */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <section id="resources" className="scroll-mt-20" data-tour="workspace-resources">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Resources</CardTitle>
              <Button size="sm" onClick={() => resourceFormDialog.open({ title: 'Add Resource', size: 'lg' })}>Add</Button>
            </div>
          </CardHeader>
          <CardContent>
            {resources.length === 0 ? (
              <p className="text-gray-500 text-sm">No resources defined</p>
            ) : (
              <div className="space-y-2">
                {resources.map((resource) => (
                  <div key={resource.id} className="flex items-center justify-between gap-2 p-2">
                    <span className="text-gray-200 truncate min-w-0">{resource.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge>{resource.resource_type}</Badge>
                      <button
                        onClick={async () => {
                          await workspacesApi.deleteResource(resource.id)
                          setResources(prev => prev.filter(r => r.id !== resource.id))
                          toast.success('Resource deleted')
                        }}
                        className="text-gray-500 hover:text-red-400 text-sm px-1"
                        title="Delete resource"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </section>

        <section id="components" className="scroll-mt-20" data-tour="workspace-components">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Components</CardTitle>
              <Button size="sm" onClick={() => componentFormDialog.open({ title: 'Add Component' })}>Add</Button>
            </div>
          </CardHeader>
          <CardContent>
            {components.length === 0 ? (
              <p className="text-gray-500 text-sm">No components defined</p>
            ) : (
              <div className="space-y-2">
                {components.map((component) => (
                  <div key={component.id} className="flex items-center justify-between gap-2 p-2">
                    <span className="text-gray-200 truncate min-w-0">{component.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge>{component.component_type}</Badge>
                      <button
                        onClick={async () => {
                          await workspacesApi.deleteComponent(component.id)
                          setComponents(prev => prev.filter(c => c.id !== component.id))
                          toast.success('Component deleted')
                        }}
                        className="text-gray-500 hover:text-red-400 text-sm px-1"
                        title="Delete component"
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </section>
      </div>

      <FormDialog {...milestoneFormDialog.dialogProps} onSubmit={milestoneForm.submit} loading={formLoading}>
        {milestoneForm.fields}
      </FormDialog>
      <FormDialog {...resourceFormDialog.dialogProps} onSubmit={resourceForm.submit} loading={formLoading}>
        {resourceForm.fields}
      </FormDialog>
      <FormDialog {...componentFormDialog.dialogProps} onSubmit={componentForm.submit} loading={formLoading}>
        {componentForm.fields}
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="text-center">
        <div className="text-2xl md:text-3xl font-bold text-indigo-400">{value}</div>
        <div className="text-sm text-gray-400">{label}</div>
      </CardContent>
    </Card>
  )
}
