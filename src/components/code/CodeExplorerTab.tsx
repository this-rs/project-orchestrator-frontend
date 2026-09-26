import { useState, type FormEvent } from 'react'
import { Button, EmptyState, EntityList, EntityListSkeleton, EntityRow, ErrorState, FilterBar, pluralize } from '@/components/ui'
import { codeApi } from '@/services'
import type { SearchResult } from '@/services'

interface CodeExplorerTabProps {
  projectSlug: string | null
  workspaceSlug: string
  /** Open a file's history (the page owns the sheet through `?file=`). */
  onOpenFile: (path: string) => void
}

const MAX_SYMBOLS = 10
const MAX_SIGNATURES = 5

export function CodeExplorerTab({ projectSlug, workspaceSlug, onOpenFile }: CodeExplorerTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const handleSearch = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!searchQuery.trim()) return
    setLoading(true)
    setSearchError(null)
    try {
      const project_slug = projectSlug ?? undefined
      const workspace_slug = projectSlug ? undefined : workspaceSlug
      const response = await codeApi.search(searchQuery, { project_slug, workspace_slug })
      setSearchResults(Array.isArray(response) ? response : [])
      setSearched(true)
    } catch {
      setSearchError('The backend may be unreachable.')
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Semantic search across files, functions and structs, ranked by relevance. Tap a file to see its recent commits.
      </p>

      <form role="search" onSubmit={handleSearch}>
        <FilterBar
          search={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search the code…"
          searchLabel="Search the code"
          trailing={
            <Button type="submit" size="sm" loading={loading} disabled={!searchQuery.trim()}>
              Search
            </Button>
          }
        />
      </form>

      {loading ? (
        <EntityListSkeleton rows={5} />
      ) : searchError ? (
        <ErrorState title="Search failed" description={searchError} onRetry={() => handleSearch()} />
      ) : searchResults.length === 0 ? (
        <EmptyState
          variant="search"
          title={searched ? 'No results' : 'Search the code'}
          description={
            searched
              ? 'Try other words: the search matches meaning, not only the exact text.'
              : 'Type a term to explore the code of your projects.'
          }
        />
      ) : (
        <EntityList aria-label="Search results">
          {searchResults.map((result) => {
            const doc = result.document
            const symbols = doc.symbols ?? []
            const signatures = doc.signatures ?? []
            const name = doc.path.split('/').pop() || doc.path
            return (
              <EntityRow
                key={doc.id}
                title={<span className="font-mono">{name}</span>}
                ariaLabel={`History of ${doc.path}`}
                onClick={() => onOpenFile(doc.path)}
                trailing={<span title="Match">{(result.score * 100).toFixed(0)}%</span>}
                description={
                  <>
                    <span className="font-mono break-all">{doc.path}</span>
                    {doc.docstrings && <span className="block mt-0.5 text-gray-400">{doc.docstrings}</span>}
                  </>
                }
                meta={[
                  <span key="lang" className="capitalize">
                    {doc.language}
                  </span>,
                  symbols.length ? pluralize(symbols.length, 'symbol') : null,
                ]}
                context={
                  symbols.length > 0 || signatures.length > 0 ? (
                    <div className="space-y-1.5">
                      {symbols.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {symbols.slice(0, MAX_SYMBOLS).map((symbol) => (
                            <span
                              key={symbol}
                              className="rounded border border-white/[0.08] px-1.5 text-[11px] leading-5 text-gray-400 font-mono break-all"
                            >
                              {symbol}
                            </span>
                          ))}
                          {symbols.length > MAX_SYMBOLS && (
                            <span className="text-[11px] leading-5 text-gray-500">+{symbols.length - MAX_SYMBOLS} more</span>
                          )}
                        </div>
                      )}
                      {signatures.length > 0 && (
                        <pre className="relative z-10 rounded-md bg-black/30 p-2 text-[11px] leading-4 text-gray-300 overflow-x-auto max-h-32">
                          <code>{signatures.slice(0, MAX_SIGNATURES).join('\n')}</code>
                          {signatures.length > MAX_SIGNATURES && (
                            <span className="text-gray-500">
                              {'\n'}… +{signatures.length - MAX_SIGNATURES} more
                            </span>
                          )}
                        </pre>
                      )}
                    </div>
                  ) : undefined
                }
              />
            )
          })}
        </EntityList>
      )}
    </div>
  )
}
