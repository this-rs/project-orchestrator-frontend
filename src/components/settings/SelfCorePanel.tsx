import { useEffect, useState } from 'react'
import { Button, ToneText } from '@/components/ui'
import { useT } from '@/i18n'
import { selfCoreApi, type SelfCore } from '@/services/selfCore'
import { SelfCoreBudget, SelfCoreEntries } from '@/components/knowledge/SelfCoreEntries'
import { isDeferred, rememberLater, selfCoreErrorMessage } from '@/components/knowledge/selfCoreShared'
import { ErrorLine, Loading, Panel, ProjectPicker } from './SettingsPanel'
import { useProjectOptions } from './useProjectOptions'

/**
 * The declared core of the self: the notes every turn starts from ("Foundational
 * Notes"), declared by a person — an assistant cannot pin its own.
 *
 * Everything shown comes from `GET /knowledge/self-core`: the budget, the cap, the
 * exact line each note becomes, and whether it lands. After a write, the endpoint
 * is read again: it is the only source of truth.
 */
export function SelfCorePanel() {
  const { t } = useT()
  const projects = useProjectOptions()
  const [project, setProject] = useState('')
  const [core, setCore] = useState<SelfCore | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [later, setLater] = useState(() => isDeferred())
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    selfCoreApi
      .read(project || undefined)
      .then((c) => {
        if (!live) return
        setCore(c)
        setError(null)
      })
      .catch((err) => {
        if (!live) return
        setCore(null)
        setError(selfCoreErrorMessage(err, t, 'selfCore.error.read'))
      })
    return () => {
      live = false
    }
  }, [project, tick, t])

  const write = async (ids: string[]) => {
    setBusy(true)
    setSaved(false)
    try {
      await selfCoreApi.pin(ids, project || undefined)
      setError(null)
      setSaved(true)
      setTick((n) => n + 1)
    } catch (err) {
      // Surfaced as it comes; never retried.
      setError(selfCoreErrorMessage(err, t, 'selfCore.error.write'))
    } finally {
      setBusy(false)
    }
  }

  const choose = (slug: string) => {
    setProject(slug)
    setCore(null)
    setSaved(false)
    setError(null)
  }

  const declared = (core?.pinned.length ?? 0) > 0
  const notes = core ? (declared ? core.pinned : core.candidates) : []
  const tooMany = !!core && notes.length > core.max_notes

  let body
  if (!core && !error) body = <Loading>{t('selfCore.loading')}</Loading>
  else if (core) {
    body = (
      <>
        <SelfCoreBudget core={core} notes={notes} />
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">{t('selfCore.empty')}</p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400">
              {declared ? t('selfCore.declaredHeading') : t('selfCore.proposalHeading')}
            </p>
            {!declared && <p className="text-xs text-gray-500">{t('selfCore.proposalHint')}</p>}
            <SelfCoreEntries
              core={core}
              notes={notes}
              renderAction={
                declared
                  ? (n, i) => (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={t('selfCore.removeAria', { n: i + 1 })}
                        onClick={() => write(core.pinned.filter((p) => p.id !== n.id).map((p) => p.id))}
                      >
                        {t('selfCore.remove')}
                      </Button>
                    )
                  : undefined
              }
            />
          </div>
        )}
        {tooMany && <ErrorLine>{t('selfCore.tooMany', { count: core.max_notes })}</ErrorLine>}
      </>
    )
  }

  const proposal = !!core && !declared && core.candidates.length > 0
  return (
    <Panel
      testId="self-core-panel"
      description={t('selfCore.description')}
      aside={
        <ProjectPicker
          id="self-core-scope"
          label={t('selfCore.scope')}
          allLabel={t('selfCore.scopeGlobal')}
          projects={projects}
          value={project}
          onChange={choose}
        />
      }
      status={
        error ? (
          <ErrorLine>{error}</ErrorLine>
        ) : saved ? (
          <span role="status">
            <ToneText tone="success" label={t('selfCore.saved')} />
          </span>
        ) : proposal && later ? (
          <span className="text-gray-500">{t('selfCore.laterNote')}</span>
        ) : null
      }
      actions={
        proposal && (
          <>
            {!later && (
              <Button
                size="sm"
                variant="secondary"
                data-testid="self-core-panel-later"
                onClick={() => {
                  rememberLater()
                  setLater(true)
                }}
              >
                {t('selfCore.later')}
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              data-testid="self-core-panel-pin"
              loading={busy}
              disabled={busy || tooMany}
              onClick={() => write(core.candidates.map((c) => c.id))}
            >
              {t('selfCore.declare')}
            </Button>
          </>
        )
      }
    >
      {body}
    </Panel>
  )
}
