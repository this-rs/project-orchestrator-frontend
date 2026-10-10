import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, ChevronDown, Minus, RefreshCw, Search } from 'lucide-react'
import { Highlight } from '@/components/ui/SearchableSelect'
import { Switch } from '@/components/ui/Switch'
import { fold } from '@/components/ui/searchFold'
import { loadModelCatalog } from '@/components/settings/useModelCatalog'
import { useRefreshProviders } from '@/hooks/useProviders'
import {
  chatDefaultModelAtom,
  chatDraftInputAtom,
  chatFollowRequestAtom,
  chatSwitchingSessionAtom,
  chatDraftAutoAtom,
  chatDraftSelectionAtom,
  chatForcedTargetAtom,
  chatRoutingModeAtom,
  chatRoutingSettingsAtom,
  chatRoutingSlugAtom,
  chatSelectedProviderAtom,
  chatSessionCapabilitiesAtom,
  chatSessionModelAtom,
  chatSessionProviderAtom,
  chatSessionRoutingAtom,
  chatTargetProviderIdAtom,
  sessionRoutingOf,
  loadRoutingSettingsAtom,
  modelCatalogAtom,
  modelCatalogLoadedAtom,
  providersAtom,
  providersLoadStateAtom,
} from '@/atoms'
import {
  defaultModelForFamily,
  getModelShortLabel,
  groupModelsByFamily,
  sortByVersionAscending,
  type ModelFamilyGroup,
} from '@/constants/models'
import {
  aliasesForInstance,
  healthDotColor,
  pickModelResolver,
  providerModelLabel,
  providerUnavailableReason,
  routedByKey,
} from '@/constants/providers'
import { useT } from '@/i18n'
import {
  changeConversationRouting,
  conversationRoutingRefusal,
  switchConversationProvider,
  switchProviderRefusal,
  type ConversationRoutingChange,
  type ConversationRoutingRefusal,
  type SwitchProviderRefusal,
} from '@/services/chat'
import type { LearningStage } from '@/types/routing'
import { isClaudeCodeProvider, providerDisplayName, providerKindLabel, type ProviderInstance, type ProviderModel, type RoutedBy } from '@/types/provider'
import {
  distinctModels,
  isPicked,
  pickKey,
  providerState,
  setProviderPicks,
  togglePick,
  type RoutingPick,
} from '@/utils/routingSelection'
import { ProviderModelPicker, RefreshClaudeModels, type ProviderModelMenu } from './ProviderModelPicker'
import { SwitchProviderDialog } from './SwitchProviderDialog'
import { VaultUnlock } from './VaultUnlock'
import { useVaultLocked } from './useVaultLocked'

/** Visible keyboard focus on every control of the menu. */
const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'
const FOCUS_INSET = 'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400'
/** Targets: 24px at least with a mouse, 44px on a touch screen. */
const TARGET = 'min-h-6 pointer-coarse:min-h-11'
const CHIP = `inline-flex min-w-0 max-w-full items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.06] transition-colors ${TARGET} ${FOCUS}`
const POPOVER =
  'absolute bottom-full left-0 right-0 sm:right-auto sm:w-80 mb-1 z-20 max-h-[min(28rem,65dvh)] overflow-y-auto overscroll-contain bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl'
const BTN = `inline-flex items-center rounded text-[11px] text-indigo-300 hover:text-indigo-200 underline underline-offset-2 disabled:text-gray-600 disabled:no-underline ${TARGET} ${FOCUS}`
/** A row of a list that ticks on and off. */
const ROW = `flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${TARGET} ${FOCUS_INSET}`
/** More models than this: the list gets a search field. */
const SEARCH_FROM = 6

/** The Auto switch: PO chooses on the whole chain, and everything below is off. */
export function AutoSwitch({ checked, onChange, disabled = false }: { checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const { t } = useT()
  // The whole row is the switch's label: a target far larger than the switch itself.
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.06]">
      <Switch checked={checked} onChange={onChange} disabled={disabled} ariaLabel={t('routing.modes.full.label')} />
      <span className="min-w-0">
        <span className="block text-xs text-gray-100">{t('routing.modes.full.label')}</span>
        <span className="block text-[10px] leading-snug text-gray-500">{t('routing.modes.full.description')}</span>
      </span>
    </label>
  )
}

