import { useCallback, useEffect, useState } from 'react'
import { providersApi } from '@/services/providers'
import { wizardErrorMessage } from '@/constants/providerWizard'
import { useT } from '@/i18n'
import type { ProviderModel } from '@/types/provider'

/**
 * Model catalog of saved instances (`GET /chat/providers/{id}/models`), cached
 * for the session (module memory, never storage): the role, alias and policy
 * pickers of the same instance ask once. "Refresh" bypasses the cache.
 */
const cache = new Map<string, ProviderModel[]>()
const inFlight = new Map<string, Promise<ProviderModel[]>>()

/** Normalize an answer that may be `[{id,…}]` or `{ models: [...] }`. */
function toModels(raw: unknown): ProviderModel[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { models?: unknown })?.models)
      ? (raw as { models: unknown[] }).models
      : []
  return list.flatMap((m) => {
    if (typeof m === 'string') return [{ id: m }]
    if (m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string')
      return [m as ProviderModel]
    return []
  })
}

export function loadModelCatalog(providerId: string, force = false): Promise<ProviderModel[]> {
  if (!force && cache.has(providerId)) return Promise.resolve(cache.get(providerId)!)
  if (!force && inFlight.has(providerId)) return inFlight.get(providerId)!
  const p = Promise.resolve()
    .then(() => providersApi.models(providerId))
    .then((raw) => {
      const models = toModels(raw)
      cache.set(providerId, models)
      return models
    })
    .finally(() => inFlight.delete(providerId))
  inFlight.set(providerId, p)
  return p
}

/** Forget every cached catalog (tests, sign-out). */
export function clearModelCatalogCache(): void {
  cache.clear()
  inFlight.clear()
}

export interface ModelCatalog {
  models: ProviderModel[] | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/** Catalog of one saved instance; `enabled: false` loads nothing (on demand). */
export function useModelCatalog(
  providerId: string | null | undefined,
  enabled = true
): ModelCatalog {
  const { t } = useT()
  const cached = providerId ? (cache.get(providerId) ?? null) : null
  const [state, setState] = useState<{
    id: string | null
    models: ProviderModel[] | null
    loading: boolean
    error: string | null
  }>({
    id: providerId ?? null,
    models: cached,
    loading: false,
    error: null,
  })

  useEffect(() => {
    if (!providerId || !enabled) return
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag of an external fetch
    setState((s) => ({
      id: providerId,
      models: s.id === providerId ? s.models : (cache.get(providerId) ?? null),
      loading: true,
      error: null,
    }))
    loadModelCatalog(providerId)
      .then((models) => live && setState({ id: providerId, models, loading: false, error: null }))
      .catch(
        (err) =>
          live &&
          setState((s) => ({
            ...s,
            id: providerId,
            loading: false,
            error: wizardErrorMessage(err, t),
          }))
      )
    return () => {
      live = false
    }
  }, [providerId, enabled, t])

  const refresh = useCallback(() => {
    if (!providerId) return
    setState((s) => ({ ...s, id: providerId, loading: true, error: null }))
    loadModelCatalog(providerId, true)
      .then((models) => setState({ id: providerId, models, loading: false, error: null }))
      .catch((err) =>
        setState((s) => ({ ...s, id: providerId, loading: false, error: wizardErrorMessage(err, t) }))
      )
  }, [providerId, t])

  const sameId = state.id === (providerId ?? null)
  return {
    models: sameId ? state.models : cached,
    loading: sameId && state.loading,
    error: sameId ? state.error : null,
    refresh,
  }
}
