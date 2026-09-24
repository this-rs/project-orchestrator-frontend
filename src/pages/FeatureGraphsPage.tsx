import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Folder, GitGraph, Plus, Sparkles, Trash2 } from 'lucide-react'
import { featureGraphsApi, workspacesApi } from '@/services'
import {
  Button,
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  FilterBar,
  FormDialog,
  ListGroup,
  PageShell,
  RelativeTime,
  Select,
  groupByRecency,
  pluralize,
} from '@/components/ui'
import { useFormDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { CreateFeatureGraphForm, AutoBuildFeatureGraphForm } from '@/components/forms'
import type { FeatureGraph } from '@/types'
import { workspacePath } from '@/utils/paths'

// ── Main page ───────────────────────────────────────────────────────────

export function FeatureGraphsPage() {
  const navigate = useNavigate()
  const wsSlug = useWorkspaceSlug()
  const createDialog = useFormDialog()
  const autoBuildDialog = useFormDialog()
  const toast = useToast()

  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([])
  const [selectedProject, setSelectedProject] = useState('all')
  const [search, setSearch] = useState('')
  const [graphs, setGraphs] = useState<FeatureGraph[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!wsSlug) return
    workspacesApi
      .listProjects(wsSlug)
      .then((data) => setProjects(data.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))))
      .catch(() => {})
  }, [wsSlug])

  const fetchGraphs = useCallback(async () => {
    setLoading(true)
    try {
      const projectId = selectedProject !== 'all' ? selectedProject : undefined
      const res = await featureGraphsApi.list(projectId ? { project_id: projectId } : {})
      setGraphs(res.feature_graphs || [])
      setError(false)
    } catch {
      // Previously swallowed → looked like "no graphs yet". Now an explicit error.
      setGraphs([])
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    fetchGraphs()
  }, [fetchGraphs])

  const projectNameById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return graphs
    return graphs.filter((g) =>
      [g.name, g.description, g.entry_function].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [graphs, search])
  const groups = useMemo(() => groupByRecency(filtered, (g) => g.created_at), [filtered])

  // Forms
  const createForm = CreateFeatureGraphForm({
    projects,
    onSubmit: async (data) => {
      const graph = await featureGraphsApi.create(data)
      toast.success('Feature graph created')
      navigate(workspacePath(wsSlug, `/feature-graphs/${graph.id}`), { state: { projectId: data.project_id } })
    },
  })

  const autoBuildForm = AutoBuildFeatureGraphForm({
    projects,
    onSubmit: async (data) => {
      const graph = await featureGraphsApi.autoBuild(data)
      toast.success(`Auto-built with ${graph.entities?.length || 0} entities`)
      navigate(workspacePath(wsSlug, `/feature-graphs/${graph.id}`), { state: { projectId: data.project_id } })
    },
  })

  const openCreate = () => createDialog.open({ title: 'Create feature graph' })
  const openAutoBuild = () => autoBuildDialog.open({ title: 'Auto-build feature graph', size: 'lg', submitLabel: 'Build' })

  const handleDelete = async (graph: FeatureGraph) => {
    try {
      await featureGraphsApi.delete(graph.id)
      setGraphs((prev) => prev.filter((g) => g.id !== graph.id))
      toast.success('Feature graph deleted')
    } catch {
      toast.error('Failed to delete feature graph')
    }
  }

  const showProjectFilter = projects.length > 1
  const projectFilterActive = selectedProject !== 'all'
  const isPristine = graphs.length === 0 && !projectFilterActive

  return (
    <PageShell
      title="Feature Graphs"
      count={loading ? undefined : filtered.length}
      width="wide"
      actions={
        <>
          <Button size="sm" variant="secondary" onClick={openAutoBuild}>
            <Sparkles className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Auto-build
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
            New
          </Button>
        </>
      }
      filters={
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Un feature graph regroupe le code (fichiers, fonctions, types) qui réalise une fonctionnalité. Auto-build le construit en
            suivant les appels depuis une fonction d'entrée.
          </p>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search feature graphs…"
            activeCount={projectFilterActive ? 1 : 0}
            activeLabels={[projectFilterActive ? projectNameById[selectedProject] ?? '' : '']}
            onClear={() => setSelectedProject('all')}
            filters={
              showProjectFilter ? (
                <Select
                  options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                  value={selectedProject}
                  onChange={setSelectedProject}
                  icon={<Folder className="w-3 h-3" />}
                />
              ) : undefined
            }
          />
        </div>
      }
    >
      {loading ? (
        <EntityListSkeleton rows={4} />
      ) : error ? (
        <ErrorState description="Impossible de charger les feature graphs." onRetry={fetchGraphs} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GitGraph className="w-6 h-6" />}
          title={isPristine ? 'No feature graph yet' : 'No matching feature graph'}
          description={
            isPristine
              ? 'Créez-en un à la main, ou laissez Auto-build le construire depuis une fonction d’entrée de votre code.'
              : 'Essayez une autre recherche ou retirez le filtre projet.'
          }
          action={
            isPristine ? (
              <>
                <Button size="sm" variant="secondary" onClick={openAutoBuild}>
                  <Sparkles className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  Auto-build
                </Button>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
                  Create
                </Button>
              </>
            ) : undefined
          }
        />
      ) : (
        <div>
          {groups.map(({ group, items }) => (
            <ListGroup key={group} title={group} count={items.length}>
              {items.map((graph) => (
                <EntityRow
                  key={graph.id}
                  title={graph.name}
                  href={workspacePath(wsSlug, `/feature-graphs/${graph.id}`)}
                  description={graph.description}
                  trailing={<RelativeTime date={graph.created_at} />}
                  meta={[
                    graph.entity_count != null ? pluralize(graph.entity_count, 'entity', 'entities') : null,
                    graph.entry_function ? (
                      <code key="entry" className="font-mono text-gray-400 truncate max-w-[14rem]" title={`Entry: ${graph.entry_function}`}>
                        {graph.entry_function}
                      </code>
                    ) : null,
                    graph.build_depth != null ? `depth ${graph.build_depth}` : null,
                    selectedProject === 'all' ? projectNameById[graph.project_id] : null,
                  ]}
                  actions={[
                    {
                      label: 'Delete',
                      icon: Trash2,
                      variant: 'danger',
                      onClick: () => handleDelete(graph),
                      confirm: {
                        title: 'Delete feature graph',
                        description: `Supprimer définitivement « ${graph.name} » ? Le code n'est pas touché. Irréversible.`,
                        confirmLabel: 'Delete',
                      },
                    },
                  ]}
                />
              ))}
            </ListGroup>
          ))}
        </div>
      )}

      <FormDialog {...createDialog.dialogProps} onSubmit={createForm.submit}>
        {createForm.fields}
      </FormDialog>
      <FormDialog {...autoBuildDialog.dialogProps} onSubmit={autoBuildForm.submit} submitLabel="Build">
        {autoBuildForm.fields}
      </FormDialog>
    </PageShell>
  )
}
