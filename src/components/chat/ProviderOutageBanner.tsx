/**
 * The live banner of a provider INTERRUPTION, above the composer.
 *
 * Shown while an instance is out of service, gone the moment it answers again.
 * It is fed by the persisted `provider_outage` events of the conversation
 * (`openOutages`), not by a local flag: a tab reloaded during an outage still
 * shows it, the `up` retires it, and a conversation whose `up` was never written
 * keeps it — because the instance really is still down.
 *
 * The interruption is the provider's, not the reader's: the running turn is held
 * and resumes on its own, so the banner says that in words rather than offering
 * an action that would be a lie.
 */
import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { CloudOff } from 'lucide-react'
import { providersAtom } from '@/atoms'
import { useT } from '@/i18n'
import { openOutages } from '@/components/timeline'
import { providerDisplayName } from '@/types/provider'
import type { ChatMessage } from '@/types'

/** The label of a provider instance, as the provider list names it (the id itself otherwise). */
function useProviderLabel(): (id: string) => string {
  const list = useAtomValue(providersAtom)
  return (id) => {
    const instance = list?.providers.find((p) => p.id === id)
    return instance ? providerDisplayName(instance) : id
  }
}

export function ProviderOutageBanner({ messages }: { messages: ReadonlyArray<ChatMessage> }) {
  const { t } = useT()
  const label = useProviderLabel()
  const open = useMemo(() => openOutages(messages), [messages])
  if (open.length === 0) return null

  const first = open[0]
  const provider = label(first.providerId)
  const others = open.length - 1
  const failures = first.failures > 0 ? t('app.chat.providerOutage.failures', { n: first.failures }) : null

  return (
    <div
      role="alert"
      data-testid="provider-outage-banner"
      data-phase="down"
      data-provider={first.providerId}
      className="mx-3 mb-1 flex items-start gap-2 rounded-md border border-rose-400/30 bg-rose-500/[0.08] px-3 py-2 text-xs text-rose-100"
    >
      <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium">{t('app.chat.providerOutage.down', { provider })}</p>
        <p className="text-rose-200/80">{t('app.chat.providerOutage.banner')}</p>
        {(failures || others > 0) && (
          <p className="text-rose-200/70">
            {[failures, others > 0 ? t('app.chat.providerOutage.alsoDown', { n: others }) : null].filter(Boolean).join(' · ')}
          </p>
        )}
        {first.cause && <p className="break-words text-rose-200/60">{first.cause}</p>}
      </div>
    </div>
  )
}
