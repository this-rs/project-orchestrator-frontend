import { atomWithStorage } from 'jotai/utils'
import type { CostBasis } from '@/types/provider'

/**
 * A provider the setup wizard chose (Codex, or another OpenAI-compatible endpoint).
 *
 * The configuration file cannot hold it (the provider store is written by the API),
 * and the API is not up while the wizard runs. So the choice waits here until the
 * app has restarted and a person is logged in, then `PendingSetupProvider` creates it.
 * Never a secret: `credential_ref` is a reference (`vault:<name>`), never a value.
 */
export interface PendingSetupProvider {
  id: string
  kind: 'codex' | 'openai_compatible'
  preset: string | null
  label: string
  base_url: string
  default_model: string
  cost_source: CostBasis
  credential_ref: string
}

const KEY = 'po.setup.pendingProvider'

/**
 * Storage that never throws: a webview that blocks storage means "nothing pending",
 * which is the same as a fresh install.
 */
const safeStorage = {
  getItem: (key: string, initial: PendingSetupProvider | null): PendingSetupProvider | null => {
    try {
      const raw = globalThis.localStorage?.getItem(key)
      return raw ? (JSON.parse(raw) as PendingSetupProvider) : initial
    } catch {
      return initial
    }
  },
  setItem: (key: string, value: PendingSetupProvider | null): void => {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value))
    } catch {
      /* storage blocked: the choice is kept in memory for this session only */
    }
  },
  removeItem: (key: string): void => {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      /* nothing to remove */
    }
  },
}

export const pendingSetupProviderAtom = atomWithStorage<PendingSetupProvider | null>(KEY, null, safeStorage, {
  getOnInit: true,
})
