import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSetAtom } from 'jotai'
import { CheckSquare, Folder, Hash, Pencil, Trash2 } from 'lucide-react'
import { projectRefreshAtom } from '@/atoms'
import { projectsApi } from '@/services'
import { workspacesApi } from '@/services/workspaces'
import { useT } from '@/i18n'
import type { EditProjectFormData } from '@/components/forms/EditProjectForm'
import {
  BulkActionBar,
  Button,
  ConfirmDialog,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  Fact,
  ErrorState,
  FilterBar,
  FormDialog,
  PageShell,
  RelativeTime,
  RowCheckbox,
  TaskProgress,
  ToneText,
} from '@/components/ui'
import { iconButton } from '@/components/ui/classes'
import { useConfirmDialog, useFormDialog, useToast, useMultiSelect, useWorkspaceSlug, useWorkspace, useTaskProgress } from '@/hooks'
import type { TaskCounts } from '@/services/progress'
import { CreateProjectForm, EditProjectForm } from '@/components/forms'
import { workspacePath } from '@/utils/paths'
import type { Project } from '@/types'
import { PROJECT_PROFILE_TEXT, hasCodebase, profileIcon, profileLabel, profileOf } from '@/constants/projectProfile'

function matches(p: Project, q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [p.name, p.slug, p.description, p.root_path].some((v) => v?.toLowerCase().includes(needle))
}

export function ProjectsPage() {
  const { t } = useT()
  const confirmDialog = useConfirmDialog()
  const formDialog = useFormDialog()
  const editDialog = useFormDialog()
  const toast = useToast()
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const wsSlug = useWorkspaceSlug()
  const activeWorkspace = useWorkspace()
  const bumpProjectRefresh = useSetAtom(projectRefreshAtom)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const loadProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await workspacesApi.listProjects(wsSlug)
      setProjects(data)
    } catch {
      setError(t('projects.list.loadFailed'))
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [wsSlug, t])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const removeItems = (predicate: (p: Project) => boolean) => {
    setProjects((prev) => prev.filter((p) => !predicate(p)))
  }

  const form = CreateProjectForm({
    workspaceName: activeWorkspace?.name,
    onSubmit: async (data) => {
      const created = await projectsApi.create(data)
      await workspacesApi.addProject(wsSlug, created.id)
      // Bump global project refresh so other components (ChatPanel ProjectSelect,
      // overview, etc.) re-fetch the workspace project list immediately.
      // Without this, they rely on the WebSocket CRUD event which has a 500ms
      // debounce and may race with the addProject call.
      bumpProjectRefresh((c) => c + 1)
      toast.success(t('projects.list.created'))
      loadProjects()
    },
  })

  const editForm = EditProjectForm({
    initialValues: {
      name: editingProject?.name ?? '',
      slug: editingProject?.slug,
      description: editingProject?.description,
      root_path: editingProject?.root_path,
      profile: editingProject?.profile,
    },
    onSubmit: async (data: EditProjectFormData) => {
      if (!editingProject) return
      await projectsApi.update(editingProject.slug, data)
      setProjects((prev) =>
        prev.map((p) => (p.id === editingProject.id ? { ...p, ...data, root_path: data.root_path || undefined } : p)),
      )
      toast.success(t('projects.list.updated'))
    },
  })

  const handleEdit = (project: Project) => {
    setEditingProject(project)
    editDialog.open({ title: t('projects.list.editTitle') })
  }

  const handleDelete = async (project: Project) => {
    await projectsApi.delete(project.slug)
    removeItems((p) => p.id === project.id)
    bumpProjectRefresh((c) => c + 1)
    toast.success(t('projects.list.deleted'))
  }

  const openCreateDialog = () => formDialog.open({ title: t('projects.list.createTitle') })

  const visible = useMemo(() => projects.filter((p) => matches(p, search)), [projects, search])
  const multiSelect = useMultiSelect(visible, (p) => p.slug)
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects])
  const progress = useTaskProgress('project', projectIds)

  const handleBulkDelete = () => {
    const count = multiSelect.selectionCount
    confirmDialog.open({
      title: t(count === 1 ? 'projects.list.bulkDeleteTitle.one' : 'projects.list.bulkDeleteTitle.other', { n: count }),
      description: t(count === 1 ? 'projects.list.bulkDeleteDescription.one' : 'projects.list.bulkDeleteDescription.other', { n: count }),
      onConfirm: async () => {
        const items = multiSelect.selectedItems
        confirmDialog.setProgress({ current: 0, total: items.length })
        for (let i = 0; i < items.length; i++) {
          await projectsApi.delete(items[i].slug)
          confirmDialog.setProgress({ current: i + 1, total: items.length })
        }
        const slugs = new Set(items.map((p) => p.slug))
        removeItems((p) => slugs.has(p.slug))
        multiSelect.clear()
        bumpProjectRefresh((c) => c + 1)
        toast.success(t(count === 1 ? 'projects.list.bulkDeleted.one' : 'projects.list.bulkDeleted.other', { n: count }))
      },
    })
  }

  const selectAllLabel = multiSelect.isAllSelected ? t('projects.list.deselectAll') : t('projects.list.selectAll')

  return (
    <PageShell
      title={t('nav.concepts.projects')}
      description={t('projects.list.description')}
      intro="projects"
      count={loading || error ? undefined : projects.length}
      width="wide"
      actions={
        <Button size="sm" onClick={openCreateDialog}>
          {t('projects.list.newProject')}
        </Button>
      }
      filters={
        projects.length > 0 ? (
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={t('projects.list.searchPlaceholder')}
            trailing={
              visible.length > 0 ? (
                <button
                  type="button"
                  onClick={multiSelect.toggleAll}
                  aria-label={selectAllLabel}
                  aria-pressed={multiSelect.isAllSelected}
                  title={selectAllLabel}
                  className={`${iconButton('ghost', 'size-9 md:size-8')} ${multiSelect.isAllSelected ? 'text-indigo-300 bg-white/[0.08]' : 'text-gray-500'}`}
                >
                  <CheckSquare className="w-4 h-4" aria-hidden="true" />
                </button>
              ) : undefined
            }
          />
        ) : undefined
      }
    >
      {loading ? (
        <EntityListSkeleton rows={6} />
      ) : error ? (
        <ErrorState title={t('projects.common.failedTitle')} description={error} onRetry={loadProjects} />
      ) : projects.length === 0 ? (
        <EmptyState
          size="page"
          variant="projects"
          title={t('projects.list.emptyTitle')}
          description={t('projects.list.emptyDescription')}
          action={
            <Button size="sm" onClick={openCreateDialog}>
              {t('projects.list.newProject')}
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          variant="search"
          title={t('projects.list.noMatchTitle')}
          description={t('projects.list.noMatchDescription')}
          action={
            <Button size="sm" variant="secondary" onClick={() => setSearch('')}>
              {t('projects.list.clearSearch')}
            </Button>
          }
        />
      ) : (
        <EntityList aria-label={t('nav.concepts.projects')}>
          {visible.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              counts={progress[project.id]}
              wsSlug={wsSlug}
              selected={multiSelect.isSelected(project.slug)}
              onToggleSelect={(shiftKey) => multiSelect.toggle(project.slug, shiftKey)}
              onEdit={() => handleEdit(project)}
              onDelete={() => handleDelete(project)}
            />
          ))}
        </EntityList>
      )}

      <BulkActionBar count={multiSelect.selectionCount} onDelete={handleBulkDelete} onClear={multiSelect.clear} />
      <FormDialog {...formDialog.dialogProps} onSubmit={form.submit}>
        {form.fields}
      </FormDialog>
      <FormDialog {...editDialog.dialogProps} onSubmit={editForm.submit}>
        {editForm.fields}
      </FormDialog>
      <ConfirmDialog {...confirmDialog.dialogProps} />
    </PageShell>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────

