import { api, buildQuery } from './api'

/**
 * The declared core of the self — the notes a person pins as the foundation of
 * every turn (`(:Agent)-[:KNOWS]->(:Note)`, "Foundational Notes" in the prompt).
 *
 * Reading is open; writing is a HUMAN act: an agent session gets 403
 * `pinned_notes_human_only`, and the global scope is root-only. Errors are left
 * to the caller (see `selfCoreErrorKey`), never retried here.
 */

/** One note of the foundation, with what the prompt REALLY carries of it. */
export interface SelfCoreNote {
  id: string
  note_type: string
  importance: string
  /** Characters of the note as written. */
  chars: number
  /** The exact line the prompt carries (already flattened and capped): render verbatim. */
  entry: string
  /** Whether that line fits in the budget, in this order. */
  lands: boolean
}

export interface SelfCore {
  scope: string
  level: number
  budget_chars: number
  note_char_cap: number
  max_notes: number
  pinned: SelfCoreNote[]
  /** Non-empty only when nothing is declared: what the ranking puts there today. */
  candidates: SelfCoreNote[]
  slots_used: number
}

export interface PinnedNotes {
  scope: string
  note_ids: string[]
}

export const selfCoreApi = {
  /** Without `project`, the server answers for the strictest level. */
  read: (project?: string) => api.get<SelfCore>(`/knowledge/self-core${buildQuery({ project })}`),
  /** Replaces the declaration (order kept). Omit `project` for the global scope. */
  pin: (ids: string[], project?: string) =>
    api.put<PinnedNotes>(`/knowledge/pinned-notes${buildQuery({ project })}`, { note_ids: ids }),
}
