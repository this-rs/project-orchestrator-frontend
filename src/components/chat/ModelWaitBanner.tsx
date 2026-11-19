/**
 * ModelWaitBanner — where the user looks (the composer) says that the turn is
 * waiting on a provider that did not answer: the harness is retrying it.
 *
 * Driven by `chatModelWaitAtom`, which only a LIVE `model_retry` notice of
 * severity `latency` sets (never a replayed one) and which `model_recovered`,
 * a result, an interrupt, every turn exit and every session reset clear.
 *
 * The sentence is built HERE from the notice's structured `data` (attempt / max /
 * delay), translated; the backend's `message` is the fallback when the detail
 * lacks its counters. Only the elapsed time is localised, reusing the
 * `session.vaultWait.seconds` / `.minutes` formatting.
 */
import { useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { Clock } from 'lucide-react'
import { chatModelWaitAtom } from '@/atoms'
import { useT } from '@/i18n'
import { modelWaitPhrase } from './modelWait'

interface ModelWaitBannerProps {
  /** The conversation this composer belongs to: another one's wait is not shown. */
  sessionId?: string | null
}

export function ModelWaitBanner({ sessionId }: ModelWaitBannerProps) {
  const { t } = useT()
  const wait = useAtomValue(chatModelWaitAtom)
  const [now, setNow] = useState(() => Date.now())
  const active = wait != null && (wait.sessionId ?? null) === (sessionId ?? null)

  // One tick a second, only while the wait is on screen.
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active, wait?.since])

  if (!wait || !active) return null
  const total = Math.max(0, Math.floor((now - wait.since) / 1000))
  const elapsed =
    total < 60
      ? t('session.vaultWait.seconds', { s: total })
      : t('session.vaultWait.minutes', { m: Math.floor(total / 60), s: total % 60 })
  const phrase = modelWaitPhrase(t, wait)

  return (
    <div
      data-testid="model-wait-banner"
      className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-100"
    >
      <div className="flex items-center gap-2">
        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <span role="status">{phrase}</span>
          <span className="opacity-70"> · {elapsed}</span>
        </span>
      </div>
    </div>
  )
}
