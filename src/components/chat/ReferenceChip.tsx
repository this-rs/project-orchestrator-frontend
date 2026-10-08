import { AlertTriangle, Scissors, X } from 'lucide-react'
import { refKindDef } from '@/refs/registry'
import { refName } from '@/refs/refState'
import { displayState, type ChatReference, type RefDisplayState } from '@/refs/types'

/**
 * Words that carry the state next to the icon: a state is never told by
 * colour alone. `forbidden` and `not_found` are one state on purpose — the
 * server never lets a client tell them apart, so neither does the chip.
 */
const STATE_TEXT: Record<RefDisplayState, string> = {
  pending: 'resolving',
  ok: '',
  truncated: 'truncated',
  unavailable: 'unavailable',
}

const STATE_CLASS: Record<RefDisplayState, string> = {
  pending: 'border-white/[0.08] bg-white/[0.04] text-slate-300',
  ok: 'border-indigo-400/30 bg-indigo-500/10 text-slate-100',
  truncated: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  unavailable: 'border-red-400/40 bg-red-500/10 text-red-200',
}

interface ReferenceChipProps {
  reference: ChatReference
  /** Composer only: draws a remove button. The bubble's chips are read-only. */
  onRemove?: (reference: ChatReference) => void
  /** A draft in the composer: nobody resolved it yet, and saying "resolving" would be false. */
  draft?: boolean
}

/**
 * A reference as a chip: kind icon, name, and — when the server could not
 * read it in full — the state in words with its own icon.
 */
export function ReferenceChip({ reference, onRemove, draft }: ReferenceChipProps) {
  const def = refKindDef(reference.kind)
  const state = draft ? 'ok' : displayState(reference)
  const name = refName(reference)
  const stateText = STATE_TEXT[state]
  const Icon = state === 'unavailable' ? AlertTriangle : state === 'truncated' ? Scissors : def.Icon
  return (
    <span
      data-testid="reference-chip"
      data-kind={reference.kind}
      data-state={state}
      title={reference.subtitle ? `${name} — ${reference.subtitle}` : name}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-xs ${STATE_CLASS[state]}`}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="sr-only">{def.name}: </span>
      <span className={`truncate max-w-[14rem] ${state === 'unavailable' ? 'line-through' : ''}`}>{name}</span>
      {stateText && <span className="shrink-0 text-slate-400">({stateText})</span>}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(reference)}
          aria-label={`Remove ${def.name} ${name}`}
          className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  )
}
