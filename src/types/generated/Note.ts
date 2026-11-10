// Généré par `cargo xtask ts-dto --write`. Ne pas éditer.

export interface Note {
  id: string
  project_id: string | null
  note_type: NoteType
  status: NoteStatus
  importance: NoteImportance
  scope: unknown
  content: string
  tags?: string[]
  anchors?: NoteAnchor[]
  created_at: string
  created_by: string
  author_kind?: NoteAuthorKind
  confidence?: number | null
  human_confirmed_at?: string | null
  human_confirmed_by?: string | null
  last_confirmed_at: string | null
  last_confirmed_by: string | null
  staleness_score?: number
  energy?: number
  last_activated: string | null
  reactivation_count?: number
  last_reactivated: string | null
  freshness_pinged_at: string | null
  activation_count?: number
  scar_intensity?: number
  memory_horizon?: MemoryHorizon
  supersedes: string | null
  superseded_by: string | null
  changes?: NoteChange[]
  assertion_rule: AssertionRule | null
  last_assertion_result: AssertionResult | null
  revision_reason?: string | null
  valid_from?: string | null
  valid_until?: string | null
  revision?: NoteRevision | null
  sharing_consent?: SharingConsent
}
