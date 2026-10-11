import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, SearchX, X, type LucideIcon } from 'lucide-react'
import { useSheetPlacement } from '@/hooks/useSheetPlacement'
import { actorKinds, entityKinds } from '@/refs/kinds'
import { refKindDef } from '@/refs/registry'
import type { RefSigil } from '@/refs/trigger'
import { refStatusLabel } from '@/refs/statusLabel'
import type { RefSearchState } from '@/refs/useRefSearch'
import type { RefSearchItem } from '@/refs/refsApi'
import { useActiveKinds } from '@/refs/useActiveKinds'
import { useT } from '@/i18n'
import { MAX_REFS_PER_MESSAGE, type RefKind } from '@/refs/types'

export const refOptionId = (listId: string, index: number) => `${listId}-opt-${index}`

interface RefPickerProps {
  /** Id of the listbox; the textarea points at it with `aria-controls`. */
  listId: string
  search: RefSearchState
  /** Index of the option `aria-activedescendant` points at. */
  activeIndex: number
  /** Set by a kind prefix typed in the text (`#task foo`): that kind only. */
  kindFilter?: RefKind
  /** `#` searches the entities, `@` the actors (persona, skill). */
  sigil?: RefSigil
  /** `@` only: no project in view, and actors are only suggested inside one. */
  needsProject?: boolean
  /** The draft already holds the most references a message may carry. */
  full: boolean
  /** The draft already holds this one: it can still be chosen at the cap (nothing is added). */
  isInDraft?: (item: RefSearchItem) => boolean
  onPick: (item: RefSearchItem) => void
  onHover: (index: number) => void
  /** Narrow screen: a bottom sheet (fixed, 44px rows, follows the visual viewport) instead of the popover. */
  sheet?: boolean
  /** The sheet rests on this element (the composer box). */
  anchor?: HTMLElement | null
  /** Close button of the sheet (touch has no Escape). */
  onClose?: () => void
  /** Sheet: what was typed after the sigil, echoed at the top (the keyboard may hide the composer's own line). */
  query?: string
  /** Sheet: the kind the filter chips narrowed the search to (undefined = every kind of the sigil). */
  chipKind?: RefKind
  /** Sheet: a filter chip was tapped (undefined = "All"). Without it there are no chips. */
  onChipKind?: (kind: RefKind | undefined) => void
}

/**
 * The results of a `#` / `@` search. The textarea keeps the focus (ARIA combobox
 * pattern): the options are never focused, the active one is announced through
 * `aria-activedescendant`. A mouse press does not take the focus either.
 *
 * Wide screens: a popover above the composer. Narrow screens: a bottom sheet that
 * rests on the composer and takes the room the visual viewport leaves above it
 * (keyboard open), with a fixed header (query, kind chips, close) and a list that
 * scrolls on its own.
 */
export function RefPicker(props: RefPickerProps) {
  const { listId, activeIndex } = props
  // The textarea keeps the focus, so the browser never scrolls to the option the arrows reached:
  // bring it into the visible area ourselves.
  useEffect(() => {
    document.getElementById(refOptionId(listId, activeIndex))?.scrollIntoView?.({ block: 'nearest' })
  }, [listId, activeIndex])
  useActiveKinds() // the words below follow the kinds the server lists
  return props.sheet ? <RefSheet {...props} /> : <RefPopover {...props} />
}

/** What the status line says (also read by screen readers through `role="status"`). */
function statusOf({ search, needsProject = false }: RefPickerProps, noKinds: boolean, t: Translate): string {
  if (noKinds) return t('chatA-input.refs.picker.noActors')
  if (search.status === 'error') return search.message
  if (search.status === 'ready' && search.items.length === 0)
    return t(needsProject ? 'chatA-input.refs.picker.needsProject' : 'chatA-input.refs.picker.noResults')
  if (search.status === 'ready') {
    const count = search.items.length
    return t(count === 1 ? 'chatA-input.refs.picker.resultsOne' : 'chatA-input.refs.picker.resultsMany', { count })
  }
  return t('chatA-input.refs.picker.searching')
}

type Translate = ReturnType<typeof useT>['t']

const kindsOfSigil = (sigil: RefSigil): readonly RefKind[] => (sigil === '@' ? actorKinds() : entityKinds())

function useCommon(props: RefPickerProps) {
  const { t } = useT()
  const sigil = props.sigil ?? '#'
  const kinds = kindsOfSigil(sigil)
  const noKinds = kinds.length === 0
  const loading = !noKinds && (props.search.status === 'loading' || props.search.status === 'idle')
  return { t, sigil, kinds, noKinds, loading, status: statusOf(props, noKinds, t) }
}

