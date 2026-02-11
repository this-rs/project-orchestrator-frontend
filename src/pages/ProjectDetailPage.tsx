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
  const [plansExpandAll, setPlansExpandAll] = useState(0)
  const [plansCollapseAll, setPlansCollapseAll] = useState(0)
  const [plansAllExpanded, setPlansAllExpanded] = useState(false)

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
  }, [slug, projectRefresh, planRefresh, milestoneRefresh, taskRefresh])

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
        overflowActions={[
          { label: 'Delete', variant: 'danger', onClick: () => confirmDialog.open({
            title: 'Delete Project',
            description: 'This will permanently delete this project and all associated data.',
            onConfirm: async () => { await projectsApi.delete(project.slug); toast.success('Project deleted'); navigate('/projects') }
          }) }
        ]}
      />

      <SectionNav
        sections={sections}
        activeSection={activeSection}
        rightContent={
          <div className="flex items-center gap-2">
            {project.root_path && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1 group">
                <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
                <span className="text-xs text-gray-400 font-mono truncate max-w-[200px] md:max-w-xs" title={project.root_path}>
                  {project.root_path}
                </span>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(project.root_path!)
                    toast.success('Path copied')
                  }}
                  className="ml-0.5 p-0.5 rounded text-gray-600 opacity-0 group-hover:opacity-100 hover:text-gray-300 hover:bg-white/[0.08] transition-all"
                  title="Copy path"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                </button>
              </div>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="p-1.5 rounded-md text-gray-500 hover:text-indigo-400 hover:bg-white/[0.08] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={syncing ? 'Syncing...' : `Sync codebase${project.last_synced ? `\nLast sync: ${new Date(project.last_synced).toLocaleString()}` : ''}`}
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M21.015 4.356v4.992" />
              </svg>
            </button>
          </div>
        }
      />

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
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-medium text-gray-200 truncate min-w-0">{milestone.title}</span>
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
                    <div key={release.id} className="flex items-center justify-between gap-2 p-3 bg-white/[0.06] rounded-lg">
                      <div className="min-w-0 truncate">
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
          <div className="flex items-center gap-2">
            <CardTitle>Plans ({plans.length})</CardTitle>
            {plans.length > 0 && (
              <button
                onClick={() => {
                  if (plansAllExpanded) {
                    setPlansCollapseAll((s) => s + 1)
                  } else {
                    setPlansExpandAll((s) => s + 1)
                  }
                  setPlansAllExpanded(!plansAllExpanded)
                }}
                className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                title={plansAllExpanded ? 'Collapse all' : 'Expand all'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {plansAllExpanded ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4-4 4 4M4 10l4-4 4 4" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8l4 4 4-4M4 14l4 4 4-4" />
                  )}
                </svg>
              </button>
            )}
          </div>
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
                  expandAllSignal={plansExpandAll}
                  collapseAllSignal={plansCollapseAll}
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
