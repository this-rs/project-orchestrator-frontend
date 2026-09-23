import { useCallback } from 'react'
import { useSetAtom } from 'jotai'
import { modelCatalogAtom, modelCatalogLoadedAtom, fetchModelCatalog } from '@/atoms'
import { useEventBus } from './useEventBus'
import { useToast } from './useToast'
import type { CrudEvent } from '@/types'

/** Must match `MODEL_ADDED_ALERT` in backend/src/chat/model_catalog.rs. */
const MODEL_ADDED_ALERT = 'model_added'

/**
 * Announces a newly released Claude model.
 *
 * The backend refreshes its catalog from Anthropic's Models API on a long TTL
 * (12h) in the background. When that refresh turns up a model it has never
 * recorded before, it persists an `Alert` and broadcasts a project-less CRUD
 * event on `/ws/events`. This hook turns that into a toast and pulls the fresh
 * catalog so the selector updates without a reload.
 *
 * Mount once, app-wide, alongside `useCrudEventRefresh`.
 */
export function useModelCatalogEvents() {
  const setModels = useSetAtom(modelCatalogAtom)
  const setLoaded = useSetAtom(modelCatalogLoadedAtom)
  const toast = useToast()

  const handleEvent = useCallback(
    (event: CrudEvent) => {
      if (event.entity_type !== 'alert' || event.action !== 'created') return
      if (event.payload?.alert_type !== MODEL_ADDED_ALERT) return

      const label =
        typeof event.payload.full_label === 'string' && event.payload.full_label
          ? event.payload.full_label
          : typeof event.payload.model_id === 'string'
            ? event.payload.model_id
            : 'A new model'

      toast.info(`${label} is now available`)
      // The catalog the backend just refreshed is the one we want; refetch
      // rather than splicing the payload in, so ordering and curation stay
      // the backend's call.
      fetchModelCatalog(setModels, setLoaded)
    },
    [toast, setModels, setLoaded],
  )

  useEventBus(handleEvent)
}
