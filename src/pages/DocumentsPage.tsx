import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ExternalLink,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
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
  PageShell,
  RelativeTime,
} from '@/components/ui'
import { fetchAllPages } from '@/services/paginate'
import { useToast, useWorkspaceSlug } from '@/hooks'
import { documentsApi } from '@/services/documents'
import { workspacesApi } from '@/services/workspaces'
import type { DocumentSummary, Project } from '@/types'
import { NOMENCLATURE } from '@/constants/nomenclature'

type Kind = 'spreadsheet' | 'presentation' | 'text' | 'other'

/** Server format ("xlsx", "pptx", "markdown"…) → what the person calls it. */
export function documentKind(format: string): { kind: Kind; label: string; icon: LucideIcon } {
  const f = (format || '').toLowerCase()
  if (['xlsx', 'xls', 'csv', 'ods', 'spreadsheet'].includes(f)) return { kind: 'spreadsheet', label: 'Spreadsheet', icon: FileSpreadsheet }
  if (['pptx', 'ppt', 'odp', 'presentation'].includes(f)) return { kind: 'presentation', label: 'Presentation', icon: Presentation }
  if (['docx', 'doc', 'odt', 'pdf', 'markdown', 'md', 'txt', 'text', 'html', 'rtf'].includes(f)) {
    return { kind: 'text', label: f === 'pdf' ? 'PDF' : 'Document', icon: FileText }
  }
  return { kind: 'other', label: f && f !== 'binary' ? f.toUpperCase() : 'File', icon: FileIcon }
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Documents — spreadsheets, decks, PDFs and text attached to the work,
 * filterable by project. Uploading feeds the knowledge graph (extracted, chunked, embedded).
 */
export function DocumentsPage() {
  const wsSlug = useWorkspaceSlug()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [list, proj] = await Promise.all([
        fetchAllPages((page) => documentsApi.list({ project_id: projectId || undefined, ...page })),
        workspacesApi.listProjects(wsSlug).catch(() => [] as Project[]),
      ])
      setDocs(list.items ?? [])
      setProjects(proj)
    } catch {
      setError('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [projectId, wsSlug])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setUploading(true)
      let ok = 0
      for (const file of Array.from(files)) {
        try {
          await documentsApi.upload(file, { projectId: projectId || undefined })
          ok++
        } catch {
          toast.error(`Could not upload ${file.name}`)
        }
      }
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
      if (ok > 0) {
        toast.success(ok === 1 ? 'Document added' : `${ok} documents added`)
        await load()
      }
    },
    [load, projectId, toast],
  )

  const remove = useCallback(
    async (doc: DocumentSummary) => {
      try {
        await documentsApi.remove(doc.id)
        toast.success('Document deleted')
        await load()
      } catch {
        toast.error('Failed to delete document')
      }
    },
    [load, toast],
  )

  return (
    <PageShell
      title={NOMENCLATURE.documents.plural}
      description={NOMENCLATURE.documents.description}
      width="wide"
      count={loading ? undefined : docs.length}
      actions={
        <>
          <select
            aria-label="Filter by project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-8 rounded-md border border-gray-700 bg-gray-900 px-2 text-sm text-gray-200"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            aria-label="Choose files to upload"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4" aria-hidden="true" />
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </>
      }
    >
      {loading ? (
        <EntityListSkeleton rows={5} />
      ) : error ? (
        <ErrorState description={error} onRetry={load} />
      ) : docs.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload a spreadsheet, a deck, a PDF or a note. The agent can read it and use it in your plans."
          action={
            <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
              Upload
            </Button>
          }
        />
      ) : (
        <EntityList aria-label="Documents">
          {docs.map((doc) => {
            const k = documentKind(doc.format)
            const Icon = k.icon
            const pages = doc.page_count > 0 ? `${doc.page_count} ${doc.page_count === 1 ? 'page' : 'pages'}` : null
            return (
              <EntityRow
                key={doc.id}
                title={doc.filename}
                leading={<Icon className="w-4 h-4 text-indigo-400" aria-hidden="true" />}
                trailing={doc.created_at ? <RelativeTime date={doc.created_at} /> : undefined}
                meta={[
                  k.label,
                  pages,
                  formatBytes(doc.size_bytes),
                  doc.project_id ? projectName.get(doc.project_id) ?? null : null,
                ]}
                actions={[
                  {
                    label: 'Open original',
                    icon: ExternalLink,
                    onClick: () => {
                      window.open(documentsApi.rawUrl(doc.id), '_blank', 'noopener')
                    },
                  },
                  {
                    label: 'Delete',
                    icon: Trash2,
                    variant: 'danger',
                    onClick: () => remove(doc),
                    confirm: { title: 'Delete document?', description: `“${doc.filename}” will be permanently deleted.` },
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
