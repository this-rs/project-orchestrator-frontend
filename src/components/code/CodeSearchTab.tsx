import { useState } from 'react'
import { Card, CardContent, Button, SearchInput, LoadingPage, EmptyState, ErrorState } from '@/components/ui'
import { codeApi } from '@/services'
import type { SearchResult } from '@/services'

interface CodeSearchTabProps {
  projectSlug: string | null
  workspaceSlug: string
}

export function CodeSearchTab({ projectSlug, workspaceSlug }: CodeSearchTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setLoading(true)
    setSearchError(null)
    try {
      const project_slug = projectSlug ?? undefined
      const workspace_slug = projectSlug ? undefined : workspaceSlug
      const response = await codeApi.search(searchQuery, { project_slug, workspace_slug })
      setSearchResults(Array.isArray(response) ? response : [])
    } catch (err) {
      console.error('Search failed:', err)
      setSearchError('Search failed. The backend may be unreachable.')
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Semantic search across all files, functions and structs in your codebase. Results are ranked
        by relevance using MeiliSearch.
      </p>

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
      ) : searchError ? (
        <ErrorState title="Search failed" description={searchError} onRetry={handleSearch} />
      ) : searchResults.length === 0 ? (
        <EmptyState
          variant="search"
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
  )
}
