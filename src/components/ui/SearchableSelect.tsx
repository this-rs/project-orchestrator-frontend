/**
 * Searchable select: the WAI-ARIA 1.2 "combobox with list popup".
 *
 * ```
 * [ deepseek-flash                       v ]   input, role="combobox"
 * | 3 sur 12                              |   count (aria-live)
 * | deepseek-flash   <- matched text <mark>
 * |   outils : oui · 1 048 576 tokens     |   optional secondary line
 * | Utiliser “xyz”                        |   allowCustom, last
 * ```
 *
 * Focus stays in the input; the highlighted option is `aria-activedescendant`.
 * Typing filters (case and accents ignored; matches value, label, group and
 * keywords). Arrow Up/Down move, Home/End jump, Enter selects, Escape closes
 * without changing anything, Tab leaves, a click outside closes.
 *
 * A value that is not among the options is kept and shown as typed.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'

export interface SearchableOption {
  value: string
  label: string
  /** Text of the closed field when this option is the value (default: label). */
  display?: string
  /** Secondary line under the label. */
  description?: string
  /** Heading the option is listed under (consecutive options share one). */
  group?: string
  /** Extra searchable text (not shown). */
  keywords?: string[]
  disabled?: boolean
}

export interface SearchableSelectProps {
  /** Id of the input: a `<label htmlFor>` points at it. */
  id?: string
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  /** Label of the empty choice (value ''), listed first. Omit for no such choice. */
  noneLabel?: string
  /** Offer « Utiliser “texte” » when the typed text is not an option. */
  allowCustom?: boolean
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  /** What the options are, for the count and the empty state. */
  noun?: { one: string; other: string }
  'aria-describedby'?: string
  'aria-label'?: string
  className?: string
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Folded text with, per folded char, the index of the original char it came from. */
function foldWithMap(s: string): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  Array.from(s).forEach((ch, i) => {
    const f = fold(ch)
    for (let k = 0; k < f.length; k++) map.push(i)
    text += f
  })
  return { text, map }
}

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const q = fold(query.trim())
  if (!q) return text
  const { text: folded, map } = foldWithMap(text)
  const at = folded.indexOf(q)
  if (at < 0) return text
  const chars = Array.from(text)
  const from = map[at]
  const to = map[at + q.length - 1] + 1
  return (
    <>
      {chars.slice(0, from).join('')}
      <mark className="rounded-sm bg-indigo-500/30 text-inherit">{chars.slice(from, to).join('')}</mark>
      {chars.slice(to).join('')}
    </>
  )
}

interface Row {
  key: string
  value: string
  label: string
  description?: string
  group?: string
  disabled?: boolean
  custom?: boolean
  current?: boolean
}

