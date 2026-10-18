import type { PermissionConsent } from '@/types'

/** A `permission_request.consent` as the backend sends it, or `null` when absent or malformed. */
export function permissionConsentOf(value: unknown): PermissionConsent | null {
  if (typeof value !== 'object' || value === null) return null
  const { subject, destinations } = value as { subject?: unknown; destinations?: unknown }
  if (typeof subject !== 'string' || subject === '') return null
  if (!Array.isArray(destinations) || !destinations.every((d) => typeof d === 'string' && d !== '')) return null
  return { subject, destinations: [...destinations] }
}
