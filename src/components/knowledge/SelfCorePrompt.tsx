import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Button, Dialog } from '@/components/ui'
import { decidesForEveryoneAtom } from '@/atoms'
import { useT } from '@/i18n'
import { selfCoreApi, type SelfCore } from '@/services/selfCore'
import { ErrorLine } from '@/components/settings/SettingsPanel'
import { SelfCoreBudget, SelfCoreEntries } from './SelfCoreEntries'
import {
  SELF_CORE_SETTINGS_PATH,
  isDeferred,
  rememberLater,
  selfCoreErrorMessage,
} from './selfCoreShared'

/** Screens where nobody is signed in yet: never ask there. */
const PUBLIC_PATHS = ['/login', '/auth/', '/setup']

/**
 * The question brought to the person: nothing is declared as the core of the self,
 * here is what the ranking puts there today — declare it, later, or see it in settings.
 *
 * Asked only to whoever can answer for every user (the global core is root-only),
 * only when nothing is declared and the server proposes candidates, and never within
 * three days of a "Later". It writes nothing by itself: only "Declare" sends a request.
 */
export function SelfCorePrompt() {
  const { t } = useT()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const canAnswer = useAtomValue(decidesForEveryoneAtom)
  const onPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const [core, setCore] = useState<SelfCore | null>(null)
  const [open, setOpen] = useState(false)
  // Asked once per load; a ref, so that marking it does not re-run (and cancel) the read.
  const asked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (asked.current || !canAnswer || onPublicPath || isDeferred()) return
    asked.current = true
    selfCoreApi
      .read()
      .then((c) => {
        setCore(c)
        // A response without `pinned`/`candidates` is a shape this client does
        // not know (older or newer backend, a proxy error body). It must not be
        // able to throw during render: this component sits in the root tree, so
        // an exception here blanks the WHOLE application — measured on the
        // browser bench, where the fake backend answers everything with `{}`
        // and the page rendered nothing at all.
        setOpen((c.pinned?.length ?? 0) === 0 && (c.candidates?.length ?? 0) > 0)
      })
      .catch(() => {
        /* the fetch failed: nothing to ask */
      })
  }, [canAnswer, onPublicPath])

  if (!core) return null
  const notes = core.candidates ?? []
  const tooMany = notes.length > core.max_notes

  const later = () => {
    rememberLater()
    setOpen(false)
  }
  const declare = async () => {
    setBusy(true)
    try {
      await selfCoreApi.pin(notes.map((n) => n.id))
      setError(null)
      setOpen(false)
      selfCoreApi.read().then(setCore, () => {})
    } catch (err) {
      setError(selfCoreErrorMessage(err, t, 'selfCore.error.write'))
    } finally {
      setBusy(false)
    }
  }
  const settings = () => {
    setOpen(false)
    navigate(SELF_CORE_SETTINGS_PATH)
  }

  return (
    // Closing (cross, Escape, backdrop) is the "Later" answer: there is no fourth one.
    <Dialog open={open} onClose={later} title={t('selfCore.prompt.title')} size="lg">
      <div data-testid="self-core-prompt" className="space-y-3">
        <p className="text-sm text-gray-300">{t('selfCore.prompt.why')}</p>
        <SelfCoreBudget core={core} notes={notes} />
        <p className="text-xs font-medium text-gray-400">{t('selfCore.prompt.quote')}</p>
        <SelfCoreEntries core={core} notes={notes} />
        {tooMany && <ErrorLine>{t('selfCore.tooMany', { count: core.max_notes })}</ErrorLine>}
        {error && <ErrorLine>{error}</ErrorLine>}
        <p className="text-xs text-gray-500">{t('selfCore.prompt.nothingWritten')}</p>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" data-testid="self-core-settings" onClick={settings}>
            {t('selfCore.prompt.settings')}
          </Button>
          <Button size="sm" variant="secondary" data-testid="self-core-later" onClick={later}>
            {t('selfCore.later')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            data-testid="self-core-pin"
            loading={busy}
            disabled={busy || tooMany}
            onClick={declare}
          >
            {t('selfCore.declare')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
