import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Brain, Trash2, Upload, Sparkles, FileText, Globe, Folder, FolderKanban, Network, Plus, Tag, Zap } from 'lucide-react'
import { Explainer } from '@/components/protocols/Explainer'
import { skillRefreshAtom } from '@/atoms/events'
import { skillsApi, adminApi, notesApi, workspacesApi } from '@/services'
import {
  SkillBrowser,
  ImportWizard,
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
  Fact,
  FilterBar,
  FormDialog,
  Gauge,
  ListGroup,
  LoadMoreSentinel,
  Meter,
  PageShell,
  RelativeTime,
  Select,
  StatusMenu,
  TONE_CLASSES,
  ToneText,
  ViewTabs,
  getStatusMeta,
  getStatusOptions,
  groupBy,
} from '@/components/ui'
import type { ViewTab } from '@/components/ui'
import { useFormDialog, useToast, useInfiniteList, useWorkspaceSlug } from '@/hooks'
import { CreateSkillForm, ImportSkillForm } from '@/components/forms'
import type { Skill, SkillStatus, PaginatedResponse, PublishedSkillSummary } from '@/types'
import { workspacePath } from '@/utils/paths'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { useT } from '@/i18n'

type Translate = ReturnType<typeof useT>['t']
type Noun = 'member' | 'activation' | 'note'
/** `1 member` / `2 members`, from the `nouns` keys. */
const count = (t: Translate, n: number, noun: Noun) => t(`siteSkills.nouns.${noun}.${n === 1 ? 'one' : 'other'}`, { count: n })

