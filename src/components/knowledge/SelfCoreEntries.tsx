/** The budget and the entries, as the self-core panel and prompt both show them. */
import type { ReactNode } from 'react'
import { ToneText } from '@/components/ui'
import { useT } from '@/i18n'
import type { SelfCore, SelfCoreNote } from '@/services/selfCore'

/** The two numbers that make the decision possible, as the server gave them. */
export function SelfCoreBudget({ core, notes }: { core: SelfCore; notes: SelfCoreNote[] }) {
  const { t } = useT()
  return (
    <div className="space-y-1 text-sm text-gray-300" data-testid="self-core-budget">
      <p>{t('selfCore.budget', { level: core.level, budget: core.budget_chars, cap: core.note_char_cap })}</p>
      {notes.length > 0 && (
        <p className="tabular-nums">{t('selfCore.lands', { count: core.slots_used, total: notes.length })}</p>
      )}
    </div>
  )
}

/** The notes in order, each with its real size and the EXACT line the prompt carries. */
export function SelfCoreEntries({
  core,
  notes,
  renderAction,
}: {
  core: SelfCore
  notes: SelfCoreNote[]
  renderAction?: (note: SelfCoreNote, index: number) => ReactNode
}) {
  const { t } = useT()
  return (
    <ol className="divide-y divide-white/[0.05]" aria-label={t('selfCore.quoteLabel')}>
      {notes.map((n, i) => (
        <li key={n.id} data-testid={`self-core-entry-${i}`} data-lands={n.lands} className="space-y-1 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] leading-4 text-gray-500 tabular-nums">
              {t('selfCore.noteMeta', { n: i + 1, type: n.note_type, importance: n.importance, chars: n.chars })}
              {n.chars > core.note_char_cap && ` · ${t('selfCore.cut', { cap: core.note_char_cap })}`}
            </p>
            {renderAction?.(n, i)}
          </div>
          <blockquote
            className={`overflow-x-auto whitespace-pre-wrap break-words border-l-2 pl-3 font-mono text-xs ${
              n.lands ? 'border-white/10 text-gray-300' : 'border-amber-400/40 text-gray-500'
            }`}
          >
            {n.entry}
          </blockquote>
          {!n.lands && (
            <ToneText tone="warning" icon label={t('selfCore.landsNo')} className="text-xs" />
          )}
        </li>
      ))}
    </ol>
  )
}
