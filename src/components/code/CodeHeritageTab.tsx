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
import { useT } from '@/i18n'

type HeritageMode = 'hierarchy' | 'subclasses' | 'implementors'

type Result =
  | { mode: 'hierarchy'; data: ClassHierarchy }
  | { mode: 'subclasses'; data: SubclassesResponse }
  | { mode: 'implementors'; data: InterfaceImplementorsResponse }

const Mono = ({ children }: { children: string }) => <span className="font-mono break-all">{children}</span>

/** Inheritance explorer — the searched name is typed, the result is a list per direction. */
export function CodeHeritageTab() {
  const { t } = useT()
  const modes: (TabItem & { id: HeritageMode; placeholder: string })[] = [
    { id: 'hierarchy', label: t('code.heritage.hierarchy'), placeholder: t('code.heritage.hierarchyPlaceholder') },
    { id: 'subclasses', label: t('code.heritage.subclasses'), placeholder: t('code.heritage.subclassesPlaceholder') },
    { id: 'implementors', label: t('code.heritage.implementors'), placeholder: t('code.heritage.implementorsPlaceholder') },
  ]
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
      setError(t('code.common.backendUnreachable'))
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

  const current = modes.find((m) => m.id === mode)!

  let body
  if (!searched) {
    body = (
      <EmptyState
        icon={<GitFork className="w-8 h-8 text-gray-500" />}
        title={t('code.heritage.exploreTitle')}
        description={t('code.heritage.exploreDescription')}
      />
    )
  } else if (loading) {
    body = <EntityListSkeleton rows={3} />
  } else if (error) {
    body = <ErrorState title={t('code.common.searchFailed')} description={error} onRetry={() => search()} />
  } else if (result?.mode === 'hierarchy') {
    body = <HierarchyView data={result.data} />
  } else if (result?.mode === 'subclasses') {
    body = (
      <NameList
        title={t('code.heritage.subclassesOf', { name: result.data.class_name })}
        items={result.data.subclasses}
        total={result.data.total}
        empty={t('code.heritage.noSubclasses')}
      />
    )
  } else if (result?.mode === 'implementors') {
    body = (
      <NameList
        title={t('code.heritage.implementorsOf', { name: result.data.interface_name })}
        items={result.data.implementors}
        total={result.data.total}
        empty={t('code.heritage.noImplementors')}
      />
    )
  } else {
    body = <EmptyState size="sm" title={t('code.heritage.noResultsFor', { query })} description={t('code.heritage.noResultsDescription')} />
  }

  return (
    <div className="space-y-4">
      <ViewTabs tabs={modes} value={mode} onChange={changeMode} label={t('code.heritage.mode')} />
      <form role="search" onSubmit={handleSubmit}>
        <FilterBar
          search={query}
          onSearchChange={setQuery}
          searchPlaceholder={current.placeholder}
          searchLabel={t('code.heritage.typeName')}
          trailing={
            <Button type="submit" size="sm" loading={loading} disabled={!query.trim()}>
              {t('code.common.search')}
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
  const { t } = useT()
  if (data.parents.length === 0 && data.children.length === 0) {
    return <EmptyState size="sm" title={t('code.heritage.noRelatives', { name: data.type_name })} />
  }
  return (
    <div className="space-y-6">
      {data.parents.length > 0 && (
        <Section title={t('code.heritage.parents')} count={data.parents.length} description={t('code.heritage.parentsDescription')}>
          <EntityList aria-label={t('code.heritage.parentClasses')}>
            {data.parents.map((parent) => (
              <EntityRow key={parent} title={<Mono>{parent}</Mono>} ariaLabel={parent} meta={[t('code.heritage.extends')]} />
            ))}
          </EntityList>
        </Section>
      )}

      <div className={`${surface} flex flex-wrap items-center gap-2 px-3 py-2 md:px-4`}>
        <StatusDot tone="progress" label={t('code.heritage.searchedType')} />
        <span className="font-mono text-sm text-gray-100 break-all">{data.type_name}</span>
        <span className={`${metaText} ml-auto tabular-nums`}>{t('code.heritage.depth', { n: data.depth })}</span>
      </div>

      {data.children.length > 0 && (
        <Section title={t('code.heritage.children')} count={data.children.length}>
          <EntityList aria-label={t('code.heritage.childClasses')}>
            {data.children.map((child) => (
              <EntityRow key={child} title={<Mono>{child}</Mono>} ariaLabel={child} meta={[t('code.heritage.extendedBy')]} />
            ))}
          </EntityList>
        </Section>
      )}
    </div>
  )
}

function NameList({ title, items, total, empty }: { title: React.ReactNode; items: string[]; total: number; empty: string }) {
  const { t } = useT()
  return (
    <Section title={title} count={total}>
      {items.length === 0 ? (
        <EmptyState size="sm" title={empty} />
      ) : (
        <EntityList aria-label={t('code.heritage.results')}>
          {items.map((name) => (
            <EntityRow key={name} title={<Mono>{name}</Mono>} ariaLabel={name} />
          ))}
        </EntityList>
      )}
    </Section>
  )
}
