import { X } from 'lucide-react'
import { Gauge, MetaLine } from '@/components/ui'
import { focusRing, glass, glassFlat, iconButton, popIn } from '@/components/ui/classes'
import type { StatusTone } from '@/components/ui/statusMeta'
import { useT } from '@/i18n'
import { cleanDocstring, type EntityNeighbours, type EntityView, type ImportanceLevel } from '@/utils/featureGraphReadable'

import { useFeatureGraphLabels } from './useFeatureGraphLabels'

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
  const { t } = useT()
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
                className={`w-full min-h-9 text-left rounded px-1.5 py-1.5 text-xs hover:bg-white/[0.06] disabled:hover:bg-transparent ${focusRing}`}
              >
                <span className="text-gray-200">{v?.title ?? r.entityId}</span>
                {v && <span className="ml-1.5 font-mono text-[11px] text-gray-500">{v.codeName}</span>}
                {r.relationType !== 'CALLS' && <span className="ml-1.5 text-[11px] text-gray-500">{r.relationType.toLowerCase()}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {refs.length > MAX_LINKS && <p className="px-1.5 text-[11px] text-gray-500">{t('featureGraphs.panel.more', { n: refs.length - MAX_LINKS })}</p>}
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
  const { t } = useT()
  const labels = useFeatureGraphLabels()
  const e = view.entity
  const doc = cleanDocstring(e.docstring)
  const roleHint = labels.roleDescription(view.role)
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
    <aside aria-label={t('featureGraphs.panel.details', { title: view.title })} className={shell}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-100 break-words">{view.title}</h4>
          <code className="block text-xs font-mono text-gray-400 break-all">{view.codeName}</code>
          <MetaLine
            items={[
              labels.typeLabel(e.entity_type),
              <span key="r" title={[roleHint, labels.rolePlain(view.role)].filter(Boolean).join(' — ')}>
                {labels.roleWord(view.role)}
              </span>,
              e.visibility ?? null,
            ]}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('featureGraphs.panel.close')}
          className={`${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} shrink-0 -m-1`}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-gray-300 whitespace-pre-wrap break-words">
        {doc || view.summary}
      </p>

      <div className="mt-2 text-xs">
        <Gauge
          label={t('featureGraphs.browser.importance')}
          value={view.importance.value}
          level={labels.importanceLabel(view.importance.level)}
          tone={IMPORTANCE_TONE[view.importance.level]}
          title={t('featureGraphs.browser.importanceFor', { level: labels.importanceLabel(view.importance.level) })}
        />
      </div>

      {e.signature && (
        <pre aria-label={t('featureGraphs.panel.signature')} className="mt-2 overflow-x-auto rounded-md bg-white/[0.04] px-2 py-1.5 text-xs font-mono text-gray-300">
          {e.signature}
        </pre>
      )}
      {location && (
        <p className="mt-2 text-xs text-gray-400">
          <span className="text-gray-500">{t('featureGraphs.panel.definedIn')}</span>
          <code className="font-mono text-gray-300 break-all">{location}</code>
        </p>
      )}
      <code className="mt-2 block text-[11px] text-gray-500 font-mono break-all">{e.entity_id}</code>

      <div className="mt-3 space-y-2">
        <LinkList title={t('featureGraphs.panel.calledBy')} refs={callers} viewById={viewById} onSelect={onSelectId} />
        <LinkList title={t('featureGraphs.panel.calls')} refs={callees} viewById={viewById} onSelect={onSelectId} />
        <LinkList title={t('featureGraphs.panel.otherRelations')} refs={other} viewById={viewById} onSelect={onSelectId} />
      </div>
    </aside>
  )
}
