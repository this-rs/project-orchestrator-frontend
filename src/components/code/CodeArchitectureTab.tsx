import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, LoadingPage, EmptyState, ErrorState } from '@/components/ui'
import { codeApi } from '@/services'
import type { ArchitectureOverview } from '@/services'

interface CodeArchitectureTabProps {
  projectSlug: string | null
  workspaceSlug: string
}

export function CodeArchitectureTab({ projectSlug, workspaceSlug }: CodeArchitectureTabProps) {
  const [architecture, setArchitecture] = useState<ArchitectureOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadArchitecture = async () => {
    setLoading(true)
    setError(null)
    try {
      const project_slug = projectSlug ?? undefined
      const workspace_slug = projectSlug ? undefined : workspaceSlug
      const data = await codeApi.getArchitecture({ project_slug, workspace_slug })
      setArchitecture(data)
    } catch (err) {
      console.error('Failed to load architecture:', err)
      setError('Failed to load architecture overview.')
    } finally {
      setLoading(false)
    }
  }

  // Auto-load on mount or when project changes
  useEffect(() => {
    loadArchitecture()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSlug, workspaceSlug])

  if (loading) return <LoadingPage />

  if (error) return <ErrorState title="Failed to load" description={error} onRetry={loadArchitecture} />

  if (!architecture) {
    return (
      <EmptyState
        title="Architecture not loaded"
        description="Loading the codebase overview..."
      />
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        High-level overview of the codebase structure: most connected files, language breakdown, and
        dependency statistics. Useful to understand the shape of a project at a glance.
      </p>
      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <div className="p-4 bg-white/[0.06] rounded-lg text-center">
          <div className="text-2xl font-bold text-indigo-400">
            {architecture.total_files.toLocaleString()}
          </div>
          <div className="text-sm text-gray-400">Total Files</div>
        </div>
        <div className="p-4 bg-white/[0.06] rounded-lg text-center">
          <div className="text-2xl font-bold text-emerald-400">
            {architecture.languages.length}
          </div>
          <div className="text-sm text-gray-400">Languages</div>
        </div>
        <div className="p-4 bg-white/[0.06] rounded-lg text-center">
          <div className="text-2xl font-bold text-amber-400">
            {architecture.key_files.length}
          </div>
          <div className="text-sm text-gray-400">Key Files</div>
        </div>
        <div className="p-4 bg-white/[0.06] rounded-lg text-center">
          <div className="text-2xl font-bold text-purple-400">
            {architecture.modules.length}
          </div>
          <div className="text-sm text-gray-400">Modules</div>
        </div>
      </div>

      {/* Key Files */}
      <Card>
        <CardHeader>
          <CardTitle>Key Files</CardTitle>
        </CardHeader>
        <CardContent>
          {(architecture.key_files || []).length === 0 ? (
            <p className="text-gray-500 text-sm">No data available</p>
          ) : (
            <div className="space-y-2">
              {architecture.key_files.map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between p-2 bg-white/[0.06] rounded"
                >
                  <span className="font-mono text-sm text-gray-200 truncate flex-1 mr-4">{file.path}</span>
                  <div className="flex gap-4 text-sm shrink-0">
                    <span className="text-indigo-400">{file.dependents} dependents</span>
                    <span className="text-green-400">{file.imports} imports</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Languages */}
      <Card>
        <CardHeader>
          <CardTitle>Languages</CardTitle>
        </CardHeader>
        <CardContent>
          {(architecture.languages || []).length === 0 ? (
            <p className="text-gray-500 text-sm">No languages detected</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {architecture.languages.map((lang) => (
                <div
                  key={lang.language}
                  className="p-3 bg-white/[0.06] rounded text-center"
                >
                  <div className="text-lg font-bold text-indigo-400">{lang.file_count}</div>
                  <div className="text-sm text-gray-400 capitalize">{lang.language}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
