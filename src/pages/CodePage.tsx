import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, Button, SearchInput, LoadingPage, EmptyState, Select, PageShell } from '@/components/ui'
import { codeApi, workspacesApi } from '@/services'
import type { SearchResult, ArchitectureOverview } from '@/services'
import { useWorkspaceSlug } from '@/hooks'

export function CodePage() {
  const wsSlug = useWorkspaceSlug()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [architecture, setArchitecture] = useState<ArchitectureOverview | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'search' | 'architecture'>('search')

  // Project filter
  const [projects, setProjects] = useState<{ slug: string; name: string }[]>([])
  const [selectedProject, setSelectedProject] = useState('all')

  // Load workspace projects for filter
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

  // Reset architecture when project filter changes
  useEffect(() => {
    setArchitecture(null)
  }, [selectedProject])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    try {
      const projectSlug = selectedProject !== 'all' ? selectedProject : undefined
      const response = await codeApi.search(searchQuery, { project_slug: projectSlug })
      setSearchResults(Array.isArray(response) ? response : [])
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadArchitecture = async () => {
    setLoading(true)
    try {
      const projectSlug = selectedProject !== 'all' ? selectedProject : undefined
      const data = await codeApi.getArchitecture({ project_slug: projectSlug })
      setArchitecture(data)
    } catch (error) {
      console.error('Failed to load architecture:', error)
    } finally {
      setLoading(false)
    }
  }

  const projectOptions = [
    { value: 'all', label: 'All Projects' },
    ...projects.map((p) => ({ value: p.slug, label: p.name })),
  ]

  return (
    <PageShell
      title="Code Explorer"
      description="Search and explore code in workspace projects"
      actions={
        <div className="flex gap-2">
          <Button
            variant={activeTab === 'search' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('search')}
          >
            Search
          </Button>
          <Button
            variant={activeTab === 'architecture' ? 'primary' : 'secondary'}
            onClick={() => {
              setActiveTab('architecture')
              if (!architecture) loadArchitecture()
            }}
          >
            Architecture
          </Button>
        </div>
      }
    >
      {/* Project filter */}
      {projects.length > 1 && (
        <div className="mb-4">
          <Select
            options={projectOptions}
            value={selectedProject}
            onChange={(value) => setSelectedProject(value)}
            className="w-full sm:w-48"
          />
        </div>
      )}

      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Search Box */}
          <Card>
            <CardContent>
              <div className="flex gap-4">
                <SearchInput
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search code semantically..."
                  className="flex-1"
                />
                <Button onClick={handleSearch} loading={loading}>
                  Search
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {loading ? (
            <LoadingPage />
          ) : searchResults.length === 0 ? (
            <EmptyState
              title="No results"
              description="Enter a search query to find code across your workspace projects."
            />
          ) : (
            <div className="space-y-4">
              {searchResults.map((result) => (
                <Card key={result.document.id}>
                  <CardContent>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm text-indigo-400 truncate flex-1 mr-4">
                        {result.document.path}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-gray-500 capitalize">{result.document.language}</span>
                        <span className="text-xs text-green-400">
                          {(result.score * 100).toFixed(0)}% match
                        </span>
                      </div>
                    </div>

                    {result.document.docstrings && (
                      <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                        {result.document.docstrings}
                      </p>
                    )}

                    {result.document.symbols && result.document.symbols.length > 0 && (
                      <div className="mb-3">
                        <div className="text-xs text-gray-500 mb-1">Symbols:</div>
                        <div className="flex flex-wrap gap-1">
                          {result.document.symbols.slice(0, 10).map((symbol) => (
                            <span
                              key={symbol}
                              className="px-2 py-0.5 bg-white/[0.08] rounded text-xs text-gray-300 font-mono"
                            >
                              {symbol}
                            </span>
                          ))}
                          {result.document.symbols.length > 10 && (
                            <span className="text-xs text-gray-500">
                              +{result.document.symbols.length - 10} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {result.document.signatures && result.document.signatures.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Signatures:</div>
                        <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-32">
                          <code>{result.document.signatures.slice(0, 5).join('\n')}</code>
                          {result.document.signatures.length > 5 && (
                            <span className="text-gray-500">{'\n'}... +{result.document.signatures.length - 5} more</span>
                          )}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'architecture' && (
        <div className="space-y-6">
          {loading ? (
            <LoadingPage />
          ) : !architecture ? (
            <EmptyState
              title="Architecture not loaded"
              description="Click the Architecture tab to load the codebase overview."
            />
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </PageShell>
  )
}
