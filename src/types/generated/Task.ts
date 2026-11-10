// Généré par `cargo xtask ts-dto --write`. Ne pas éditer.

export interface Task {
  id: string
  title: string | null
  description: string
  status: TaskStatus
  assigned_to: string | null
  interrupted_at?: string | null
  interrupted_reason?: string | null
  priority: number | null
  tags?: string[]
  acceptance_criteria?: string[]
  affected_files?: string[]
  estimated_complexity: number | null
  actual_complexity: number | null
  due_date: string | null
  estimated_minutes: number | null
  created_at: string
  updated_at: string | null
  started_at: string | null
  completed_at: string | null
  frustration_score?: number
  execution_context?: string | null
  persona?: string | null
  prompt_cache?: string | null
}
