import { lazy, Suspense, useEffect, useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useSetAtom, useAtomValue } from 'jotai'
import { FolderOpen, Clipboard, RefreshCw, Trash2, ChevronRight, Orbit, Calendar, Network, Loader2, Brain, AlertTriangle, X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, Button, ConfirmDialog, FormDialog, LoadingPage, ErrorState, Badge, PageHeader, SectionNav } from '@/components/ui'
import { ExpandableMilestoneRow } from '@/components/expandable'
import {
  useIntelligenceData,
  IntelHealthBreakdown,
  IntelQuickActions,
  IntelLayerCards,
  IntelSkillsCard,
  IntelAttention,
} from '@/components/intelligence/IntelligenceDashboard'
import { projectsApi, featureGraphsApi } from '@/services'
import { useConfirmDialog, useFormDialog, useToast, useSectionObserver, useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import { chatSuggestedProjectIdAtom, projectRefreshAtom, planRefreshAtom, milestoneRefreshAtom, taskRefreshAtom } from '@/atoms'
import { CreateMilestoneForm, CreateReleaseForm } from '@/components/forms'
import type { Project, ProjectRoadmap, FeatureGraph } from '@/types'

// Lazy-load heavy sub-views — only loaded when the user activates a tab
const VectorSpaceExplorer = lazy(() => import('@/components/intelligence/VectorSpaceExplorer'))
const LearningTimeline = lazy(() => import('@/components/intelligence/LearningTimeline'))
const IntelligenceGraphPage = lazy(() => import('@/components/intelligence/IntelligenceGraphPage'))

type SubView = 'vector-space' | 'timeline' | 'graph'

const SUB_VIEW_CONFIG: { key: SubView; label: string; icon: typeof Orbit; color: string; activeColor: string }[] = [
  { key: 'timeline', label: 'Timeline', icon: Calendar, color: 'text-emerald-400 hover:bg-emerald-500/10', activeColor: 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40' },
  { key: 'vector-space', label: 'Vector Space', icon: Orbit, color: 'text-violet-400 hover:bg-violet-500/10', activeColor: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40' },
  { key: 'graph', label: 'Graph', icon: Network, color: 'text-cyan-400 hover:bg-cyan-500/10', activeColor: 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40' },
]

function SubViewFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading…
      </div>
    </div>
  )
}

export function ProjectDetailPage() {
  const { projectSlug: slug } = useParams<{ projectSlug: string }>()
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const confirmDialog = useConfirmDialog()
  const milestoneFormDialog = useFormDialog()
  const releaseFormDialog = useFormDialog()
  const toast = useToast()
  const setSuggestedProjectId = useSetAtom(chatSuggestedProjectIdAtom)
  const projectRefresh = useAtomValue(projectRefreshAtom)
  const planRefresh = useAtomValue(planRefreshAtom)
  const milestoneRefresh = useAtomValue(milestoneRefreshAtom)
  const taskRefresh = useAtomValue(taskRefreshAtom)
  const [project, setProject] = useState<Project | null>(null)
  const [roadmap, setRoadmap] = useState<ProjectRoadmap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [featureGraphs, setFeatureGraphs] = useState<FeatureGraph[]>([])

  // Expandable sections
  const [releasesExpanded, setReleasesExpanded] = useState(false)
  const [fgExpanded, setFgExpanded] = useState(false)

  // Sub-view state (timeline open by default so the page isn't empty)
  const [activeSubView, setActiveSubView] = useState<SubView | null>('timeline')

  // Intelligence data (composable sections)
  const intelligence = useIntelligenceData(slug ?? '')

  const fetchData = useCallback(async () => {
    if (!slug) return
    setError(null)
    const isInitialLoad = !project
    if (isInitialLoad) setLoading(true)
    try {
      const projectData = await projectsApi.get(slug)
      setProject(projectData)
      setSuggestedProjectId(projectData.id)

      try {
        const roadmapData = await projectsApi.getRoadmap(projectData.id)
        setRoadmap(roadmapData)
      } catch {
        // Roadmap might not be available
      }

      try {
        const fgData = await featureGraphsApi.list({ project_id: projectData.id })
        setFeatureGraphs(fgData.feature_graphs || [])
      } catch (fgError) {
        console.error('Failed to fetch feature graphs:', fgError)
      }
    } catch (error) {
      console.error('Failed to fetch project:', error)
      setError('Failed to load project')
    } finally {
      if (isInitialLoad) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- project is a data object (would cause loop); setSuggestedProjectId is a stable Jotai setter
  }, [slug, projectRefresh, planRefresh, milestoneRefresh, taskRefresh])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSync = async () => {
    if (!slug) return
    setSyncing(true)
    try {
      await projectsApi.sync(slug)
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
      await projectsApi.createMilestone(project.id, data)
      toast.success('Milestone added')
      try {
        const roadmapData = await projectsApi.getRoadmap(project.id)
        setRoadmap(roadmapData)
      } catch { /* ignore */ }
    },
  })

  const releaseForm = CreateReleaseForm({
    onSubmit: async (data) => {
      if (!project) return
      await projectsApi.createRelease(project.id, data)
      toast.success('Release added')
      try {
        const roadmapData = await projectsApi.getRoadmap(project.id)
        setRoadmap(roadmapData)
      } catch { /* ignore */ }
    },
  })

  const milestoneCount = (roadmap?.milestones || []).length
  const releaseCount = roadmap?.releases.length ?? 0

  const sectionIds = [
    'health',
    'quick-actions',
    ...(milestoneCount > 0 ? ['milestones'] : []),
    ...(releaseCount > 0 ? ['releases'] : []),
    'layers',
    'skills',
    ...(featureGraphs.length > 0 ? ['feature-graphs'] : []),
    'attention',
  ]
  const activeSection = useSectionObserver(sectionIds)

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={fetchData} />
  if (loading || !project) return <LoadingPage />

  const sections = [
    { id: 'health', label: 'Health' },
    { id: 'quick-actions', label: 'Actions' },
    ...(milestoneCount > 0 ? [{ id: 'milestones', label: 'Milestones', count: milestoneCount }] : []),
    ...(releaseCount > 0 ? [{ id: 'releases', label: 'Releases', count: releaseCount }] : []),
    { id: 'layers', label: 'Layers' },
    { id: 'skills', label: 'Skills' },
    ...(featureGraphs.length > 0 ? [{ id: 'feature-graphs', label: 'Feature Graphs', count: featureGraphs.length }] : []),
    { id: 'attention', label: 'Attention' },
  ]

  // Intelligence loading/error/empty states
  const intelReady = !intelligence.loading && !intelligence.error && !!intelligence.summary

  return (
    <div className="pt-6 space-y-6">
      <PageHeader
        title={project.name}
        description={project.description}
        overflowActions={[
          { label: 'Delete', variant: 'danger', onClick: () => confirmDialog.open({
            title: 'Delete Project',
            description: 'This will permanently delete this project and all associated data.',
            onConfirm: async () => { await projectsApi.delete(project.slug); toast.success('Project deleted'); navigate(workspacePath(wsSlug, '/projects')) }
          }) }
        ]}
      />

      {/* ── Sub-view switcher (below description) ──────────────────────── */}
      <div className="flex items-center gap-1.5">
        {SUB_VIEW_CONFIG.map(({ key, label, icon: Icon, color, activeColor }) => (
          <button
            key={key}
            onClick={() => setActiveSubView(activeSubView === key ? null : key)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
              activeSubView === key ? activeColor : color
            }`}
            title={label}
          >
            <Icon size={13} />
            <span>{label}</span>
          </button>
        ))}
        {activeSubView && (
          <button
            onClick={() => setActiveSubView(null)}
            className="ml-1 p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
            title="Close view"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Inline sub-view content ────────────────────────────────────── */}
      {activeSubView && (
        <section className="scroll-mt-20">
          <Suspense fallback={<SubViewFallback />}>
            {activeSubView === 'vector-space' && (
              <VectorSpaceExplorer embedded projectSlug={slug} />
            )}
            {activeSubView === 'timeline' && (
              <LearningTimeline embedded projectSlug={slug} />
            )}
            {activeSubView === 'graph' && (
              <IntelligenceGraphPage embedded projectSlug={slug} />
            )}
          </Suspense>
        </section>
      )}

      <SectionNav
        sections={sections}
        activeSection={activeSection}
        rightContent={
          <div className="flex items-center gap-1.5">
            {project.root_path && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-md px-2.5 py-1 group">
                <FolderOpen className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <span className="text-xs text-gray-400 font-mono truncate max-w-[120px] md:max-w-[200px]" title={project.root_path}>
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
                  <Clipboard className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="p-1.5 rounded-md text-gray-500 hover:text-indigo-400 hover:bg-white/[0.08] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              title={syncing ? 'Syncing...' : `Sync codebase${project.last_synced ? `\nLast sync: ${new Date(project.last_synced).toLocaleString()}` : ''}`}
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      />

      {/* ── Intelligence: Loading / Error / Empty ──────────────────────── */}
      {intelligence.loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      )}
      {intelligence.error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
          <p className="text-sm text-slate-400 mb-3">{intelligence.error}</p>
          <button
            onClick={intelligence.handleRefresh}
            className="text-xs text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}
      {!intelligence.loading && !intelligence.error && !intelligence.summary && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Brain className="w-8 h-8 text-slate-600 mb-3" />
          <p className="text-sm text-slate-500">No intelligence data available</p>
        </div>
      )}

      {/* ── 1. Health Breakdown ─────────────────────────────────────────── */}
      {intelReady && (
        <section id="health" className="scroll-mt-20">
          <IntelHealthBreakdown
            data={intelligence}
            progress={roadmap ? { percentage: roadmap.progress.percentage } : undefined}
          />
        </section>
      )}

      {/* ── 2. Quick Actions ───────────────────────────────────────────── */}
      {intelReady && (
        <section id="quick-actions" className="scroll-mt-20">
          <IntelQuickActions data={intelligence} />
        </section>
      )}

      {/* ── 3. Milestones ──────────────────────────────────────────────── */}
      {milestoneCount > 0 && (
        <section id="milestones" className="scroll-mt-20">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Milestones ({milestoneCount})</CardTitle>
              <Button size="sm" onClick={() => milestoneFormDialog.open({ title: 'Add Milestone' })}>
                Add
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(roadmap!.milestones || []).map(({ milestone, progress }) => (
                  <ExpandableMilestoneRow
                    key={milestone.id}
                    milestone={milestone}
                    progress={progress}
                    refreshTrigger={taskRefresh}
                    linkState={{ projectId: project.id, projectSlug: project.slug, projectName: project.name }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── 4. Releases ────────────────────────────────────────────────── */}
      {releaseCount > 0 && (
        <section id="releases" className="scroll-mt-20">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <button
                onClick={() => setReleasesExpanded(!releasesExpanded)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${releasesExpanded ? 'rotate-90' : ''}`} />
                <CardTitle className="text-sm">Releases ({releaseCount})</CardTitle>
              </button>
              <Button size="sm" onClick={() => releaseFormDialog.open({ title: 'Add Release' })}>Add</Button>
            </CardHeader>
            {releasesExpanded && (
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {roadmap!.releases.map(({ release }) => (
                    <div key={release.id} className="flex items-center justify-between gap-2 p-2.5 bg-white/[0.04] rounded-lg">
                      <div className="min-w-0 truncate">
                        <span className="text-sm text-gray-300">v{release.version}</span>
                        {release.title && (
                          <span className="ml-2 text-gray-500 text-sm">{release.title}</span>
                        )}
                      </div>
                      <Badge variant={release.status === 'released' ? 'success' : 'default'}>
                        {release.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </section>
      )}

      {/* ── 5. Layer Cards (Code, PM, Knowledge Fabric, Neural) ─────── */}
      {intelReady && (
        <section id="layers" className="scroll-mt-20">
          <IntelLayerCards data={intelligence} />
        </section>
      )}

      {/* ── 6. Skills ──────────────────────────────────────────────────── */}
      {intelReady && (
        <section id="skills" className="scroll-mt-20">
          <IntelSkillsCard data={intelligence} />
        </section>
      )}

      {/* ── 7. Feature Graphs ──────────────────────────────────────────── */}
      {featureGraphs.length > 0 && (
        <section id="feature-graphs" className="scroll-mt-20">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <button
                onClick={() => setFgExpanded(!fgExpanded)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform duration-150 ${fgExpanded ? 'rotate-90' : ''}`} />
                <CardTitle className="text-sm">Feature Graphs ({featureGraphs.length})</CardTitle>
              </button>
            </CardHeader>
            {fgExpanded && (
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {featureGraphs.map((fg) => (
                    <Link
                      key={fg.id}
                      to={workspacePath(wsSlug, `/feature-graphs/${fg.id}`)}
                      state={{ projectId: project.id, projectSlug: project.slug, projectName: project.name }}
                      className="flex items-center justify-between gap-3 p-2.5 bg-white/[0.04] rounded-lg hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-300 truncate">{fg.name}</span>
                          {fg.entity_count != null && (
                            <Badge variant="default">{fg.entity_count} entities</Badge>
                          )}
                          {fg.entry_function && (
                            <Badge variant="info">{fg.entry_function}</Badge>
                          )}
                        </div>
                        {fg.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {fg.description.length > 80 ? `${fg.description.slice(0, 80)}...` : fg.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          confirmDialog.open({
                            title: 'Delete Feature Graph',
                            description: `Delete "${fg.name}"? This cannot be undone.`,
                            onConfirm: async () => {
                              await featureGraphsApi.delete(fg.id)
                              setFeatureGraphs((prev) => prev.filter((g) => g.id !== fg.id))
                              toast.success('Feature graph deleted')
                            },
                          })
                        }}
                        className="p-1 rounded text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-white/[0.08] transition-all shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </section>
      )}

      {/* ── 8. Attention Needed ─────────────────────────────────────────── */}
      {intelReady && (
        <section id="attention" className="scroll-mt-20">
          <IntelAttention data={intelligence} />
        </section>
      )}

      <FormDialog {...milestoneFormDialog.dialogProps} onSubmit={milestoneForm.submit}>
        {milestoneForm.fields}
      </FormDialog>
      <FormDialog {...releaseFormDialog.dialogProps} onSubmit={releaseForm.submit}>
        {releaseForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </div>
  )
}
