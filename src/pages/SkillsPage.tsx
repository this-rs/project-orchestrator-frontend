import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Brain, Trash2, Upload, Sparkles, FileText, Globe, Folder, Plus } from 'lucide-react'
import { skillRefreshAtom } from '@/atoms/events'
import { skillsApi, adminApi, notesApi, workspacesApi } from '@/services'
import {
  SkillBrowser,
  ImportWizard,
  ConceptNote,
  energyLevel,
  cohesionLevel,
  tagSummary,
  fetchAllPages,
  dedupeById,
} from '@/components/registry'
import {
  Button,
  EmptyState,
  EntityListSkeleton,
  EntityRow,
  FilterBar,
  FormDialog,
  ListGroup,
  LoadMoreSentinel,
  PageShell,
  RelativeTime,
  Select,
  StatusMenu,
  TONE_CLASSES,
  TabLayout,
  getStatusMeta,
  getStatusOptions,
  groupBy,
  pluralize,
} from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { useFormDialog, useToast, useInfiniteList, useWorkspaceSlug } from '@/hooks'
import { CreateSkillForm, ImportSkillForm } from '@/components/forms'
import type { Skill, SkillStatus, PaginatedResponse, PublishedSkillSummary } from '@/types'
import { workspacePath } from '@/utils/paths'

// ── Options ─────────────────────────────────────────────────────────────

const statusOptions = [{ value: 'all', label: 'All statuses' }, ...getStatusOptions('skill')]

/** Lifecycle order used to group the list. */
const STATUS_ORDER: SkillStatus[] = ['active', 'emerging', 'imported', 'dormant', 'archived']

const MIN_NOTES_FOR_DETECTION = 15

type Project = { id: string; name: string; slug: string }

// ── Main page ───────────────────────────────────────────────────────────

