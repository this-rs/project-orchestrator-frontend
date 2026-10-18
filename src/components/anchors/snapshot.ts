/**
 * The snapshot « Demander ici » sends about the page: an ALLOW-LIST of fields
 * (type, id, name), the name cleaned and stripped of anything that looks like a
 * secret. The palette shows this exact object before it leaves; the server
 * treats it as unverified and re-reads the entity.
 */
import { isAnchorTargetType, type AddAnchorInput, type AnchorTargetType } from '@/services/anchors'

/** Longest name sent, in characters (code points). */
export const SNAPSHOT_NAME_MAX = 120

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // API keys (sk-…, sk-ant-…)
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\b[A-Za-z0-9+/_-]{40,}={0,2}/g, // long opaque runs (base64, hex)
]

export interface CleanText {
  text: string
  redacted: boolean
}

export function cleanSnapshotText(raw: string, mask: string): CleanText {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  let text = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  let redacted = false
  for (const re of SECRET_PATTERNS) {
    text = text.replace(re, () => {
      redacted = true
      return mask
    })
  }
  const chars = Array.from(text)
  if (chars.length > SNAPSHOT_NAME_MAX) text = `${chars.slice(0, SNAPSHOT_NAME_MAX - 1).join('')}…`
  return { text, redacted }
}

export interface SnapshotPreview {
  /** The exact body of the anchor request (null when the kind cannot be anchored). */
  anchor: AddAnchorInput | null
  redacted: boolean
}

/** The anchor request for one entity of the page, focus by default. */
export function buildSnapshot(entity: { kind: string; id: string; label?: string }, mask: string): SnapshotPreview {
  if (!isAnchorTargetType(entity.kind)) return { anchor: null, redacted: false }
  const name = entity.label ? cleanSnapshotText(entity.label, mask) : null
  const anchor: AddAnchorInput = {
    target_type: entity.kind as AnchorTargetType,
    target_id: entity.id,
    roles: ['focus'],
    ...(name && name.text ? { snapshot_name: name.text } : {}),
  }
  return { anchor, redacted: !!name?.redacted }
}
