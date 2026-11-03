import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Button, SkeletonLine } from '@/components/ui'
import { textLink } from '@/components/ui/classes'
import { decidesForEveryoneAtom } from '@/atoms'
import { useT } from '@/i18n'
import { selfCoreApi, type SelfCore } from '@/services/selfCore'
import { SelfCoreBudget, SelfCoreEntries } from '@/components/knowledge/SelfCoreEntries'
import { SELF_CORE_SETTINGS_PATH, isDeferred, selfCoreErrorMessage } from '@/components/knowledge/selfCoreShared'
import { PANEL } from './BandFrame'

/**
 * The permanent home of the self core on Today: what is declared (or what the
 * ranking puts there when nothing is), visible without a click. The popup
 * (`SelfCorePrompt`) is the question at load; this card is the place that stays.
 *
 * Everything shown comes from `GET /knowledge/self-core`; after a write the
 * endpoint is read again — it is the only source of truth. Reading is open, but
 * declaring is a HUMAN act (the global core is root-only): the button exists only
 * for whoever decides for everyone (`decidesForEveryoneAtom`, the same rule the
 * popup uses). A read failure hides the card (the settings panel is the authority).
 */
export function SelfCoreCard() {
  const { t } = useT()
  const canAnswer = useAtomValue(decidesForEveryoneAtom)
  const [core, setCore] = useState<SelfCore | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    selfCoreApi
      .read()
      .then((c) => {
        if (!live) return
        setCore(c)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [])

  const declare = async () => {
    if (!core) return
    setBusy(true)
    setError(null)
    try {
      await selfCoreApi.pin(core.candidates.map((n) => n.id))
      // Re-read: never show a stale copy, the endpoint is the only truth.
      const c = await selfCoreApi.read()
      setCore(c)
    } catch (err) {
      setError(selfCoreErrorMessage(err, t, 'selfCore.error.write'))
    } finally {
      setBusy(false)
    }
  }

  // Unreadable: nothing honest to show, the settings panel is the authority.
  if (failed) return null

  const declared = (core?.pinned.length ?? 0) > 0
  const notes = core ? (declared ? core.pinned : core.candidates) : []
  const tooMany = !!core && notes.length > core.max_notes

  return (
    <section aria-label={t('selfCore.title')} data-testid="self-core-card" className={`min-w-0 ${PANEL}`}>
      <h2 className="text-base font-semibold tracking-tight text-gray-100">{t('selfCore.title')}</h2>

      {!core ? (
        <div role="status" className="mt-2">
          <SkeletonLine width="70%" className="h-3.5" />
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <SelfCoreBudget core={core} notes={notes} />

          {notes.length === 0 ? (
            <p className="text-sm text-gray-400">{t('selfCore.empty')}</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">
                {declared ? t('selfCore.declaredHeading') : t('selfCore.proposalHeading')}
              </p>
              {!declared && <p className="text-xs text-gray-500">{t('selfCore.proposalHint')}</p>}
              <SelfCoreEntries core={core} notes={notes} />
            </div>
          )}

          {tooMany && <p className="text-xs text-amber-300">{t('selfCore.tooMany', { count: core.max_notes })}</p>}
          {error && (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {!declared &&
              (canAnswer ? (
                <Button
                  size="sm"
                  variant="primary"
                  data-testid="self-core-card-pin"
                  loading={busy}
                  disabled={busy || tooMany}
                  onClick={declare}
                >
                  {t('selfCore.declare')}
                </Button>
              ) : (
                <p className="text-xs text-gray-400">{t('selfCore.error.humanOnly')}</p>
              ))}
            <Link data-testid="self-core-card-settings" to={SELF_CORE_SETTINGS_PATH} className={textLink}>
              {t('selfCore.card.settings')}
            </Link>
          </div>

          {isDeferred() && <p className="text-xs text-gray-500">{t('selfCore.laterNote')}</p>}
        </div>
      )}
    </section>
  )
}
