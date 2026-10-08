import { useState, type SyntheticEvent } from 'react'
import { NOMENCLATURE, type ConceptExplain, type ConceptKey } from '@/constants/nomenclature'
import { focusRing } from './classes'

export interface ConceptIntroProps {
  /** A registry key (`'plans'`) — the text is read from `NOMENCLATURE[key].explain` — or the three lines themselves. */
  concept: ConceptKey | ConceptExplain
  /**
   * Where the open/closed choice is remembered (`localStorage`). A registry key remembers under
   * `po.intro.<key>` by itself; an inline `ConceptExplain` remembers only when a key is given here.
   */
  storageKey?: string
  className?: string
}

/** The question each line answers (website/AUDIENCE.md § 9 « Les quatre lignes de l'Explainer »). */
const LINES: readonly { key: keyof ConceptExplain; label: string }[] = [
  { key: 'what', label: 'What it is' },
  { key: 'why', label: 'What it is for' },
  { key: 'different', label: 'How it differs' },
]

const SUMMARY = 'What is this?'

/** `po.intro.<key>`: '1' = the person opened it and left it open; '0' = closed it; absent = never touched (closed). */
const introStorageKey = (key: string): string => `po.intro.${key}`

function readRemembered(key: string | undefined): boolean {
  if (!key) return false
  try {
    return window.localStorage.getItem(introStorageKey(key)) === '1'
  } catch {
    // localStorage unavailable (private mode, blocked storage, no window): closed, like the first visit
    return false
  }
}

function remember(key: string | undefined, open: boolean): void {
  if (!key) return
  try {
    window.localStorage.setItem(introStorageKey(key), open ? '1' : '0')
  } catch {
    // localStorage unavailable: the choice lives for this render only
  }
}

/**
 * The three sentences that introduce a screen to someone who discovers it — DESIGN.md § 5
 * « Explaining a concept », brought up from the site's `Explainer` (website/DESIGN.md § 6).
 *
 * - a `<details>` CLOSED by default under the page title: its reader comes back every day, the
 *   screen stays dense (the site keeps the same block always visible — that is the one difference);
 * - a plain-text `<summary>` (« What is this? »), no icon, no badge, no illustration;
 * - a `<dl>` of three labelled lines, one sentence each: What it is / What it is for / How it differs;
 * - the open state is remembered per concept in `localStorage` (`po.intro.<key>`), under try/catch:
 *   without storage the intro still renders and toggles, it just forgets;
 * - native semantics: `<summary>` is the disclosure button (`aria-expanded` comes from the browser).
 *
 * The text is never typed in a page: it comes from the registry (`NOMENCLATURE[key].explain`), or,
 * for a screen that is not a concept, from an inline `ConceptExplain` written with the same rules.
 *
 * @example <PageShell title={NOMENCLATURE.plans.plural} intro="plans">…</PageShell>
 */
export function ConceptIntro({ concept, storageKey, className = '' }: ConceptIntroProps) {
  const isKey = typeof concept === 'string'
  const explain: ConceptExplain = isKey ? NOMENCLATURE[concept].explain : concept
  const memoryKey = storageKey ?? (isKey ? concept : undefined)
  const [open, setOpen] = useState(() => readRemembered(memoryKey))

  const onToggle = (e: SyntheticEvent<HTMLDetailsElement>) => {
    const next = e.currentTarget.open
    setOpen(next)
    remember(memoryKey, next)
  }

  return (
    <details open={open} onToggle={onToggle} className={`group/intro text-sm ${className}`} data-concept-intro={isKey ? concept : undefined}>
      <summary
        className={`inline-flex min-h-9 cursor-pointer list-none items-center rounded text-gray-400 underline-offset-4 hover:text-gray-200 hover:underline group-open/intro:text-gray-200 [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        {SUMMARY}
      </summary>
      <dl className="mt-1 max-w-[var(--measure-md)] space-y-2 pb-1">
        {LINES.map(({ key, label }) => (
          <div key={key}>
            <dt className="text-[13px] leading-5 text-gray-400">{label}</dt>
            <dd className="text-sm leading-relaxed text-gray-200">{explain[key]}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
