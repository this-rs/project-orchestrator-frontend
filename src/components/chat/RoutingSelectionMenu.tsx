import { useEffect, useId, useMemo, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, ChevronDown, Minus, Search } from 'lucide-react'
import { Highlight } from '@/components/ui/SearchableSelect'
import { Switch } from '@/components/ui/Switch'
import { fold } from '@/components/ui/searchFold'
import { loadModelCatalog } from '@/components/settings/useModelCatalog'
import {
  chatDraftAutoAtom,
  chatDraftSelectionAtom,
  chatForcedTargetAtom,
  chatRoutingSettingsAtom,
  chatSelectedProviderAtom,
  chatSessionModelAtom,
  modelCatalogAtom,
  modelCatalogLoadedAtom,
  providersAtom,
} from '@/atoms'
import {
  defaultModelForFamily,
  getModelShortLabel,
  groupModelsByFamily,
  sortByVersionAscending,
  type ModelFamilyGroup,
} from '@/constants/models'
import { aliasesForInstance, healthDotColor, providerModelLabel, providerUnavailableReason } from '@/constants/providers'
import { useT } from '@/i18n'
import { isClaudeCodeProvider, providerDisplayName, providerKindLabel, type ProviderInstance, type ProviderModel } from '@/types/provider'
import {
  isPicked,
  pickKey,
  providerState,
  setProviderPicks,
  togglePick,
  type RoutingPick,
} from '@/utils/routingSelection'
import type { ProviderModelMenu } from './ProviderModelPicker'

const CHIP =
  'inline-flex min-w-0 max-w-full items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.06] transition-colors'
const POPOVER =
  'absolute bottom-full left-0 right-0 sm:right-auto sm:w-80 mb-1 z-20 max-h-[min(28rem,65dvh)] overflow-y-auto overscroll-contain bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl'
const BTN = 'text-[11px] text-indigo-300 hover:text-indigo-200 underline underline-offset-2 disabled:text-gray-600 disabled:no-underline'
/** More models than this: the list gets a search field. */
const SEARCH_FROM = 6

/** The Auto switch: PO chooses on the whole chain, and everything below is off. */
export function AutoSwitch({ checked, onChange, disabled = false }: { checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.06]">
      <Switch checked={checked} onChange={onChange} disabled={disabled} ariaLabel={t('routing.modes.full.label')} />
      <div className="min-w-0">
        <div className="text-xs text-gray-100">{t('routing.modes.full.label')}</div>
        <p className="text-[10px] leading-snug text-gray-500">{t('routing.modes.full.description')}</p>
      </div>
    </div>
  )
}

/** Model lists of every instance: Claude from the catalog, the others from their own (cached) catalog. */
function useProviderModels(instances: readonly ProviderInstance[]): Record<string, ProviderModel[]> {
  const [loaded, setLoaded] = useState<Record<string, ProviderModel[]>>({})
  useEffect(() => {
    let live = true
    for (const p of instances) {
      if (isClaudeCodeProvider(p.id, p.kind)) continue
      loadModelCatalog(p.id)
        .then((models) => live && setLoaded((prev) => ({ ...prev, [p.id]: models })))
        .catch(() => {})
    }
    return () => {
      live = false
    }
  }, [instances])
  return loaded
}

/**
 * The menu of a NEW conversation: what it may run on, in one place.
 *
 * - the Auto switch: PO chooses on the whole chain; everything below is off;
 * - otherwise one section per provider, its models to tick. The mode is not a
 *   setting here, it is READ from the ticks: one model = strict, several =
 *   mixed (PO routes among them), none = the server default;
 * - quick gestures: select / clear everything, a whole provider, a whole family.
 *
 * Claude keeps its families and versions: one line per family, one stop per
 * version on a stepped track, each stop tickable.
 */
