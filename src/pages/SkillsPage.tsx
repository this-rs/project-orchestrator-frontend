import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { motion, AnimatePresence } from 'motion/react'
import { Brain, Trash2, Zap, Upload, Sparkles, FileText, Globe, Info } from 'lucide-react'
import { skillRefreshAtom } from '@/atoms/events'
import { skillsApi, adminApi, notesApi } from '@/services'
import { SkillBrowser, ImportWizard } from '@/components/registry'
import {
  Card,
  CardContent,
  Badge,
  Button,
  Select,
  InteractiveSkillStatusBadge,
  ConfirmDialog,
  FormDialog,
  PageShell,
  Spinner,
  SkeletonCard,
  LoadMoreSentinel,
  MetricTooltip,
  TabLayout,
} from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { useConfirmDialog, useFormDialog, useToast, useInfiniteList, useWorkspaceSlug } from '@/hooks'
import { CreateSkillForm, ImportSkillForm } from '@/components/forms'
import { fadeInUp, staggerContainer, useReducedMotion } from '@/utils/motion'
import type { Skill, SkillStatus, PaginatedResponse, PublishedSkillSummary } from '@/types'
import { workspacePath } from '@/utils/paths'

// ── Filter options ──────────────────────────────────────────────────────

const statusOptions = [
  { value: 'all', label: 'All Status' },
  { value: 'emerging', label: 'Emerging' },
  { value: 'active', label: 'Active' },
  { value: 'dormant', label: 'Dormant' },
  { value: 'archived', label: 'Archived' },
  { value: 'imported', label: 'Imported' },
]

// ── Human-readable labels for Energy / Cohesion ─────────────────────────

function energyLabel(energy: number): { text: string; color: string } {
  if (energy >= 0.7) return { text: 'Haute', color: 'text-emerald-400' }
  if (energy >= 0.3) return { text: 'Moyenne', color: 'text-amber-400' }
  return { text: 'Basse', color: 'text-red-400' }
}

function cohesionLabel(cohesion: number): { text: string; color: string } {
  if (cohesion >= 0.5) return { text: 'Forte', color: 'text-indigo-400' }
  return { text: 'Faible', color: 'text-indigo-300/60' }
}

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

// ── Tab definitions ─────────────────────────────────────────────────────

const tabItems: TabItem[] = [
  { id: 'skills', label: 'Mes Skills', icon: <Brain className="w-4 h-4" /> },
  { id: 'registry', label: 'Catalogue partagé', icon: <Globe className="w-4 h-4" /> },
]

// ── Main page ───────────────────────────────────────────────────────────

