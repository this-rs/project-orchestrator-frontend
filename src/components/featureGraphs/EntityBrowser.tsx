import { Fragment, useMemo, useState } from 'react'
import { File, Layers, Package, Shapes, Zap, Database, Link as LinkIcon } from 'lucide-react'
import { EmptyState, EntityRow, Fact, FilterBar, Gauge, ViewTabs, WindowedList, type WindowedItem } from '@/components/ui'
import { Button } from '@/components/ui'
import { ROLE_META, roleLabel } from '@/utils/featureGraphModel'
import {
  groupEntityViews,
  ROLE_PLAIN,
  type EntityNeighbours,
  type EntityView,
  type GroupBy,
} from '@/utils/featureGraphReadable'
import { EntityDetailPanel, IMPORTANCE_TONE } from './EntityDetailPanel'

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

const GROUP_TABS: { id: GroupBy; label: string }[] = [
  { id: 'role', label: 'Role' },
  { id: 'file', label: 'File' },
  { id: 'type', label: 'Type' },
]

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
    for (const g of groupEntityViews(matching, by, roleLabel)) {
      out.push({
        kind: 'header',
        key: `h:${by}:${g.key}`,
        height: HEADER_HEIGHT,
        header: true,
        label: g.label,
        path: g.path,
        count: g.views.length,
        hint: by === 'role' ? ROLE_META[g.key]?.description : undefined,
      })
      for (const view of g.views) out.push({ kind: 'row', key: `r:${view.index}`, height: ROW_HEIGHT, view, pos: ++pos })
    }
    return out
  }, [matching, by])

  const selectById = (id: string) => {
    const v = viewById.get(id)
    if (v) setSelected(v)
  }

  const renderItem = (i: number) => {
    const item = flat[i]
    if (item.kind === 'header') return <GroupHeader item={item} by={by} />
    const { view } = item
    const e = view.entity
    const roleHint = [ROLE_META[view.role]?.description, ROLE_PLAIN[view.role]?.plain].filter(Boolean).join(' — ')
    const where = view.file && by !== 'file' ? (e.line_start != null ? `${view.file}:${e.line_start}` : view.file) : e.line_start != null ? `line ${e.line_start}` : null
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
              {view.roleWord}
            </span>,
            <Gauge
              key="imp"
              label="Importance"
              value={view.importance.value}
              level={view.importance.label}
              tone={IMPORTANCE_TONE[view.importance.level]}
              title={`${view.importance.label} for this feature`}
            />,
          ]}
          meta={[
            where ? (
              <Fact key="where" icon={File} mono title={where} truncateAt="max-w-[16rem]">
                {where}
              </Fact>
            ) : null,
            <Fact key="type" icon={Shapes}>
              {view.typeLabel}
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
        searchPlaceholder="Search entities…"
        trailing={<ViewTabs tabs={GROUP_TABS} value={by} onChange={setBy} label="Group entities by" />}
      />
      {matching.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Package />}
          title="No matching entities"
          description="Try another name, path, type or word from the description."
          action={
            <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
              Clear
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-gray-500 tabular-nums" role="status">
            <Layers className="w-3 h-3" aria-hidden="true" />
            {hasQuery
              ? `${matching.length.toLocaleString()} of ${views.length.toLocaleString()} entities match`
              : `${views.length.toLocaleString()} entities — scroll the list to see them all`}
          </p>
          <WindowedList
            items={flat}
            renderItem={renderItem}
            label={`Entities grouped by ${by}`}
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