function ProjectRow({
  project,
  counts,
  wsSlug,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  project: Project
  counts?: TaskCounts
  wsSlug: string
  selected: boolean
  onToggleSelect: (shiftKey: boolean) => void
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const { t } = useT()
  const profile = profileOf(project)
  // Only a codebase is synced: a project without code is never "behind".
  const neverSynced = hasCodebase(project) && !project.last_synced
  return (
    <EntityRow
      title={project.name}
      href={workspacePath(wsSlug, `/projects/${project.slug}`)}
      selected={selected}
      leading={<RowCheckbox checked={selected} onToggle={onToggleSelect} label={t('projects.list.selectRow', { name: project.name })} />}
      description={project.description || undefined}
      context={<TaskProgress counts={counts} />}
      trailing={project.last_synced ? <RelativeTime date={project.last_synced} prefix={`${t('projects.common.synced')} `} /> : undefined}
      tone={neverSynced ? 'warning' : undefined}
      status={neverSynced ? [<ToneText key="never" tone="warning" icon label={t('projects.common.neverSynced')} />] : undefined}
      meta={[
        <Fact key="type" icon={profileIcon(profile)} title={PROJECT_PROFILE_TEXT.type}>
          {profileLabel(profile)}
        </Fact>,
        <Fact key="slug" icon={Hash} mono>
          {project.slug}
        </Fact>,
        project.root_path ? (
          <Fact key="path" icon={Folder} mono title={project.root_path} truncateAt="max-w-[16rem]">
            {project.root_path}
          </Fact>
        ) : null,
      ]}
      actions={[
        { label: t('projects.common.edit'), icon: Pencil, onClick: onEdit },
        {
          label: t('projects.common.delete'),
          icon: Trash2,
          variant: 'danger',
          onClick: onDelete,
          confirm: { title: t('projects.list.deleteTitle'), description: t('projects.list.deleteDescription', { name: project.name }) },
        },
      ]}
    />
  )
}
