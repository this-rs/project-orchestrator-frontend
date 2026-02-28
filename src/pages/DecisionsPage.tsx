import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Trash2, CheckCircle2 } from 'lucide-react'
import { decisionsApi, workspacesApi } from '@/services'
import {
  Card,
  CardContent,
  EmptyState,
  Select,
  SearchInput,
  InteractiveDecisionStatusBadge,
  ConfirmDialog,
  PageShell,
  Spinner,
} from '@/components/ui'
import { useConfirmDialog, useToast, useWorkspaceSlug } from '@/hooks'
import { fadeInUp, staggerContainer, useReducedMotion } from '@/utils/motion'
import type { Decision, DecisionStatus } from '@/types'
import { workspacePath } from '@/utils/paths'

// ── Filter options ──────────────────────────────────────────────────────

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'proposed', label: 'Proposed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'deprecated', label: 'Deprecated' },
  { value: 'superseded', label: 'Superseded' },
]

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

export function DecisionsPage() {
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const confirmDialog = useConfirmDialog()
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()
  const reducedMotion = useReducedMotion()
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

  // Debounced search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchDecisions(value), 300)
  }

  // Client-side status filter
  const filtered = statusFilter === 'all' ? decisions : decisions.filter((d) => d.status === statusFilter)

  const handleDelete = (decision: Decision) => {
    confirmDialog.open({
      title: 'Delete Decision',
      description: `Permanently delete this decision? This cannot be undone.`,
      onConfirm: async () => {
        await decisionsApi.delete(decision.id)
        setDecisions((prev) => prev.filter((d) => d.id !== decision.id))
        toast.success('Decision deleted')
      },
    })
  }

  const handleStatusChange = async (decision: Decision, newStatus: DecisionStatus) => {
    try {
      await decisionsApi.update(decision.id, { status: newStatus })
      setDecisions((prev) => prev.map((d) => (d.id === decision.id ? { ...d, status: newStatus } : d)))
      toast.success(`Status changed to ${newStatus}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  return (
    <PageShell
      title="Architectural Decisions"
      description="Track architectural decisions, their rationale, and impact across the codebase"
      actions={
        <>
          <SearchInput
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search decisions..."
            className="w-full sm:w-56"
          />
          {projects.length > 1 && (
            <Select
              options={[
                { value: 'all', label: 'All projects' },
                ...projects.map((p) => ({ value: p.slug, label: p.name })),
              ]}
              value={selectedProject}
              onChange={(v) => setSelectedProject(v)}
              className="w-full sm:w-48"
            />
          )}
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as DecisionStatus | 'all')}
            className="w-full sm:w-40"
          />
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={decisions.length === 0 && !searchQuery ? 'No decisions yet' : 'No matching decisions'}
          description={
            decisions.length === 0 && !searchQuery
              ? 'Architectural decisions are recorded during task execution. Add decisions from task detail pages.'
              : 'Try adjusting your search query or filters.'
          }
        />
      ) : (
        <motion.div
          className="space-y-3"
          variants={reducedMotion ? undefined : staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((decision) => (
              <motion.div key={decision.id} variants={fadeInUp} exit="exit" layout={!reducedMotion}>
                <DecisionCard
                  decision={decision}
                  wsSlug={wsSlug}
                  onStatusChange={(status) => handleStatusChange(decision, status)}
                  onDelete={() => handleDelete(decision)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

// ── Decision Card ───────────────────────────────────────────────────────

interface DecisionCardProps {
  decision: Decision
  wsSlug: string
  onStatusChange: (status: DecisionStatus) => Promise<void>
  onDelete: () => void
}

function DecisionCard({ decision, wsSlug, onStatusChange, onDelete }: DecisionCardProps) {
  return (
    <Card className="group">
      <Link to={workspacePath(wsSlug, `/decisions/${decision.id}`)} className="block">
        <CardContent className="py-3">
          <div className="flex items-start justify-between gap-3">
            {/* Left: content */}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-200 line-clamp-2 mb-2">{decision.description}</p>

              <div className="flex flex-wrap items-center gap-2">
                {decision.chosen_option && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    {decision.chosen_option}
                  </span>
                )}
                {decision.alternatives.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {decision.alternatives.length} alternative{decision.alternatives.length > 1 ? 's' : ''}
                  </span>
                )}
                <span className="text-xs text-gray-600">{relativeTime(decision.decided_at)}</span>
              </div>
            </div>

            {/* Right: status + delete */}
            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.preventDefault()}>
              <InteractiveDecisionStatusBadge status={decision.status} onStatusChange={onStatusChange} />
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelete()
                }}
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                title="Delete decision"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}
