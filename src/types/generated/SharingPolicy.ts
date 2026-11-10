// Généré par `cargo xtask ts-dto --write`. Ne pas éditer.

export interface SharingPolicy {
  mode?: SharingMode
  type_overrides?: Record<string, SharingAction>
  l3_scan_enabled?: boolean
  min_shareability_score?: number
  enabled?: boolean
}
