import { atom } from 'jotai'

/** Where a « exécute dans X ? » card stands. `expired` keeps the card to say why. */
export type ExecConfirmState = 'pending' | 'confirmed' | 'rejected' | 'expired'

export interface ExecConfirmRequest {
  placementId: string
  /** Asserted by the harness (event / 202), never editable, never from the model's text. */
  path: string
  taskId: string | null
  expiresAt: string | null
  state: ExecConfirmState
  /** Readable reason of a refusal (403 / 409 / 410 …). */
  error: string | null
}

/** Display state only; the consent itself lives on the server. Deduplicated by `placementId`. */
export const execConfirmRequestsAtom = atom<ExecConfirmRequest[]>([])
