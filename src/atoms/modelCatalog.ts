import { atom } from 'jotai'
import { AVAILABLE_MODELS, type ModelDefinition } from '@/constants/models'
import { chatApi } from '@/services'

/**
 * Live Claude model catalog — initialized with the static fallback list and
 * refreshed once per app load from the backend (`GET /chat/models`), which
 * itself merges Anthropic's Models API with local curation and caches
 * server-side for hours. See `fetchModelCatalog` below and
 * `backend/src/chat/model_catalog.rs`.
 *
 * Components should read this atom instead of importing `AVAILABLE_MODELS`
 * directly, so new/renamed models show up without a frontend release.
 */
export const modelCatalogAtom = atom<ModelDefinition[]>([...AVAILABLE_MODELS])

/**
 * Guards against overlapping calls only (not "already tried once") — the
 * fetch is meant to be retried after a failed attempt. In particular,
 * `/chat/models` is an authenticated route: during the setup wizard
 * (pre-login) it 401s and we silently keep the static fallback, then
 * `ModelCatalogLoader` retries once auth succeeds — see App.tsx.
 */
let fetchInFlight = false

/**
 * Fetch the live model catalog and update `modelCatalogAtom`. Safe to call
 * repeatedly (e.g. on app boot and again after login) — concurrent calls
 * are deduped, but a prior failure does not block a later retry. Silently
 * keeps the current (static or last-known) catalog on any error — offline,
 * unauthenticated, no Anthropic key configured, etc. — never throws.
 */
export function fetchModelCatalog(set: (models: ModelDefinition[]) => void) {
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
      // Backend unreachable, unauthenticated, or no Anthropic key
      // configured — keep whatever is already in the atom. Not worth
      // surfacing to the user; the model selector still works.
    })
    .finally(() => {
      fetchInFlight = false
    })
}