export function SkillsPage() {
  const [statusFilter, setStatusFilter] = useState<SkillStatus | 'all'>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const skillRefresh = useAtomValue(skillRefreshAtom)
  const navigate = useNavigate()
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const importDialog = useFormDialog()
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()
  const reducedMotion = useReducedMotion()

  const [activeTab, setActiveTab] = useState<string>('skills')
  const [detecting, setDetecting] = useState(false)
  const [noteCount, setNoteCount] = useState<number | null>(null)
  const [importTarget, setImportTarget] = useState<PublishedSkillSummary | null>(null)

  // Load projects for filter dropdown
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([])
  useEffect(() => {
    if (!wsSlug) return
    import('@/services').then(({ workspacesApi }) => {
      workspacesApi
        .listProjects(wsSlug)
        .then(setProjects)
        .catch(() => {})
    })
  }, [wsSlug])

  // Resolve active project id (explicit filter or undefined for workspace-wide)
  const activeProjectId = projectFilter !== 'all' ? projectFilter : undefined

  // Fetch note count for the active project (or first project as fallback)
  useEffect(() => {
    const pid = activeProjectId ?? projects[0]?.id
    if (!pid) return
    setNoteCount(null)
    notesApi.list({ project_id: pid, limit: 1 }).then((res) => setNoteCount(res.total)).catch(() => {})
  }, [activeProjectId, projects])

  const projectOptions = useMemo(
    () => [{ value: 'all', label: 'Workspace' }, ...projects.map((p) => ({ value: p.id, label: p.name }))],
    [projects],
  )

  const filters = useMemo(
    () => ({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      project_id: activeProjectId,
      _refresh: skillRefresh,
    }),
    [statusFilter, activeProjectId, skillRefresh],
  )

  const fetcher = useCallback(
    (params: { limit: number; offset: number; status?: string; project_id?: string }): Promise<PaginatedResponse<Skill>> => {
      const typedParams = {
        limit: params.limit,
        offset: params.offset,
        status: params.status as SkillStatus | undefined,
      }
      if (params.project_id) {
        // Single project selected
        return skillsApi.list({ ...typedParams, project_id: params.project_id })
      }
      // Workspace mode: fetch from all projects in parallel and merge
      if (projects.length === 0) {
        return Promise.resolve({ items: [], total: 0, limit: params.limit, offset: params.offset })
      }
      return Promise.all(
        projects.map((p) =>
          skillsApi.list({ ...typedParams, project_id: p.id }).catch(() => ({ items: [] as Skill[], total: 0, limit: params.limit, offset: params.offset })),
        ),
      ).then((results) => {
        const merged = results.flatMap((r) => r.items)
        const seen = new Set<string>()
        const unique = merged.filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true })
        return { items: unique, total: unique.length, limit: params.limit, offset: params.offset }
      })
    },
    [projects],
  )

  const {
    items: skills,
    loading,
    loadingMore,
    hasMore,
    total,
    sentinelRef,
    reset,
    removeItems,
    updateItem,
  } = useInfiniteList({ fetcher, filters, enabled: projects.length > 0 })

  const skillForm = CreateSkillForm({
    projects,
    onSubmit: async (data) => {
      await skillsApi.create(data)
      toast.success('Skill created')
      reset()
    },
  })

  const importForm = ImportSkillForm({
    projects,
    onSubmit: async (data) => {
      const result = await skillsApi.importSkill(data)
      toast.success(`Skill imported (${result.notes_created} notes, ${result.decisions_imported} decisions)`)
      navigate(workspacePath(wsSlug, `/skills/${result.skill_id}`))
    },
  })

  const openCreate = () => formDialog.open({ title: 'Create Skill', size: 'md' })
  const openImport = () => importDialog.open({ title: 'Import Skill', size: 'md', submitLabel: 'Import' })

  const handleDetectSkills = async () => {
    if (!activeProjectId) return
    setDetecting(true)
    try {
      const result = await adminApi.detectSkills(activeProjectId)
      if (result.status === 'InsufficientData') {
        toast.error(result.message || 'Not enough data for skill detection')
      } else {
        toast.success(`Detected ${result.skills_created} new skills (${result.skills_updated} updated)`)
        reset()
      }
    } catch {
      toast.error('Failed to run skill detection')
    } finally {
      setDetecting(false)
    }
  }

  const handleDelete = (skill: Skill) => {
    confirmDialog.open({
      title: 'Delete Skill',
      description: `Permanently delete "${skill.name}"? This cannot be undone.`,
      onConfirm: async () => {
        await skillsApi.delete(skill.id)
        removeItems((s) => s.id === skill.id)
        toast.success('Skill deleted')
      },
    })
  }

  const handleStatusChange = async (skill: Skill, newStatus: SkillStatus) => {
    try {
      const updated = await skillsApi.update(skill.id, { status: newStatus })
      updateItem((s) => s.id === skill.id, () => updated)
      toast.success(`Status changed to ${newStatus}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  return (
    <PageShell
      title="Skills"
      description="Groupes de connaissances émergents, détectés automatiquement à partir de vos notes et décisions."
      actions={
        <>
          {activeTab === 'skills' && (
            <>
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as SkillStatus | 'all')}
                className="w-full sm:w-36"
              />
              <Select
                options={projectOptions}
                value={projectFilter}
                onChange={setProjectFilter}
                className="w-full sm:w-44"
              />
              <Button variant="secondary" onClick={openImport}>
                <Upload className="w-4 h-4 mr-1.5" />
                Import
              </Button>
              <Button onClick={openCreate}>
                <Brain className="w-4 h-4 mr-1.5" />
                Create Skill
              </Button>
            </>
          )}
        </>
      }
    >
      {/* Explainer banner */}
      <div className="flex items-start gap-3 rounded-lg bg-indigo-500/[0.07] border border-indigo-500/20 px-4 py-3 mb-6">
        <Info className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
        <p className="text-sm text-gray-300 leading-relaxed">
          Les <strong>skills</strong> sont des groupes de connaissances qui émergent automatiquement de vos notes.
          Plus vous ajoutez de notes liées entre elles, plus le système identifie des domaines d'expertise.
          Vous pouvez aussi en créer manuellement ou en importer depuis le catalogue partagé.
        </p>
      </div>

      <TabLayout tabs={tabItems} activeTab={activeTab} onTabChange={setActiveTab} className="pt-4">
        {activeTab === 'registry' ? (
          <SkillBrowser onImport={setImportTarget} />
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} lines={4} />
            ))}
          </div>
        ) : skills.length === 0 ? (
          total === 0 && statusFilter === 'all' ? (
            <SkillsEmptyState
              noteCount={noteCount}
              detecting={detecting}
              onDetect={handleDetectSkills}
              onCreate={openCreate}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-white/[0.06] rounded-2xl">
              <h3 className="text-lg font-medium text-gray-200 mb-1">Aucun skill correspondant</h3>
              <p className="text-sm text-gray-400 max-w-xs">Aucun skill ne correspond aux filtres actuels.</p>
            </div>
          )
        ) : (
          <>
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              variants={reducedMotion ? undefined : staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {skills.map((skill) => (
                  <motion.div key={skill.id} variants={fadeInUp} exit="exit" layout={!reducedMotion}>
                    <SkillCard
                      skill={skill}
                      wsSlug={wsSlug}
                      onStatusChange={(status) => handleStatusChange(skill, status)}
                      onDelete={() => handleDelete(skill)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
            <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
          </>
        )}
      </TabLayout>

      <FormDialog {...formDialog.dialogProps} onSubmit={skillForm.submit}>
        {skillForm.fields}
      </FormDialog>
      <FormDialog {...importDialog.dialogProps} onSubmit={importForm.submit} submitLabel="Import">
        {importForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
      <ImportWizard
        skill={importTarget}
        projectId={activeProjectId ?? ''}
        onImported={(result) => {
          toast.success(`Skill imported (${result.notes_created} notes, ${result.decisions_imported} decisions)`)
          setImportTarget(null)
          if (activeTab === 'skills') reset()
        }}
        onClose={() => setImportTarget(null)}
      />
    </PageShell>
  )
}

// ── Skills Empty State ──────────────────────────────────────────────────

const MIN_NOTES_FOR_DETECTION = 15

interface SkillsEmptyStateProps {
  noteCount: number | null
  detecting: boolean
  onDetect: () => void
  onCreate: () => void
}

function SkillsEmptyState({ noteCount, detecting, onDetect, onCreate }: SkillsEmptyStateProps) {
  const ready = noteCount !== null && noteCount >= MIN_NOTES_FOR_DETECTION
  const progress = noteCount !== null ? Math.min(noteCount / MIN_NOTES_FOR_DETECTION, 1) : 0

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-white/[0.06] rounded-2xl">
      <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center text-gray-500 mb-4">
        <Brain className="w-8 h-8" />
      </div>

      <h3 className="text-lg font-medium text-gray-200 mb-1">Aucun skill détecté</h3>
      <p className="text-sm text-gray-400 mb-6 max-w-md">
        Les skills apparaissent automatiquement quand vous avez suffisamment de notes liées entre elles.
        Ajoutez des notes (gotchas, patterns, guidelines) à votre projet pour que le système puisse identifier des domaines d'expertise.
      </p>

      {/* Note count progress */}
      {noteCount !== null && (
        <div className="w-64 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <FileText className="w-3.5 h-3.5" />
              {noteCount} / {MIN_NOTES_FOR_DETECTION} notes
            </span>
            {ready ? (
              <span className="text-xs text-emerald-400">Prêt pour la détection</span>
            ) : (
              <span className="text-xs text-gray-500">Encore {MIN_NOTES_FOR_DETECTION - noteCount} notes nécessaires</span>
            )}
          </div>
          <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${ready ? 'bg-emerald-500' : 'bg-indigo-500/70'}`}
              style={{ width: `${Math.max(progress * 100, 2)}%` }}
            />
          </div>
          {!ready && (
            <p className="text-xs text-gray-500 mt-2">
              Le minimum de {MIN_NOTES_FOR_DETECTION} notes permet d'avoir assez de connexions pour identifier des groupes cohérents.
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {ready && (
          <Button onClick={onDetect} disabled={detecting}>
            {detecting ? (
              <>
                <Spinner size="sm" className="mr-1.5" />
                Détection en cours...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1.5" />
                Lancer la détection
              </>
            )}
          </Button>
        )}
        <Button variant="secondary" onClick={onCreate}>
          <Brain className="w-4 h-4 mr-1.5" />
          Créer manuellement
        </Button>
      </div>
    </div>
  )
}

// ── Skill Card ──────────────────────────────────────────────────────────

interface SkillCardProps {
  skill: Skill
  wsSlug: string
  onStatusChange: (status: SkillStatus) => Promise<void>
  onDelete: () => void
}

function SkillCard({ skill, wsSlug, onStatusChange, onDelete }: SkillCardProps) {
  const memberCount = skill.note_count + skill.decision_count
  const energy = energyLabel(skill.energy)
  const cohesion = cohesionLabel(skill.cohesion)

  return (
    <Card className="group relative">
      <Link to={workspacePath(wsSlug, `/skills/${skill.id}`)} className="block">
        <CardContent>
          {/* Header: name + status + delete */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-gray-100 truncate">{skill.name}</h3>
              {skill.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{skill.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.preventDefault()}>
              <InteractiveSkillStatusBadge status={skill.status} onStatusChange={onStatusChange} />
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelete()
                }}
                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                title="Delete skill"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Human-readable metrics with tooltips */}
          <div className="flex items-center gap-3 mb-3">
            <MetricTooltip term="energy" showIndicator>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-gray-500">Activité :</span>
                <span className={`font-medium ${energy.color}`}>{energy.text}</span>
              </span>
            </MetricTooltip>
            <MetricTooltip term="cohesion" showIndicator>
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-gray-500">Cohérence :</span>
                <span className={`font-medium ${cohesion.color}`}>{cohesion.text}</span>
              </span>
            </MetricTooltip>
          </div>

          {/* Tags */}
          {skill.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {skill.tags.slice(0, 5).map((tag) => (
                <Badge key={tag} variant="default">{tag}</Badge>
              ))}
              {skill.tags.length > 5 && (
                <span className="text-xs text-gray-500">+{skill.tags.length - 5}</span>
              )}
            </div>
          )}

          {/* Footer: metrics */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Brain className="w-3 h-3" />
              {memberCount} membres
            </span>
            {skill.activation_count > 0 && (
              <MetricTooltip term="activation_count">
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {skill.activation_count} activations
                </span>
              </MetricTooltip>
            )}
            <span className="ml-auto">{relativeTime(skill.created_at)}</span>
          </div>
        </CardContent>
      </Link>

    </Card>
  )
}
