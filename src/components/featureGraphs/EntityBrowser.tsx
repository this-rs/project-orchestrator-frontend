import { Fragment, useMemo, useState } from 'react'
import { File, Layers, Package, Shapes, Zap, Database, Link as LinkIcon } from 'lucide-react'
import { EmptyState, EntityRow, Fact, FilterBar, Gauge, ViewTabs, WindowedList, type WindowedItem } from '@/components/ui'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'
import {
  groupEntityViews,
  type EntityNeighbours,
  type EntityView,
  type GroupBy,
} from '@/utils/featureGraphReadable'
import { EntityDetailPanel, IMPORTANCE_TONE } from './EntityDetailPanel'
import { useFeatureGraphLabels } from './useFeatureGraphLabels'

/** Key of the "no file" group (see `groupEntityViews`). */
const NO_FILE = '\uFFFF'

export const ROW_HEIGHT = 108
export const HEADER_HEIGHT = 36

export function EntityIcon({ type, className = 'w-4 h-4 shrink-0' }: { type: string; className?: string }) {
  switch (type) {
    case 'function':
      return <Zap className={`${className} text-green-400`} aria-hidden="true" />
    case 'file':
      return <File className={`${className} text-blue-400`} aria-hidden="true" />
    case 'struct':
    case 'enum':
      return <Database className={`${className} text-purple-400`} aria-hidden="true" />
    case 'trait':
      return <LinkIcon className={`${className} text-orange-400`} aria-hidden="true" />
    default:
      return <Package className={`${className} text-gray-500`} aria-hidden="true" />
  }
}

type Flat = WindowedItem & ({ kind: 'header'; label: string; path: string[]; count: number; hint?: string } | { kind: 'row'; view: EntityView; pos: number })

function GroupHeader({ item, by }: { item: Extract<Flat, { kind: 'header' }>; by: GroupBy }) {
  return (
    <h3
      className="flex h-full items-center gap-1.5 px-3 border-b border-white/[0.06] text-[11px] font-medium text-gray-400 min-w-0"
      title={item.hint}
    >
      {by === 'file' ? (
        <span className="truncate min-w-0" title={item.path.join('/')}>
          {item.path.map((seg, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="px-1 text-gray-600" aria-hidden="true">›</span>}
              <span className={i === item.path.length - 1 ? 'text-gray-200' : ''}>{seg}</span>
            </Fragment>
          ))}
        </span>
      ) : (
        <span className="truncate text-gray-300">{item.label}</span>
      )}
      <span className="tabular-nums font-normal text-gray-600">{item.count}</span>
    </h3>
  )
}

/**
 * Every entity of a feature graph, browsable: internal scroll (windowed), grouped by role / file /
 * type, searchable across all of them. Each row speaks: human title, code name, one-line explanation.
 */
