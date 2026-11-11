// Généré par `cargo xtask ts-dto --write`. Ne pas éditer.

import type { ChangeType } from './ChangeType'

export interface NoteChange {
  timestamp: string
  change_type: ChangeType
  details: unknown | null
  actor: string
}
