import { useState, useEffect, useCallback } from 'react'
import { EmptyState, EntityList, EntityListSkeleton, EntityRow, ErrorState, Section, Skeleton, StatTiles } from '@/components/ui'
import { useT } from '@/i18n'
import { useCodeCount } from './useCodeCount'
import { codeApi } from '@/services'
import type { ArchitectureOverview } from '@/services'

interface CodeArchitectureTabProps {
  projectSlug: string | null
  workspaceSlug: string
  onOpenFile: (path: string) => void
}

const basename = (path: string) => path.split('/').pop() || path

export function CodeArchitectureTab({ projectSlug, workspaceSlug, onOpenFile }: CodeArchitectureTabProps) {
  const { t } = useT()
  const count = useCodeCount()
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
      setError(t('code.architectureTab.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [projectSlug, workspaceSlug, t])

  useEffect(() => {
    loadArchitecture()
  }, [loadArchitecture])

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label={t('code.common.loading')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <EntityListSkeleton rows={4} />
      </div>
    )
  }
  if (error) return <ErrorState title={t('code.architectureTab.unavailable')} description={error} onRetry={loadArchitecture} />
  if (!architecture) return <EmptyState title={t('code.architectureTab.noData')} description={t('code.architectureTab.noDataDescription')} />

  const keyFiles = architecture.key_files ?? []
  const languages = architecture.languages ?? []
  const modules = architecture.modules ?? []

  return (
    <div className="space-y-6">
      <StatTiles
        items={[
          { label: t('code.architectureTab.files'), value: architecture.total_files.toLocaleString() },
          { label: t('code.architectureTab.languages'), value: languages.length },
          { label: t('code.architectureTab.keyFiles'), value: keyFiles.length },
          { label: t('code.architectureTab.modules'), value: modules.length },
        ]}
      />

      <Section title={t('code.architectureTab.keyFiles')} count={keyFiles.length} description={t('code.architectureTab.keyFilesDescription')}>
        {keyFiles.length === 0 ? (
          <EmptyState size="sm" title={t('code.architectureTab.noKeyFiles')} />
        ) : (
          <EntityList aria-label={t('code.architectureTab.keyFiles')}>
            {keyFiles.map((file) => (
              <EntityRow
                key={file.path}
                title={<span className="font-mono">{basename(file.path)}</span>}
                ariaLabel={t('code.common.historyOf', { path: file.path })}
                onClick={() => onOpenFile(file.path)}
                description={<span className="font-mono break-all">{file.path}</span>}
                meta={[count('dependent', file.dependents), count('import', file.imports)]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      <Section title={t('code.architectureTab.languages')} count={languages.length}>
        {languages.length === 0 ? (
          <EmptyState size="sm" title={t('code.architectureTab.noLanguages')} />
        ) : (
          <EntityList aria-label={t('code.architectureTab.languages')}>
            {languages.map((lang) => (
              <EntityRow
                key={lang.language}
                title={<span className="capitalize">{lang.language}</span>}
                ariaLabel={lang.language}
                trailing={count('file', lang.file_count)}
                meta={[count('function', lang.function_count), count('struct', lang.struct_count)]}
              />
            ))}
          </EntityList>
        )}
      </Section>

      {modules.length > 0 && (
        <Section title={t('code.architectureTab.modules')} count={modules.length} collapsible defaultOpen={modules.length <= 8}>
          <EntityList aria-label={t('code.architectureTab.modules')}>
            {modules.map((m) => (
              <EntityRow
                key={m.path}
                title={<span className="font-mono break-all">{m.path}</span>}
                ariaLabel={m.path}
                trailing={count('file', m.files)}
                meta={[m.public_api?.length ? count('publicSymbol', m.public_api.length) : null]}
              />
            ))}
          </EntityList>
        </Section>
      )}
    </div>
  )
}
