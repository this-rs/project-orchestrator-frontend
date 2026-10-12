import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { Check, Minus } from 'lucide-react'
import { Button } from '@/components/ui'
import { modelCatalogAtom, providersAtom } from '@/atoms'
import { getModelShortLabel } from '@/constants/models'
import { providerModelLabel, providerUnavailableReason } from '@/constants/providers'
import { useT } from '@/i18n'
import { ApiError } from '@/services/api'
import { autoModelsApi, type AutoModelEntry } from '@/services/routing'
import { isClaudeCodeProvider, providerDisplayName, providerKindLabel, type ProviderInstance, type ProviderModel } from '@/types/provider'
import { isPicked, pickKey, providerState, setProviderPicks, togglePick } from '@/utils/routingSelection'
import { loadModelCatalog } from './useModelCatalog'
import { ErrorLine, Loading } from './SettingsPanel'

/** Visible keyboard focus on every control. */
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'
/** Targets (WCAG 2.2, 2.5.8): 24px at least, 44px on a touch screen. */
const TARGET = 'min-h-6 pointer-coarse:min-h-11'
const LINK = `inline-flex items-center rounded px-1 text-xs text-indigo-300 hover:text-indigo-200 underline underline-offset-2 disabled:cursor-not-allowed disabled:text-gray-500 disabled:no-underline ${TARGET} ${FOCUS}`

type Load = { state: 'loading' } | { state: 'ready' } | { state: 'forbidden' } | { state: 'error' }

