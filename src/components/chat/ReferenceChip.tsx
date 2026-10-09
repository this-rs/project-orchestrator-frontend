import { refName } from '@/refs/refState'
import { displayState, type ChatReference } from '@/refs/types'
import { RefChip } from './RefChip'

interface ReferenceChipProps {
  reference: ChatReference
  /** Composer only: draws a remove button. The bubble's chips are read-only. */
  onRemove?: (reference: ChatReference) => void
  /** A draft in the composer: nobody resolved it yet, and saying "resolving" would be false. */
  draft?: boolean
}

/**
 * A reference the user attached, in the composer or the bubble: always the
 * `full` chip — kind icon, name, and, when the server could not read it in
 * full, the state in words with its own icon.
 */
export function ReferenceChip({ reference, onRemove, draft }: ReferenceChipProps) {
  const name = refName(reference)
  return (
    <RefChip
      testId="reference-chip"
      density="full"
      kind={reference.kind}
      name={name}
      state={draft ? 'ok' : displayState(reference)}
      title={reference.subtitle ? `${name} — ${reference.subtitle}` : name}
      onRemove={onRemove ? () => onRemove(reference) : undefined}
    />
  )
}
