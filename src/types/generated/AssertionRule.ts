// Généré par `cargo xtask ts-dto --write`. Ne pas éditer.

import type { AssertionCheckType } from './AssertionCheckType'
import type { ViolationAction } from './ViolationAction'

export interface AssertionRule {
  check_type: AssertionCheckType
  target: string
  file_pattern: string | null
  parameters: unknown | null
  on_violation?: ViolationAction
}
