import { useState, useCallback, type FormEvent } from 'react'
import { Button, EmptyState, EntityList, EntityListSkeleton, EntityRow, ErrorState, FilterBar } from '@/components/ui'
import { codeApi } from '@/services'
import type { SearchResult } from '@/services'
import { FileHistoryDrawer } from './FileHistoryDrawer'

interface CodeExplorerTabProps {
  projectSlug: string | null
  workspaceSlug: string
}

const MAX_SYMBOLS = 10
const MAX_SIGNATURES = 5

export function CodeExplorerTab({ projectSlug, workspaceSlug }: CodeExplorerTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [historyFile, setHistoryFile] = useState<string | null>(null)

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
    } catch (err) {
      console.error('Search failed:', err)
      setSearchError('Search failed. The backend may be unreachable.')
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  const openFileHistory = useCallback((filePath: string) => {
    setHistoryFile(filePath)
  }, [])

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Recherche sémantique dans les fichiers, fonctions et structures. Résultats classés par pertinence — touchez un
        fichier pour voir ses commits récents.
      </p>

      <form role="search" onSubmit={handleSearch}>
        <FilterBar
          search={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Rechercher dans le code…"
          searchLabel="Rechercher dans le code"
          trailing={
            <Button type="submit" size="sm" loading={loading} disabled={!searchQuery.trim()}>
              Rechercher
            </Button>
          }
        />
      </form>

      {loading ? (
        <EntityListSkeleton rows={5} />
      ) : searchError ? (
        <ErrorState title="Échec de la recherche" description={searchError} onRetry={() => handleSearch()} />
      ) : searchResults.length === 0 ? (
        <EmptyState
          variant="search"
          title="Aucun résultat"
          description={
            searched
              ? 'Essayez d’autres mots : la recherche porte sur le sens, pas seulement le texte exact.'
              : 'Entrez un terme de recherche pour explorer le code de vos projets.'
          }
        />
      ) : (
        <EntityList aria-label="Résultats de recherche">
          {searchResults.map((result) => {
            const doc = result.document
            const symbols = doc.symbols ?? []
            const signatures = doc.signatures ?? []
            const name = doc.path.split('/').pop() || doc.path
            return (
              <EntityRow
                key={doc.id}
                title={<span className="font-mono">{name}</span>}
                ariaLabel={`Historique de ${doc.path}`}
                onClick={() => openFileHistory(doc.path)}
                trailing={<span className="text-emerald-400">{(result.score * 100).toFixed(0)}%</span>}
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
                  symbols.length ? `${symbols.length} symbole${symbols.length > 1 ? 's' : ''}` : null,
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
                            <span className="text-[11px] leading-5 text-gray-500">+{symbols.length - MAX_SYMBOLS} de plus</span>
                          )}
                        </div>
                      )}
                      {signatures.length > 0 && (
                        <pre className="relative z-10 rounded-md bg-black/30 p-2 text-[11px] leading-4 text-gray-300 overflow-x-auto max-h-32">
                          <code>{signatures.slice(0, MAX_SIGNATURES).join('\n')}</code>
                          {signatures.length > MAX_SIGNATURES && (
                            <span className="text-gray-500">
                              {'\n'}… +{signatures.length - MAX_SIGNATURES} de plus
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

      {historyFile && (
        <FileHistoryDrawer
          filePath={historyFile}
          projectSlug={projectSlug}
          workspaceSlug={workspaceSlug}
          onClose={() => setHistoryFile(null)}
          onNavigate={openFileHistory}
        />
      )}
    </div>
  )
}