export function SearchableSelect({
  id,
  value,
  onChange,
  options,
  noneLabel,
  allowCustom,
  placeholder,
  disabled,
  loading,
  noun = { one: 'résultat', other: 'résultats' },
  className = '',
  'aria-describedby': describedBy,
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const auto = useId().replace(/:/g, '')
  const inputId = id ?? `ss-${auto}`
  const listId = `${inputId}-list`
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const selected = options.find((o) => o.value === value)
  const outside = value !== '' && !selected
  const closedText = selected
    ? (selected.display ?? selected.label)
    : outside
      ? value
      : value === '' && noneLabel
        ? noneLabel
        : ''

  const q = fold(query.trim())
  const rows = useMemo<Row[]>(() => {
    const hit = (o: SearchableOption) =>
      !q || fold([o.value, o.label, o.group ?? '', ...(o.keywords ?? [])].join('\n')).includes(q)
    const out: Row[] = []
    if (noneLabel !== undefined && (!q || fold(noneLabel).includes(q)))
      out.push({ key: 'none', value: '', label: noneLabel, current: value === '' })
    if (outside && !q)
      out.push({ key: 'outside', value, label: `${value} (hors liste, valeur actuelle)`, current: true })
    for (const o of options)
      if (hit(o))
        out.push({
          key: `o:${o.value}`,
          value: o.value,
          label: o.label,
          description: o.description,
          group: o.group,
          disabled: o.disabled,
          current: o.value === value,
        })
    const typed = query.trim()
    if (allowCustom && typed && !options.some((o) => fold(o.value) === q || fold(o.label) === q) && typed !== value)
      out.push({ key: 'custom', value: typed, label: `Utiliser “${typed}”`, custom: true })
    return out
  }, [options, q, query, noneLabel, allowCustom, outside, value])

  const matches = rows.filter((r) => !r.custom && r.key !== 'none' && r.key !== 'outside').length
  const total = options.length
  const nounFor = (n: number) => (n === 1 ? noun.one : noun.other)
  const count = loading && total === 0 ? '' : q ? `${matches} sur ${total}` : `${total} ${nounFor(total)}`
  const enabled = (i: number) => !!rows[i] && !rows[i].disabled

  const openList = () => {
    if (disabled || open) return
    setQuery('')
    const at = rows.findIndex((r) => r.current && !r.disabled)
    setActive(at >= 0 ? at : Math.max(0, rows.findIndex((r) => !r.disabled)))
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setQuery('')
  }
  const choose = (r: Row | undefined) => {
    if (!r || r.disabled) return
    onChange(r.value)
    close()
  }
  const move = (from: number, step: 1 | -1) => {
    for (let i = from + step; i >= 0 && i < rows.length; i += step) if (enabled(i)) return i
    return from
  }

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  // Keep the highlighted row inside the scrolled list.
  const activeId = open && rows[active] ? `${listId}-${active}` : undefined
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault()
        if (!open) return openList()
        const down = e.key === 'ArrowDown'
        // Wraps around, as the APG combobox does.
        setActive((a) => {
          const next = move(a, down ? 1 : -1)
          if (next !== a) return next
          return down ? move(-1, 1) : move(rows.length, -1)
        })
        return
      }
      case 'Home':
      case 'End':
        if (!open) return
        e.preventDefault()
        setActive(e.key === 'Home' ? move(-1, 1) : move(rows.length, -1))
        return
      case 'Enter':
        if (!open) return
        e.preventDefault()
        choose(rows[active])
        return
      case 'Escape':
        if (!open) return
        e.preventDefault()
        e.stopPropagation()
        close()
        return
      case 'Tab':
        if (open) close()
        return
    }
  }

  let lastGroup: string | undefined
  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      aria-busy={loading || undefined}
      onBlur={(e) => {
        if (open && !rootRef.current?.contains(e.relatedTarget as Node | null)) close()
      }}
    >
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={open ? closedText || placeholder : placeholder}
        value={open ? query : closedText}
        title={!open && closedText ? closedText : undefined}
        onClick={openList}
        onChange={(e) => {
          if (!open) setOpen(true)
          setQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        className="w-full truncate rounded-lg border border-border-default bg-surface-base py-2 pl-3 pr-9 text-base text-gray-100 placeholder-gray-500 input-focus-glow focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
      />
      {loading ? (
        <Loader2
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-500"
          aria-hidden="true"
        />
      ) : (
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      )}
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-xl">
          <div
            className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-1.5 text-xs text-gray-500"
            aria-live="polite"
          >
            <span>{count}</span>
            {loading && <span>Chargement…</span>}
          </div>
          <ul id={listId} role="listbox" aria-label="Choix" className="max-h-64 overflow-y-auto py-1">
            {rows.map((r, i) => {
              const heading = r.group && r.group !== lastGroup ? r.group : null
              lastGroup = r.group
              return [
                heading && (
                  <li
                    key={`g:${heading}:${i}`}
                    role="presentation"
                    className="px-3 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-gray-500"
                  >
                    {heading}
                  </li>
                ),
                <li
                  key={r.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={!!r.current}
                  aria-disabled={r.disabled || undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => !r.disabled && i !== active && setActive(i)}
                  onClick={() => choose(r)}
                  className={`flex min-w-0 items-start gap-2 px-3 py-1.5 text-sm ${
                    r.disabled ? 'cursor-not-allowed text-gray-600' : 'cursor-pointer text-gray-200'
                  } ${i === active && !r.disabled ? 'bg-white/[0.06]' : ''} ${r.custom ? 'border-t border-white/[0.06]' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">
                      {r.custom ? r.label : <Highlight text={r.label} query={query} />}
                    </span>
                    {r.description && (
                      <span className="block break-words text-xs text-gray-500">{r.description}</span>
                    )}
                  </span>
                  {r.current && <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" aria-hidden="true" />}
                </li>,
              ]
            })}
            {rows.length === 0 && (
              <li role="presentation" className="px-3 py-3 text-sm text-gray-500">
                {loading
                  ? 'Chargement…'
                  : q
                    ? `Aucun ${noun.one} ne correspond à « ${query.trim()} »`
                    : `Aucun ${noun.one}`}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
