// Généré par `cargo xtask ts-dto --write`. Ne pas éditer.

export interface NoteAnchor {
  entity_type: EntityType
  entity_id: string
  signature_hash: string | null
  body_hash: string | null
  last_verified: string
  is_valid?: boolean
}
