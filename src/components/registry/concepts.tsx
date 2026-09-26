/**
 * Shared building blocks for the Skills & Personas pages: plain-language
 * explanations (skills and personas are abstract concepts — the user wants
 * them explained), qualitative levels for 0–1 metrics, and an explained
 * metric list.
 *
 * These compose `@/components/ui` primitives locally; candidates for
 * promotion to the design system (`Facts` with a `hint` line, `ConceptNote`).
 */
import { useId, useState, type ReactNode } from 'react'
import { Lightbulb } from 'lucide-react'
import { Meter, TONE_CLASSES, hitArea, textLink } from '@/components/ui'
import type { Level } from './metrics'

// ── ConceptNote ─────────────────────────────────────────────────────────

interface ConceptNoteProps {
  /** One-line summary, always visible. */
  summary: ReactNode
  /** Extra paragraphs revealed by "En savoir plus". */
  children?: ReactNode
  defaultOpen?: boolean
  className?: string
}

/**
 * Compact "what am I looking at?" block: one visible line + expandable
 * details. Tap-friendly (text toggle with enlarged hit area), no hover.
 */
export function ConceptNote({ summary, children, defaultOpen = false, className = '' }: ConceptNoteProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <aside className={`flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 ${className}`}>
      <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-xs leading-5 text-gray-400">
        <p className="text-gray-300">{summary}</p>
        {children && open && (
          <div id={id} className="mt-1.5 space-y-1.5">
            {children}
          </div>
        )}
        {children && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={open ? id : undefined}
            className={`${hitArea} ${textLink} mt-1 text-xs`}
          >
            {open ? 'Réduire' : 'En savoir plus'}
          </button>
        )}
      </div>
    </aside>
  )
}

// ── MetricList ──────────────────────────────────────────────────────────

export interface MetricItem {
  label: string
  /** Main value (`82%`, `12`, `3m`). */
  value: ReactNode
  /** Qualitative level shown after the value, in its tone colour. */
  level?: Level
  /** 0–1 → thin static meter under the value line. */
  ratio?: number
  /** One-line plain-language explanation. */
  hint: string
  hidden?: boolean
}

/**
 * Explained metrics: `label ··· value · Level` then a one-line explanation,
 * optional thin meter. One per line on phones and tablets (the sidebar
 * appears at `md`, leaving ~520px of content at 820px), 2 columns from `lg`.
 */
export function MetricList({ items, className = '' }: { items: MetricItem[]; className?: string }) {
  const visible = items.filter((i) => !i.hidden)
  if (visible.length === 0) return null
  return (
    <div className={`rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden ${className}`}>
      {/* -mb-px: the last row's bottom border is clipped by the container */}
      <dl className="grid grid-cols-1 lg:grid-cols-2 -mb-px">
        {visible.map((m) => (
          <div
            key={m.label}
            className="min-w-0 grid grid-cols-[1fr_auto] items-baseline gap-x-3 px-3 py-2.5 border-b border-white/[0.05] lg:odd:border-r"
          >
            <dt className="min-w-0 text-sm text-gray-300">{m.label}</dt>
            <dd className="text-sm tabular-nums text-gray-100 text-right">
              {m.value}
              {m.level && <span className={`ml-1.5 text-xs ${TONE_CLASSES[m.level.tone].text}`}>{m.level.label}</span>}
            </dd>
            <dd className="col-span-2 min-w-0">
              {m.ratio !== undefined && <Meter size="bar" value={m.ratio} tone={m.level?.tone ?? 'progress'} className="mt-1.5" />}
              <p className="mt-1 text-xs leading-4 text-gray-500">{m.hint}</p>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ── Tags ────────────────────────────────────────────────────────────────

/** Subtle outline chips — detail pages only (DESIGN §4). */
export function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((t) => (
        <li key={t} className="rounded border border-white/[0.08] px-1.5 text-[11px] leading-5 text-gray-400 break-all">
          {t}
        </li>
      ))}
    </ul>
  )
}
