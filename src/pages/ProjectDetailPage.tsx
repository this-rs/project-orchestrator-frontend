import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import { Card, CardHeader, CardTitle, CardContent, Button, ConfirmDialog, FormDialog, LinkEntityDialog, LoadingPage, Badge, ProgressBar, PageHeader, SectionNav } from '@/components/ui'
import { ExpandablePlanRow } from '@/components/expandable'
import { projectsApi, plansApi } from '@/services'
import { useConfirmDialog, useFormDialog, useLinkDialog, useToast, useSectionObserver } from '@/hooks'
import { chatSuggestedProjectIdAtom, projectRefreshAtom, planRefreshAtom, milestoneRefreshAtom, taskRefreshAtom } from '@/atoms'
import { CreateMilestoneForm, CreateReleaseForm } from '@/components/forms'
import type { Project, Plan, ProjectRoadmap, PlanStatus } from '@/types'

export function ProjectDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const confirmDialog = useConfirmDialog()
  const milestoneFormDialog = useFormDialog()
  const releaseFormDialog = useFormDialog()
  const linkDialog = useLinkDialog()
  const toast = useToast()
  const setSuggestedProjectId = useSetAtom(chatSuggestedProjectIdAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const [formLoading, setFormLoading] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [roadmap, setRoadmap] = useState<ProjectRoadmap | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    async function fetchData() {
      if (!slug) return
      // Only show loading spinner on initial load, not on WS-triggered refreshes
      const isInitialLoad = !project
      if (isInitialLoad) setLoading(true)
      try {
        // First get the project
        const projectData = await projectsApi.get(slug)
        setProject(projectData)
        setSuggestedProjectId(projectData.id)

        // Fetch plans filtered by project_id (client-side filter as backend filter doesn't work)
        const allPlansData = await plansApi.list({ limit: 100 })
        const projectPlans = (allPlansData.items || []).filter(
          (plan) => plan.project_id === projectData.id
        )
        setPlans(projectPlans)

        // Try to get roadmap
        try {
          const roadmapData = await projectsApi.getRoadmap(projectData.id)
          setRoadmap(roadmapData)
        } catch {
          // Roadmap might not be available
        }
      } catch (error) {
        console.error('Failed to fetch project:', error)
      } finally {
        if (isInitialLoad) setLoading(false)
      }
    }
    fetchData()
  }, [slug, projectRefresh, planRefresh, milestoneRefresh])

  const handleSync = async () => {
    if (!slug) return
    setSyncing(true)
    try {
      await projectsApi.sync(slug)
      // Refresh project data
      const projectData = await projectsApi.get(slug)
      setProject(projectData)
      toast.success('Codebase synced')
    } catch (error) {
      console.error('Failed to sync project:', error)
      toast.error('Failed to sync project')
    } finally {
      setSyncing(false)
    }
  }

  const milestoneForm = CreateMilestoneForm({
    onSubmit: async (data) => {
      if (!project) return
      setFormLoading(true)
      try {
        await projectsApi.createMilestone(project.id, data)
        milestoneFormDialog.close()
        toast.success('Milestone added')
        // Refresh roadmap
        try {
          const roadmapData = await projectsApi.getRoadmap(project.id)
          setRoadmap(roadmapData)
        } catch { /* ignore */ }
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const releaseForm = CreateReleaseForm({
    onSubmit: async (data) => {
      if (!project) return
      setFormLoading(true)
      try {
        await projectsApi.createRelease(project.id, data)
        releaseFormDialog.close()
        toast.success('Release added')
        // Refresh roadmap
        try {
          const roadmapData = await projectsApi.getRoadmap(project.id)
          setRoadmap(roadmapData)
        } catch { /* ignore */ }
      } finally {
        setFormLoading(false)
      }
    },
    loading: formLoading,
  })

  const hasRoadmap = roadmap && ((roadmap.milestones || []).length > 0 || roadmap.releases.length > 0)
  const sectionIds = [...(hasRoadmap ? ['roadmap'] : []), 'plans']
  const activeSection = useSectionObserver(sectionIds)

  if (loading || !project) return <LoadingPage />

  const sections = [
    ...(hasRoadmap ? [{ id: 'roadmap', label: 'Roadmap', count: (roadmap!.milestones || []).length + roadmap!.releases.length }] : []),
    { id: 'plans', label: 'Plans', count: plans.length },
  ]

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={project.name}
        description={project.description}
        metadata={[
          ...(project.root_path ? [{ label: 'Root path', value: project.root_path }] : []),
        ]}
        overflowActions={[
          { label: 'Delete', variant: 'danger', onClick: () => confirmDialog.open({
            title: 'Delete Project',
            description: 'This will permanently delete this project and all associated data.',
            onConfirm: async () => { await projectsApi.delete(project.slug); toast.success('Project deleted'); navigate('/projects') }
          }) }
        ]}
        actions={
          <Button onClick={handleSync} loading={syncing}>
            {syncing ? 'Syncing...' : 'Sync Codebase'}
          </Button>
        }
      />

      <SectionNav sections={sections} activeSection={activeSection} />

      {/* Roadmap Progress */}
      {roadmap && (
        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <ProgressBar value={roadmap.progress.percentage} showLabel size="lg" />
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-200">{roadmap.progress.total_tasks}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">{roadmap.progress.completed_tasks}</div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{roadmap.progress.in_progress_tasks}</div>
                <div className="text-xs text-gray-500">In Progress</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-400">{roadmap.progress.pending_tasks}</div>
                <div className="text-xs text-gray-500">Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Milestones & Releases */}
      {roadmap && (
        <section id="roadmap" className="scroll-mt-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Milestones</CardTitle>
                <Button size="sm" onClick={() => milestoneFormDialog.open({ title: 'Add Milestone' })}>Add</Button>
              </div>
            </CardHeader>
            <CardContent>
              {(roadmap.milestones || []).length === 0 ? (
                <p className="text-gray-500 text-sm">No milestones defined</p>
              ) : (
                <div className="space-y-3">
                  {(roadmap.milestones || []).map(({ milestone, progress }) => (
                    <Link
                      key={milestone.id}
                      to={`/project-milestones/${milestone.id}`}
                      className="block p-3 bg-white/[0.06] rounded-lg hover:bg-white/[0.08] transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-200">{milestone.title}</span>
                        <Badge variant={milestone.status?.toLowerCase() === 'open' ? 'info' : 'success'}>
                          {milestone.status}
                        </Badge>
                      </div>
                      <ProgressBar value={progress?.percentage || 0} size="sm" />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Releases</CardTitle>
                <Button size="sm" onClick={() => releaseFormDialog.open({ title: 'Add Release' })}>Add</Button>
              </div>
            </CardHeader>
            <CardContent>
              {roadmap.releases.length === 0 ? (
                <p className="text-gray-500 text-sm">No releases planned</p>
              ) : (
                <div className="space-y-3">
                  {roadmap.releases.map(({ release }) => (
                    <div key={release.id} className="flex items-center justify-between p-3 bg-white/[0.06] rounded-lg">
                      <div>
                        <span className="font-medium text-gray-200">v{release.version}</span>
                        {release.title && (
                          <span className="ml-2 text-gray-400">{release.title}</span>
                        )}
                      </div>
                      <Badge variant={release.status === 'released' ? 'success' : 'default'}>
                        {release.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        </section>
      )}

      {/* Plans */}
      <section id="plans" className="scroll-mt-20">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Plans ({plans.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => linkDialog.open({
              title: 'Link Existing Plan',
              submitLabel: 'Link',
              fetchOptions: async () => {
                const data = await plansApi.list({ limit: 100 })
                return (data.items || [])
                  .filter(p => !p.project_id)
                  .map(p => ({ value: p.id, label: p.title, description: p.status }))
              },
              onLink: async (planId) => {
                await plansApi.linkToProject(planId, project.id)
                const allPlansData = await plansApi.list({ limit: 100 })
                const projectPlans = (allPlansData.items || []).filter(p => p.project_id === project.id)
                setPlans(projectPlans)
                toast.success('Plan linked')
              },
            })}>Link Plan</Button>
            <Link to="/plans">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-gray-500 text-sm">No plans for this project</p>
          ) : (
            <div className="space-y-2">
              {plans.map((plan) => (
                <ExpandablePlanRow
                  key={plan.id}
                  plan={plan}
                  onStatusChange={async (newStatus: PlanStatus) => {
                    await plansApi.updateStatus(plan.id, newStatus)
                    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, status: newStatus } : p)))
                    toast.success('Status updated')
                  }}
                  refreshTrigger={taskRefresh}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </section>

      <FormDialog {...milestoneFormDialog.dialogProps} onSubmit={milestoneForm.submit} loading={formLoading}>
        {milestoneForm.fields}
      </FormDialog>
      <FormDialog {...releaseFormDialog.dialogProps} onSubmit={releaseForm.submit} loading={formLoading}>
        {releaseForm.fields}
      </FormDialog>
      <LinkEntityDialog {...linkDialog.dialogProps} />
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
