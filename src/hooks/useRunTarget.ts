import { useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { providersAtom, providersLoadStateAtom } from '@/atoms'
import { providersApi } from '@/services/providers'
import type { StartRunOptions } from '@/services/runner'
import type { ModelAlias, ProviderInstance, ProvidersResponse, ResolvedDefault } from '@/types/provider'
import type { ProviderRoutingMode } from '@/types/routing'
import { useEffectiveRoutingMode } from './useRoutingSettings'
import { useProviders } from './useProviders'

export interface RunTargetChoice {
  /** Instance id, or `null` = server default. */
  provider: string | null
  /** Model id or alias, or `null` = the instance's default. */
  model: string | null
}

export const SERVER_DEFAULT_TARGET: RunTargetChoice = { provider: null, model: null }

export interface RunTarget {
  /** False on a backend without provider routes or with a single instance: no control at all. */
  visible: boolean
  choice: RunTargetChoice
  setChoice: (choice: RunTargetChoice) => void
  /** The instance the run will use (the chosen one, else the server default). */
  instance: ProviderInstance | null
  providers: ProviderInstance[]
  /** Server default for THIS run's project. */
  resolved: ResolvedDefault | null
  aliases: readonly ModelAlias[] | undefined
  /** Routing mode in force for the project: `full` hides the picker, `mixed` makes "PO routes" the default row. */
  routingMode: ProviderRoutingMode
  /** Full routing on a multi-provider backend: no picker, a line says PO will choose. */
  poChooses: boolean
  /** Fields for `runnerApi.startRun`: only what was chosen. */
  options: StartRunOptions
}

/**
 * State of the "Provider / model" choice of a run launcher. Nothing chosen
 * stays nothing: `options` is empty and the run takes the server default.
 *
 * `projectSlug` is the project of the PLAN being launched: `allowed_for_project`
 * is an answer about one project, and the chat's selected project is another
 * one. Without it the list is the chat's, as before. The routing mode is read
 * for the same project; an explicit choice is always sent as chosen (explicit
 * levels are never overridden). While the project's own
 * answer loads, no consent is claimed either way (the server still refuses).
 */
export function useRunTarget(projectSlug?: string | null): RunTarget {
  const { providers: chatProviders, state } = useProviders()
  const chatTable = useAtomValue(providersAtom)
  const loadState = useAtomValue(providersLoadStateAtom)
  const [choice, setChoice] = useState<RunTargetChoice>(SERVER_DEFAULT_TARGET)
  const [scoped, setScoped] = useState<{ slug: string; table: ProvidersResponse } | null>(null)

  useEffect(() => {
    if (!projectSlug) return
    let live = true
    providersApi
      .list({ project_slug: projectSlug })
      .then((table) => {
        if (live) setScoped({ slug: projectSlug, table })
      })
      .catch(() => {
        /* keep the unscoped list: the server decides at launch */
      })
    return () => {
      live = false
    }
  }, [projectSlug])

  const own = projectSlug && scoped?.slug === projectSlug ? scoped.table : null
  const providers = useMemo<ProviderInstance[]>(() => {
    if (own) return own.providers
    if (!projectSlug) return chatProviders
    return chatProviders.map((p) => ({ ...p, allowed_for_project: undefined }))
  }, [own, projectSlug, chatProviders])
  const table = own ?? chatTable
  const resolved = table?.default ?? null

  const routingMode = useEffectiveRoutingMode(projectSlug)
  // In `full`, PO chooses everything: there is nothing left to pick.
  const several = (state === 'ready' || loadState === 'ready') && providers.length > 1
  const visible = several && routingMode !== 'full'
  const poChooses = several && routingMode === 'full'
  const instance = useMemo(() => {
    const id = choice.provider ?? resolved?.provider ?? null
    return providers.find((p) => p.id === id) ?? null
  }, [choice.provider, providers, resolved?.provider])

  const options = useMemo<StartRunOptions>(() => {
    // A hidden selector never leaks a stale choice into the request.
    if (!visible) return {}
    const o: StartRunOptions = {}
    if (choice.provider) o.provider = choice.provider
    if (choice.model) o.model = choice.model
    return o
  }, [visible, choice])

  return { visible, choice, setChoice, instance, providers, resolved, aliases: table?.aliases, routingMode, poChooses, options }
}
