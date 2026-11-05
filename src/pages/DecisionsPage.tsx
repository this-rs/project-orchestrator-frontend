import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Folder, Trash2 } from 'lucide-react'
import { decisionsApi, workspacesApi } from '@/services'
import {
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  Fact,
  FilterBar,
  ListGroup,
  PageShell,
  RelativeTime,
  Select,
  StatusMenu,
  getStatusMeta,
  getStatusOptions,
  groupByRecency,
  Button,
} from '@/components/ui'
import { useToast, useWorkspaceSlug } from '@/hooks'
import type { Decision, DecisionStatus } from '@/types'
import { workspacePath } from '@/utils/paths'
import { decisionPreview, decisionTitle } from '@/components/knowledge/noteMeta'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { useT } from '@/i18n'

// ── Main page ───────────────────────────────────────────────────────────

export function DecisionsPage() {
  const { t } = useT()
  const statusOptions = [{ value: 'all', label: t('siteKnowledge.shared.allStatuses') }, ...getStatusOptions('decision')]
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const initialLoadDone = useRef(false)

  // Project filter
  const [projects, setProjects] = useState<{ slug: string; name: string }[]>([])
  const [selectedProject, setSelectedProject] = useState('all')

  useEffect(() => {
    async function loadProjects() {
      try {
        const wsProjects = await workspacesApi.listProjects(wsSlug)
        setProjects(wsProjects.map((p) => ({ slug: p.slug, name: p.name })))
      } catch {
        // No projects available
      }
    }
    loadProjects()
  }, [wsSlug])

  const projectSlug = selectedProject !== 'all' ? selectedProject : undefined

  const fetchDecisions = useCallback(
    async (query: string) => {
      if (!initialLoadDone.current) setLoading(true)
      try {
        const results = await decisionsApi.search({
          q: query || '*',
          limit: 100,
          project_slug: projectSlug,
          // When "All projects" is selected, filter by workspace to only show
          // decisions belonging to projects in the current workspace
          workspace_slug: !projectSlug ? wsSlug : undefined,
        })
        setDecisions(results)
        initialLoadDone.current = true
      } catch {
        toast.error(t('siteKnowledge.decisions.loadFailed'))
        setDecisions([])
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast and t are stable (Jotai setter, provider)
    [projectSlug, wsSlug],
  )

  // Initial load + reload on project change
  useEffect(() => {
    fetchDecisions(searchQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchQuery handled by debounce, not this effect
  }, [fetchDecisions])

  // Debounced (server-side) search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchDecisions(value), 300)
  }

  // Client-side status filter, then recency groups (by decision date)
  const filtered = useMemo(
    () => (statusFilter === 'all' ? decisions : decisions.filter((d) => d.status === statusFilter)),
    [decisions, statusFilter],
  )
  const groups = useMemo(() => groupByRecency(filtered, (d) => d.decided_at), [filtered])

  // Filter panel state
  const showProjectFilter = projects.length > 1
  const activeFilterCount = (projectSlug ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const activeLabels = [
    projectSlug ? projects.find((p) => p.slug === projectSlug)?.name ?? projectSlug : '',
    statusFilter !== 'all' ? statusOptions.find((o) => o.value === statusFilter)?.label ?? statusFilter : '',
  ]
  const clearFilters = () => {
    setSelectedProject('all')
    setStatusFilter('all')
  }

  const handleDelete = async (decision: Decision) => {
    await decisionsApi.delete(decision.id)
    setDecisions((prev) => prev.filter((d) => d.id !== decision.id))
    toast.success(t('siteKnowledge.decisions.deleted'))
  }

  const handleStatusChange = async (decision: Decision, newStatus: DecisionStatus) => {
    try {
      await decisionsApi.update(decision.id, { status: newStatus })
      setDecisions((prev) => prev.map((d) => (d.id === decision.id ? { ...d, status: newStatus } : d)))
      toast.success(t('siteKnowledge.decisions.statusChanged', { status: getStatusMeta('decision', newStatus).label }))
    } catch {
      toast.error(t('siteKnowledge.decisions.statusFailed'))
    }
  }

  const isPristine = decisions.length === 0 && !searchQuery && !projectSlug && statusFilter === 'all'

  return (
    <PageShell
      title={NOMENCLATURE.decisions.plural}
      description={NOMENCLATURE.decisions.description}
      intro="decisions"
      count={loading ? undefined : filtered.length}
      width="wide"
      filters={
        <FilterBar
          search={searchQuery}
          onSearchChange={handleSearchChange}
          searchPlaceholder={t('siteKnowledge.decisions.searchPlaceholder')}
          activeCount={activeFilterCount}
          activeLabels={activeLabels}
          onClear={clearFilters}
          filters={
            <>
              {showProjectFilter && (
                <Select
                  options={[
                    { value: 'all', label: t('siteKnowledge.shared.allProjects') },
                    ...projects.map((p) => ({ value: p.slug, label: p.name })),
                  ]}
                  value={selectedProject}
                  onChange={(v) => setSelectedProject(v)}
                  icon={<Folder className="w-3 h-3" />}
                />
              )}
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as DecisionStatus | 'all')}
              />
            </>
          }
        />
      }
    >
      {loading ? (
        <EntityListSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        isPristine ? (
          // No "New decision" here: a decision is recorded where the choice is made (a task, an
          // assistant at work), so the one action this screen can offer is to go there.
          <EmptyState
            size="page"
            title={t('siteKnowledge.decisions.emptyTitle')}
            description={t('siteKnowledge.decisions.emptyDescription')}
            action={
              <Button size="sm" onClick={() => navigate(workspacePath(wsSlug, '/tasks'))}>
                {t('siteKnowledge.decisions.openTasks')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('siteKnowledge.decisions.noMatchTitle')}
            description={t('siteKnowledge.decisions.noMatchDescription')}
            action={
              <Button size="sm" variant="secondary" onClick={() => { clearFilters(); setSearchQuery('') }}>
                {t('siteKnowledge.shared.clear')}
              </Button>
            }
          />
        )
      ) : (
        <div>
          {groups.map(({ group, label, items }) => (
            <ListGroup key={group} title={label} count={items.length}>
              {items.map((decision) => (
                <DecisionRow
                  key={decision.id}
                  decision={decision}
                  wsSlug={wsSlug}
                  onStatusChange={(status) => handleStatusChange(decision, status)}
                  onDelete={() => handleDelete(decision)}
                />
              ))}
            </ListGroup>
          ))}
        </div>
      )}
    </PageShell>
  )
}

// ── Decision row ────────────────────────────────────────────────────────

interface DecisionRowProps {
  decision: Decision
  wsSlug: string
  onStatusChange: (status: DecisionStatus) => Promise<void>
  onDelete: () => Promise<void>
}

function DecisionRow({ decision, wsSlug, onStatusChange, onDelete }: DecisionRowProps) {
  const { t } = useT()
  const alternatives = decision.alternatives.length
  return (
    <EntityRow
      title={decisionTitle(decision.description)}
      entityRef={{ kind: 'decision', id: decision.id }}
      href={workspacePath(wsSlug, `/decisions/${decision.id}`)}
      muted={decision.status === 'superseded'}
      trailing={<RelativeTime date={decision.decided_at} />}
      description={decisionPreview(decision.description) || undefined}
      tone={getStatusMeta('decision', decision.status).tone}
      status={[<StatusMenu key="status" kind="decision" icon status={decision.status} onChange={onStatusChange} />]}
      meta={[
        decision.chosen_option ? (
          <Fact key="chosen" icon={CheckCircle2} title={t('siteKnowledge.decisions.chosen', { option: decision.chosen_option })} truncateAt="max-w-[16rem]">
            {decision.chosen_option}
          </Fact>
        ) : null,
        alternatives > 0
          ? alternatives === 1
            ? t('siteKnowledge.decisions.alternatives.one', { n: 1 })
            : t('siteKnowledge.decisions.alternatives.other', { n: alternatives })
          : null,
      ]}
      actions={[
        {
          label: t('siteKnowledge.shared.delete'),
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: {
            title: t('siteKnowledge.decisions.deleteTitle'),
            description: t('siteKnowledge.decisions.deleteDescription'),
          },
        },
      ]}
    />
  )
}
