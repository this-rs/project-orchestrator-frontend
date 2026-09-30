import { X } from 'lucide-react'
import { Gauge, MetaLine } from '@/components/ui'
import { glass, popIn } from '@/components/ui/classes'
import type { StatusTone } from '@/components/ui/statusMeta'
import { ROLE_META } from '@/utils/featureGraphModel'
import { cleanDocstring, ROLE_PLAIN, type EntityNeighbours, type EntityView, type ImportanceLevel } from '@/utils/featureGraphReadable'

export const IMPORTANCE_TONE: Record<ImportanceLevel, StatusTone> = { key: 'info', supporting: 'neutral', minor: 'muted' }

const MAX_LINKS = 200

function LinkList({
  title,
  refs,
  viewById,
  onSelect,
}: {
  title: string
  refs: { entityId: string; relationType: string }[]
  viewById: Map<string, EntityView>
  onSelect: (id: string) => void
}) {
  if (refs.length === 0) return null
  const shown = refs.slice(0, MAX_LINKS)
  return (
    <div>
      <h5 className="text-[11px] font-medium text-gray-500">
        {title} <span className="tabular-nums text-gray-600">{refs.length}</span>
      </h5>
      <ul className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
        {shown.map((r, i) => {
          const v = viewById.get(r.entityId)
          return (
            <li key={`${r.entityId}-${r.relationType}-${i}`}>
              <button
                type="button"
                disabled={!v}
                onClick={() => onSelect(r.entityId)}
                className="w-full text-left rounded px-1.5 py-1 text-xs hover:bg-white/[0.06] disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-indigo-400"
              >
                <span className="text-gray-200">{v?.title ?? r.entityId}</span>
                {v && <span className="ml-1.5 font-mono text-[11px] text-gray-500">{v.codeName}</span>}
                {r.relationType !== 'CALLS' && <span className="ml-1.5 text-[10px] text-gray-500">{r.relationType.toLowerCase()}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {refs.length > MAX_LINKS && <p className="px-1.5 text-[11px] text-gray-500">+{refs.length - MAX_LINKS} more</p>}
    </div>
  )
}

/**
 * Everything known about one entity: human title, code name, full description, signature,
 * file:line, and who calls it / what it calls. Floating over the canvas or inline under the list.
 */
export function EntityDetailPanel({
  view,
  neighbours,
  viewById,
  onSelectId,
  onClose,
  floating,
}: {
  view: EntityView
  neighbours?: EntityNeighbours
  viewById: Map<string, EntityView>
  onSelectId: (id: string) => void
  onClose: () => void
  floating?: boolean
}) {
  const e = view.entity
  const doc = cleanDocstring(e.docstring)
  const roleHint = ROLE_META[view.role]?.description
  const callers = (neighbours?.incoming ?? []).filter((r) => r.relationType === 'CALLS')
  const callees = (neighbours?.outgoing ?? []).filter((r) => r.relationType === 'CALLS')
  const other = [
    ...(neighbours?.incoming ?? []).filter((r) => r.relationType !== 'CALLS'),
    ...(neighbours?.outgoing ?? []).filter((r) => r.relationType !== 'CALLS'),
  ]
  const location = view.file ? (e.line_start != null ? `${view.file}:${e.line_start}` : view.file) : undefined
  const shell = floating
    ? `absolute top-2 right-2 left-2 sm:left-auto sm:w-96 z-20 max-h-[calc(100%-1rem)] overflow-y-auto rounded-xl p-3 ${glass} ${popIn}`
    : 'rounded-xl border border-white/[0.07] bg-white/[0.03] p-3'

  return (
    <aside aria-label={`Details of ${view.title}`} className={shell}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-100 break-words">{view.title}</h4>
          <code className="block text-xs font-mono text-gray-400 break-all">{view.codeName}</code>
          <MetaLine
            items={[
              view.typeLabel,
              <span key="r" title={[roleHint, ROLE_PLAIN[view.role]?.plain].filter(Boolean).join(' — ')}>
                {view.roleWord}
              </span>,
              e.visibility ?? null,
            ]}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close entity details"
          className="shrink-0 -m-1 w-9 h-9 md:w-8 md:h-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-gray-300 whitespace-pre-wrap break-words">
        {doc || view.summary}
      </p>

      <div className="mt-2 text-xs">
        <Gauge
          label="Importance"
          value={view.importance.value}
          level={view.importance.label}
          tone={IMPORTANCE_TONE[view.importance.level]}
          title={`${view.importance.label} for this feature`}
        />
      </div>

      {e.signature && (
        <pre aria-label="Signature" className="mt-2 overflow-x-auto rounded-md bg-white/[0.04] px-2 py-1.5 text-xs font-mono text-gray-300">
          {e.signature}
        </pre>
      )}
      {location && (
        <p className="mt-2 text-xs text-gray-400">
          <span className="text-gray-500">Defined in </span>
          <code className="font-mono text-gray-300 break-all">{location}</code>
        </p>
      )}
      <code className="mt-2 block text-[11px] text-gray-500 font-mono break-all">{e.entity_id}</code>

      <div className="mt-3 space-y-2">
        <LinkList title="Called by" refs={callers} viewById={viewById} onSelect={onSelectId} />
        <LinkList title="Calls" refs={callees} viewById={viewById} onSelect={onSelectId} />
        <LinkList title="Other relations" refs={other} viewById={viewById} onSelect={onSelectId} />
      </div>
    </aside>
  )
}
