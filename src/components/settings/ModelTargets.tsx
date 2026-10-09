/**
 * What a model-target picker says next to its list: the state of the live
 * catalog, and the vault unlock in place when a chosen instance needs it.
 * The list itself comes from `useModelTargets`.
 */
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'
import { vaultApi, type VaultOverview } from '@/services/vault'
import type { ProviderInstance } from '@/types/provider'
import { VaultUnlock } from '@/components/chat/VaultUnlock'
import { dependsOnVault, type CatalogState } from './useModelTargets'

// ---------------------------------------------------------------------------
// What the picker says about its list
// ---------------------------------------------------------------------------

/** "Offline list" when the live Claude catalog could not be read: text and icon, with a retry. */
export function CatalogStateNote({ state, onRetry }: { state: CatalogState; onRetry: () => void }) {
  const { t } = useT()
  if (state === 'live') return null
  if (state === 'loading') {
    return (
      <p className="text-xs text-gray-500" data-testid="catalog-loading">
        {t('routing.modelTargets.loading')}
      </p>
    )
  }
  return (
    <p role="note" data-testid="catalog-offline" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-200">
      <span className="inline-flex items-center gap-1.5">
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-medium">{t('routing.modelTargets.offline')}</strong> {t('routing.modelTargets.offlineHelp')}
        </span>
      </span>
      <Button size="sm" variant="ghost" onClick={onRetry} className="-my-1">
        {t('routing.modelTargets.retry')}
      </Button>
    </p>
  )
}

// ---------------------------------------------------------------------------
// The vault, in place
// ---------------------------------------------------------------------------

const isLocked = (o: VaultOverview | null) => !!o && o.initialized && !o.unavailable && !o.unlocked_until

/**
 * When a chosen target runs on an instance whose key sits in the vault and the
 * vault is locked: the unlock form, here. On success the caller re-reads what
 * depends on the vault (providers, catalogs).
 */
export function TargetVaultUnlock({
  providers,
  instances,
  onUnlocked,
}: {
  /** Ids of the instances currently chosen in the panel. */
  providers: readonly string[]
  instances: readonly ProviderInstance[]
  onUnlocked: () => void
}) {
  const { t } = useT()
  const dependent = instances.filter((p) => providers.includes(p.id) && dependsOnVault(p))
  const names = dependent.map((p) => p.label).join(', ')
  const wanted = dependent.length > 0
  const [overview, setOverview] = useState<VaultOverview | null>(null)
  useEffect(() => {
    if (!wanted) return
    let alive = true
    // Wrapped so a synchronous failure (no fetch in this environment) is still a rejection.
    Promise.resolve()
      .then(() => vaultApi.overview())
      .then(
        (o) => alive && setOverview(o),
        () => alive && setOverview(null)
      )
    return () => {
      alive = false
    }
  }, [wanted])
  if (!wanted || !isLocked(overview)) return null
  return (
    <div data-testid="target-vault-unlock" className="space-y-1.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2">
      <p className="text-xs text-gray-300">{t('routing.modelTargets.vaultNeeded', { providers: names })}</p>
      {/* VaultUnlock turns into its own "unlocked" status line: it stays mounted so the focus it takes is not lost. */}
      <VaultUnlock onUnlocked={onUnlocked} />
    </div>
  )
}
