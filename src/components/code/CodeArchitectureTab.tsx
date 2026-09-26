import { useState, useEffect, useCallback } from 'react'
import { EmptyState, EntityList, EntityListSkeleton, EntityRow, ErrorState, Section, Skeleton, pluralize } from '@/components/ui'
import { codeApi } from '@/services'
import type { ArchitectureOverview } from '@/services'
import { StatTiles } from './metrics'

interface CodeArchitectureTabProps {
  projectSlug: string | null
  workspaceSlug: string
  onOpenFile: (path: string) => void
}

const basename = (path: string) => path.split('/').pop() || path

export function CodeArchitectureTab({ projectSlug, workspaceSlug, onOpenFile }: CodeArchitectureTabProps) {
  const [architecture, setArchitecture] = useState<ArchitectureOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadArchitecture = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const project_slug = projectSlug ?? undefined
      const workspace_slug = projectSlug ? undefined : workspaceSlug
      setArchitecture(await codeApi.getArchitecture({ project_slug, workspace_slug }))
    } catch {
      setError('Could not load the architecture overview.')
    } finally {
      setLoading(false)
    }
  }, [projectSlug, workspaceSlug])

  useEffect(() => {
    loadArchitecture()
  }, [loadArchitecture])

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <EntityListSkeleton rows={4} />
      </div>
    )
  }
  if (error) return <ErrorState title="Architecture unavailable" description={error} onRetry={loadArchitecture} />
  if (!architecture) return <EmptyState title="No architecture data" description="Sync the project first to analyse its code." />

  const keyFiles = architecture.key_files ?? []
  const languages = architecture.languages ?? []
  const modules = architecture.modules ?? []

  return (
    <div className="space-y-6">
      <StatTiles
        items={[
          { label: 'Files', value: architecture.total_files.toLocaleString() },
          { label: 'Languages', value: languages.length },
          { label: 'Key files', value: keyFiles.length },
          { label: 'Modules', value: modules.length },
        ]}
      />

      <Section title="Key files" count={keyFiles.length} description="The most depended-on files — changing them ripples furthest.">
        {keyFiles.length === 0 ? (
          <EmptyState size="sm" title="No key files yet." />
        ) : (
          <EntityList aria-label="Key files">
            {keyFiles.map((file) => (
              <EntityRow
                key={file.path}
                title={<span className="font-mono">{basename(file.path)}</span>}
                ariaLabel={`History of ${file.path}`}
                onClick={() => onOpenFile(file.path)}
                description={<span className="font-mono break-all">{file.path}</span>}
                meta={[pluralize(file.dependents, 'dependent'), pluralize(file.imports, 'import')]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      <Section title="Languages" count={languages.length}>
        {languages.length === 0 ? (
          <EmptyState size="sm" title="No languages detected." />
        ) : (
          <EntityList aria-label="Languages">
            {languages.map((lang) => (
              <EntityRow
                key={lang.language}
                title={<span className="capitalize">{lang.language}</span>}
                ariaLabel={lang.language}
                trailing={pluralize(lang.file_count, 'file')}
                meta={[pluralize(lang.function_count, 'function'), pluralize(lang.struct_count, 'struct')]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {modules.length > 0 && (
        <Section title="Modules" count={modules.length} collapsible defaultOpen={modules.length <= 8}>
          <EntityList aria-label="Modules">
            {modules.map((m) => (
              <EntityRow
                key={m.path}
                title={<span className="font-mono break-all">{m.path}</span>}
                ariaLabel={m.path}
                trailing={pluralize(m.files, 'file')}
                meta={[m.public_api?.length ? `${pluralize(m.public_api.length, 'public symbol')}` : null]}
              />
            ))}
          </EntityList>
        </Section>
      )}
    </div>
  )
}
