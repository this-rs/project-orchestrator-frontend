// Généré par `cargo xtask ts-dto --write`. Ne pas éditer.

export interface AssertionRule {
  check_type: AssertionCheckType
  target: string
  file_pattern: string | null
  parameters: unknown | null
  on_violation?: ViolationAction
}
