import { useId, useRef, useState, type ReactNode } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Sep } from './MetaLine'
import { focusRing, iconButton, textLink } from './classes'

interface FilterBarProps {
  /** Controlled search text. Omit `onSearchChange` to hide the search field. */
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  /** Accessible name of the search field (defaults to the placeholder). */
  searchLabel?: string
  /** Filter controls shown in the collapsible panel (Select, Switch…). Omit to hide the button. */
  filters?: ReactNode
  /** Number of filters differing from their default — badge on the button. */
  activeCount?: number
  /** Short labels of the active filters, shown in a summary line (visible when collapsed). */
  activeLabels?: string[]
  /** Reset every filter (not the search). Shows a "Clear" link when filters are active. */
  onClear?: () => void
  /** Initial panel state; defaults to open when filters are active. */
  defaultOpen?: boolean
  /** Controls placed right of the search (ViewToggle, sort…). Keep to icon buttons on mobile. */
  trailing?: ReactNode
  className?: string
}

/**
 * Search + collapsible filters, the list-page toolbar (same pattern as the
 * conversation list). Filters live behind a button with an active-count
 * badge; an active-filter summary with "Clear" stays visible.
 */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  searchLabel,
  filters,
  activeCount = 0,
  activeLabels,
  onClear,
  defaultOpen,
  trailing,
  className = '',
}: FilterBarProps) {
  const [open, setOpen] = useState(defaultOpen ?? activeCount > 0)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelId = useId()
  const hasSearch = onSearchChange !== undefined
  const summary = activeLabels?.filter(Boolean) ?? []

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-1.5">
        {hasSearch && (
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && search) {
                  e.preventDefault()
                  onSearchChange('')
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={searchLabel ?? searchPlaceholder.replace(/[.…]+$/, '')}
              // 16px on phones prevents iOS Safari from zooming on focus
              className="w-full h-9 pl-8 pr-8 text-base md:text-sm bg-white/[0.03] border border-white/[0.06] rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/40 focus:bg-white/[0.05] transition-colors [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('')
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
                className={`absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded text-gray-500 hover:text-gray-300 ${focusRing}`}
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {!hasSearch && <div className="flex-1" />}
        {filters && (
          // The badge sits outside the button: `.btn` clips its overflow (the glass edge).
          <span className="relative shrink-0 inline-flex">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={activeCount > 0 ? `Filters (${activeCount} active)` : 'Filters'}
              className={`${iconButton('ghost', 'size-9 md:size-8')} ${activeCount > 0 ? 'text-indigo-300' : 'text-gray-400'}`}
            >
              <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>
            {activeCount > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-indigo-500 text-[10px] leading-4 font-semibold text-white tabular-nums text-center"
              >
                {activeCount}
              </span>
            )}
          </span>
        )}
        {trailing && <div className="shrink-0 flex items-center gap-1.5">{trailing}</div>}
      </div>

      {filters && open && (
        <div id={panelId} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filters}
        </div>
      )}

      {(summary.length > 0 || (activeCount > 0 && onClear)) && (
        <div className="flex items-center gap-2 min-w-0 text-[11px] leading-4 text-gray-500">
          <span className="truncate min-w-0">
            {summary.map((label, i) => (
              <span key={label}>
                {i > 0 && <Sep />}
                <span className="text-gray-400">{label}</span>
              </span>
            ))}
          </span>
          {onClear && activeCount > 0 && (
            <button type="button" onClick={onClear} className={`ml-auto shrink-0 px-1 ${textLink}`}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
