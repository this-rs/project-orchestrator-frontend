import { useId, useMemo, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, ChevronDown, Lock, RefreshCw, Search } from 'lucide-react'
import { useT } from '@/i18n'
import { Highlight } from '@/components/ui/SearchableSelect'
import { fold } from '@/components/ui/searchFold'
import { useModelCatalog } from '@/components/settings/useModelCatalog'
import { useRefreshProviders } from '@/hooks/useProviders'
import {
  chatDefaultModelAtom,
  chatEffectiveProviderAtom,
  chatRoutingModeAtom,
  chatTargetProviderIdAtom,
  chatSelectedProviderAtom,
  chatSessionCapabilitiesAtom,
  chatSessionModelAtom,
  chatSessionProviderAtom,
  chatSessionRoutingAtom,
  modelCatalogAtom,
  modelCatalogLoadedAtom,
  modelCatalogRefreshingAtom,
  refreshModelCatalog,
  providersAtom,
  providersLoadStateAtom,
} from '@/atoms'
import { getModelDotColor, getModelShortLabel, groupModelsByFamily } from '@/constants/models'
import {
  AUTO_TARGET_HELP,
  AUTO_TARGET_LABEL,
  DEFAULT_MODEL_LABEL,
  NEW_CONVERSATION_OTHER_PROVIDER_LABEL,
  PROVIDER_LOCKED_TEXT,
  SET_MODEL_UNSUPPORTED_TEXT,
  aliasesForInstance,
  healthDotColor,
  healthLabel,
  providerModelLabel,
  providerUnavailableReason,
  routedByLabel,
} from '@/constants/providers'
import {
  isClaudeCodeProvider,
  providerDisplayName,
  providerKindLabel,
  type ProviderInstance,
} from '@/types/provider'
import { ModelFamilyPicker, type ModelSelectOptions } from './ModelFamilyPicker'
import { VaultUnlock } from './VaultUnlock'
import { useVaultLocked } from './useVaultLocked'

/** The one menu of the composer's target control, or none. Owned by the composer, which also has a mode menu to close. */
export type ProviderModelMenu = 'target' | 'routing' | null

interface ProviderModelPickerProps {
  /** Current session (null/undefined = a conversation not created yet). */
  sessionId?: string | null
  open: ProviderModelMenu
  onOpenChange: (open: ProviderModelMenu) => void
  /** Change the model of a LIVE session (sent over the socket). */
  onChangeModel?: (model: string) => void
  /** Start a new conversation — the way out of a session locked on its provider. */
  onNewConversation?: () => void
  /** Called when the user makes (`true`) or clears (`false`) an explicit choice for a NEW conversation. */
  onForce?: (forced: boolean) => void
}

const CHIP =
  'inline-flex min-w-0 max-w-full items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] border text-gray-300 hover:bg-white/[0.06] transition-colors'

const POPOVER =
  'absolute bottom-full left-0 right-0 sm:right-auto sm:w-72 mb-1 z-20 max-h-[min(22rem,55dvh)] overflow-y-auto overscroll-contain bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl'

const ROW = 'w-full text-left px-3 py-1.5 text-xs transition-colors'
const rowTone = (active: boolean) =>
  active ? 'text-gray-100 bg-white/[0.04]' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'

/**
 * Where the conversation being composed runs: provider AND model, in ONE
 * control — a single chip, a single menu.
 *
 * - New conversation: "Auto" first (nothing is sent, the server resolves the
 *   provider and the model; it says what it would pick), then one section per
 *   instance. A section opens on its models (and aliases); picking one sets
 *   both. Instances that cannot serve the project stay listed with the reason.
 * - Existing session: the provider is shown but locked — a conversation stays
 *   on its provider — and the model can change only if the provider can do it
 *   live (`set_model_live`).
 * - Backend without provider routes: no provider at all, and the Claude model
 *   picker exactly as it was.
 */
