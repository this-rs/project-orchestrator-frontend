import { atom } from 'jotai'
import type { ModelDefinition } from '@/constants/models'
import { chatApi } from '@/services'

/**
 * Live Claude model catalog — the single source of truth for which models are
 * selectable. Served by the backend (`GET /chat/models`), which merges
 * Anthropic's Models API with local curation and caches server-side for
 * hours. See `backend/src/chat/model_catalog.rs`.
 *
 * Starts EMPTY on purpose. There is deliberately no hardcoded frontend copy of
 * the catalog any more: a second curated list is a second thing to keep in
 * sync, and the two had already drifted. Consumers must handle the empty state
 * (see `modelCatalogLoadedAtom`) rather than assume a seed.
 */
export const modelCatalogAtom = atom<ModelDefinition[]>([])

/**
 * Whether a catalog fetch has settled (successfully or not). Lets the UI tell
 * "still loading" apart from "loaded, and genuinely empty".
 */
export const modelCatalogLoadedAtom = atom(false)

/**
 * Guards against overlapping calls only (not "already tried once") — the fetch
 * is meant to be retried after a failed attempt.
 */
let fetchInFlight = false

/**
 * Fetch the live model catalog and update `modelCatalogAtom`. Safe to call
 * repeatedly — concurrent calls are deduped, but a prior failure does not
 * block a later retry. Never throws.
 */
export function fetchModelCatalog(
  set: (models: ModelDefinition[]) => void,
  setLoaded?: (loaded: boolean) => void,
) {
  if (fetchInFlight) return
  fetchInFlight = true

  chatApi
    .getModelCatalog()
    .then((models) => {
      if (Array.isArray(models) && models.length > 0) {
        set(models)
      }
    })
    .catch(() => {
      // Backend unreachable, or no Anthropic key configured. The route is
      // public, so this is a genuine outage rather than an auth problem, and
      // there is nothing useful to tell the user here.
    })
    .finally(() => {
      fetchInFlight = false
      setLoaded?.(true)
    })
}