interface ProviderModels {
  loaded: Record<string, ProviderModel[]>
  failed: Record<string, boolean>
  retry: (id: string) => void
}

/** Model lists of every non-Claude instance from its own (cached) catalog, read while the menu is open. */
function useProviderModels(instances: readonly ProviderInstance[], active: boolean): ProviderModels {
  const [loaded, setLoaded] = useState<Record<string, ProviderModel[]>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const read = useCallback((id: string, force: boolean) => {
    loadModelCatalog(id, force)
      .then((models) => {
        if (!alive.current) return
        setLoaded((prev) => ({ ...prev, [id]: models }))
        setFailed((prev) => ({ ...prev, [id]: false }))
      })
      .catch(() => alive.current && setFailed((prev) => ({ ...prev, [id]: true })))
  }, [])
  useEffect(() => {
    if (!active) return
    for (const p of instances) if (!isClaudeCodeProvider(p.id, p.kind)) read(p.id, false)
  }, [instances, active, read])
  const retry = useCallback((id: string) => read(id, true), [read])
  return { loaded, failed, retry }
}

interface RoutingSelectionMenuProps {
  /** Current session (null/undefined = a conversation not created yet). */
  sessionId?: string | null
  open: ProviderModelMenu
  onOpenChange: (open: ProviderModelMenu) => void
  /** Change the model of a LIVE session (sent over the socket). */
  onChangeModel?: (model: string) => void
  /** Start a new conversation on another provider (the history stays where it is). */
  onNewConversation?: () => void
}

/**
 * Where the conversation runs, in ONE menu - for a new conversation and for an
 * existing one, at any time. A server without the router (or without provider
 * routes) has nothing to route: the plain provider/model picker.
 */
export function RoutingSelectionMenu(props: RoutingSelectionMenuProps) {
  const slug = useAtomValue(chatRoutingSlugAtom)
  const load = useSetAtom(loadRoutingSettingsAtom)
  const settings = useAtomValue(chatRoutingSettingsAtom)
  const list = useAtomValue(providersAtom)
  const loadState = useAtomValue(providersLoadStateAtom)
  const setForced = useSetAtom(chatForcedTargetAtom)

  useEffect(() => {
    void load({ slug })
  }, [load, slug])

  if (!settings || !list || loadState === 'unsupported') return <ProviderModelPicker {...props} onForce={setForced} />
  return <RoutingMenu {...props} autoByDefault={settings.mode === 'full'} />
}

/**
 * The menu: what the conversation may run on, in one place.
 *
 * - the Auto switch: PO chooses on the whole chain; everything below is off.
 *   It can be flipped at any time, in both directions, and only for THIS
 *   conversation (a draft before its first message, the open chat afterwards);
 * - otherwise one section per provider, its models to tick. The mode is not a
 *   setting, it is READ from the ticks: one model = strict, several = mixed
 *   (PO routes among them), none = the server default;
 * - quick gestures on a draft: select / clear everything, a whole provider,
 *   a whole Claude family.
 *
 * Claude keeps its families and versions: one line per family, one stop per
 * version on a stepped track, each stop tickable.
 *
 * An existing chat: its changes go to the server (`PUT /chat/sessions/{id}/routing`)
 * and the menu shows what the server answers: Auto, or its ticked models (one =
 * strict, several = mixed among them). On Auto the list stays usable: picking a
 * model takes the hand back. A model of ANOTHER provider moves the conversation
 * there (`POST .../switch-provider`) after a confirmation that says what happens
 * and takes the message to continue with; the tab then follows the new session.
 * The gestures on many models are not offered.
 */
