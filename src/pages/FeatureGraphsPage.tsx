import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownUp, Boxes, Folder, FolderKanban, GitGraph, Layers, Play, Plus, Sparkles, Trash2 } from 'lucide-react'
import { featureGraphsApi, workspacesApi } from '@/services'
import {
  Button,
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Fact,
  FilterBar,
  FormDialog,
  ListGroup,
  LoadMoreSentinel,
  PageShell,
  RelativeTime,
  Select,
  groupByRecency,
  pluralize,
} from '@/components/ui'
import { useFormDialog, useIncrementalList, useToast, useWorkspaceSlug } from '@/hooks'
import { CreateFeatureGraphForm, AutoBuildFeatureGraphForm } from '@/components/forms'
import type { FeatureGraph } from '@/types'
import { workspacePath } from '@/utils/paths'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { humanize, humanizeIfCode, looksLikeIdentifier } from '@/utils/featureGraphReadable'

type SortKey = 'recent' | 'name' | 'entities'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Most recent' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'entities', label: 'Most entities' },
]

/** Rows rendered at once: the API returns every graph in one response (no server pagination). */
const PAGE_SIZE = 50
const noopRef = () => {}

/** One plain sentence when the graph has no description of its own. */
function graphSentence(g: FeatureGraph): string | undefined {
  if (g.description) return g.description
  if (!g.entry_function) return undefined
  const depth = g.build_depth != null ? ` and follows its calls ${g.build_depth} ${g.build_depth === 1 ? 'level' : 'levels'} deep` : ''
  return `Starts from “${humanize(g.entry_function)}”${depth}.`
}

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
  const [sort, setSort] = useState<SortKey>('recent')
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
  const sorted = useMemo(() => {
    const list = [...filtered]
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    else if (sort === 'entities') list.sort((a, b) => (b.entity_count ?? -1) - (a.entity_count ?? -1))
    else list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    return list
  }, [filtered, sort])
  const { visible, hasMore, remaining, showMore } = useIncrementalList(
    sorted,
    PAGE_SIZE,
    `${search}|${selectedProject}|${sort}`,
  )
  const groups = useMemo(
    () => (sort === 'recent' ? groupByRecency(visible, (g) => g.created_at) : [{ group: 'All', items: visible }]),
    [visible, sort],
  )

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

  const openCreate = () => createDialog.open({ title: 'New feature graph' })
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
  const clearAll = () => {
    setSearch('')
    setSelectedProject('all')
    setSort('recent')
  }

  // Same two actions in the header and in the "nothing yet" empty state.
  const createActions = (
    <>
      <Button size="sm" variant="secondary" onClick={openAutoBuild}>
        <Sparkles className="w-4 h-4 mr-1.5" aria-hidden="true" />
        Auto-build
      </Button>
      <Button size="sm" onClick={openCreate}>
        <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
        New graph
      </Button>
    </>
  )

  return (
    <PageShell
      title={NOMENCLATURE.featureGraphs.plural}
      description={NOMENCLATURE.featureGraphs.description}
      intro="featureGraphs"
      count={loading ? undefined : filtered.length}
      width="wide"
      actions={createActions}
      filters={
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search feature graphs…"
          activeCount={(projectFilterActive ? 1 : 0) + (sort !== 'recent' ? 1 : 0)}
          activeLabels={[
            projectFilterActive ? projectNameById[selectedProject] ?? '' : '',
            sort !== 'recent' ? SORT_OPTIONS.find((o) => o.value === sort)?.label ?? '' : '',
          ]}
          onClear={() => {
            setSelectedProject('all')
            setSort('recent')
          }}
          filters={
            <>
              {showProjectFilter && (
                <Select
                  options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                  value={selectedProject}
                  onChange={setSelectedProject}
                  icon={<Folder className="w-3 h-3" />}
                />
              )}
              <Select
                options={SORT_OPTIONS}
                value={sort}
                onChange={(v) => setSort(v as SortKey)}
                icon={<ArrowDownUp className="w-3 h-3" />}
              />
            </>
          }
        />
      }
    >
      {loading ? (
        <EntityListSkeleton rows={4} />
      ) : error ? (
        <ErrorState description="Feature graphs could not be loaded." onRetry={fetchGraphs} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GitGraph className="w-6 h-6" />}
          title={isPristine ? 'No feature graphs yet' : 'No matching feature graphs'}
          description={
            isPristine
              ? 'A feature graph gathers the files, functions and types behind one feature. Let Auto-build assemble one from an entry function, or create an empty one and add entities by hand.'
              : 'Try another search, or clear the search and the project filter.'
          }
          action={
            isPristine ? (
              createActions
            ) : (
              <Button size="sm" variant="secondary" onClick={clearAll}>
                Clear
              </Button>
            )
          }
        />
      ) : (
        <div>
          {groups.map(({ group, items }) => (
            <ListGroup key={group} title={group} count={items.length}>
              {items.map((graph) => (
                <EntityRow
                  key={graph.id}
                  title={humanizeIfCode(graph.name)}
                  titleSuffix={
                    looksLikeIdentifier(graph.name) ? (
                      <code className="font-mono text-[11px] font-normal text-gray-500">{graph.name}</code>
                    ) : undefined
                  }
                  ariaLabel={humanizeIfCode(graph.name)}
                  menuLabel={humanizeIfCode(graph.name)}
                  href={workspacePath(wsSlug, `/feature-graphs/${graph.id}`)}
                  description={graphSentence(graph)}
                  trailing={<RelativeTime date={graph.created_at} />}
                  meta={[
                    selectedProject === 'all' && projectNameById[graph.project_id] ? (
                      <Fact key="project" icon={FolderKanban} title="Project" truncateAt="max-w-[12rem]">
                        {projectNameById[graph.project_id]}
                      </Fact>
                    ) : null,
                    graph.entry_function ? (
                      <Fact key="entry" icon={Play} title={`Entry function: ${graph.entry_function}`} truncateAt="max-w-[20rem]">
                        {humanize(graph.entry_function)}{' '}
                        <code className="font-mono text-[11px] text-gray-500">{graph.entry_function}</code>
                      </Fact>
                    ) : null,
                    graph.build_depth != null ? (
                      <Fact key="depth" icon={Layers} title="Build depth">
                        {`depth ${graph.build_depth}`}
                      </Fact>
                    ) : null,
                    graph.entity_count != null ? (
                      <Fact key="entities" icon={Boxes}>
                        {pluralize(graph.entity_count, 'entity', 'entities')}
                      </Fact>
                    ) : null,
                  ]}
                  actions={[
                    {
                      label: 'Delete',
                      icon: Trash2,
                      variant: 'danger',
                      onClick: () => handleDelete(graph),
                      confirm: {
                        title: 'Delete feature graph?',
                        description: `Permanently delete “${graph.name}”? The code itself is not touched. This cannot be undone.`,
                        confirmLabel: 'Delete',
                      },
                    },
                  ]}
                />
              ))}
            </ListGroup>
          ))}
          <p className="mt-2 text-center text-xs text-gray-500 tabular-nums" role="status">
            Showing {visible.length.toLocaleString()} of {filtered.length.toLocaleString()}
          </p>
          <LoadMoreSentinel sentinelRef={noopRef} loadingMore={false} hasMore={hasMore} remaining={remaining} onLoadMore={showMore} />
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