export function ProviderModelPicker({ sessionId, open, onOpenChange, onChangeModel, onNewConversation, onForce }: ProviderModelPickerProps) {
  const list = useAtomValue(providersAtom)
  const loadState = useAtomValue(providersLoadStateAtom)
  const [pickedProvider, setPickedProvider] = useAtom(chatSelectedProviderAtom)
  const effectiveId = useAtomValue(chatTargetProviderIdAtom)
  const instance = useAtomValue(chatEffectiveProviderAtom)
  const sessionProvider = useAtomValue(chatSessionProviderAtom)
  const [sessionModel, setSessionModel] = useAtom(chatSessionModelAtom)
  const setSessionRouting = useSetAtom(chatSessionRoutingAtom)
  const routingMode = useAtomValue(chatRoutingModeAtom)
  const defaultModel = useAtomValue(chatDefaultModelAtom)
  const capabilities = useAtomValue(chatSessionCapabilitiesAtom)
  const catalog = useAtomValue(modelCatalogAtom)
  const catalogLoaded = useAtomValue(modelCatalogLoadedAtom)
  const modelGroups = useMemo(() => groupModelsByFamily(catalog), [catalog])
  const [modelJustChanged, setModelJustChanged] = useState(false)
  /** Section opened by the user: `null` = follow the effective provider, `''` = all closed. */
  const [expanded, setExpanded] = useState<string | null>(null)
  const baseId = useId()
  const modelHelpId = `${baseId}-model-help`
  const refreshProviders = useRefreshProviders()

  const hasSession = !!sessionId
  const showProviders = list !== null && loadState !== 'unsupported'
  const vaultLocked = useVaultLocked(open === 'target' && showProviders)
  const resolvedDefault = showProviders ? (list.default ?? null) : null
  const effectiveClaude = loadState === 'unsupported' || isClaudeCodeProvider(effectiveId, instance?.kind ?? sessionProvider?.kind)

  // ── What is selected ───────────────────────────────────────────────
  // Aliases are offered for a NEW conversation only: the session-creation
  // request takes a logical name, a live model switch takes a model id.
  const aliasesOf = (p: ProviderInstance | null) => (hasSession ? [] : aliasesForInstance(p, list?.aliases))
  const activeAlias = aliasesOf(instance).find((a) => a.alias === sessionModel) ?? null
  const model = sessionModel ?? defaultModel
  /** The model id behind what is selected (an alias resolves to its target). */
  const activeModelId = activeAlias?.model ?? model ?? ''
  const nameOf = (p: ProviderInstance | null, modelId: string) =>
    (p ? isClaudeCodeProvider(p.id, p.kind) : effectiveClaude) ? getModelShortLabel(modelId) : providerModelLabel(p, modelId)
  const modelLabel = activeAlias ? activeAlias.alias : model ? nameOf(instance, model) : DEFAULT_MODEL_LABEL
  // Family colors are a Claude presentation. Another provider's model gets no
  // dot rather than the grey "other" one, which would read as a state.
  const modelDot = effectiveClaude && !showProviders ? getModelDotColor(activeModelId) : null
  const modelLocked = hasSession && !capabilities.set_model_live

  const pickedIsListed = !!pickedProvider && !!list?.providers.some((p) => p.id === pickedProvider)
  const autoActive = showProviders && !hasSession && !pickedIsListed && sessionModel === null

  const providerLabel = sessionProvider?.label ?? (instance ? providerDisplayName(instance) : effectiveId)
  const providerKind = providerKindLabel(sessionProvider?.kind ?? instance?.kind)

  // What "Auto" resolves to for this project, as the server says.
  const resolvedInstance = list?.providers.find((p) => p.id === resolvedDefault?.provider) ?? null
  const resolvedModel = resolvedDefault?.model ?? resolvedDefault?.alias ?? null
  const resolvedText = resolvedDefault
    ? [
        resolvedInstance ? providerDisplayName(resolvedInstance) : resolvedDefault.provider,
        resolvedModel ? nameOf(resolvedInstance, resolvedModel) : null,
        routedByLabel(resolvedDefault.routed_by),
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const close = () => {
    setExpanded(null)
    onOpenChange(null)
  }
  const toggle = () => {
    setExpanded(null)
    onOpenChange(open === 'target' ? null : 'target')
  }
  const flash = () => {
    setModelJustChanged(true)
    setTimeout(() => setModelJustChanged(false), 1000)
  }

  /** Pick a model, on `target` for a new conversation. `null` model = that instance's default. */
  const select = (target: ProviderInstance | null, modelId: string | null, { close: shut }: ModelSelectOptions = { close: true }) => {
    if (hasSession) {
      if (modelLocked || !modelId) return
      // Active session — mid-session model change over the socket.
      if (onChangeModel) onChangeModel(modelId)
      else setSessionModel(modelId)
      // This chat now carries the user's own choice: its chip must show it
      // instead of PO's. Local to this session (the record is reloaded per chat).
      setSessionRouting({ routed_by: 'request', route_reason: null, routing_mode: routingMode })
    } else if (target) {
      if (providerUnavailableReason(target)) return
      // Picking the server default's own instance is not a choice to remember:
      // nothing is sent and the server keeps resolving it.
      setPickedProvider(target.id === resolvedDefault?.provider ? null : target.id)
      setSessionModel(modelId)
      onForce?.(true)
    } else {
      setSessionModel(modelId)
      if (!hasSession) onForce?.(true)
    }
    if (shut) close()
    flash()
  }

  const selectAuto = () => {
    setPickedProvider(null)
    setSessionModel(null)
    onForce?.(false)
    close()
    flash()
  }

  // ── Chip ───────────────────────────────────────────────────────────
  const chipText = !showProviders ? modelLabel : autoActive ? AUTO_TARGET_LABEL : `${providerLabel} › ${modelLabel}`
  const chipTitle = autoActive && resolvedText ? `${AUTO_TARGET_LABEL}: ${resolvedText}` : chipText

  const choices = (p: ProviderInstance | null, active: string, withDefault: boolean, defaultActive = false) => (
    <ModelChoices
      instance={p}
      claude={p ? isClaudeCodeProvider(p.id, p.kind) : effectiveClaude}
      aliases={aliasesOf(p)}
      activeModelId={active}
      withDefault={withDefault}
      defaultActive={defaultActive}
      groups={modelGroups}
      catalogLoaded={catalogLoaded}
      nameOf={(id) => nameOf(p, id)}
      onSelect={(id, o) => select(p, id, o)}
    />
  )

  return (
    // Positioned only from `sm` up. Below that the picker's containing block
    // is the whole toolbar row, so it spans the input's width instead of
    // hanging off a button that sits mid-row — anchored to the button, a
    // phone-width screen pushed it off the right edge.
    <div className="min-w-0 sm:relative">
      <button
        type="button"
        onClick={toggle}
        // Named for what it is: "Default model" alone would read like the
        // "Default" permission mode sitting next to it.
        aria-label={showProviders ? `Provider and model: ${chipTitle}` : `Model: ${modelLabel}`}
        aria-haspopup="true"
        aria-expanded={open === 'target'}
        aria-describedby={modelLocked && showProviders === false ? modelHelpId : undefined}
        data-testid="target-chip"
        className={`${CHIP} ${modelJustChanged ? 'border-violet-400/50 ring-1 ring-violet-400/30' : 'border-white/[0.08]'}`}
      >
        {showProviders &&
          (hasSession ? (
            <Lock className="w-2.5 h-2.5 text-gray-500" aria-hidden="true" />
          ) : (
            <span
              className={`w-1.5 h-1.5 rounded-full ${healthDotColor((autoActive ? resolvedInstance : instance)?.health?.status)}`}
              aria-hidden="true"
            />
          ))}
        {modelDot && <span className={`w-1.5 h-1.5 rounded-full ${modelDot}`} />}
        <span className="min-w-0 max-w-[14rem] truncate" title={chipTitle}>
          {chipText}
        </span>
        {autoActive && resolvedText && (
          <span className="hidden sm:inline min-w-0 max-w-[8rem] truncate text-[9px] text-gray-500">
            {resolvedInstance ? providerDisplayName(resolvedInstance) : resolvedDefault?.provider}
          </span>
        )}
        <ChevronDown className="w-2.5 h-2.5 text-gray-500" aria-hidden="true" />
      </button>

      {open === 'target' && (
        <div data-testid="target-picker-popover" className={POPOVER}>
          {showProviders && vaultLocked && (
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <VaultUnlock onUnlocked={() => void refreshProviders()} />
            </div>
          )}
          {showProviders && hasSession && (
            <div className="px-3 py-2 space-y-1.5 border-b border-white/[0.06]">
              <div className="flex items-baseline gap-1.5 text-xs">
                <span className="text-gray-100">{providerLabel}</span>
                <span className="text-[10px] text-gray-500">{providerKind}</span>
              </div>
              <p className="text-[11px] leading-snug text-gray-400">{PROVIDER_LOCKED_TEXT}</p>
              {onNewConversation && (
                <button
                  type="button"
                  onClick={() => {
                    onNewConversation()
                    // The composer is now a new conversation: leave this menu
                    // open so it shows the targets to choose from.
                    onOpenChange('target')
                  }}
                  className="text-[11px] text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                >
                  {NEW_CONVERSATION_OTHER_PROVIDER_LABEL}
                </button>
              )}
            </div>
          )}

          {showProviders && !hasSession ? (
            <>
              <button
                type="button"
                aria-pressed={autoActive}
                onClick={selectAuto}
                data-testid="target-auto"
                className={`${ROW} border-b border-white/[0.06] ${rowTone(autoActive)}`}
              >
                <span className="flex items-center gap-1.5">
                  <span>{AUTO_TARGET_LABEL}</span>
                  {autoActive && <Check className="w-3 h-3 text-indigo-300" aria-hidden="true" />}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-gray-500">
                  {resolvedText ? `${AUTO_TARGET_HELP} Now: ${resolvedText}` : AUTO_TARGET_HELP}
                </span>
              </button>
              {list.providers.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">No provider configured</div>}
              {list.providers.map((p) => {
                const reason = providerUnavailableReason(p)
                const isOpen = !reason && (expanded ?? effectiveId) === p.id
                const reasonId = `${baseId}-reason-${p.id}`
                const sectionId = `${baseId}-section-${p.id}`
                return (
                  <div key={p.id} data-testid={`target-provider-${p.id}`}>
                    {/* Kept focusable and announced as disabled, with the reason
                        as visible text: a greyed-out row that says nothing
                        reads as a bug. */}
                    <button
                      type="button"
                      aria-expanded={reason ? undefined : isOpen}
                      aria-controls={isOpen ? sectionId : undefined}
                      aria-disabled={reason ? true : undefined}
                      aria-describedby={reason ? reasonId : undefined}
                      onClick={() => {
                        if (reason) return
                        setExpanded(isOpen ? '' : p.id)
                      }}
                      className={`${ROW} ${reason ? 'text-gray-500 cursor-not-allowed' : rowTone(false)}`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${healthDotColor(p.health?.status)}`} aria-hidden="true" />
                        <span className="sr-only">{healthLabel(p.health?.status)}:</span>
                        <span className="truncate">{providerDisplayName(p)}</span>
                        <span className="text-[10px] text-gray-500 shrink-0">{providerKindLabel(p.kind)}</span>
                        {!reason && (
                          <ChevronDown
                            className={`w-2.5 h-2.5 ml-auto shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                      {reason && (
                        <span id={reasonId} className="mt-0.5 block text-[10px] leading-snug text-gray-500">
                          {reason}
                        </span>
                      )}
                    </button>
                    {isOpen && (
                      <div id={sectionId} className="border-l border-white/[0.08] ml-3 mb-1">
                        {choices(p, p.id === effectiveId && !autoActive ? activeModelId : '', true, p.id === effectiveId && !autoActive && sessionModel === null)}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          ) : modelLocked ? (
            <p id={modelHelpId} className="px-3 py-2 text-[11px] leading-snug text-gray-400">
              {SET_MODEL_UNSUPPORTED_TEXT}
            </p>
          ) : (
            choices(instance, activeModelId, false)
          )}
        </div>
      )}
    </div>
  )
}

interface ModelChoicesProps {
  instance: ProviderInstance | null
  claude: boolean
  aliases: { alias: string; model: string }[]
  activeModelId: string
  /** A first row that picks the instance WITHOUT naming a model. */
  withDefault: boolean
  defaultActive: boolean
  groups: ReturnType<typeof groupModelsByFamily>
  catalogLoaded: boolean
  nameOf: (modelId: string) => string
  onSelect: (modelId: string | null, options?: ModelSelectOptions) => void
}

/** Default row, aliases, then the models of one instance (Claude families, or its own list). */
function ModelChoices({ instance, claude, aliases, activeModelId, withDefault, defaultActive, groups, catalogLoaded, nameOf, onSelect }: ModelChoicesProps) {
  const activeAlias = aliases.find((a) => a.alias === activeModelId)
  return (
    <>
      {withDefault && (
        <button type="button" aria-pressed={defaultActive} onClick={() => onSelect(null)} className={`${ROW} ${rowTone(defaultActive)}`}>
          {DEFAULT_MODEL_LABEL}
        </button>
      )}
      {aliases.length > 0 && (
        <div role="group" aria-label="Model aliases" className="py-1 border-b border-white/[0.06]">
          {aliases.map((a) => (
            <button
              key={a.alias}
              type="button"
              aria-pressed={activeAlias?.alias === a.alias}
              onClick={() => onSelect(a.alias)}
              className={`${ROW} flex items-baseline gap-2 ${rowTone(activeAlias?.alias === a.alias)}`}
            >
              <span>{a.alias}</span>
              <span className="ml-auto truncate text-[10px] text-gray-500">{nameOf(a.model)}</span>
            </button>
          ))}
        </div>
      )}
      {claude ? (
        <>
          <ModelFamilyPicker groups={groups} activeModelId={activeModelId} loaded={catalogLoaded} onSelect={(id, o) => onSelect(id, o)} />
          <RefreshClaudeModels />
        </>
      ) : (
        <ProviderModelList instance={instance} activeModelId={activeAlias ? '' : activeModelId} onSelect={(id) => onSelect(id)} />
      )}
    </>
  )
}

/** "Actualiser": asks the backend to re-read Anthropic's list. Never blocks the menu. */
export function RefreshClaudeModels() {
  const setModels = useSetAtom(modelCatalogAtom)
  const setLoaded = useSetAtom(modelCatalogLoadedAtom)
  const [refreshing, setRefreshing] = useAtom(modelCatalogRefreshingAtom)
  const { t } = useT()
  return (
    <div className="border-t border-white/[0.06] px-3 py-1.5">
      <button
        type="button"
        disabled={refreshing}
        aria-label={t('routing.menu.refreshModelsAria')}
        onClick={() => refreshModelCatalog(setModels, setLoaded, setRefreshing)}
        className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-200 disabled:opacity-60"
      >
        <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
        {refreshing ? t('routing.menu.refreshing') : t('routing.menu.refreshModels')}
      </button>
    </div>
  )
}

/** More models than this: the list gets a search field. */
const SEARCH_FROM = 6

interface ProviderModelListProps {
  instance: ProviderInstance | null
  activeModelId: string
  onSelect: (modelId: string) => void
}

/**
 * Models of a non-Claude instance: a flat list, each under the name its
 * provider gives it. No families, no version track — those are a reading of
 * Anthropic model ids and mean nothing for `qwen2.5-coder-32b`.
 */
function ProviderModelList({ instance, activeModelId, onSelect }: ProviderModelListProps) {
  // The instance's own `models` is only what was stored with it (its default
  // model, often nothing): the provider's real list comes from its catalog.
  // Mounted only while the menu is open, so it loads on demand.
  const catalog = useModelCatalog(instance?.id)
  const models = catalog.models && catalog.models.length > 0 ? catalog.models : (instance?.models ?? [])
  const [query, setQuery] = useState('')
  if (models.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-gray-500" aria-live="polite">
        {catalog.loading ? (
          'Loading models…'
        ) : (
          <>
            <p>{catalog.error ? `Could not load the models: ${catalog.error}` : 'No models listed for this provider'}</p>
            <button
              type="button"
              onClick={catalog.refresh}
              className="mt-1 inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
          </>
        )}
      </div>
    )
  }
  // A short list stays a plain group of buttons; a long one gets a search
  // field (the same matching as the settings combobox: id and label, case and
  // accents ignored).
  const searchable = models.length > SEARCH_FROM
  const q = searchable ? fold(query.trim()) : ''
  const shown = q ? models.filter((m) => fold(`${m.id}\n${m.label ?? ''}`).includes(q)) : models
  return (
    <div>
      {searchable && (
        <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-surface-popover px-2 py-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search models"
              placeholder="Search models…"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Clear first; a second Escape reaches the composer and closes the menu.
                if (e.key === 'Escape' && query) {
                  e.stopPropagation()
                  setQuery('')
                }
              }}
              className="w-full rounded border border-white/[0.08] bg-surface-base py-1 pl-7 pr-2 text-base text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-400/50 sm:text-xs"
            />
          </div>
          <p className="mt-1 px-0.5 text-[10px] text-gray-500" aria-live="polite">
            {q ? `${shown.length} of ${models.length}` : `${models.length} models`}
          </p>
        </div>
      )}
      <div role="group" aria-label="Models" className="py-1">
        {shown.map((m) => {
          const active = m.id === activeModelId
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(m.id)}
              title={m.label || m.id}
              className={`w-full text-left px-3 py-1.5 text-xs truncate transition-colors ${
                active ? 'text-gray-100 bg-white/[0.04]' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
              }`}
            >
              <Highlight text={m.label || m.id} query={q ? query : ''} />
            </button>
          )
        })}
        {shown.length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-500">{`No model matches “${query.trim()}”`}</div>
        )}
      </div>
    </div>
  )
}