/** The tick of a checkbox: a shape for every state, never the colour alone. */
function Box({ state }: { state: 'none' | 'some' | 'all' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${state === 'none' ? 'border-white/30' : 'border-violet-300 bg-violet-500/30'}`}
    >
      {state === 'all' && <Check className="h-3 w-3 text-violet-100" />}
      {state === 'some' && <Minus className="h-3 w-3 text-violet-100" />}
    </span>
  )
}

/** Model lists of every instance but Claude Code (whose catalog is the app's), from their cached catalogs. */
function useInstanceModels(instances: readonly ProviderInstance[]) {
  const [loaded, setLoaded] = useState<Record<string, ProviderModel[]>>({})
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    for (const p of instances) {
      if (isClaudeCodeProvider(p.id, p.kind)) continue
      loadModelCatalog(p.id)
        .then((models) => alive.current && setLoaded((prev) => ({ ...prev, [p.id]: models })))
        .catch(() => undefined)
    }
  }, [instances])
  return loaded
}

/**
 * "Models Auto may use" (AUTO-L): the signed-in person's own list, the same
 * presentation as the chat's routing menu — one section per provider, its
 * models to tick, all / none per section and for everything.
 *
 * Nothing set = Auto chooses among every available model (and the ones added
 * later). "Select all" returns to that; unticking a model from there turns the
 * rest into an explicit list. A conversation's own ticked models always win;
 * a listed model that is no longer available is simply skipped by Auto.
 */
export function AutoModelsSettings() {
  const { t } = useT()
  const list = useAtomValue(providersAtom)
  const claudeCatalog = useAtomValue(modelCatalogAtom)
  const instances = useMemo(() => list?.providers ?? [], [list])
  const loaded = useInstanceModels(instances)
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  /** What the server holds: `null` = every available model. */
  const [stored, setStored] = useState<AutoModelEntry[] | null>(null)
  /** What is on screen: `null` = every available model. */
  const [selection, setSelection] = useState<AutoModelEntry[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [saved, setSaved] = useState(false)

  const read = useCallback(() => {
    autoModelsApi
      .get()
      .then((answer) => {
        const value = answer.all_available ? null : answer.models
        setStored(value)
        setSelection(value)
        setLoad({ state: 'ready' })
      })
      .catch((err) => setLoad({ state: err instanceof ApiError && err.status === 403 ? 'forbidden' : 'error' }))
  }, [])
  useEffect(read, [read])
  const retry = () => {
    setLoad({ state: 'loading' })
    read()
  }

  const modelsOf = useCallback(
    (p: ProviderInstance): string[] =>
      isClaudeCodeProvider(p.id, p.kind) ? claudeCatalog.map((m) => m.id) : (loaded[p.id] ?? p.models ?? []).map((m) => m.id),
    [claudeCatalog, loaded],
  )
  const labelOf = (p: ProviderInstance, model: string) =>
    isClaudeCodeProvider(p.id, p.kind) ? getModelShortLabel(model) : providerModelLabel(p, model)
  /** Every model available now: what "every model" means on screen. */
  const available = useMemo(
    () => instances.filter((p) => !providerUnavailableReason(p)).flatMap((p) => modelsOf(p).map((model) => ({ provider: p.id, model }))),
    [instances, modelsOf],
  )
  const shown = selection ?? available
  const missing = selection ? selection.filter((p) => !isPicked(available, p)).length : 0
  const dirty = JSON.stringify(selection?.map(pickKey) ?? null) !== JSON.stringify(stored?.map(pickKey) ?? null)
  const empty = selection !== null && selection.length === 0

  const change = (next: AutoModelEntry[] | null) => {
    setSaved(false)
    setSaveError(false)
    setSelection(next)
  }
  const save = () => {
    if (!dirty || empty || saving) return
    setSaving(true)
    setSaveError(false)
    autoModelsApi
      .put(selection ?? [])
      .then((answer) => {
        const value = answer.all_available ? null : answer.models
        setStored(value)
        setSelection(value)
        setSaved(true)
      })
      .catch(() => setSaveError(true))
      .finally(() => setSaving(false))
  }

  const summary =
    selection === null
      ? t('routing.autoModels.summaryAll')
      : selection.length === 1
        ? t('routing.autoModels.summaryOne')
        : t('routing.autoModels.summaryCount', { count: selection.length })

  if (load.state === 'loading') return <Loading>{t('routing.autoModels.loading')}</Loading>
  if (load.state === 'forbidden') return <p className="text-xs text-gray-400">{t('routing.autoModels.forbidden')}</p>
  if (load.state === 'error') {
    return (
      <div className="flex items-center gap-3">
        <ErrorLine>{t('routing.autoModels.loadError')}</ErrorLine>
        <Button size="sm" variant="secondary" onClick={retry}>
          {t('routing.settings.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="auto-models">
      <p className="text-xs text-gray-400">{t('routing.autoModels.description')}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p data-testid="auto-models-summary" aria-live="polite" className="min-w-0 flex-1 text-sm text-gray-100">
          {summary}
        </p>
        <button type="button" data-testid="auto-models-all" disabled={selection === null} onClick={() => change(null)} className={LINK}>
          {t('routing.menu.selectAll')}
        </button>
        <button type="button" data-testid="auto-models-none" disabled={empty} onClick={() => change([])} className={LINK}>
          {t('routing.menu.clearAll')}
        </button>
      </div>
      {missing > 0 && (
        <p data-testid="auto-models-missing" className="text-xs text-amber-200">
          {t('routing.autoModels.missing', { count: missing })}
        </p>
      )}
      {empty && (
        <p data-testid="auto-models-empty" className="text-xs text-amber-200">
          {t('routing.autoModels.emptyHint')}
        </p>
      )}
      {instances.length === 0 && <p className="text-xs text-gray-500">{t('routing.menu.noProvider')}</p>}
      <div className="divide-y divide-white/[0.06] rounded-lg border border-white/[0.08]">
        {instances.map((p) => {
          const reason = providerUnavailableReason(p)
          const models = modelsOf(p)
          const state = providerState(shown, p.id, models)
          const picked = models.filter((m) => isPicked(shown, { provider: p.id, model: m })).length
          const name = providerDisplayName(p)
          return (
            <section key={p.id} data-testid={`auto-models-provider-${p.id}`} aria-label={name} className="px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
                  aria-label={t('routing.menu.providerToggle', { provider: name })}
                  aria-disabled={reason || models.length === 0 ? true : undefined}
                  data-testid={`auto-models-provider-check-${p.id}`}
                  onClick={() => {
                    if (reason || models.length === 0) return
                    change(setProviderPicks(shown, p.id, models, state !== 'all'))
                  }}
                  className={`grid size-6 shrink-0 place-items-center rounded pointer-coarse:size-11 ${FOCUS} ${reason ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <Box state={state} />
                </button>
                <span className="min-w-0 truncate text-sm text-gray-100">{name}</span>
                <span className="text-xs text-gray-400">{providerKindLabel(p.kind)}</span>
                {!reason && models.length > 0 && (
                  <span className="ml-auto flex items-center gap-1">
                    <span className="text-xs text-gray-400">{t('routing.menu.countOf', { selected: picked, total: models.length })}</span>
                    <button
                      type="button"
                      data-testid={`auto-models-provider-all-${p.id}`}
                      aria-label={t('routing.autoModels.sectionAllAria', { provider: name })}
                      disabled={state === 'all'}
                      onClick={() => change(setProviderPicks(shown, p.id, models, true))}
                      className={LINK}
                    >
                      {t('routing.autoModels.sectionAll')}
                    </button>
                    <button
                      type="button"
                      data-testid={`auto-models-provider-none-${p.id}`}
                      aria-label={t('routing.autoModels.sectionNoneAria', { provider: name })}
                      disabled={state === 'none'}
                      onClick={() => change(setProviderPicks(shown, p.id, models, false))}
                      className={LINK}
                    >
                      {t('routing.autoModels.sectionNone')}
                    </button>
                  </span>
                )}
              </div>
              {reason && <p className="pl-8 text-xs text-gray-400">{reason}</p>}
              {!reason && models.length === 0 && <p className="pl-8 text-xs text-gray-400">{t('routing.menu.noModels')}</p>}
              {!reason && models.length > 0 && (
                <div role="group" aria-label={t('routing.autoModels.modelsOf', { provider: name })} className="mt-1 grid gap-0.5 pl-6 sm:grid-cols-2">
                  {models.map((model) => {
                    const pick = { provider: p.id, model }
                    const on = isPicked(shown, pick)
                    return (
                      <button
                        key={model}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        title={model}
                        data-testid={`auto-models-model-${p.id}-${model}`}
                        onClick={() => change(togglePick(shown, pick))}
                        className={`flex min-w-0 items-center gap-2 rounded px-2 py-1 text-left text-xs ${TARGET} ${FOCUS} ${on ? 'text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
                      >
                        <Box state={on ? 'all' : 'none'} />
                        <span className="truncate">{labelOf(p, model)}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {saveError && <ErrorLine>{t('routing.autoModels.saveError')}</ErrorLine>}
        {saved && !dirty && (
          <p role="status" className="text-xs text-emerald-300">
            {t('routing.autoModels.saved')}
          </p>
        )}
        <Button size="sm" variant="primary" data-testid="auto-models-save" disabled={!dirty || empty} loading={saving} onClick={save}>
          {t('routing.autoModels.save')}
        </Button>
      </div>
    </div>
  )
}