export function SkillsPage() {
  const [statusFilter, setStatusFilter] = useState<SkillStatus | 'all'>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const skillRefresh = useAtomValue(skillRefreshAtom)
  const navigate = useNavigate()
  const formDialog = useFormDialog()
  const importDialog = useFormDialog()
  const toast = useToast()
  const wsSlug = useWorkspaceSlug()

  const [activeTab, setActiveTab] = useState<string>('skills')
  const [detecting, setDetecting] = useState(false)
  const [noteCount, setNoteCount] = useState<number | null>(null)
  const [importTarget, setImportTarget] = useState<PublishedSkillSummary | null>(null)

  // Projects of the workspace (filter + create / import destinations)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  useEffect(() => {
    if (!wsSlug) return
    setProjectsLoaded(false)
    workspacesApi
      .listProjects(wsSlug)
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoaded(true))
  }, [wsSlug])

  const activeProjectId = projectFilter !== 'all' ? projectFilter : undefined
  const projectNameById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects])

  // Note count of the active project (or first project) — detection readiness
  useEffect(() => {
    const pid = activeProjectId ?? projects[0]?.id
    if (!pid) return
    setNoteCount(null)
    notesApi
      .list({ project_id: pid, limit: 1 })
      .then((res) => setNoteCount(res.total))
      .catch(() => {})
  }, [activeProjectId, projects])

  const filters = useMemo(
    () => ({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      project_id: activeProjectId,
      _refresh: skillRefresh,
    }),
    [statusFilter, activeProjectId, skillRefresh],
  )

  const fetcher = useCallback(
    async (params: { limit: number; offset: number; status?: string; project_id?: string }): Promise<PaginatedResponse<Skill>> => {
      const status = params.status as SkillStatus | undefined
      if (params.project_id) {
        return skillsApi.list({ limit: params.limit, offset: params.offset, status, project_id: params.project_id })
      }
      // Workspace view: merge every project, each loaded in full (single page for the hook)
      if (params.offset > 0 || projects.length === 0) {
        return { items: [], total: 0, limit: params.limit, offset: params.offset }
      }
      const perProject = await Promise.all(
        projects.map((p) =>
          fetchAllPages<Skill>((limit, offset) => skillsApi.list({ limit, offset, status, project_id: p.id })).catch(
            () => [] as Skill[],
          ),
        ),
      )
      const unique = dedupeById(perProject.flat())
      return { items: unique, total: unique.length, limit: params.limit, offset: params.offset }
    },
    [projects],
  )

  const {
    items: skills,
    loading: listLoading,
    loadingMore,
    hasMore,
    total,
    sentinelRef,
    reset,
    removeItems,
    updateItem,
  } = useInfiniteList({ fetcher, filters, enabled: projects.length > 0 })

  const noProjects = projectsLoaded && projects.length === 0
  const loading = !projectsLoaded || (projects.length > 0 && listLoading)

  // Client-side search on name / description / tags
  const q = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      q
        ? skills.filter(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              (s.description ?? '').toLowerCase().includes(q) ||
              s.tags.some((t) => t.toLowerCase().includes(q)),
          )
        : skills,
    [skills, q],
  )
  const groups = useMemo(() => groupBy(visible, (s) => s.status, STATUS_ORDER), [visible])

  // ── Forms ─────────────────────────────────────────────────────────────

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

  const openCreate = () => formDialog.open({ title: 'Create skill', size: 'md' })
  const openImport = () => importDialog.open({ title: 'Import skill package', size: 'md', submitLabel: 'Import' })

  // ── Actions ───────────────────────────────────────────────────────────

  const handleDetectSkills = async () => {
    // Workspace view: fall back to the first project (same resolution as the
    // readiness check) so "Run detection" is never a silent no-op.
    const pid = activeProjectId ?? projects[0]?.id
    if (!pid) {
      toast.error('No project available to run skill detection')
      return
    }
    setDetecting(true)
    try {
      const result = await adminApi.detectSkills(pid)
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

  const handleDelete = async (skill: Skill) => {
    try {
      await skillsApi.delete(skill.id)
      removeItems((s) => s.id === skill.id)
      toast.success('Skill deleted')
    } catch {
      toast.error('Failed to delete skill')
    }
  }

  const handleStatusChange = async (skill: Skill, newStatus: SkillStatus) => {
    try {
      const updated = await skillsApi.update(skill.id, { status: newStatus })
      updateItem((s) => s.id === skill.id, () => updated)
      toast.success(`Status changed to ${getStatusMeta('skill', newStatus).label}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  // ── Filters ───────────────────────────────────────────────────────────

  const showProjectFilter = projects.length > 1
  const activeFilterCount = (activeProjectId ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const activeLabels = [
    activeProjectId ? projectNameById[activeProjectId] ?? '' : '',
    statusFilter !== 'all' ? getStatusMeta('skill', statusFilter).label : '',
  ]
  const clearFilters = () => {
    setProjectFilter('all')
    setStatusFilter('all')
  }

  const tabItems: TabItem[] = [
    { id: 'skills', label: 'My skills', icon: <Brain className="w-4 h-4" aria-hidden="true" /> },
    { id: 'registry', label: 'Shared catalog', icon: <Globe className="w-4 h-4" aria-hidden="true" /> },
  ]

  const isPristine = total === 0 && statusFilter === 'all' && !q

  return (
    <PageShell
      title="Skills"
      description="Emergent knowledge clusters, detected from your notes and decisions."
      count={activeTab === 'skills' && !loading && !noProjects ? visible.length : undefined}
      width="wide"
      actions={
        activeTab === 'skills' && !noProjects ? (
          <>
            <Button variant="secondary" size="sm" onClick={openImport}>
              <Upload className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Import
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              New skill
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <ConceptNote summary="A skill is a domain of expertise: a group of notes and decisions about the same topic. When an agent works on that topic, the skill injects that knowledge automatically.">
          <p>
            <span className="text-gray-300">Detection.</span> The system spots groups of notes strongly linked to each
            other (at least {MIN_NOTES_FOR_DETECTION} notes in the project). You can also create one by hand, import an
            exported file, or pick one up from the shared catalog.
          </p>
          <p>
            <span className="text-gray-300">Triggers.</span> Each skill carries patterns (regex, files, meaning, MCP
            tool): when an agent's request matches one, the skill activates.
          </p>
          <p>
            <span className="text-gray-300">Lifecycle.</span> <Lifecycle status="emerging" /> just appeared ·{' '}
            <Lifecycle status="active" /> in use · <Lifecycle status="imported" /> came from another project, on
            probation · <Lifecycle status="dormant" /> not called on for a long time · <Lifecycle status="archived" />{' '}
            retired.
          </p>
          <p>
            <span className="text-gray-300">Energy</span> = recent activity, <span className="text-gray-300">cohesion</span>{' '}
            = how tightly its notes are linked to each other.
          </p>
        </ConceptNote>

        <TabLayout tabs={tabItems} activeTab={activeTab} onTabChange={setActiveTab} className="pt-3 space-y-3">
          {activeTab === 'registry' ? (
            <SkillBrowser onImport={setImportTarget} />
          ) : noProjects ? (
            <EmptyState
              icon={<Folder className="w-8 h-8" />}
              title="No projects in this workspace"
              description="Skills belong to a project. Add a project to this workspace to detect or create skills."
            />
          ) : (
            <>
              <FilterBar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search skills…"
                activeCount={activeFilterCount}
                activeLabels={activeLabels}
                onClear={clearFilters}
                filters={
                  <>
                    {showProjectFilter && (
                      <Select
                        options={[{ value: 'all', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                        value={projectFilter}
                        onChange={setProjectFilter}
                        icon={<Folder className="w-3 h-3" />}
                      />
                    )}
                    <Select
                      options={statusOptions}
                      value={statusFilter}
                      onChange={(v) => setStatusFilter(v as SkillStatus | 'all')}
                    />
                  </>
                }
              />

              {loading ? (
                <EntityListSkeleton rows={6} />
              ) : visible.length === 0 ? (
                isPristine ? (
                  <SkillsEmptyState
                    noteCount={noteCount}
                    detecting={detecting}
                    onDetect={handleDetectSkills}
                    onCreate={openCreate}
                  />
                ) : (
                  <EmptyState
                    title="No matching skills"
                    description="Try another search or clear the filters."
                    action={
                      activeFilterCount > 0 ? (
                        <Button variant="secondary" size="sm" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                )
              ) : (
                <div>
                  {groups.map(({ key, items }) => (
                    <ListGroup
                      key={key}
                      title={getStatusMeta('skill', key).label}
                      count={items.length}
                      collapsible={key === 'archived'}
                      defaultOpen={key !== 'archived'}
                    >
                      {items.map((skill) => (
                        <SkillRow
                          key={skill.id}
                          skill={skill}
                          wsSlug={wsSlug}
                          projectName={!activeProjectId && showProjectFilter ? projectNameById[skill.project_id] : undefined}
                          onStatusChange={(status) => handleStatusChange(skill, status)}
                          onDelete={() => handleDelete(skill)}
                        />
                      ))}
                    </ListGroup>
                  ))}
                  <LoadMoreSentinel sentinelRef={sentinelRef} loadingMore={loadingMore} hasMore={hasMore} />
                </div>
              )}
            </>
          )}
        </TabLayout>
      </div>

      <FormDialog {...formDialog.dialogProps} onSubmit={skillForm.submit}>
        {skillForm.fields}
      </FormDialog>
      <FormDialog {...importDialog.dialogProps} onSubmit={importForm.submit} submitLabel="Import">
        {importForm.fields}
      </FormDialog>
      <ImportWizard
        skill={importTarget}
        projects={projects}
        defaultProjectId={activeProjectId}
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

/** Status word in its tone colour (lifecycle legend). */
function Lifecycle({ status }: { status: SkillStatus }) {
  const meta = getStatusMeta('skill', status)
  return <span className={TONE_CLASSES[meta.tone].text}>{meta.label}</span>
}

// ── Empty state (nothing detected yet) ──────────────────────────────────

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
    <div className="flex flex-col items-center py-10 px-4 text-center border border-dashed border-white/[0.08] rounded-xl">
      <Brain className="w-8 h-8 mb-3 text-gray-600" aria-hidden="true" />
      <h3 className="text-sm font-medium text-gray-200">No skills detected yet</h3>
      <p className="mt-1 text-xs text-gray-500 max-w-sm">
        Skills appear when the project has enough linked notes. Add notes (gotchas, patterns, guidelines) so the system
        can identify expertise domains — or create one by hand.
      </p>

      {noteCount !== null && (
        <div className="w-full max-w-64 mt-4">
          <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
            <span className="flex items-center gap-1.5 text-gray-400 tabular-nums">
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              {noteCount} / {MIN_NOTES_FOR_DETECTION} notes
            </span>
            {ready ? (
              <span className="text-emerald-400">Ready for detection</span>
            ) : (
              <span className="text-gray-500">{MIN_NOTES_FOR_DETECTION - noteCount} more needed</span>
            )}
          </div>
          <div
            className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden"
            role="progressbar"
            aria-label="Notes available for detection"
            aria-valuemin={0}
            aria-valuemax={MIN_NOTES_FOR_DETECTION}
            aria-valuenow={noteCount}
          >
            <div
              className={`h-full rounded-full ${ready ? 'bg-emerald-500' : 'bg-indigo-500/70'}`}
              style={{ width: `${Math.max(progress * 100, 2)}%` }}
            />
          </div>
          {!ready && (
            <p className="mt-2 text-[11px] leading-4 text-gray-500">
              At least {MIN_NOTES_FOR_DETECTION} notes are needed to find coherent clusters.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
        {ready && (
          <Button size="sm" onClick={onDetect} loading={detecting}>
            {!detecting && <Sparkles className="w-4 h-4 mr-1.5" aria-hidden="true" />}
            {detecting ? 'Detecting…' : 'Run detection'}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onCreate}>
          <Brain className="w-4 h-4 mr-1.5" aria-hidden="true" />
          Create manually
        </Button>
      </div>
    </div>
  )
}

// ── Skill row ───────────────────────────────────────────────────────────

interface SkillRowProps {
  skill: Skill
  wsSlug: string
  projectName?: string
  onStatusChange: (status: SkillStatus) => Promise<void>
  onDelete: () => Promise<void>
}

function SkillRow({ skill, wsSlug, projectName, onStatusChange, onDelete }: SkillRowProps) {
  const members = skill.note_count + skill.decision_count
  const energy = energyLevel(skill.energy)
  const cohesion = cohesionLevel(skill.cohesion)
  return (
    <EntityRow
      title={skill.name}
      href={workspacePath(wsSlug, `/skills/${skill.id}`)}
      description={skill.description || undefined}
      muted={skill.status === 'archived'}
      trailing={<RelativeTime date={skill.created_at} />}
      meta={[
        <StatusMenu key="status" kind="skill" status={skill.status} onChange={onStatusChange} />,
        pluralize(members, 'member'),
        <span key="energy" title={`Energy ${Math.round(skill.energy * 100)}% — recent activity`}>
          <span className={TONE_CLASSES[energy.tone].text}>{energy.label}</span> energy
        </span>,
        <span key="cohesion" title={`Cohesion ${Math.round(skill.cohesion * 100)}%`}>
          <span className={TONE_CLASSES[cohesion.tone].text}>{cohesion.label}</span> cohesion
        </span>,
        skill.activation_count > 0 ? pluralize(skill.activation_count, 'activation') : null,
        projectName,
        tagSummary(skill.tags),
      ]}
      actions={[
        {
          label: 'Delete',
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: {
            title: 'Delete skill?',
            description: `Permanently delete “${skill.name}”? Its notes and decisions are kept, only the skill is removed. This cannot be undone.`,
          },
        },
      ]}
    />
  )
}
