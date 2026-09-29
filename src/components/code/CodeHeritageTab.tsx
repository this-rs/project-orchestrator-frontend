import { useState, type FormEvent } from 'react'
import { GitFork } from 'lucide-react'
import {
  Button,
  EmptyState,
  EntityList,
  EntityListSkeleton,
  EntityRow,
  ErrorState,
  FilterBar,
  Section,
  StatusDot,
  metaText,
  surface,
} from '@/components/ui'
import type { TabItem } from '@/components/ui'
import { codeApi } from '@/services'
import type { ClassHierarchy, SubclassesResponse, InterfaceImplementorsResponse } from '@/types'
import { ViewTabs } from '@/components/ui'

type HeritageMode = 'hierarchy' | 'subclasses' | 'implementors'

const MODES: (TabItem & { id: HeritageMode; placeholder: string })[] = [
  { id: 'hierarchy', label: 'Class hierarchy', placeholder: 'Class or struct name…' },
  { id: 'subclasses', label: 'Subclasses', placeholder: 'Parent class name…' },
  { id: 'implementors', label: 'Implementors', placeholder: 'Interface or trait name…' },
]

type Result =
  | { mode: 'hierarchy'; data: ClassHierarchy }
  | { mode: 'subclasses'; data: SubclassesResponse }
  | { mode: 'implementors'; data: InterfaceImplementorsResponse }

const Mono = ({ children }: { children: string }) => <span className="font-mono break-all">{children}</span>

/** Inheritance explorer — the searched name is typed, the result is a list per direction. */
export function CodeHeritageTab() {
  const [mode, setMode] = useState<HeritageMode>('hierarchy')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [searched, setSearched] = useState(false)

  const search = async (activeMode: HeritageMode = mode) => {
    const name = query.trim()
    if (!name) return
    setLoading(true)
    setError(null)
    setSearched(true)
    setResult(null)
    try {
      if (activeMode === 'hierarchy') {
        setResult({ mode: 'hierarchy', data: await codeApi.getClassHierarchy({ type_name: name, max_depth: 10 }) })
      } else if (activeMode === 'subclasses') {
        setResult({ mode: 'subclasses', data: await codeApi.findSubclasses({ class_name: name }) })
      } else {
        setResult({ mode: 'implementors', data: await codeApi.findInterfaceImplementors({ interface_name: name }) })
      }
    } catch {
      setError('The backend may be unreachable.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    search()
  }

  const changeMode = (id: string) => {
    const next = id as HeritageMode
    if (next === mode) return
    setMode(next)
    if (query.trim()) search(next)
    else {
      setSearched(false)
      setResult(null)
    }
  }

  const current = MODES.find((m) => m.id === mode)!

  let body
  if (!searched) {
    body = (
      <EmptyState
        icon={<GitFork className="w-8 h-8 text-gray-500" />}
        title="Explore inheritance"
        description="Search a class, interface or trait to see its parents and children, its subclasses, or its implementors."
      />
    )
  } else if (loading) {
    body = <EntityListSkeleton rows={3} />
  } else if (error) {
    body = <ErrorState title="Search failed" description={error} onRetry={() => search()} />
  } else if (result?.mode === 'hierarchy') {
    body = <HierarchyView data={result.data} />
  } else if (result?.mode === 'subclasses') {
    body = <NameList title={<>Subclasses of <Mono>{result.data.class_name}</Mono></>} items={result.data.subclasses} total={result.data.total} empty="No subclasses found." />
  } else if (result?.mode === 'implementors') {
    body = (
      <NameList
        title={<>Implementors of <Mono>{result.data.interface_name}</Mono></>}
        items={result.data.implementors}
        total={result.data.total}
        empty="No implementors found."
      />
    )
  } else {
    body = <EmptyState size="sm" title={`No results for “${query}”`} description="Make sure the project is synced and the name is exact." />
  }

  return (
    <div className="space-y-4">
      <ViewTabs tabs={MODES} value={mode} onChange={changeMode} label="Heritage mode" />
      <form role="search" onSubmit={handleSubmit}>
        <FilterBar
          search={query}
          onSearchChange={setQuery}
          searchPlaceholder={current.placeholder}
          searchLabel="Type name"
          trailing={
            <Button type="submit" size="sm" loading={loading} disabled={!query.trim()}>
              Search
            </Button>
          }
        />
      </form>
      {body}
    </div>
  )
}

// ── Views ───────────────────────────────────────────────────────────────

function HierarchyView({ data }: { data: ClassHierarchy }) {
  if (data.parents.length === 0 && data.children.length === 0) {
    return <EmptyState size="sm" title={`No parent or child classes found for ${data.type_name}.`} />
  }
  return (
    <div className="space-y-6">
      {data.parents.length > 0 && (
        <Section title="Parents" count={data.parents.length} description="From the closest ancestor up.">
          <EntityList aria-label="Parent classes">
            {data.parents.map((parent) => (
              <EntityRow key={parent} title={<Mono>{parent}</Mono>} ariaLabel={parent} meta={['extends']} />
            ))}
          </EntityList>
        </Section>
      )}

      <div className={`${surface} flex flex-wrap items-center gap-2 px-3 py-2 md:px-4`}>
        <StatusDot tone="progress" label="Searched type" />
        <span className="font-mono text-sm text-gray-100 break-all">{data.type_name}</span>
        <span className={`${metaText} ml-auto tabular-nums`}>depth {data.depth}</span>
      </div>

      {data.children.length > 0 && (
        <Section title="Children" count={data.children.length}>
          <EntityList aria-label="Child classes">
            {data.children.map((child) => (
              <EntityRow key={child} title={<Mono>{child}</Mono>} ariaLabel={child} meta={['extended by']} />
            ))}
          </EntityList>
        </Section>
      )}
    </div>
  )
}

function NameList({ title, items, total, empty }: { title: React.ReactNode; items: string[]; total: number; empty: string }) {
  return (
    <Section title={title} count={total}>
      {items.length === 0 ? (
        <EmptyState size="sm" title={empty} />
      ) : (
        <EntityList aria-label="Results">
          {items.map((name) => (
            <EntityRow key={name} title={<Mono>{name}</Mono>} ariaLabel={name} />
          ))}
        </EntityList>
      )}
    </Section>
  )
}