export function EntityBrowser({
  views,
  neighbours,
  viewById,
}: {
  views: EntityView[]
  neighbours: Map<string, EntityNeighbours>
  viewById: Map<string, EntityView>
}) {
  const { t } = useT()
  const labels = useFeatureGraphLabels()
  const groupTabs: { id: GroupBy; label: string }[] = [
    { id: 'role', label: t('featureGraphs.browser.role') },
    { id: 'file', label: t('featureGraphs.browser.file') },
    { id: 'type', label: t('featureGraphs.browser.type') },
  ]
  const [query, setQuery] = useState('')
  const [by, setBy] = useState<GroupBy>('role')
  const [selected, setSelected] = useState<EntityView | null>(null)

  const matching = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? views.filter((v) => v.haystack.includes(q)) : views
  }, [views, query])

  const flat = useMemo<Flat[]>(() => {
    const out: Flat[] = []
    let pos = 0
    for (const g of groupEntityViews(matching, by, labels.roleLabel)) {
      const noFile = by === 'file' && g.key === NO_FILE
      const label = by === 'type' ? labels.typePlural(g.key) : noFile ? t('featureGraphs.browser.noFile') : g.label
      out.push({
        kind: 'header',
        key: `h:${by}:${g.key}`,
        height: HEADER_HEIGHT,
        header: true,
        label,
        path: noFile || by !== 'file' ? [label] : g.path,
        count: g.views.length,
        hint: by === 'role' ? labels.roleDescription(g.key) : undefined,
      })
      for (const view of g.views) out.push({ kind: 'row', key: `r:${view.index}`, height: ROW_HEIGHT, view, pos: ++pos })
    }
    return out
  }, [matching, by, t, labels])

  const selectById = (id: string) => {
    const v = viewById.get(id)
    if (v) setSelected(v)
  }

  const renderItem = (i: number) => {
    const item = flat[i]
    if (item.kind === 'header') return <GroupHeader item={item} by={by} />
    const { view } = item
    const e = view.entity
    const roleHint = [labels.roleDescription(view.role), labels.rolePlain(view.role)].filter(Boolean).join(' — ')
    const where =
      view.file && by !== 'file'
        ? e.line_start != null
          ? `${view.file}:${e.line_start}`
          : view.file
        : e.line_start != null
          ? t('featureGraphs.browser.line', { n: e.line_start })
          : null
    return (
      <article aria-posinset={item.pos} aria-setsize={matching.length} aria-label={view.title} className="h-full overflow-hidden">
        <EntityRow
          as="div"
          title={view.title}
          titleLines={1}
          titleSuffix={<code className="font-mono text-[11px] font-normal text-gray-500">{view.codeName}</code>}
          onClick={() => setSelected(view)}
          selected={selected?.index === view.index}
          leading={<EntityIcon type={e.entity_type} className="w-3.5 h-3.5 shrink-0" />}
          description={<span className="block truncate" title={view.summary}>{view.summary}</span>}
          status={[
            <span key="role" title={roleHint}>
              {labels.roleWord(view.role)}
            </span>,
            <Gauge
              key="imp"
              label={t('featureGraphs.browser.importance')}
              value={view.importance.value}
              level={labels.importanceLabel(view.importance.level)}
              tone={IMPORTANCE_TONE[view.importance.level]}
              title={t('featureGraphs.browser.importanceFor', { level: labels.importanceLabel(view.importance.level) })}
            />,
          ]}
          meta={[
            where ? (
              <Fact key="where" icon={File} mono title={where} truncateAt="max-w-[16rem]">
                {where}
              </Fact>
            ) : null,
            <Fact key="type" icon={Shapes}>
              {labels.typeLabel(e.entity_type)}
            </Fact>,
          ]}
        />
      </article>
    )
  }

  const hasQuery = query.trim().length > 0
  return (
    <div className="space-y-3">
      <FilterBar
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder={t('featureGraphs.browser.search')}
        trailing={<ViewTabs tabs={groupTabs} value={by} onChange={setBy} label={t('featureGraphs.browser.groupBy')} />}
      />
      {matching.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Package />}
          title={t('featureGraphs.browser.noMatch')}
          description={t('featureGraphs.browser.noMatchDescription')}
          action={
            <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
              {t('featureGraphs.browser.clear')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-gray-500 tabular-nums" role="status">
            <Layers className="w-3 h-3" aria-hidden="true" />
            {hasQuery
              ? t('featureGraphs.browser.matches', { shown: matching.length, total: views.length })
              : t('featureGraphs.browser.scrollAll', { total: views.length })}
          </p>
          <WindowedList
            items={flat}
            renderItem={renderItem}
            label={t(`featureGraphs.browser.groupedBy.${by}`)}
            resetKey={`${by}|${query}`}
          />
        </div>
      )}
      {selected && (
        <EntityDetailPanel
          view={selected}
          neighbours={neighbours.get(selected.entity.entity_id)}
          viewById={viewById}
          onSelectId={selectById}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
