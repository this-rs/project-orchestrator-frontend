import { useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { providersAtom, providersLoadStateAtom } from '@/atoms'
import type { StartRunOptions } from '@/services/runner'
import type { ProviderInstance } from '@/types/provider'
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
  /** Fields for `runnerApi.startRun`: only what was chosen. */
  options: StartRunOptions
}

/**
 * State of the "Provider / model" choice of a run launcher. Nothing chosen
 * stays nothing: `options` is empty and the run takes the server default.
 */
export function useRunTarget(): RunTarget {
  const { providers, state } = useProviders()
  const resolved = useAtomValue(providersAtom)?.default ?? null
  const loadState = useAtomValue(providersLoadStateAtom)
  const [choice, setChoice] = useState<RunTargetChoice>(SERVER_DEFAULT_TARGET)

  const visible = (state === 'ready' || loadState === 'ready') && providers.length > 1
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

  return { visible, choice, setChoice, instance, providers, options }
}
