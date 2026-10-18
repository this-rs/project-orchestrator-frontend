import { anchorsApi, AnchorConflictError, AnchorsUnavailableError, type AddAnchorInput } from '@/services/anchors'

/**
 * Places the anchors a person confirmed in « Demander ici » on the conversation
 * that was just opened, one after the other, each with the version of the set it
 * read (`If-Match`). Adding is additive and idempotent on the server: on a
 * conflict (the server or an assistant anchored something meanwhile) the CURRENT
 * version is taken from the 409 and the add tried once more — never a removal or
 * a role change made over someone else's.
 *
 * Resolves `true` when every anchor is in place, or when the server has no
 * anchors at all (the page then travelled as a reference of the message only).
 */
export async function placeAnchors(sessionId: string, anchors: readonly AddAnchorInput[]): Promise<boolean> {
  let version: number
  try {
    version = (await Promise.resolve().then(() => anchorsApi.list(sessionId))).version
  } catch (err) {
    return err instanceof AnchorsUnavailableError
  }
  let ok = true
  for (const input of anchors) {
    try {
      version = (await anchorsApi.add(sessionId, input, version)).version
    } catch (err) {
      if (err instanceof AnchorConflictError && err.current) {
        try {
          version = (await anchorsApi.add(sessionId, input, err.current.version)).version
          continue
        } catch {
          /* counted below */
        }
      }
      if (err instanceof AnchorsUnavailableError) return true
      ok = false
    }
  }
  return ok
}