export function DraftRoutingMenu({ open, onOpenChange }: { open: ProviderModelMenu; onOpenChange: (open: ProviderModelMenu) => void }) {
  const { t } = useT()
  const list = useAtomValue(providersAtom)
  const settings = useAtomValue(chatRoutingSettingsAtom)
  const catalog = useAtomValue(modelCatalogAtom)
  const catalogLoaded = useAtomValue(modelCatalogLoadedAtom)
  const [autoDraft, setAutoDraft] = useAtom(chatDraftAutoAtom)
  const [selection, setSelection] = useAtom(chatDraftSelectionAtom)
  const setPickedProvider = useSetAtom(chatSelectedProviderAtom)
  const setSessionModel = useSetAtom(chatSessionModelAtom)
  const setForced = useSetAtom(chatForcedTargetAtom)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const baseId = useId()

  const instances = useMemo(() => list?.providers ?? [], [list])
  const claudeGroups = useMemo(() => groupModelsByFamily(catalog), [catalog])
  const loaded = useProviderModels(instances)

  const auto = autoDraft ?? settings?.mode === 'full'
  const modelsOf = (p: ProviderInstance): string[] => {
    const own = isClaudeCodeProvider(p.id, p.kind) ? catalog.map((m) => m.id) : (loaded[p.id] ?? p.models ?? []).map((m) => m.id)
    return own
  }
  const selectable = instances.filter((p) => !providerUnavailableReason(p))
  const total = selectable.reduce((n, p) => n + modelsOf(p).length, 0)

  /** Every change goes through here: the draft's atoms, and the single pick the rest of the composer reads. */
  const commit = (nextAuto: boolean, next: RoutingPick[]) => {
    setAutoDraft(nextAuto)
    setSelection(next)
    const pilot = nextAuto ? undefined : next[0]
    setPickedProvider(pilot?.provider ?? null)
    setSessionModel(pilot?.model ?? null)
    setForced(!!pilot)
  }
  const setAuto = (on: boolean) => commit(on, selection)
  const setAll = (on: boolean) =>
    commit(
      false,
      on ? selectable.flatMap((p) => modelsOf(p).map((model) => ({ provider: p.id, model }))) : [],
    )

  const nameOf = (provider: string, model: string) => {
    const p = instances.find((x) => x.id === provider) ?? null
    const alias = aliasesForInstance(p, list?.aliases).find((a) => a.alias === model)
    if (alias) return alias.alias
    return p && isClaudeCodeProvider(p.id, p.kind) ? getModelShortLabel(model) : providerModelLabel(p, model)
  }
  const count = selection.length
  const first = selection[0]
  const firstInstance = first ? (instances.find((p) => p.id === first.provider) ?? null) : null
  const chipText = auto
    ? t('routing.modes.full.label')
    : count === 0
      ? t('routing.menu.chipDefault')
      : count === 1
        ? `${firstInstance ? providerDisplayName(firstInstance) : first.provider} › ${nameOf(first.provider, first.model)}`
        : t('routing.menu.chipMixed', { count })
  const summary = auto ? t('routing.modes.full.description') : count === 0 ? t('routing.menu.summaryNone') : count === 1 ? t('routing.modes.primary.description') : t('routing.menu.summaryMixed', { count })
  const modeLabel = auto ? t('routing.modes.full.label') : count === 0 ? '' : count === 1 ? t('routing.modes.primary.label') : t('routing.modes.mixed.label')
  const isOpen = open === 'target'

  return (
    <div className="min-w-0 sm:relative">
      <button
        type="button"
        onClick={() => onOpenChange(isOpen ? null : 'target')}
        aria-label={`${t('routing.menu.aria')}: ${modeLabel ? `${modeLabel} · ` : ''}${chipText}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        data-testid="target-chip"
        data-mode={auto ? 'full' : count > 1 ? 'mixed' : 'primary'}
        className={CHIP}
      >
        {!auto && count === 1 && <span className={`w-1.5 h-1.5 rounded-full ${healthDotColor(firstInstance?.health?.status)}`} aria-hidden="true" />}
        <span className="min-w-0 max-w-[14rem] truncate" title={chipText}>
          {chipText}
        </span>
        <ChevronDown className="w-2.5 h-2.5 text-gray-500" aria-hidden="true" />
      </button>

      {isOpen && (
        <div data-testid="target-picker-popover" className={POPOVER}>
          <AutoSwitch checked={auto} onChange={setAuto} />

          <div inert={auto} className={auto ? 'opacity-40' : undefined} data-testid="routing-selection">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06]">
              <p data-testid="routing-summary" aria-live="polite" className="min-w-0 flex-1 text-[10px] leading-snug text-gray-400">
                {modeLabel && <span className="text-gray-200">{modeLabel} · </span>}
                {summary}
              </p>
              <button type="button" data-testid="routing-select-all" disabled={total === 0 || count >= total} onClick={() => setAll(true)} className={BTN}>
                {t('routing.menu.selectAll')}
              </button>
              <button type="button" data-testid="routing-clear-all" disabled={count === 0} onClick={() => setAll(false)} className={BTN}>
                {t('routing.menu.clearAll')}
              </button>
            </div>

            {instances.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">{t('routing.menu.noProvider')}</div>}
            {instances.map((p) => {
              const reason = providerUnavailableReason(p)
              const models = modelsOf(p)
              const claude = isClaudeCodeProvider(p.id, p.kind)
              const state = providerState(selection, p.id, models)
              const picked = models.filter((m) => isPicked(selection, { provider: p.id, model: m })).length
              const isExpanded = !reason && (expanded[p.id] ?? (claude || state !== 'none'))
              const sectionId = `${baseId}-${p.id}`
              return (
                <div key={p.id} data-testid={`target-provider-${p.id}`} className="border-b border-white/[0.04] last:border-b-0">
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
                      aria-label={t('routing.menu.providerToggle', { provider: providerDisplayName(p) })}
                      aria-disabled={reason ? true : undefined}
                      data-testid={`routing-provider-check-${p.id}`}
                      onClick={() => {
                        if (reason) return
                        commit(false, setProviderPicks(selection, p.id, models, state !== 'all'))
                      }}
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                        state === 'none' ? 'border-white/20' : 'border-violet-400 bg-violet-500/30'
                      } ${reason ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      {state === 'all' && <Check className="h-3 w-3 text-violet-100" aria-hidden="true" />}
                      {state === 'some' && <Minus className="h-3 w-3 text-violet-100" aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      aria-expanded={reason ? undefined : isExpanded}
                      aria-controls={isExpanded ? sectionId : undefined}
                      onClick={() => !reason && setExpanded((e) => ({ ...e, [p.id]: !isExpanded }))}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs ${reason ? 'cursor-not-allowed text-gray-500' : 'text-gray-200'}`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDotColor(p.health?.status)}`} aria-hidden="true" />
                      <span className="truncate">{providerDisplayName(p)}</span>
                      <span className="shrink-0 text-[10px] text-gray-500">{providerKindLabel(p.kind)}</span>
                      {!reason && models.length > 0 && (
                        <span className="ml-auto shrink-0 text-[10px] text-gray-500">{t('routing.menu.countOf', { selected: picked, total: models.length })}</span>
                      )}
                      {!reason && <ChevronDown className={`h-2.5 w-2.5 shrink-0 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />}
                    </button>
                  </div>
                  {reason && <p className="px-3 pb-1.5 pl-9 text-[10px] leading-snug text-gray-500">{reason}</p>}
                  {isExpanded && (
                    <div id={sectionId} className="mb-1 ml-5 border-l border-white/[0.08]">
                      {claude ? (
                        <ClaudeFamilies
                          provider={p.id}
                          groups={claudeGroups}
                          loaded={catalogLoaded}
                          selection={selection}
                          onChange={(next) => commit(false, next)}
                          aliases={aliasesForInstance(p, list?.aliases)}
                        />
                      ) : (
                        <ModelChecklist
                          provider={p.id}
                          models={loaded[p.id] ?? p.models ?? []}
                          loadingDone={p.id in loaded}
                          selection={selection}
                          aliases={aliasesForInstance(p, list?.aliases)}
                          onChange={(next) => commit(false, next)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function AliasRows({
  provider,
  aliases,
  selection,
  onChange,
}: {
  provider: string
  aliases: { alias: string; model: string }[]
  selection: readonly RoutingPick[]
  onChange: (next: RoutingPick[]) => void
}) {
  if (aliases.length === 0) return null
  return (
    <div role="group" aria-label="Model aliases" className="border-b border-white/[0.06] py-1">
      {aliases.map((a) => {
        const pick = { provider, model: a.alias }
        const on = isPicked(selection, pick)
        return (
          <button
            key={a.alias}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onChange(togglePick(selection, pick))}
            className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs ${on ? 'bg-white/[0.04] text-gray-100' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'}`}
          >
            <Tick on={on} />
            <span>{a.alias}</span>
            <span className="ml-auto truncate text-[10px] text-gray-500">{a.model}</span>
          </button>
        )
      })}
    </div>
  )
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center self-center rounded-sm border ${on ? 'border-violet-400 bg-violet-500/30' : 'border-white/20'}`} aria-hidden="true">
      {on && <Check className="h-2.5 w-2.5 text-violet-100" />}
    </span>
  )
}

/** Models of a non-Claude instance: a plain checklist, searchable when long. */
function ModelChecklist({
  provider,
  models,
  loadingDone,
  selection,
  aliases,
  onChange,
}: {
  provider: string
  models: ProviderModel[]
  loadingDone: boolean
  selection: readonly RoutingPick[]
  aliases: { alias: string; model: string }[]
  onChange: (next: RoutingPick[]) => void
}) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  if (models.length === 0) {
    return <div className="px-3 py-2 text-xs text-gray-500">{loadingDone ? t('routing.menu.noModels') : t('routing.menu.loading')}</div>
  }
  const searchable = models.length > SEARCH_FROM
  const q = searchable ? fold(query.trim()) : ''
  const shown = q ? models.filter((m) => fold(`${m.id}\n${m.label ?? ''}`).includes(q)) : models
  return (
    <div>
      <AliasRows provider={provider} aliases={aliases} selection={selection} onChange={onChange} />
      {searchable && (
        <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-surface-popover px-2 py-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            <input
              type="search"
              aria-label={t('routing.menu.search')}
              placeholder={t('routing.menu.search')}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded border border-white/[0.08] bg-surface-base py-1 pl-7 pr-2 text-base text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-400/50 sm:text-xs"
            />
          </div>
        </div>
      )}
      <div role="group" aria-label="Models" className="py-1">
        {shown.map((m) => {
          const pick = { provider, model: m.id }
          const on = isPicked(selection, pick)
          return (
            <button
              key={m.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              title={m.label || m.id}
              onClick={() => onChange(togglePick(selection, pick))}
              className={`flex w-full items-center gap-2 truncate px-3 py-1.5 text-left text-xs ${on ? 'bg-white/[0.04] text-gray-100' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'}`}
            >
              <Tick on={on} />
              <span className="truncate">
                <Highlight text={m.label || m.id} query={q ? query : ''} />
              </span>
            </button>
          )
        })}
        {shown.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">{`No model matches “${query.trim()}”`}</div>}
      </div>
    </div>
  )
}

/** Claude: one line per family, one tickable stop per version. */
function ClaudeFamilies({
  provider,
  groups,
  loaded,
  selection,
  aliases,
  onChange,
}: {
  provider: string
  groups: readonly ModelFamilyGroup[]
  loaded: boolean
  selection: readonly RoutingPick[]
  aliases: { alias: string; model: string }[]
  onChange: (next: RoutingPick[]) => void
}) {
  const { t } = useT()
  if (groups.length === 0) {
    return <div className="px-3 py-2 text-xs text-gray-500">{loaded ? t('routing.menu.noModels') : t('routing.menu.loading')}</div>
  }
  return (
    <div className="py-1">
      <AliasRows provider={provider} aliases={aliases} selection={selection} onChange={onChange} />
      {groups.map((group) => (
        <FamilyMultiRow key={group.family} group={group} provider={provider} selection={selection} onChange={onChange} />
      ))}
    </div>
  )
}

function FamilyMultiRow({
  group,
  provider,
  selection,
  onChange,
}: {
  group: ModelFamilyGroup
  provider: string
  selection: readonly RoutingPick[]
  onChange: (next: RoutingPick[]) => void
}) {
  const versions = useMemo(() => sortByVersionAscending(group.models), [group.models])
  const on = versions.map((m) => isPicked(selection, { provider, model: m.id }))
  const pickedIdx = on.flatMap((x, i) => (x ? [i] : []))
  const last = Math.max(1, versions.length - 1)
  const pct = (i: number) => (i / last) * 100
  const ids = versions.map((m) => m.id)

  const toggleFamily = () => {
    if (pickedIdx.length > 0) return onChange(selection.filter((x) => !(x.provider === provider && ids.includes(x.model))))
    const def = defaultModelForFamily(versions, '')
    if (def) onChange(togglePick(selection, { provider, model: def.id }))
  }
  const shownVersions = pickedIdx.map((i) => versions[i].version).filter(Boolean)
  const label = shownVersions.length === 0 ? '—' : shownVersions.length <= 2 ? shownVersions.join(', ') : `${shownVersions[0]} +${shownVersions.length - 1}`

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1 ${pickedIdx.length ? 'bg-white/[0.05]' : ''}`} data-testid={`model-family-${group.family}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={pickedIdx.length === 0 ? false : pickedIdx.length === versions.length ? true : 'mixed'}
        onClick={toggleFamily}
        className={`flex w-[4.25rem] shrink-0 items-center gap-2 self-stretch rounded text-left text-xs ${pickedIdx.length ? 'text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${group.dotColor}`} aria-hidden="true" />
        <span className="truncate">{group.label}</span>
      </button>

      <div role="group" aria-label={`${group.label} versions`} className="relative flex h-9 min-w-0 flex-1 items-center sm:h-6">
        {versions.length >= 2 && (
          <div className="absolute inset-y-0 left-3 right-3" aria-hidden="true">
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/15" />
            {pickedIdx.length >= 2 && (
              <div
                className={`absolute top-1/2 h-0.5 -translate-y-1/2 rounded ${group.dotColor} opacity-70`}
                style={{ left: `${pct(pickedIdx[0])}%`, width: `${pct(pickedIdx[pickedIdx.length - 1]) - pct(pickedIdx[0])}%` }}
              />
            )}
          </div>
        )}
        <div className="relative flex w-full items-center justify-between">
          {versions.map((m, i) => (
            <button
              key={pickKey({ provider, model: m.id })}
              type="button"
              role="checkbox"
              aria-checked={on[i]}
              aria-label={`${group.label} ${m.version || m.fullLabel}`}
              title={m.tier === 'legacy' ? `${m.fullLabel} (legacy)` : m.fullLabel}
              onClick={() => onChange(togglePick(selection, { provider, model: m.id }))}
              className="grid h-9 w-6 place-items-center rounded outline-none focus-visible:ring-1 focus-visible:ring-white/30 sm:h-6"
            >
              <span className={on[i] ? `h-3 w-3 rounded-full shadow ${group.dotColor}` : 'h-1.5 w-1.5 rounded-full bg-white/30'} />
            </button>
          ))}
        </div>
      </div>

      <span className="w-14 shrink-0 truncate text-right font-mono text-[11px] text-gray-300" title={shownVersions.join(', ')}>
        {label}
      </span>
    </div>
  )
}
