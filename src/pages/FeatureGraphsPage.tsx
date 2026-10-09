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
} from '@/components/ui'
import { useFormDialog, useIncrementalList, useToast, useWorkspaceSlug } from '@/hooks'
import { CreateFeatureGraphForm, AutoBuildFeatureGraphForm } from '@/components/forms'
import type { FeatureGraph } from '@/types'
import { workspacePath } from '@/utils/paths'
import { useT, type MessageKey } from '@/i18n'
import { useRecencyLabel } from '@/components/code/useCodeCount'
import { humanize, humanizeIfCode, looksLikeIdentifier } from '@/utils/featureGraphReadable'

type SortKey = 'recent' | 'name' | 'entities'

/** Rows rendered at once: the API returns every graph in one response (no server pagination). */
const PAGE_SIZE = 50
const noopRef = () => {}

/** One plain sentence when the graph has no description of its own. */
function graphSentence(g: FeatureGraph, t: ReturnType<typeof useT>['t']): string | undefined {
  if (g.description) return g.description
  if (!g.entry_function) return undefined
  const name = humanize(g.entry_function)
  if (g.build_depth == null) return t('featureGraphs.list.startsFrom', { name })
  return t(g.build_depth === 1 ? 'featureGraphs.list.startsFromDepthOne' : 'featureGraphs.list.startsFromDepthOther', {
    name,
    n: g.build_depth,
  })
}

// ── Main page ───────────────────────────────────────────────────────────

export function FeatureGraphsPage() {
  const { t } = useT()
  const recencyLabel = useRecencyLabel()
  const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'recent', label: t('featureGraphs.list.sort.recent') },
    { value: 'name', label: t('featureGraphs.list.sort.name') },
    { value: 'entities', label: t('featureGraphs.list.sort.entities') },
  ]
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
      toast.success(t('featureGraphs.list.created'))
      navigate(workspacePath(wsSlug, `/feature-graphs/${graph.id}`), { state: { projectId: data.project_id } })
    },
  })

  const autoBuildForm = AutoBuildFeatureGraphForm({
    projects,
    onSubmit: async (data) => {
      const graph = await featureGraphsApi.autoBuild(data)
      toast.success(t('featureGraphs.list.autoBuilt', { n: graph.entities?.length || 0 }))
      navigate(workspacePath(wsSlug, `/feature-graphs/${graph.id}`), { state: { projectId: data.project_id } })
    },
  })

  const openCreate = () => createDialog.open({ title: t('featureGraphs.list.newTitle') })
  const openAutoBuild = () => autoBuildDialog.open({ title: t('featureGraphs.list.autoBuildTitle'), size: 'lg', submitLabel: t('featureGraphs.list.build') })

  const handleDelete = async (graph: FeatureGraph) => {
    try {
      await featureGraphsApi.delete(graph.id)
      setGraphs((prev) => prev.filter((g) => g.id !== graph.id))
      toast.success(t('featureGraphs.list.deleted'))
    } catch {
      toast.error(t('featureGraphs.list.deleteFailed'))
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
        {t('featureGraphs.list.autoBuild')}
      </Button>
      <Button size="sm" onClick={openCreate}>
        <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
        {t('featureGraphs.list.newGraph')}
      </Button>
    </>
  )

  return (
    <PageShell
      title={t('nav.concepts.featureGraphs')}
      description={t('featureGraphs.description')}
      intro="featureGraphs"
      count={loading ? undefined : filtered.length}
      width="wide"
      actions={createActions}
      filters={
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('featureGraphs.list.searchPlaceholder')}
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
                  options={[{ value: 'all', label: t('featureGraphs.list.allProjects') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
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
        <ErrorState description={t('featureGraphs.list.loadFailed')} onRetry={fetchGraphs} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<GitGraph className="w-6 h-6" />}
          title={isPristine ? t('featureGraphs.list.emptyTitle') : t('featureGraphs.list.noMatchTitle')}
          description={isPristine ? t('featureGraphs.list.emptyDescription') : t('featureGraphs.list.noMatchDescription')}
          action={
            isPristine ? (
              createActions
            ) : (
              <Button size="sm" variant="secondary" onClick={clearAll}>
                {t('featureGraphs.list.clear')}
              </Button>
            )
          }
        />
      ) : (
        <div>
          {groups.map(({ group, items }) => (
            <ListGroup key={group} title={group === 'All' ? t('featureGraphs.list.all') : recencyLabel(group)} count={items.length}>
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
                  description={graphSentence(graph, t)}
                  trailing={<RelativeTime date={graph.created_at} />}
                  meta={[
                    selectedProject === 'all' && projectNameById[graph.project_id] ? (
                      <Fact key="project" icon={FolderKanban} title={t('featureGraphs.list.project')} truncateAt="max-w-[12rem]">
                        {projectNameById[graph.project_id]}
                      </Fact>
                    ) : null,
                    graph.entry_function ? (
                      <Fact key="entry" icon={Play} title={t('featureGraphs.list.entryFunction', { name: graph.entry_function })} truncateAt="max-w-[20rem]">
                        {humanize(graph.entry_function)}{' '}
                        <code className="font-mono text-[11px] text-gray-500">{graph.entry_function}</code>
                      </Fact>
                    ) : null,
                    graph.build_depth != null ? (
                      <Fact key="depth" icon={Layers} title={t('featureGraphs.list.buildDepth')}>
                        {t('featureGraphs.list.depth', { n: graph.build_depth })}
                      </Fact>
                    ) : null,
                    graph.entity_count != null ? (
                      <Fact key="entities" icon={Boxes}>
                        {t(`featureGraphs.counts.entity.${graph.entity_count === 1 ? 'one' : 'other'}` as MessageKey, { n: graph.entity_count })}
                      </Fact>
                    ) : null,
                  ]}
                  actions={[
                    {
                      label: t('featureGraphs.list.delete'),
                      icon: Trash2,
                      variant: 'danger',
                      onClick: () => handleDelete(graph),
                      confirm: {
                        title: t('featureGraphs.list.deleteTitle'),
                        description: t('featureGraphs.list.deleteDescription', { name: graph.name }),
                        confirmLabel: t('featureGraphs.list.delete'),
                      },
                    },
                  ]}
                />
              ))}
            </ListGroup>
          ))}
          <p className="mt-2 text-center text-xs text-gray-500 tabular-nums" role="status">
            {t('featureGraphs.list.showing', { shown: visible.length, total: filtered.length })}
          </p>
          <LoadMoreSentinel sentinelRef={noopRef} loadingMore={false} hasMore={hasMore} remaining={remaining} onLoadMore={showMore} />
        </div>
      )}

      <FormDialog {...createDialog.dialogProps} onSubmit={createForm.submit}>
        {createForm.fields}
      </FormDialog>
      <FormDialog {...autoBuildDialog.dialogProps} onSubmit={autoBuildForm.submit} submitLabel={t('featureGraphs.list.build')}>
        {autoBuildForm.fields}
      </FormDialog>
    </PageShell>
  )
}
