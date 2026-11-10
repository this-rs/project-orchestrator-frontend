// Généré par `cargo xtask ts-dto --write`. Ne pas éditer.

import type { PlanStatus } from './PlanStatus'

export interface Plan {
  id: string
  title: string
  description: string
  status: PlanStatus
  created_at: string
  created_by: string
  priority: number
  project_id?: string | null
  execution_context?: string | null
  persona?: string | null
}
