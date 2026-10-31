/**
 * The live log: every event of the scope, in arrival order, as one line each.
 *
 * It is a *log*, so it reads like one — a timestamp, the kind of thing, the thing,
 * and what happened — and stays raw where being raw is honest (`status_changed`,
 * `progress`). What it adds over a terminal is the one gesture a log usually
 * lacks: clicking a line takes you to the card of the run it talks about, because
 * "which run is this?" is the question a busy feed actually raises.
 *
 * Bounded on purpose: the hook keeps the last 500 lines. A hub that tries to hold
 * a day of events in the DOM is a hub that freezes at the worst moment — and the
 * server keeps the authoritative history anyway.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { SearchInput, Switch } from '@/components/ui'
import { useT } from '@/i18n'
import type { ActivityEvent } from '@/types/activity'
import { CATEGORY_META } from './categoryMeta'

interface ActivityLogProps {
  events: ActivityEvent[]
  /** Scroll the matching card into view and pulse it. */
  onJump: (entityId: string) => void
  follow: boolean
  onToggleFollow: (follow: boolean) => void
  /** Events the server dropped since the last refresh (0 when the log is whole). */
  gap: number
}

export function ActivityLog({ events, onJump, follow, onToggleFollow, gap }: ActivityLogProps) {
  const { t, date } = useT()
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLUListElement | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return events
    return events.filter((event) => {
      const label = event.title ?? event.entity_type
      return `${label} ${event.entity_id} ${event.action} ${event.status ?? ''}`
        .toLowerCase()
        .includes(needle)
    })
  }, [events, query])

  // Follow the tail unless the person said otherwise — or is searching, in which
  // case jumping to the newest line would yank the result away under the cursor.
  useEffect(() => {
    if (!follow || query.trim()) return
    const list = listRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [filtered.length, follow, query])

  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-gray-200">{t('activity.hub.log')}</h2>
        <div className="ml-auto flex items-center gap-3">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('ui.searchPlaceholder')}
            className="w-48"
          />
          <label className="flex items-center gap-2 text-xs text-gray-400">
            {t('activity.hub.follow')}
            <Switch checked={follow} onChange={onToggleFollow} ariaLabel={t('activity.hub.follow')} />
          </label>
        </div>
      </div>

      {gap > 0 && (
        <p className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-300">
          {t('activity.hub.gap', { count: gap })}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-6 text-center text-xs text-gray-500">
          {t('activity.hub.logEmpty')}
        </p>
      ) : (
        <ul
          ref={listRef}
          className="max-h-64 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/20 py-1 font-mono text-[11px] leading-5"
        >
          {filtered.map((event) => {
            const meta = CATEGORY_META[event.category]
            return (
              <li key={`${event.seq}-${event.entity_id}`}>
                <button
                  type="button"
                  onClick={() => onJump(event.entity_id)}
                  className="flex w-full items-baseline gap-2 px-2 py-0.5 text-left hover:bg-white/[0.04]"
                  title={event.entity_id}
                >
                  <span className="shrink-0 tabular-nums text-gray-600">
                    {date(event.ts, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: meta.tint }}
                    aria-hidden="true"
                  />
                  <span className="shrink-0 text-gray-500">{meta.label()}</span>
                  <span className="truncate text-gray-300">{event.title ?? event.entity_id.slice(0, 8)}</span>
                  <span className="ml-auto shrink-0 text-gray-500">
                    {event.status ?? event.action}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
