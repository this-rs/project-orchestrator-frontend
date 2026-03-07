// ============================================================================
// Pattern Composer — Internal model types
// ============================================================================

import type {
  ComposeStateInline,
  ComposeTransitionInline,
  NoteStateBinding,
  RelevanceVector,
} from '@/types/intelligence'

/** Internal state node used on the FSM canvas */
export interface ComposerState extends ComposeStateInline {
  /** Canvas position (for @xyflow/react) */
  x: number
  y: number
}

/** Internal transition used on the FSM canvas */
export type ComposerTransition = ComposeTransitionInline

/** Note attached to a state */
export type ComposerNoteBinding = NoteStateBinding

/** Full composer model — serializable to ComposeProtocolRequest */
export interface ComposerModel {
  name: string
  description: string
  category: 'system' | 'business'
  states: ComposerState[]
  transitions: ComposerTransition[]
  notes: ComposerNoteBinding[]
  relevance_vector?: RelevanceVector
  triggers: { pattern_type: string; pattern_value: string; confidence_threshold?: number }[]
}

export function createEmptyModel(): ComposerModel {
  return {
    name: '',
    description: '',
    category: 'business',
    states: [],
    transitions: [],
    notes: [],
    triggers: [],
  }
}
