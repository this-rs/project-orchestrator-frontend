import { useState, useCallback } from 'react'
import {
  Card,
  CardContent,
  Button,
  SearchInput,
  LoadingPage,
  EmptyState,
  ErrorState,
} from '@/components/ui'
import { codeApi } from '@/services'
import type { SearchResult } from '@/services'
import { History } from 'lucide-react'
import { FileHistoryDrawer } from './FileHistoryDrawer'

interface CodeExplorerTabProps {
  projectSlug: string | null
  workspaceSlug: string
}

export function CodeExplorerTab({ projectSlug, workspaceSlug }: CodeExplorerTabProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [historyFile, setHistoryFile] = useState<string | null>(null)

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

  const openFileHistory = useCallback((filePath: string) => {
    setHistoryFile(filePath)
  }, [])

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Recherche sémantique dans les fichiers, fonctions et structures de votre codebase.
        Les résultats sont classés par pertinence. Cliquez sur l&apos;icône historique
        d&apos;un fichier pour voir ses commits récents.
      </p>

      {/* Search Box */}
      <Card>
        <CardContent>
          <div className="flex gap-4">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Rechercher dans le code..."
              className="flex-1"
            />
            <Button onClick={handleSearch} loading={loading}>
              Rechercher
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <LoadingPage />
      ) : searchError ? (
        <ErrorState title="Échec de la recherche" description={searchError} onRetry={handleSearch} />
      ) : searchResults.length === 0 ? (
        <EmptyState
          variant="search"
          title="Aucun résultat"
          description="Entrez un terme de recherche pour explorer le code de vos projets."
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
                    <span className="text-xs text-gray-500 capitalize">
                      {result.document.language}
                    </span>
                    <span className="text-xs text-green-400">
                      {(result.score * 100).toFixed(0)}% match
                    </span>
                    <button
                      onClick={() => openFileHistory(result.document.path)}
                      className="p-1 rounded hover:bg-white/[0.08] text-gray-500 hover:text-indigo-400 transition-colors"
                      title="Voir l'historique du fichier"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {result.document.docstrings && (
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                    {result.document.docstrings}
                  </p>
                )}

                {result.document.symbols && result.document.symbols.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs text-gray-500 mb-1">Symboles :</div>
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
                          +{result.document.symbols.length - 10} de plus
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {result.document.signatures && result.document.signatures.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Signatures :</div>
                    <pre className="bg-gray-900 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-32">
                      <code>{result.document.signatures.slice(0, 5).join('\n')}</code>
                      {result.document.signatures.length > 5 && (
                        <span className="text-gray-500">
                          {'\n'}... +{result.document.signatures.length - 5} de plus
                        </span>
                      )}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* File History Drawer — contextual, opened on click */}
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
