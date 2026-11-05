import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderKanban,
  ExternalLink,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Folder,
  Presentation,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  Fact,
  FilterBar,
  PageShell,
  RelativeTime,
  Select,
  ToneText,
} from '@/components/ui'
import { fetchAllPages } from '@/services/paginate'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { useT, activeTranslator } from '@/i18n'
import { documentsApi } from '@/services/documents'
import { workspacesApi } from '@/services/workspaces'
import type { DocumentSummary, Project } from '@/types'
import { NOMENCLATURE } from '@/constants/nomenclature'
import { readableFormats, uploadFailureText, uploadOutcomeNote } from './documents/uploadOutcome'

type Kind = 'spreadsheet' | 'presentation' | 'text' | 'other'

/** Server format ("xlsx", "pptx", "markdown"…) → what the person calls it. */
export function documentKind(format: string): { kind: Kind; label: string; icon: LucideIcon } {
  const f = (format || '').toLowerCase()
  if (['xlsx', 'xls', 'csv', 'ods', 'spreadsheet'].includes(f)) return { kind: 'spreadsheet', label: activeTranslator().t('siteOps.documents.kindSpreadsheet'), icon: FileSpreadsheet }
  if (['pptx', 'ppt', 'odp', 'presentation'].includes(f)) return { kind: 'presentation', label: activeTranslator().t('siteOps.documents.kindPresentation'), icon: Presentation }
  if (['docx', 'doc', 'odt', 'pdf', 'markdown', 'md', 'txt', 'text', 'html', 'rtf'].includes(f)) {
    return { kind: 'text', label: f === 'pdf' ? 'PDF' : activeTranslator().t('siteOps.documents.kindDocument'), icon: FileText }
  }
  return { kind: 'other', label: f && f !== 'binary' ? f.toUpperCase() : activeTranslator().t('siteOps.documents.kindFile'), icon: FileIcon }
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Documents — spreadsheets, decks, PDFs and text attached to the work,
 * filterable by project. Uploading reads the text so assistants can use it.
 */
export function DocumentsPage() {
  const { t } = useT()
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Files sent so far out of the files chosen — `null` when nothing is uploading. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const proj = await workspacesApi.listProjects(wsSlug).catch(() => [] as Project[])
      // The API never lists documents without a scope, so "All projects" is the
      // union of each project's documents, newest first.
      const scopes = projectId ? [projectId] : proj.map((p) => p.id)
      const lists = await Promise.all(
        scopes.map((id) => fetchAllPages((page) => documentsApi.list({ project_id: id, ...page }))),
      )
      const byId = new Map<string, DocumentSummary>()
      for (const l of lists) for (const d of l.items ?? []) byId.set(d.id, d)
      const merged = [...byId.values()].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      setDocs(merged)
      setProjects(proj)
    } catch {
      setError(t('siteOps.documents.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [projectId, wsSlug])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // A document must belong to a project to be listed again: upload into the
  // selected project, or the only one there is.
  const uploadProjectId = projectId || (projects.length === 1 ? projects[0].id : '')
  const canUpload = uploadProjectId !== ''
  const uploading = progress !== null

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      const list = Array.from(files)
      setProgress({ done: 0, total: list.length })
      let ok = 0
      for (const file of list) {
        try {
          const doc = await documentsApi.upload(file, { projectId: uploadProjectId })
          ok++
          const note = uploadOutcomeNote(doc)
          if (note) toast.warning(note)
        } catch (err) {
          toast.error(uploadFailureText(err, file.name))
        }
        setProgress({ done: ok, total: list.length })
      }
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
      if (ok > 0) {
        toast.success(ok === 1 ? t('siteOps.documents.added') : t('siteOps.documents.addedMany', { count: ok }))
        await load()
      }
    },
    [load, uploadProjectId, toast],
  )

  const remove = useCallback(
    async (doc: DocumentSummary) => {
      try {
        await documentsApi.remove(doc.id)
        toast.success(t('siteOps.documents.deleted'))
        await load()
      } catch {
        toast.error(t('siteOps.documents.deleteFailed'))
      }
    },
    [load, toast],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? docs.filter((d) => d.filename.toLowerCase().includes(q) || documentKind(d.format).label.toLowerCase().includes(q)) : docs
  }, [docs, search])

  const showProjectFilter = projects.length > 1
  const activeCount = projectId ? 1 : 0
  const pristine = docs.length === 0 && !projectId && !search
  const uploadLabel = progress ? (progress.total > 1 ? t('siteOps.documents.uploadingOf', { current: Math.min(progress.done + 1, progress.total), total: progress.total }) : t('siteOps.documents.uploading')) : t('siteOps.documents.upload')
  const openPicker = () => inputRef.current?.click()

  return (
    <PageShell
      title={NOMENCLATURE.documents.plural}
      description={NOMENCLATURE.documents.description}
      intro="documents"
      width="wide"
      count={loading ? undefined : filtered.length}
      filters={
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('siteOps.documents.searchPlaceholder')}
          searchLabel={t('siteOps.documents.searchLabel')}
          activeCount={activeCount}
          activeLabels={[projectId ? projectName.get(projectId) ?? '' : '']}
          onClear={() => setProjectId('')}
          filters={
            showProjectFilter ? (
              <Select
                options={[{ value: '', label: t('siteOps.documents.allProjects') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                value={projectId}
                onChange={setProjectId}
                icon={<Folder className="w-3 h-3" />}
              />
            ) : undefined
          }
        />
      }
      actions={
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            aria-label={t('siteOps.documents.chooseFiles')}
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button
            size="sm"
            loading={uploading}
            disabled={!canUpload}
            title={canUpload ? undefined : t('siteOps.documents.chooseProjectFirst')}
            onClick={openPicker}
          >
            {!uploading && <Upload className="w-4 h-4 mr-1.5" aria-hidden="true" />}
            {uploadLabel}
          </Button>
        </>
      }
    >
      {loading ? (
        <EntityListSkeleton rows={5} />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : filtered.length === 0 ? (
        pristine ? (
          <EmptyState
            size="page"
            title={t('siteOps.documents.emptyTitle')}
            description={
              canUpload
                ? t('siteOps.documents.emptyUpload', { formats: readableFormats() })
                : t('siteOps.documents.emptyChoose')
            }
            action={
              <Button size="sm" disabled={!canUpload} onClick={openPicker}>
                {t('siteOps.documents.upload')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('siteOps.documents.noMatchTitle')}
            description={t('siteOps.documents.noMatchDescription')}
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setProjectId('')
                }}
              >
                {t('siteOps.documents.clear')}
              </Button>
            }
          />
        )
      ) : (
        <EntityList aria-label={t('siteOps.documents.listLabel')}>
          {filtered.map((doc) => {
            const k = documentKind(doc.format)
            const Icon = k.icon
            const pages = doc.page_count > 0 ? (doc.page_count === 1 ? t('siteOps.documents.pageOne') : t('siteOps.documents.pageOther', { count: doc.page_count })) : null
            const unreadable = doc.extracted === false
            return (
              <EntityRow
                key={doc.id}
                title={doc.filename}
                leading={<Icon className="w-4 h-4 text-indigo-400" aria-hidden="true" />}
                trailing={doc.created_at ? <RelativeTime date={doc.created_at} /> : undefined}
                status={unreadable ? [<ToneText key="u" tone="muted" icon label={t('siteOps.documents.notReadable')} />] : undefined}
                meta={[
                  <Fact key="kind" icon={Icon} title={t('siteOps.documents.typeLabel')}>
                    {k.label}
                  </Fact>,
                  pages,
                  formatBytes(doc.size_bytes),
                  doc.project_id && projectName.get(doc.project_id) ? (
                    <Fact key="project" icon={FolderKanban} title={t('siteOps.documents.projectLabel')} truncateAt="max-w-[12rem]">
                      {projectName.get(doc.project_id)}
                    </Fact>
                  ) : null,
                ]}
                actions={[
                  {
                    label: t('siteOps.documents.openOriginal'),
                    icon: ExternalLink,
                    onClick: () => {
                      window.open(documentsApi.rawUrl(doc.id), '_blank', 'noopener')
                    },
                  },
                  {
                    label: t('siteOps.documents.delete'),
                    icon: Trash2,
                    variant: 'danger',
                    onClick: () => remove(doc),
                    confirm: { title: t('siteOps.documents.deleteTitle'), description: t('siteOps.documents.deleteDescription', { name: doc.filename }) },
                  },
                ]}
              />
            )
          })}
        </EntityList>
      )}
    </PageShell>
  )
}
