import { useState } from 'react'
import { Card, CardContent, Button, SearchInput, EmptyState } from '@/components/ui'
import { Search, ChevronRight, ChevronDown } from 'lucide-react'
import { codeApi } from '@/services'
import type { ClassHierarchy, SubclassesResponse, InterfaceImplementorsResponse } from '@/types'

type HeritageMode = 'hierarchy' | 'subclasses' | 'implementors'

const MODE_CONFIG: { key: HeritageMode; label: string; placeholder: string }[] = [
  { key: 'hierarchy', label: 'Class Hierarchy', placeholder: 'Enter a class or struct name…' },
  { key: 'subclasses', label: 'Subclasses', placeholder: 'Enter a parent class name…' },
  { key: 'implementors', label: 'Implementors', placeholder: 'Enter an interface or trait name…' },
]

export function CodeHeritageTab() {
  const [mode, setMode] = useState<HeritageMode>('hierarchy')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  // Results — only one is set at a time
  const [hierarchy, setHierarchy] = useState<ClassHierarchy | null>(null)
  const [subclasses, setSubclasses] = useState<SubclassesResponse | null>(null)
  const [implementors, setImplementors] = useState<InterfaceImplementorsResponse | null>(null)
  const [searched, setSearched] = useState(false)

  const handleSearch = async (overrideMode?: HeritageMode) => {
    const trimmed = query.trim()
    if (!trimmed) return

    const activeMode = overrideMode ?? mode

    setLoading(true)
    setSearched(true)
    // Clear previous results
    setHierarchy(null)
    setSubclasses(null)
    setImplementors(null)

    try {
      switch (activeMode) {
        case 'hierarchy': {
          const data = await codeApi.getClassHierarchy({ type_name: trimmed, max_depth: 10 })
          setHierarchy(data)
          break
        }
        case 'subclasses': {
          const data = await codeApi.findSubclasses({ class_name: trimmed })
          setSubclasses(data)
          break
        }
        case 'implementors': {
          const data = await codeApi.findInterfaceImplementors({ interface_name: trimmed })
          setImplementors(data)
          break
        }
      }
    } catch (err) {
      console.error('Heritage search failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const currentConfig = MODE_CONFIG.find((m) => m.key === mode)!

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        Explore inheritance relationships: class hierarchy (parents and children), transitive
        subclasses, and interface or trait implementors across the codebase.
      </p>

      {/* ── Search Bar ───────────────────────────────────────────── */}
      <Card>
        <CardContent>
          {/* Mode selector */}
          <div className="flex gap-2 mb-4">
            {MODE_CONFIG.map((m) => (
              <Button
                key={m.key}
                variant={mode === m.key ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  if (m.key === mode) return
                  setMode(m.key)
                  if (query.trim()) {
                    handleSearch(m.key)
                  } else {
                    setSearched(false)
                    setHierarchy(null)
                    setSubclasses(null)
                    setImplementors(null)
                  }
                }}
              >
                {m.label}
              </Button>
            ))}
          </div>

          {/* Search input */}
          <div className="flex gap-4">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={currentConfig.placeholder}
              className="flex-1"
            />
            <Button onClick={() => handleSearch()} loading={loading}>
              <Search className="w-4 h-4 mr-1.5" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Results ──────────────────────────────────────────────── */}
      {!searched ? (
        <EmptyState
          title="Heritage Explorer"
          description="Search for a class, interface, or trait to explore its inheritance hierarchy, subclasses, or implementors."
        />
      ) : loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-white/[0.04] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : mode === 'hierarchy' && hierarchy ? (
        <HierarchyView data={hierarchy} />
      ) : mode === 'subclasses' && subclasses ? (
        <SubclassesView data={subclasses} />
      ) : mode === 'implementors' && implementors ? (
        <ImplementorsView data={implementors} />
      ) : (
        <EmptyState
          title={`No results for "${query}"`}
          description="No hierarchy found. Make sure the project is synced and the name is correct."
        />
      )}
    </div>
  )
}

// ── Hierarchy Tree View ─────────────────────────────────────────────────

function HierarchyView({ data }: { data: ClassHierarchy }) {
  const [expandedParents, setExpandedParents] = useState(true)
  const [expandedChildren, setExpandedChildren] = useState(true)

  return (
    <Card>
      <CardContent>
        <div className="space-y-1">
          {/* Parents */}
          {data.parents.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 hover:text-gray-300"
                onClick={() => setExpandedParents(!expandedParents)}
              >
                {expandedParents ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Parents ({data.parents.length})
              </button>
              {expandedParents && (
                <div className="space-y-1 ml-4">
                  {data.parents.map((parent, idx) => (
                    <div
                      key={parent}
                      className="flex items-center gap-2 p-2 bg-white/[0.04] rounded"
                      style={{ marginLeft: `${idx * 12}px` }}
                    >
                      <span className="text-xs text-gray-500">extends</span>
                      <span className="font-mono text-sm text-indigo-400">{parent}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Current type (highlighted) */}
          <div className="flex items-center gap-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg my-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="font-mono text-sm font-semibold text-indigo-300">{data.type_name}</span>
            <span className="text-xs text-gray-500 ml-auto">depth: {data.depth}</span>
          </div>

          {/* Children */}
          {data.children.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 hover:text-gray-300"
                onClick={() => setExpandedChildren(!expandedChildren)}
              >
                {expandedChildren ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                Children ({data.children.length})
              </button>
              {expandedChildren && (
                <div className="space-y-1 ml-4">
                  {data.children.map((child) => (
                    <div
                      key={child}
                      className="flex items-center gap-2 p-2 bg-white/[0.04] rounded"
                    >
                      <span className="text-xs text-gray-500">extended by</span>
                      <span className="font-mono text-sm text-emerald-400">{child}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {data.parents.length === 0 && data.children.length === 0 && (
            <p className="text-sm text-gray-500 py-2">
              No parent or child classes found for this type.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Subclasses View ─────────────────────────────────────────────────────

function SubclassesView({ data }: { data: SubclassesResponse }) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-300">
            Subclasses of <span className="font-mono text-indigo-400">{data.class_name}</span>
          </h3>
          <span className="text-xs text-gray-500">{data.total} found</span>
        </div>

        {data.subclasses.length === 0 ? (
          <p className="text-sm text-gray-500">No subclasses found.</p>
        ) : (
          <div className="space-y-1">
            {data.subclasses.map((sub) => (
              <div
                key={sub}
                className="flex items-center gap-2 p-2 bg-white/[0.04] rounded hover:bg-white/[0.06]"
              >
                <span className="font-mono text-sm text-emerald-400">{sub}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Implementors View ───────────────────────────────────────────────────

function ImplementorsView({ data }: { data: InterfaceImplementorsResponse }) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-300">
            Implementors of <span className="font-mono text-indigo-400">{data.interface_name}</span>
          </h3>
          <span className="text-xs text-gray-500">{data.total} found</span>
        </div>

        {data.implementors.length === 0 ? (
          <p className="text-sm text-gray-500">No implementors found.</p>
        ) : (
          <div className="space-y-1">
            {data.implementors.map((impl) => (
              <div
                key={impl}
                className="flex items-center gap-2 p-2 bg-white/[0.04] rounded hover:bg-white/[0.06]"
              >
                <span className="text-xs text-gray-500">implements</span>
                <span className="font-mono text-sm text-amber-400">{impl}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
