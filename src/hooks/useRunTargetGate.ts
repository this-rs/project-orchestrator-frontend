import { useCallback, useState } from 'react'
import { useAtomValue } from 'jotai'
import { providersLoadStateAtom } from '@/atoms'
import { runnerApi, type StartRunOptions } from '@/services/runner'
import { useProviders } from './useProviders'

/** A one-click run launch waiting for its provider/model choice. */
export interface PendingRun {
  /** Project of the plan being launched: consent is checked for it. */
  projectSlug?: string | null
  /** What is launched, shown in the dialog. */
  title: string
  /**
   * Launch it. `unpriced` is true when the chosen instance has no price: a
   * caller that passes a USD budget must then drop it (it could never trigger).
   */
  run: (options: StartRunOptions, unpriced: boolean) => Promise<unknown> | void
}

/**
 * Gate in front of the run buttons that used to launch on the spot. With one
 * provider (or a backend without provider routes) `ask` runs at once, exactly
 * as before; with several it holds the launch until a provider/model is chosen.
 */
export function useRunTargetGate() {
  const { providers, state } = useProviders()
  const loadState = useAtomValue(providersLoadStateAtom)
  const needsChoice = (state === 'ready' || loadState === 'ready') && providers.length > 1
  const [pending, setPending] = useState<PendingRun | null>(null)

  const ask = useCallback(
    (request: PendingRun) => {
      if (!needsChoice) return request.run({}, false)
      setPending(request)
    },
    [needsChoice],
  )
  const cancel = useCallback(() => setPending(null), [])
  return { ask, pending, cancel }
}

/**
 * `runnerApi.startRun` with what the gate returned. Nothing chosen = the call
 * exactly as it was before the gate existed.
 */
export function launchRun(planId: string, cwd: string, projectSlug: string | undefined, options: StartRunOptions, maxCostUsd?: number) {
  if (Object.keys(options).length > 0) return runnerApi.startRun(planId, cwd, projectSlug, maxCostUsd, options)
  return maxCostUsd === undefined ? runnerApi.startRun(planId, cwd, projectSlug) : runnerApi.startRun(planId, cwd, projectSlug, maxCostUsd)
}