// ── Options ─────────────────────────────────────────────────────────────

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
  const { t } = useT()
  const statusOptions = [{ value: 'all', label: t('siteSkills.common.allStatuses') }, ...getStatusOptions('skill')]

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
    total,
    sentinelProps,
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
      toast.success(t('siteSkills.skills.created'))
      reset()
    },
  })

  const importForm = ImportSkillForm({
    projects,
    onSubmit: async (data) => {
      const result = await skillsApi.importSkill(data)
      toast.success(t('siteSkills.skills.imported', { notes: result.notes_created, decisions: result.decisions_imported }))
      navigate(workspacePath(wsSlug, `/skills/${result.skill_id}`))
    },
  })

  const openCreate = () => formDialog.open({ title: t('siteSkills.skills.createTitle'), size: 'md' })
  const openImport = () =>
    importDialog.open({ title: t('siteSkills.skills.importTitle'), size: 'md', submitLabel: t('siteSkills.common.import') })

  // ── Actions ───────────────────────────────────────────────────────────

  const handleDetectSkills = async () => {
    // Workspace view: fall back to the first project (same resolution as the
    // readiness check) so "Run detection" is never a silent no-op.
    const pid = activeProjectId ?? projects[0]?.id
    if (!pid) {
      toast.error(t('siteSkills.skills.noProjectForDetection'))
      return
    }
    setDetecting(true)
    try {
      const result = await adminApi.detectSkills(pid)
      if (result.status === 'InsufficientData') {
        toast.error(result.message || t('siteSkills.skills.detectFallback'))
      } else {
        toast.success(t('siteSkills.skills.detected', { created: result.skills_created, updated: result.skills_updated }))
        reset()
      }
    } catch {
      toast.error(t('siteSkills.skills.detectFailed'))
    } finally {
      setDetecting(false)
    }
  }

  const handleDelete = async (skill: Skill) => {
    try {
      await skillsApi.delete(skill.id)
      removeItems((s) => s.id === skill.id)
      toast.success(t('siteSkills.skills.deleted'))
    } catch {
      toast.error(t('siteSkills.skills.deleteFailed'))
    }
  }

  const handleStatusChange = async (skill: Skill, newStatus: SkillStatus) => {
    try {
      const updated = await skillsApi.update(skill.id, { status: newStatus })
      updateItem((s) => s.id === skill.id, () => updated)
      toast.success(t('siteSkills.common.statusChanged', { status: getStatusMeta('skill', newStatus).label }))
    } catch {
      toast.error(t('siteSkills.common.statusFailed'))
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

  const tabItems: ViewTab[] = [
    { id: 'skills', label: t('siteSkills.skills.tabs.mine'), icon: <Brain aria-hidden="true" /> },
    { id: 'registry', label: t('siteSkills.skills.tabs.catalog'), icon: <Globe aria-hidden="true" /> },
  ]

  const isPristine = total === 0 && statusFilter === 'all' && !q

  return (
    <PageShell
      title={NOMENCLATURE.skills.plural}
      description={t('siteSkills.skills.description')}
      intro="skills"
      count={activeTab === 'skills' && !loading && !noProjects ? visible.length : undefined}
      width="wide"
      actions={
        activeTab === 'skills' && !noProjects ? (
          <>
            <Button variant="secondary" size="sm" onClick={openImport}>
              <Upload className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t('siteSkills.common.import')}
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t('siteSkills.skills.newSkill')}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <Explainer>
          {t('siteSkills.skills.explainer.detection', { min: MIN_NOTES_FOR_DETECTION })}{' '}
          <Lifecycle status="emerging" /> {t('siteSkills.skills.explainer.emerging')} · <Lifecycle status="active" />{' '}
          {t('siteSkills.skills.explainer.active')} · <Lifecycle status="imported" />{' '}
          {t('siteSkills.skills.explainer.imported')} · <Lifecycle status="dormant" />{' '}
          {t('siteSkills.skills.explainer.dormant')} · <Lifecycle status="archived" />{' '}
          {t('siteSkills.skills.explainer.archived')}
          {t('siteSkills.skills.explainer.energy')}
        </Explainer>

        <ViewTabs label={t('siteSkills.skills.tabs.label')} tabs={tabItems} value={activeTab} onChange={setActiveTab} />
        <div className="space-y-3">
          {activeTab === 'registry' ? (
            <SkillBrowser onImport={setImportTarget} />
          ) : noProjects ? (
            <EmptyState
              icon={<Folder className="w-8 h-8" />}
              title={t('siteSkills.common.noProjects')}
              description={t('siteSkills.skills.noProjectsHint')}
            />
          ) : (
            <>
              <FilterBar
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder={t('siteSkills.skills.searchPlaceholder')}
                activeCount={activeFilterCount}
                activeLabels={activeLabels}
                onClear={clearFilters}
                filters={
                  <>
                    {showProjectFilter && (
                      <Select
                        options={[{ value: 'all', label: t('siteSkills.common.allProjects') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
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
                    title={t('siteSkills.skills.noMatching')}
                    description={t('siteSkills.skills.noMatchingHint')}
                    action={
                      <Button variant="secondary" size="sm" onClick={() => { clearFilters(); setSearch('') }}>
                        {t('siteSkills.common.clear')}
                      </Button>
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
                  <LoadMoreSentinel {...sentinelProps} />
                </div>
              )}
            </>
          )}
        </div>
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
          toast.success(t('siteSkills.skills.imported', { notes: result.notes_created, decisions: result.decisions_imported }))
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
  const { t } = useT()
  const ready = noteCount !== null && noteCount >= MIN_NOTES_FOR_DETECTION
  const progress = noteCount !== null ? Math.min(noteCount / MIN_NOTES_FOR_DETECTION, 1) : 0

  return (
    <div className="flex flex-col items-center py-10 px-4 text-center border border-dashed border-white/[0.08] rounded-xl">
      <Brain className="w-8 h-8 mb-3 text-gray-600" aria-hidden="true" />
      <h3 className="text-sm font-medium text-gray-200">{t('siteSkills.skills.empty.title')}</h3>
      <p className="mt-1 text-xs text-gray-500 max-w-sm">{t('siteSkills.skills.empty.hint')}</p>

      {noteCount !== null && (
        <div className="w-full max-w-64 mt-4">
          <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
            <span className="flex items-center gap-1.5 text-gray-400 tabular-nums">
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              {t('siteSkills.skills.empty.progress', { count: noteCount, min: MIN_NOTES_FOR_DETECTION })}
            </span>
            {ready ? (
              <ToneText tone="success" label={t('siteSkills.skills.empty.ready')} />
            ) : (
              <span className="text-gray-500">
                {t('siteSkills.skills.empty.moreNeeded', { count: MIN_NOTES_FOR_DETECTION - noteCount })}
              </span>
            )}
          </div>
          <Meter size="bar" value={progress} tone={ready ? 'success' : 'progress'} />
          {!ready && (
            <p className="mt-2 text-[11px] leading-4 text-gray-500">
              {t('siteSkills.skills.empty.needNotes', { min: MIN_NOTES_FOR_DETECTION })}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
        {ready && (
          <Button size="sm" onClick={onDetect} loading={detecting}>
            {!detecting && <Sparkles className="w-4 h-4 mr-1.5" aria-hidden="true" />}
            {detecting ? t('siteSkills.skills.empty.detecting') : t('siteSkills.skills.empty.run')}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onCreate}>
          <Brain className="w-4 h-4 mr-1.5" aria-hidden="true" />
          {t('siteSkills.skills.empty.create')}
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
  const { t } = useT()
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
      tone={getStatusMeta('skill', skill.status).tone}
      status={[<StatusMenu key="status" kind="skill" icon status={skill.status} onChange={onStatusChange} />]}
      meta={[
        projectName ? (
          <Fact key="project" icon={FolderKanban} title={t('siteSkills.common.project')} truncateAt="max-w-[12rem]">
            {projectName}
          </Fact>
        ) : null,
        <Fact key="members" icon={Network}>
          {count(t, members, 'member')}
        </Fact>,
        <Gauge
          key="energy"
          label={t('siteSkills.common.energy')}
          value={skill.energy}
          level={energy.label}
          tone={energy.tone}
          title={t('siteSkills.skills.energyTitle', { value: Math.round(skill.energy * 100) })}
        />,
        <Gauge
          key="cohesion"
          label={t('siteSkills.common.cohesion')}
          value={skill.cohesion}
          level={cohesion.label}
          tone={cohesion.tone}
          title={t('siteSkills.skills.cohesionTitle', { value: Math.round(skill.cohesion * 100) })}
        />,
        skill.activation_count > 0 ? (
          <Fact key="act" icon={Zap}>
            {count(t, skill.activation_count, 'activation')}
          </Fact>
        ) : null,
        skill.tags?.length ? (
          <Fact key="tags" icon={Tag}>
            {tagSummary(skill.tags ?? [])}
          </Fact>
        ) : null,
      ]}
      actions={[
        {
          label: t('siteSkills.common.delete'),
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: {
            title: t('siteSkills.skills.deleteTitle'),
            description: t('siteSkills.skills.deleteDescription', { name: skill.name }),
          },
        },
      ]}
    />
  )
}
