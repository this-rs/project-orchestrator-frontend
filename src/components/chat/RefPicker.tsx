import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { refKindDef } from '@/refs/registry'
import { refStatusLabel } from '@/refs/statusLabel'
import type { RefSearchState } from '@/refs/useRefSearch'
import type { RefSearchItem } from '@/refs/refsApi'
import { MAX_REFS_PER_MESSAGE, type RefKind } from '@/refs/types'

export const refOptionId = (listId: string, index: number) => `${listId}-opt-${index}`

interface RefPickerProps {
  /** Id of the listbox; the textarea points at it with `aria-controls`. */
  listId: string
  search: RefSearchState
  /** Index of the option `aria-activedescendant` points at. */
  activeIndex: number
  kindFilter?: RefKind
  /** The draft already holds the most references a message may carry. */
  full: boolean
  /** The draft already holds this one: it can still be chosen at the cap (nothing is added). */
  isInDraft?: (item: RefSearchItem) => boolean
  onPick: (item: RefSearchItem) => void
  onHover: (index: number) => void
}

/**
 * The results of a `#` search. The textarea keeps the focus (ARIA combobox
 * pattern): the options are never focused, the active one is announced through
 * `aria-activedescendant`. A mouse press does not take the focus either.
 */
export function RefPicker({ listId, search, activeIndex, kindFilter, full, isInDraft, onPick, onHover }: RefPickerProps) {
  const { items } = search
  // The textarea keeps the focus, so the browser never scrolls to the option the arrows reached:
  // bring it into the visible area ourselves (7 rows fit; the 8th was blind).
  useEffect(() => {
    document.getElementById(refOptionId(listId, activeIndex))?.scrollIntoView?.({ block: 'nearest' })
  }, [listId, activeIndex])
  const loading = search.status === 'loading' || search.status === 'idle'
  const status =
    search.status === 'error'
      ? search.message
      : search.status === 'ready' && items.length === 0
        ? 'No results'
        : search.status === 'ready'
          ? `${items.length} result${items.length > 1 ? 's' : ''}`
          : 'Searching…'
  return (
    <div
      data-testid="ref-picker"
      className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[min(16rem,40dvh)] overflow-y-auto rounded-lg border border-white/[0.08] bg-surface-popover py-1 shadow-xl"
      // Keep the caret in the textarea.
      onMouseDown={(e) => e.preventDefault()}
    >
      <p className="px-2.5 pb-1 text-[11px] text-slate-400">
        {kindFilter ? `${refKindDef(kindFilter).name} only` : 'Plans, tasks, notes, decisions, RFCs'}
        {full ? ' — maximum references reached' : ''}
      </p>
      {full && (
        <p
          data-testid="ref-picker-limit"
          className="mx-1.5 mb-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
        >
          Maximum {MAX_REFS_PER_MESSAGE} references per message: remove one to add another.
        </p>
      )}
      {/* No listbox without an option: the status line below says why there is nothing. */}
      {items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="References"
          aria-busy={loading || undefined}
          className={`m-0 list-none p-0 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          {items.map((item, i) => {
            const def = refKindDef(item.kind)
            const active = !loading && i === activeIndex
            const blocked = full && !isInDraft?.(item)
            return (
              <li
                key={`${item.kind}:${item.id}`}
                id={refOptionId(listId, i)}
                role="option"
                aria-selected={active}
                aria-disabled={blocked || undefined}
                data-testid="ref-option"
                onClick={() => onPick(item)}
                onMouseMove={() => onHover(i)}
                className={`flex min-h-8 items-center gap-2 px-2.5 py-1 text-xs text-slate-200 [@media(pointer:coarse)]:min-h-11 ${
                  blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                } ${active ? 'bg-indigo-500/20 ring-2 ring-inset ring-indigo-400' : ''}`}
              >
                <def.Icon className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                <span className="shrink-0 text-slate-400">{def.name}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.subtitle && <span className="hidden max-w-[40%] truncate text-slate-400 sm:inline">{item.subtitle}</span>}
                {item.entity_status && <span className="shrink-0 rounded bg-white/[0.06] px-1.5 text-[11px] text-slate-300">{refStatusLabel(item.entity_status)}</span>}
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex items-center gap-2 px-2.5 pt-1 text-xs text-slate-300">
        {loading && <Loader2 data-testid="ref-picker-spinner" className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-300" aria-hidden />}
        <p
          role="status"
          aria-live="polite"
          data-testid="ref-picker-status"
          className={`m-0 min-w-0 flex-1 ${search.status === 'error' ? 'text-amber-200' : ''}`}
        >
          {status}
        </p>
        {search.status === 'error' && (
          <button
            type="button"
            onClick={search.retry}
            className="shrink-0 rounded-md border border-white/[0.12] px-2 py-0.5 text-xs text-slate-100 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
