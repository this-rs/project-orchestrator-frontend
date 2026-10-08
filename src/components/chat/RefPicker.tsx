import { refKindDef } from '@/refs/registry'
import type { RefSearchState } from '@/refs/useRefSearch'
import type { RefSearchItem } from '@/refs/refsApi'
import type { RefKind } from '@/refs/types'

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
  onPick: (item: RefSearchItem) => void
  onHover: (index: number) => void
}

/**
 * The results of a `#` search. The textarea keeps the focus (ARIA combobox
 * pattern): the options are never focused, the active one is announced through
 * `aria-activedescendant`. A mouse press does not take the focus either.
 */
export function RefPicker({ listId, search, activeIndex, kindFilter, full, onPick, onHover }: RefPickerProps) {
  const { items } = search
  const status =
    search.status === 'error'
      ? `Search failed: ${search.message}`
      : search.status === 'ready' && items.length === 0
        ? 'No results'
        : search.status === 'ready'
          ? `${items.length} result${items.length > 1 ? 's' : ''}`
          : 'Searching…'
  return (
    <div
      data-testid="ref-picker"
      className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-64 overflow-y-auto rounded-lg border border-white/[0.08] bg-surface-popover py-1 shadow-xl"
      // Keep the caret in the textarea.
      onMouseDown={(e) => e.preventDefault()}
    >
      <p className="px-2.5 pb-1 text-[11px] text-slate-400">
        {kindFilter ? `${refKindDef(kindFilter).name} only` : 'Plans, tasks, notes, decisions, RFCs'}
        {full ? ' — maximum references reached' : ''}
      </p>
      {/* No listbox without an option: the status line below says why there is nothing. */}
      {items.length > 0 && (
        <ul id={listId} role="listbox" aria-label="References" className="m-0 list-none p-0">
          {items.map((item, i) => {
            const def = refKindDef(item.kind)
            const active = i === activeIndex
            return (
              <li
                key={`${item.kind}:${item.id}`}
                id={refOptionId(listId, i)}
                role="option"
                aria-selected={active}
                aria-disabled={full || undefined}
                data-testid="ref-option"
                onClick={() => onPick(item)}
                onMouseMove={() => onHover(i)}
                className={`flex min-h-8 cursor-pointer items-center gap-2 px-2.5 py-1 text-xs text-slate-200 [@media(pointer:coarse)]:min-h-11 ${
                  active ? 'bg-indigo-500/20 ring-2 ring-inset ring-indigo-400' : ''
                }`}
              >
                <def.Icon className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                <span className="shrink-0 text-slate-400">{def.name}</span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.subtitle && <span className="hidden max-w-[40%] truncate text-slate-400 sm:inline">{item.subtitle}</span>}
                {item.entity_status && <span className="shrink-0 text-slate-400">[{item.entity_status}]</span>}
              </li>
            )
          })}
        </ul>
      )}
      <p role="status" aria-live="polite" data-testid="ref-picker-status" className="px-2.5 pt-1 text-[11px] text-slate-400">
        {status}
      </p>
    </div>
  )
}
