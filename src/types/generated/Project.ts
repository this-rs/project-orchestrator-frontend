// Généré par `cargo xtask ts-dto --write`. Ne pas éditer.

import type { ProjectProfile } from './ProjectProfile'
import type { SharingPolicy } from './SharingPolicy'

export interface Project {
  id: string
  name: string
  slug: string
  root_path: string
  description: string | null
  created_at: string
  last_synced: string | null
  analytics_computed_at: string | null
  last_co_change_computed_at?: string | null
  default_note_energy?: number | null
  scaffolding_override?: number | null
  sharing_policy?: SharingPolicy | null
  watch_enabled?: boolean
  profile?: ProjectProfile
}