function RoutingMenu({ sessionId, open, onOpenChange, onNewConversation, autoByDefault }: RoutingSelectionMenuProps & { autoByDefault: boolean }) {
  const { t } = useT()
  const list = useAtomValue(providersAtom)
  const catalog = useAtomValue(modelCatalogAtom)
  const catalogLoaded = useAtomValue(modelCatalogLoadedAtom)
  const [autoDraft, setAutoDraft] = useAtom(chatDraftAutoAtom)
  const draftSelection = useAtomValue(chatDraftSelectionAtom)
  const setDraftSelection = useSetAtom(chatDraftSelectionAtom)
  const setPickedProvider = useSetAtom(chatSelectedProviderAtom)
  const [sessionModel, setSessionModel] = useAtom(chatSessionModelAtom)
  const setForced = useSetAtom(chatForcedTargetAtom)
  const [sessionRouting, setSessionRouting] = useAtom(chatSessionRoutingAtom)
  const sessionMode = useAtomValue(chatRoutingModeAtom)
  const targetId = useAtomValue(chatTargetProviderIdAtom)
  const sessionProvider = useAtomValue(chatSessionProviderAtom)
  const defaultModel = useAtomValue(chatDefaultModelAtom)
  const capabilities = useAtomValue(chatSessionCapabilitiesAtom)
  const refreshProviders = useRefreshProviders()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const baseId = useId()
  const hasSession = !!sessionId
  const isOpen = open === 'target'
  /** The chat in which the user just took the hand back from PO by picking a model. */
  const [tookControlIn, setTookControlIn] = useState<string | null>(null)
  /** A routing change of this chat on its way to the server, and the last refusal. */
  const [pending, setPending] = useState(false)
  const [refusal, setRefusal] = useState<{ sessionId: string; reason: ConversationRoutingRefusal } | null>(null)
  const settings = useAtomValue(chatRoutingSettingsAtom)
  /** A move to another provider being confirmed: the model picked there, and the route's answer. */
  const [switchTarget, setSwitchTarget] = useState<{ sessionId: string; pick: RoutingPick } | null>(null)
  const [switchPending, setSwitchPending] = useState(false)
  const [switchRefusal, setSwitchRefusal] = useState<SwitchProviderRefusal | null>(null)
  const [draft, setDraft] = useAtom(chatDraftInputAtom)
  const follow = useSetAtom(chatFollowRequestAtom)
  const setSwitching = useSetAtom(chatSwitchingSessionAtom)
  const chipRef = useRef<HTMLButtonElement>(null)
  const projectSlug = useAtomValue(chatRoutingSlugAtom)

  const instances = useMemo(() => list?.providers ?? [], [list])
  const claudeGroups = useMemo(() => groupModelsByFamily(catalog), [catalog])
  const { loaded, failed, retry } = useProviderModels(instances, isOpen)
  const vaultLocked = useVaultLocked(isOpen)

  // A chat the user gave its own model (recorded when they tick one) is no longer PO's to decide.
  const ownChoice = hasSession && sessionRouting?.routed_by === 'request'
  const auto = hasSession ? sessionMode === 'full' && !ownChoice : (autoDraft ?? autoByDefault)
  /** The model the chat runs now, the one it was opened with or switched to. */
  const liveModel = sessionModel ?? defaultModel
  /** An existing chat: its ticked models as the server holds them (mixed), else the one it runs. */
  const selection = useMemo<RoutingPick[]>(() => {
    if (!hasSession) return draftSelection
    const pool = sessionRouting?.routing_mode === 'mixed' ? (sessionRouting.routing_pool ?? []).filter((p) => p.provider === targetId) : []
    if (pool.length > 1) return pool
    return liveModel ? [{ provider: targetId, model: liveModel }] : []
  }, [hasSession, liveModel, targetId, draftSelection, sessionRouting])
  /** An existing chat can change model live only if its provider can. */
  const liveLocked = hasSession && !capabilities.set_model_live

  const modelsOf = (p: ProviderInstance): string[] =>
    isClaudeCodeProvider(p.id, p.kind) ? catalog.map((m) => m.id) : (loaded[p.id] ?? p.models ?? []).map((m) => m.id)
  // Only an unavailable provider (unhealthy, not allowed here) is off. On an existing chat,
  // a model of ANOTHER provider moves the conversation there (switch route, confirmed first).
  const lockReason = (p: ProviderInstance) => providerUnavailableReason(p)
  const selectable = instances.filter((p) => !lockReason(p))
  const total = selectable.reduce((n, p) => n + modelsOf(p).length, 0)

  /**
   * An existing chat: the change goes to the server (`PUT .../routing`) and the menu shows
   * what it answers - never a local guess. A refusal keeps the previous state and says why.
   */
  const sendRouting = (change: ConversationRoutingChange, tookControl: boolean) => {
    if (!sessionId || pending) return
    const sid = sessionId
    setPending(true)
    setRefusal(null)
    changeConversationRouting(sid, change)
      .then((session) => {
        setSessionRouting(sessionRoutingOf(session) ?? { routed_by: null, route_reason: null, routing_mode: change.auto ? 'full' : null })
        if (session.model) setSessionModel(session.model)
        setTookControlIn(tookControl ? sid : null)
      })
      .catch((err) => setRefusal({ sessionId: sid, reason: conversationRoutingRefusal(err) }))
      .finally(() => setPending(false))
  }

  /** Draft: every change goes through here - the draft's atoms, and the single pick the rest of the composer reads. */
  const commit = (nextAuto: boolean, next: RoutingPick[]) => {
    if (hasSession) {
      const added = next.find((p) => !isPicked(selection, p))
      // A model of another provider: the conversation moves there, once confirmed.
      if (added && added.provider !== targetId && sessionId) {
        setSwitchRefusal(null)
        setSwitchTarget({ sessionId, pick: added })
        onOpenChange(null)
        return
      }
      if (liveLocked) return
      // On Auto, picking a model takes the hand back on that model alone (strict).
      // Otherwise the ticks are the pool: one = strict, several = mixed; never none.
      const pool = auto ? (added ? [added] : []) : distinctModels(next, pickModelResolver(list))
      if (pool.length === 0) return
      sendRouting({ auto: false, routing_pool: pool.map(({ provider, model }) => ({ provider, model })) }, auto)
      return
    }
    setAutoDraft(nextAuto)
    setDraftSelection(next)
    const pilot = nextAuto ? undefined : next[0]
    setPickedProvider(pilot?.provider ?? null)
    setSessionModel(pilot?.model ?? null)
    setForced(!!pilot)
  }
  /** The switch, both ways, for this conversation only ("hand it back to PO" = on). */
  const setAuto = (on: boolean) => {
    if (hasSession) {
      // Off: the chat keeps the model it runs now, imposed (strict).
      if (on) sendRouting({ auto: true }, false)
      else if (liveModel) sendRouting({ auto: false, routing_pool: [{ provider: targetId, model: liveModel }] }, true)
      return
    }
    commit(on, selection)
  }
  const setAll = (on: boolean) =>
    commit(
      false,
      on ? selectable.flatMap((p) => modelsOf(p).map((model) => ({ provider: p.id, model }))) : [],
    )

  /**
   * Move the conversation (`POST .../switch-provider`): on success the tab follows the new
   * session and the draft that was sent is cleared; a refusal is said in the dialog and
   * nothing changes.
   */
  const confirmSwitch = (message: string) => {
    if (!switchTarget || switchPending) return
    const { sessionId: sid, pick } = switchTarget
    setSwitchPending(true)
    setSwitchRefusal(null)
    setSwitching(sid)
    switchConversationProvider(sid, { provider: pick.provider, model: pick.model, message })
      .then((move) => {
        // The message left with the move: the old conversation's draft is spent.
        if (draft.trim() && message.trim() === draft.trim()) setDraft('')
        setSwitchTarget(null)
        follow({ sessionId: move.session_id, fromSessionId: sid, notice: null })
      })
      .catch((err) => setSwitchRefusal(switchProviderRefusal(err)))
      .finally(() => {
        setSwitchPending(false)
        setSwitching(null)
      })
  }

  const nameOf = (provider: string, model: string) => {
    const p = instances.find((x) => x.id === provider) ?? null
    const alias = hasSession ? undefined : aliasesForInstance(p, list?.aliases).find((a) => a.alias === model)
    if (alias) return alias.alias
    return p && isClaudeCodeProvider(p.id, p.kind) ? getModelShortLabel(model) : providerModelLabel(p, model)
  }
  // An alias next to the model it stands for is ONE model: the mode is read from distinct models.
  const count = useMemo(() => distinctModels(selection, pickModelResolver(list)).length, [selection, list])
  const first = selection[0]
  const firstInstance = first ? (instances.find((p) => p.id === first.provider) ?? null) : null
  const sessionLabel = sessionProvider?.label ?? (firstInstance ? providerDisplayName(firstInstance) : targetId)
  // The mode is READ from the ticks: nothing stored, nothing to keep in step.
  const modeLabel = auto ? t('routing.modes.full.label') : count === 0 ? '' : count === 1 ? t('routing.menu.modeStrict') : t('routing.menu.modeMixed', { count })
  const chipText = auto
    ? t('routing.modes.full.label')
    : count === 0
      ? hasSession
        ? `${sessionLabel} › ${t('routing.menu.defaultModel')}`
        : t('routing.menu.chipDefault')
      : count === 1
        ? `${hasSession ? sessionLabel : firstInstance ? providerDisplayName(firstInstance) : first.provider} › ${nameOf(first.provider, first.model)}`
        : modeLabel
  const summary = auto ? t('routing.modes.full.description') : count === 0 ? t('routing.menu.summaryNone') : count === 1 ? t('routing.modes.primary.description') : t('routing.menu.summaryMixed', { count })
  const mode = auto ? 'full' : count > 1 ? 'mixed' : 'primary'

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => onOpenChange(isOpen ? null : 'target')}
        aria-label={`${t('routing.menu.aria')}: ${modeLabel && modeLabel !== chipText ? `${modeLabel} · ` : ''}${chipText}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        ref={chipRef}
        data-testid="target-chip"
        data-mode={mode}
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
          <AutoSwitch checked={auto} onChange={setAuto} disabled={pending} />
          {auto && hasSession && (
            <AutoPanel
              model={liveModel ? nameOf(targetId, liveModel) : null}
              reason={sessionRouting?.route_reason ?? null}
              routedBy={sessionRouting?.routed_by ?? null}
              stage={settings?.stage ?? null}
            />
          )}
          {auto && !hasSession && settings && settings.stage !== 'auto' && (
            <p data-testid="routing-stage-note" className="px-3 py-2 text-[11px] leading-snug text-amber-200/90 border-b border-white/[0.06]">
              {t('routing.menu.observing', { stage: t(`routing.stages.${settings.stage}.label`) })}
            </p>
          )}
          {refusal && refusal.sessionId === sessionId && (
            <p role="alert" data-testid="routing-refusal" className="px-3 py-2 text-[11px] leading-snug text-red-300 border-b border-white/[0.06]">
              {t(`routing.menu.refused.${refusal.reason}`)}
            </p>
          )}
          {!auto && hasSession && (
            <div data-testid="routing-own-choice" className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 border-b border-white/[0.06]">
              {tookControlIn === sessionId && liveModel && (
                <p role="status" className="min-w-0 flex-1 text-[11px] leading-snug text-gray-300">
                  {t('routing.menu.tookControl', { model: nameOf(targetId, liveModel) })}
                </p>
              )}
              <button type="button" data-testid="routing-hand-back" disabled={pending} onClick={() => setAuto(true)} className={BTN}>
                {t('routing.menu.handBack')}
              </button>
            </div>
          )}
          {vaultLocked && (
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <VaultUnlock onUnlocked={() => void refreshProviders()} />
            </div>
          )}

          {/* A draft on Auto: PO decides, the rest is off. An existing chat on Auto keeps
              its list usable: picking a model there takes the hand back. */}
          <div inert={(auto && !hasSession) || pending} aria-busy={pending || undefined} className={auto && !hasSession ? 'opacity-40' : undefined} data-testid="routing-selection">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06]">
              <p data-testid="routing-summary" aria-live="polite" className="min-w-0 flex-1 text-[10px] leading-snug text-gray-400">
                {modeLabel && <span className="text-gray-200">{modeLabel} · </span>}
                {summary}
              </p>
              {!hasSession && (
                <>
                  <button type="button" data-testid="routing-select-all" disabled={total === 0 || count >= total} onClick={() => setAll(true)} className={BTN}>
                    {t('routing.menu.selectAll')}
                  </button>
                  <button type="button" data-testid="routing-clear-all" disabled={count === 0} onClick={() => setAll(false)} className={BTN}>
                    {t('routing.menu.clearAll')}
                  </button>
                </>
              )}
            </div>
            {hasSession && (
              <div className="px-3 py-1.5 space-y-1 border-b border-white/[0.06]">
                {liveLocked && <p className="text-[10px] leading-snug text-gray-500">{t('routing.menu.liveUnsupported')}</p>}
                {onNewConversation && (
                  <button
                    type="button"
                    onClick={() => {
                      onNewConversation()
                      // The composer is now a new conversation: leave this menu open so it shows the targets to choose from.
                      onOpenChange('target')
                    }}
                    className={BTN}
                  >
                    {t('routing.menu.otherProvider')}
                  </button>
                )}
              </div>
            )}

            <div>
              {instances.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">{t('routing.menu.noProvider')}</div>}
              {instances.map((p) => {
                const reason = lockReason(p)
                const models = modelsOf(p)
                const claude = isClaudeCodeProvider(p.id, p.kind)
                const state = providerState(selection, p.id, models)
                const picked = models.filter((m) => isPicked(selection, { provider: p.id, model: m })).length
                // An existing chat: its own provider open; the others closed until asked (picking there moves the chat).
                const other = hasSession && p.id !== targetId
                const isExpanded = !reason && (expanded[p.id] ?? (hasSession ? !other : claude || state !== 'none'))
                // A provider that cannot change model live keeps its own models off; the others still offer a move.
                const sectionLocked = liveLocked && !other
                const sectionId = `${baseId}-${p.id}`
                return (
                  <div key={p.id} data-testid={`target-provider-${p.id}`} inert={sectionLocked} className={`border-b border-white/[0.04] last:border-b-0 ${sectionLocked ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      {!hasSession && (
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
                          className={`grid size-6 shrink-0 place-items-center rounded pointer-coarse:size-11 ${FOCUS} ${reason ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          <span
                            className={`grid h-4 w-4 place-items-center rounded border ${state === 'none' ? 'border-white/20' : 'border-violet-400 bg-violet-500/30'}`}
                            aria-hidden="true"
                          >
                            {state === 'all' && <Check className="h-3 w-3 text-violet-100" />}
                            {state === 'some' && <Minus className="h-3 w-3 text-violet-100" />}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        aria-expanded={reason ? undefined : isExpanded}
                        aria-controls={isExpanded ? sectionId : undefined}
                        aria-disabled={reason ? true : undefined}
                        onClick={() => !reason && setExpanded((e) => ({ ...e, [p.id]: !isExpanded }))}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded text-left text-xs ${TARGET} ${FOCUS} ${reason ? 'cursor-not-allowed text-gray-500' : 'text-gray-200'}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDotColor(p.health?.status)}`} aria-hidden="true" />
                        <span className="truncate">{providerDisplayName(p)}</span>
                        <span className="shrink-0 text-[10px] text-gray-500">{providerKindLabel(p.kind)}</span>
                        {!reason && models.length > 0 && !hasSession && (
                          <span className="ml-auto shrink-0 text-[10px] text-gray-500">{t('routing.menu.countOf', { selected: picked, total: models.length })}</span>
                        )}
                        {!reason && <ChevronDown className={`h-2.5 w-2.5 shrink-0 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''} ${hasSession ? 'ml-auto' : ''}`} aria-hidden="true" />}
                      </button>
                    </div>
                    {reason && <p className={`px-3 pb-1.5 text-[10px] leading-snug text-gray-500 ${hasSession ? '' : 'pl-9'}`}>{reason}</p>}
                    {!reason && other && (
                      <p data-testid={`routing-switch-hint-${p.id}`} className="px-3 pb-1.5 text-[10px] leading-snug text-gray-500">
                        {t('routing.switch.hint')}
                      </p>
                    )}
                    {isExpanded && (
                      <div id={sectionId} className="mb-1 ml-5 border-l border-white/[0.08]">
                        {claude ? (
                          <ClaudeFamilies
                            provider={p.id}
                            groups={claudeGroups}
                            loaded={catalogLoaded}
                            selection={selection}
                            onChange={(next) => commit(false, next)}
                            aliases={hasSession ? [] : aliasesForInstance(p, list?.aliases)}
                          />
                        ) : (
                          <ModelChecklist
                            provider={p.id}
                            models={loaded[p.id] ?? p.models ?? []}
                            loadingDone={p.id in loaded || !!failed[p.id]}
                            onRetry={() => retry(p.id)}
                            selection={selection}
                            aliases={hasSession ? [] : aliasesForInstance(p, list?.aliases)}
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
        </div>
      )}
      {switchTarget && switchTarget.sessionId === sessionId && (
        <SwitchProviderDialog
          target={`${(() => {
            const p = instances.find((x) => x.id === switchTarget.pick.provider)
            return p ? providerDisplayName(p) : switchTarget.pick.provider
          })()} › ${nameOf(switchTarget.pick.provider, switchTarget.pick.model)}`}
          current={liveModel ? `${sessionLabel} › ${nameOf(targetId, liveModel)}` : sessionLabel}
          initialMessage={draft}
          pending={switchPending}
          refusal={switchRefusal}
          projectSlug={projectSlug}
          onConfirm={confirmSwitch}
          onCancel={() => {
            setSwitchTarget(null)
            setSwitchRefusal(null)
          }}
          returnFocus={() => chipRef.current}
        />
      )}
    </div>
  )
}

/**
 * Auto, once the conversation exists: what PO chose and why, and how to take the hand
 * back. Before the `auto` learning stage PO only observes: the server records its
 * decisions but does not switch models, and the panel says so instead of "PO chose".
 */
function AutoPanel({ model, reason, routedBy, stage }: { model: string | null; reason: string | null; routedBy: RoutedBy | null; stage: LearningStage | null }) {
  const { t } = useT()
  const applies = stage === null || stage === 'auto'
  const lines = applies
    ? [
        model ? t('routing.menu.autoChose', { model }) : null,
        reason ? t('routing.reason', { reason }) : null,
        routedBy ? t('routing.picker.routedBy', { by: t(routedByKey(routedBy)) }) : null,
        t('routing.menu.autoHint'),
      ]
    : [t('routing.menu.observing', { stage: t(`routing.stages.${stage}.label`) }), model ? t('routing.menu.running', { model }) : null, t('routing.menu.autoHint')]
  return (
    <p data-testid="routing-auto-panel" className="whitespace-pre-line px-3 py-2.5 text-[11px] leading-snug text-gray-400 border-b border-white/[0.06]">
      {lines.join('\n')}
    </p>
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
  const { t } = useT()
  if (aliases.length === 0) return null
  return (
    <div role="group" aria-label={t('routing.menu.aliasesGroup')} className="border-b border-white/[0.06] py-1">
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
            className={`${ROW} ${on ? 'bg-white/[0.04] text-gray-100' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'}`}
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
  onRetry,
  selection,
  aliases,
  onChange,
}: {
  provider: string
  models: ProviderModel[]
  loadingDone: boolean
  onRetry: () => void
  selection: readonly RoutingPick[]
  aliases: { alias: string; model: string }[]
  onChange: (next: RoutingPick[]) => void
}) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  if (models.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-gray-500" aria-live="polite">
        {loadingDone ? t('routing.menu.noModels') : t('routing.menu.loading')}
        {loadingDone && (
          <button type="button" onClick={onRetry} className={`mt-1 flex gap-1 ${BTN}`}>
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            {t('routing.modelTargets.retry')}
          </button>
        )}
      </div>
    )
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
              className={`w-full rounded border border-white/[0.08] bg-surface-base py-1 pl-7 pr-2 text-base text-gray-100 placeholder-gray-500 focus:border-indigo-400/50 sm:text-xs ${TARGET} ${FOCUS}`}
            />
          </div>
        </div>
      )}
      <div role="group" aria-label={t('routing.menu.modelsGroup')} className="py-1">
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
              className={`${ROW} truncate ${on ? 'bg-white/[0.04] text-gray-100' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'}`}
            >
              <Tick on={on} />
              <span className="truncate">
                <Highlight text={m.label || m.id} query={q ? query : ''} />
              </span>
            </button>
          )
        })}
        {shown.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">{t('routing.menu.noMatch', { query: query.trim() })}</div>}
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
      <RefreshClaudeModels />
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
  const { t } = useT()
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
        className={`flex w-[4.25rem] shrink-0 items-center gap-2 self-stretch rounded text-left text-xs ${TARGET} ${FOCUS} ${pickedIdx.length ? 'text-gray-100' : 'text-gray-400 hover:text-gray-200'}`}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${group.dotColor}`} aria-hidden="true" />
        <span className="truncate">{group.label}</span>
      </button>

      <div role="group" aria-label={t('routing.menu.versionsGroup', { family: group.label })} className="relative flex h-9 min-w-0 flex-1 items-center sm:h-6">
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
              title={m.tier === 'legacy' ? `${m.fullLabel} (${t('routing.modelTargets.legacy')})` : m.fullLabel}
              onClick={() => onChange(togglePick(selection, { provider, model: m.id }))}
              className={`grid h-9 w-6 place-items-center rounded sm:h-6 pointer-coarse:h-11 ${FOCUS}`}
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
