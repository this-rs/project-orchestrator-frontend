import { useEffect, useState } from 'react'
import { vaultApi, type VaultOverview } from '@/services/vault'

/**
 * True when the secrets vault exists but is locked. A provider whose credential
 * sits in the vault cannot run then: the target menu says so and unlocks in
 * place. Read each time `active` turns on (the menu opens).
 */
export function useVaultLocked(active: boolean): boolean {
  const [vault, setVault] = useState<VaultOverview | null>(null)
  useEffect(() => {
    if (!active) return
    let alive = true
    // Wrapped so a synchronous failure (no fetch in this environment) is still a rejection.
    Promise.resolve()
      .then(() => vaultApi.overview())
      .then(
        (o) => alive && setVault(o),
        () => alive && setVault(null),
      )
    return () => {
      alive = false
    }
  }, [active])
  return !!vault && vault.initialized && !vault.unavailable && !vault.unlocked_until
}
