import { useCallback, useEffect, useState } from 'react'
import { ApiError, apiErrorMessage } from '@/services/api'
import { routingApi } from '@/services/routing'
import type { ProviderRoutingMode, RoutingSettings, RoutingSettingsResponse } from '@/types/routing'

export interface RoutingSettingsState {
  /** The settings in force (`scope` says which level answered); `null` until loaded or when unavailable. */
  settings: RoutingSettingsResponse | null
  loading: boolean
  /** A readable load error; `null` when none. */
  error: string | null
  /** The backend has no cognitive router (404): nothing to configure. */
  unavailable: boolean
  reload: () => void
  /** PUT the settings (global, or the project's override) and keep the answer. Throws on a refusal. */
  save: (settings: RoutingSettings) => Promise<RoutingSettingsResponse>
  /** DELETE the project override, then read the settings again. No-op without a project. */
  removeOverride: () => Promise<void>
}

interface Loaded {
  key: string
  settings: RoutingSettingsResponse | null
  error: string | null
  unavailable: boolean
}

/**
 * The routing settings of the whole server (`slug` null) or of one project
 * (its override when it has one, else the global settings — `scope` tells).
 */
export function useRoutingSettings(slug: string | null): RoutingSettingsState {
  const key = slug ?? ''
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    const request = slug ? routingApi.getProject(slug) : routingApi.get()
    request
      .then((settings) => live && setLoaded({ key, settings, error: null, unavailable: false }))
      .catch((err) => {
        if (!live) return
        const unavailable = err instanceof ApiError && err.status === 404
        setLoaded({ key, settings: null, error: unavailable ? null : apiErrorMessage(err, ''), unavailable })
      })
    return () => {
      live = false
    }
  }, [slug, key, tick])

  const current = loaded && loaded.key === key ? loaded : null

  const save = useCallback(
    async (settings: RoutingSettings) => {
      const saved = slug ? await routingApi.putProject(slug, settings) : await routingApi.put(settings)
      setLoaded({ key, settings: saved, error: null, unavailable: false })
      return saved
    },
    [slug, key],
  )

  const removeOverride = useCallback(async () => {
    if (!slug) return
    await routingApi.deleteProject(slug)
    setTick((n) => n + 1)
  }, [slug])

  return {
    settings: current?.settings ?? null,
    loading: current === null,
    error: current?.error || null,
    unavailable: current?.unavailable ?? false,
    reload: () => {
      setLoaded(null)
      setTick((n) => n + 1)
    },
    save,
    removeOverride,
  }
}

/**
 * The routing mode in force for a project (global when none). `primary` — the
 * identity behaviour — while loading and on any failure, so a launcher never
 * hides its picker on a guess.
 */
export function useEffectiveRoutingMode(slug?: string | null): ProviderRoutingMode {
  const [answer, setAnswer] = useState<{ key: string; mode: ProviderRoutingMode } | null>(null)
  const key = slug ?? ''
  useEffect(() => {
    let live = true
    const request = slug ? routingApi.getProject(slug) : routingApi.get()
    request
      .then((s) => live && setAnswer({ key, mode: s.mode }))
      .catch(() => live && setAnswer({ key, mode: 'primary' }))
    return () => {
      live = false
    }
  }, [slug, key])
  return answer && answer.key === key ? answer.mode : 'primary'
}
