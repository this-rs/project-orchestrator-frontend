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
  pluralize,
  Button,
} from '@/components/ui'
import { useToast, useWorkspaceSlug } from '@/hooks'
import type { Decision, DecisionStatus } from '@/types'
import { workspacePath } from '@/utils/paths'
import { decisionPreview, decisionTitle } from '@/components/knowledge/noteMeta'
import { NOMENCLATURE } from '@/constants/nomenclature'

// ── Filter options ──────────────────────────────────────────────────────

const statusOptions = [{ value: 'all', label: 'All statuses' }, ...getStatusOptions('decision')]

// ── Main page ───────────────────────────────────────────────────────────

export function DecisionsPage() {
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
        toast.error('Failed to load decisions')
        setDecisions([])
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable (Jotai setter)
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
    toast.success('Decision deleted')
  }

  const handleStatusChange = async (decision: Decision, newStatus: DecisionStatus) => {
    try {
      await decisionsApi.update(decision.id, { status: newStatus })
      setDecisions((prev) => prev.map((d) => (d.id === decision.id ? { ...d, status: newStatus } : d)))
      toast.success(`Status changed to ${getStatusMeta('decision', newStatus).label}`)
    } catch {
      toast.error('Failed to update status')
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
          searchPlaceholder="Search decisions…"
          activeCount={activeFilterCount}
          activeLabels={activeLabels}
          onClear={clearFilters}
          filters={
            <>
              {showProjectFilter && (
                <Select
                  options={[
                    { value: 'all', label: 'All projects' },
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
            title="No decisions yet"
            description="A decision is a choice that was made, with its reason and the alternatives set aside. Assistants record them while they work; you can also add one from a task's page."
            action={
              <Button size="sm" onClick={() => navigate(workspacePath(wsSlug, '/tasks'))}>
                Open tasks
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="No matching decisions"
            description="Try adjusting your search query or filters."
            action={
              <Button size="sm" variant="secondary" onClick={() => { clearFilters(); setSearchQuery('') }}>
                Clear
              </Button>
            }
          />
        )
      ) : (
        <div>
          {groups.map(({ group, items }) => (
            <ListGroup key={group} title={group} count={items.length}>
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
  const alternatives = decision.alternatives.length
  return (
    <EntityRow
      title={decisionTitle(decision.description)}
      href={workspacePath(wsSlug, `/decisions/${decision.id}`)}
      muted={decision.status === 'superseded'}
      trailing={<RelativeTime date={decision.decided_at} />}
      description={decisionPreview(decision.description) || undefined}
      tone={getStatusMeta('decision', decision.status).tone}
      status={[<StatusMenu key="status" kind="decision" icon status={decision.status} onChange={onStatusChange} />]}
      meta={[
        decision.chosen_option ? (
          <Fact key="chosen" icon={CheckCircle2} title={`Chosen: ${decision.chosen_option}`} truncateAt="max-w-[16rem]">
            {decision.chosen_option}
          </Fact>
        ) : null,
        alternatives > 0 ? pluralize(alternatives, 'alternative') : null,
      ]}
      actions={[
        {
          label: 'Delete',
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: {
            title: 'Delete decision?',
            description: 'Permanently delete this decision? This cannot be undone.',
          },
        },
      ]}
    />
  )
}