function LimitNotice() {
  return (
    <p
      data-testid="ref-picker-limit"
      className="mx-1.5 mb-1 shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
    >
      Maximum {MAX_REFS_PER_MESSAGE} references per message: remove one to add another.
    </p>
  )
}

function RetryButton({ onClick, large = false }: { onClick: () => void; large?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-md border border-white/[0.12] text-slate-100 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        large ? 'min-h-11 px-4 text-sm' : 'px-2 py-0.5 text-xs'
      }`}
    >
      Try again
    </button>
  )
}

/** The listbox. One render for both variants; only the row dressing differs. */
function Options({ listId, search, activeIndex, sigil, loading, full, isInDraft, onPick, onHover, sheet }: RefPickerProps & { sigil: RefSigil; loading: boolean }) {
  const { items } = search
  return (
    <ul
      id={listId}
      role="listbox"
      aria-label={sigil === '@' ? 'Actors' : 'References'}
      aria-busy={loading || undefined}
      className={`m-0 list-none p-0 transition-opacity ${sheet ? 'py-1' : ''} ${loading ? 'opacity-60' : ''}`}
    >
      {items.map((item, i) => {
        const def = refKindDef(item.kind)
        const active = !loading && i === activeIndex
        const blocked = full && !isInDraft?.(item)
        const status = item.entity_status ? refStatusLabel(item.entity_status) : null
        const common = {
          id: refOptionId(listId, i),
          role: 'option',
          'aria-selected': active,
          'aria-disabled': blocked || undefined,
          'data-testid': 'ref-option',
          'data-kind': item.kind,
          onClick: () => onPick(item),
          onMouseMove: () => onHover(i),
        } as const
        if (sheet) {
          // Two lines in 44px: the title, then what it is and where it lives.
          const meta = [def.name, item.project?.name ?? item.workspace?.name, item.subtitle].filter(Boolean).join(' · ')
          return (
            <li
              key={`${item.kind}:${item.id}`}
              {...common}
              className={`mx-1.5 flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-1 text-slate-200 ${
                blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:bg-white/[0.08]'
              } ${active ? 'bg-indigo-500/20 ring-1 ring-inset ring-indigo-400/70' : ''}`}
            >
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-slate-300">
                <def.Icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm leading-5">{item.label}</span>
                <span className="truncate text-xs leading-4 text-slate-400">{meta}</span>
              </span>
              {status && <span className="shrink-0 rounded bg-white/[0.06] px-1.5 text-[11px] leading-5 text-slate-300">{status}</span>}
            </li>
          )
        }
        return (
          <li
            key={`${item.kind}:${item.id}`}
            {...common}
            className={`flex min-h-8 items-center gap-2 px-2.5 py-1 text-xs text-slate-200 [@media(pointer:coarse)]:min-h-11 ${
              blocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            } ${active ? 'bg-indigo-500/20 ring-2 ring-inset ring-indigo-400' : ''}`}
          >
            <def.Icon className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
            <span className="shrink-0 text-slate-400">{def.name}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.subtitle && <span className="hidden max-w-[40%] truncate text-slate-400 sm:inline">{item.subtitle}</span>}
            {status && <span className="shrink-0 rounded bg-white/[0.06] px-1.5 text-[11px] text-slate-300">{status}</span>}
          </li>
        )
      })}
    </ul>
  )
}

function RefPopover(props: RefPickerProps) {
  const { search, kindFilter, full } = props
  const { sigil, kinds, loading, status } = useCommon(props)
  return (
    <div
      data-testid="ref-picker"
      data-variant="popover"
      className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-[min(16rem,40dvh)] overflow-y-auto rounded-lg border border-white/[0.08] bg-surface-popover py-1 shadow-xl"
      // Keep the caret in the textarea.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex">
        <p className="m-0 min-w-0 flex-1 px-2.5 pb-1 text-[11px] text-slate-400 [@media(pointer:coarse)]:text-xs">
          {kindFilter
            ? `${refKindDef(kindFilter).name} only`
            : sigil === '@'
              ? `Actors: ${kinds.map((k) => refKindDef(k).name).join(', ') || 'none'}`
              : kinds.map((k) => refKindDef(k).name).join(', ')}
          {full ? ' — maximum references reached' : ''}
        </p>
      </div>
      {full && <LimitNotice />}
      {/* No listbox without an option: the status line below says why there is nothing. */}
      {search.items.length > 0 && <Options {...props} sigil={sigil} loading={loading} />}
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
        {search.status === 'error' && <RetryButton onClick={search.retry} />}
      </div>
    </div>
  )
}

function RefSheet(props: RefPickerProps) {
  const { search, kindFilter, full, anchor = null, onClose, query = '', chipKind, onChipKind } = props
  const placement = useSheetPlacement(anchor, true)
  const { t, sigil, kinds, loading, status } = useCommon(props)
  const hasItems = search.items.length > 0
  const isError = search.status === 'error'
  // An error stays visible even over the previous results: it carries the retry.
  const showState = !hasItems || isError
  // Chips only when there is a choice to make: a prefix typed in the text already chose.
  const chips = !kindFilter && onChipKind && kinds.length > 1 ? kinds : null
  const chip = (kind: RefKind | undefined, label: string, Icon?: LucideIcon) => {
    const on = chipKind === kind
    return (
      <button
        key={kind ?? '*'}
        type="button"
        aria-pressed={on}
        data-testid="ref-kind-chip"
        onClick={() => onChipKind?.(kind)}
        // 36px to the eye, 44px to the finger: the ::before extends the hit area 4px above and below.
        className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
          on ? 'border-indigo-400/60 bg-indigo-500/25 text-indigo-100' : 'border-white/[0.1] bg-white/[0.04] text-slate-300 active:bg-white/[0.1]'
        }`}
      >
        {Icon && <Icon className="size-3.5" />}
        {label}
      </button>
    )
  }
  const body = (
    <div
      data-testid="ref-picker"
      data-variant="sheet"
      // Fixed to the screen, just above the composer; the composer stays visible under it.
      className="fixed inset-x-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border border-b-0 border-white/[0.1] bg-surface-popover pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-2xl shadow-black/50 motion-safe:animate-ref-sheet-in"
      style={{ bottom: placement.bottom, maxHeight: placement.maxHeight }}
      // Keep the caret in the textarea.
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Header: fixed, never scrolls with the list. */}
      <div className="relative shrink-0 border-b border-white/[0.06] pt-2">
        <span aria-hidden="true" className="absolute left-1/2 top-1 h-1 w-9 -translate-x-1/2 rounded-full bg-white/20" />
        <div className="flex min-h-11 items-center gap-2 pl-3">
          <span
            data-testid="ref-picker-query"
            className="min-w-0 max-w-[45%] shrink-0 truncate rounded-md bg-white/[0.06] px-2 py-1 font-mono text-xs text-slate-200"
          >
            {sigil}
            {kindFilter ? `${kindFilter} ` : ''}
            {query || <span className="font-sans text-slate-400">{t(sigil === '@' ? 'chatA-input.refs.picker.hintActors' : 'chatA-input.refs.picker.hintSearch')}</span>}
          </span>
          {kindFilter && <span className="truncate text-xs text-slate-400">{t('chatA-input.refs.picker.kindOnly', { kind: refKindDef(kindFilter).name })}</span>}
          {/* The scroll lives on this row alone: the page never scrolls sideways. */}
          {chips ? (
            <div
              role="group"
              aria-label={t('chatA-input.refs.picker.filterByKind')}
              data-testid="ref-kind-chips"
              // The right edge fades out: a chip cut by the fade says the row scrolls (the scrollbar is hidden).
              // A trailing spacer (not padding: some engines leave a flex scroller's end padding out) lets the last chip leave the fade.
              className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto overscroll-x-contain py-1 [mask-image:linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {chip(undefined, t('chatA-input.refs.picker.all'))}
              {chips.map((k) => {
                const def = refKindDef(k)
                return chip(k, def.name, def.Icon)
              })}
              <span aria-hidden="true" className="w-5 shrink-0" />
            </div>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {loading && <Loader2 data-testid="ref-picker-spinner" className="size-4 shrink-0 animate-spin text-indigo-300" aria-hidden />}
          <button
            type="button"
            aria-label={t('chatA-input.refs.picker.close')}
            onClick={onClose}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {full && (
        <div className="shrink-0 pt-1.5">
          <LimitNotice />
        </div>
      )}
      <div data-ref-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        {hasItems && <Options {...props} sigil={sigil} loading={loading} />}
        {/* With results the count is for screen readers only; without, it is the state shown in the list's place. */}
        <div className={showState ? 'flex flex-col items-center gap-3 px-6 py-6 text-center' : 'sr-only'}>
          {showState && (isError ? (
            <AlertTriangle className="size-5 text-amber-300" aria-hidden />
          ) : loading ? (
            <Loader2 className="size-5 animate-spin text-indigo-300" aria-hidden />
          ) : (
            <SearchX className="size-5 text-slate-400" aria-hidden />
          ))}
          <p
            role="status"
            aria-live="polite"
            data-testid="ref-picker-status"
            className={`m-0 text-sm ${isError ? 'text-amber-200' : 'text-slate-300'}`}
          >
            {status}
          </p>
          {isError && <RetryButton large onClick={search.retry} />}
        </div>
      </div>
    </div>
  )
  return createPortal(body, document.body)
}
