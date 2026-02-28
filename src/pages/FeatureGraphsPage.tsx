import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { GitGraph, Trash2, Plus, Sparkles, Box } from 'lucide-react'
import { featureGraphsApi, workspacesApi } from '@/services'
import {
  Card,
  CardContent,
  Badge,
  Button,
  Select,
  ConfirmDialog,
  FormDialog,
  PageShell,
  SkeletonCard,
} from '@/components/ui'
import { useConfirmDialog, useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { CreateFeatureGraphForm, AutoBuildFeatureGraphForm } from '@/components/forms'
import { fadeInUp, staggerContainer, useReducedMotion } from '@/utils/motion'
import type { FeatureGraph } from '@/types'
import { workspacePath } from '@/utils/paths'

// ── Relative time ───────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// ── Main page ───────────────────────────────────────────────────────────

export function FeatureGraphsPage() {
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const confirmDialog = useConfirmDialog()
  const createDialog = useFormDialog()
  const autoBuildDialog = useFormDialog()
  const toast = useToast()
  const reducedMotion = useReducedMotion()

  // Project selector
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([])
  const [selectedProject, setSelectedProject] = useState('all')
  const [graphs, setGraphs] = useState<FeatureGraph[]>([])
  const [loading, setLoading] = useState(true)

  // Load projects for the workspace
  useEffect(() => {
    if (!wsSlug) return
    workspacesApi
      .listProjects(wsSlug)
      .then((data) => {
        setProjects(data.map((p) => ({ id: p.id, name: p.name, slug: p.slug })))
      })
      .catch(() => {})
  }, [wsSlug])

  const projectOptions = useMemo(
    () => [
      { value: 'all', label: 'All Projects' },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects],
  )

  // Fetch feature graphs
  const fetchGraphs = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    try {
      const projectId = selectedProject !== 'all' ? selectedProject : undefined
      const res = await featureGraphsApi.list(projectId ? { project_id: projectId } : {})
      setGraphs(res.feature_graphs || [])
    } catch {
      setGraphs([])
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    fetchGraphs(true)
  }, [fetchGraphs])

  // Resolve project name from id
  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects],
  )

  // Forms
  const createForm = CreateFeatureGraphForm({
    projects,
    onSubmit: async (data) => {
      const graph = await featureGraphsApi.create(data)
      toast.success('Feature graph created')
      navigate(workspacePath(wsSlug, `/feature-graphs/${graph.id}`), {
        state: { projectId: data.project_id },
      })
    },
  })

  const autoBuildForm = AutoBuildFeatureGraphForm({
    projects,
    onSubmit: async (data) => {
      const graph = await featureGraphsApi.autoBuild(data)
      toast.success(`Auto-built with ${graph.entities?.length || 0} entities`)
      navigate(workspacePath(wsSlug, `/feature-graphs/${graph.id}`), {
        state: { projectId: data.project_id },
      })
    },
  })

  const handleDelete = (graph: FeatureGraph) => {
    confirmDialog.open({
      title: 'Delete Feature Graph',
      description: `Permanently delete "${graph.name}"? This cannot be undone.`,
      onConfirm: async () => {
        await featureGraphsApi.delete(graph.id)
        setGraphs((prev) => prev.filter((g) => g.id !== graph.id))
        toast.success('Feature graph deleted')
      },
    })
  }

  return (
    <PageShell
      title="Feature Graphs"
      description="Visualize feature relationships extracted from your codebase"
      actions={
        <>
          {projects.length > 1 && (
            <Select
              options={projectOptions}
              value={selectedProject}
              onChange={setSelectedProject}
              className="w-full sm:w-44"
            />
          )}
          <Button variant="secondary" onClick={() => autoBuildDialog.open({ title: 'Auto-Build Feature Graph', size: 'lg', submitLabel: 'Build' })}>
            <Sparkles className="w-4 h-4 mr-1.5" />
            Auto-Build
          </Button>
          <Button onClick={() => createDialog.open({ title: 'Create Feature Graph' })}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      ) : graphs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-white/[0.06] rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center text-gray-500 mb-4">
            <GitGraph className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-gray-200 mb-1">No feature graphs yet</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-sm">
            Create one manually or auto-build from an entry function in your code.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => autoBuildDialog.open({ title: 'Auto-Build Feature Graph', size: 'lg', submitLabel: 'Build' })}
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              Auto-Build
            </Button>
            <Button onClick={() => createDialog.open({ title: 'Create Feature Graph' })}>
              <Plus className="w-4 h-4 mr-1.5" />
              Create
            </Button>
          </div>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
          variants={reducedMotion ? undefined : staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {graphs.map((graph) => (
              <motion.div key={graph.id} variants={fadeInUp} exit="exit" layout={!reducedMotion}>
                <FeatureGraphCard
                  graph={graph}
                  wsSlug={wsSlug}
                  projectName={projectNameById[graph.project_id]}
                  onDelete={() => handleDelete(graph)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <FormDialog {...createDialog.dialogProps} onSubmit={createForm.submit}>
        {createForm.fields}
      </FormDialog>
      <FormDialog {...autoBuildDialog.dialogProps} onSubmit={autoBuildForm.submit} submitLabel="Build">
        {autoBuildForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

// ── Feature Graph Card ──────────────────────────────────────────────────

interface FeatureGraphCardProps {
  graph: FeatureGraph
  wsSlug: string
  projectName?: string
  onDelete: () => void
}

function FeatureGraphCard({ graph, wsSlug, projectName, onDelete }: FeatureGraphCardProps) {
  return (
    <Card className="group relative">
      <Link
        to={workspacePath(wsSlug, `/feature-graphs/${graph.id}`)}
        state={{ projectId: graph.project_id }}
        className="block"
      >
        <CardContent>
          {/* Header: name + delete */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-gray-100 truncate">{graph.name}</h3>
              {graph.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{graph.description}</p>
              )}
            </div>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelete()
              }}
              className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
              title="Delete feature graph"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {graph.entity_count != null && (
              <Badge variant="default">{graph.entity_count} entities</Badge>
            )}
            {graph.entry_function && (
              <Badge variant="info">{graph.entry_function}</Badge>
            )}
            {graph.build_depth != null && (
              <Badge variant="default">depth {graph.build_depth}</Badge>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {projectName && (
              <span className="flex items-center gap-1 truncate">
                <Box className="w-3 h-3 shrink-0" />
                {projectName}
              </span>
            )}
            {graph.created_at && (
              <span className="ml-auto shrink-0">{relativeTime(graph.created_at)}</span>
            )}
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}
