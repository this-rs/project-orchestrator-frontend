import { useId, useMemo, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, Lock } from 'lucide-react'
import {
  chatDefaultModelAtom,
  chatEffectiveProviderAtom,
  chatEffectiveProviderIdAtom,
  chatProviderTargetAtom,
  chatSelectedProviderAtom,
  chatSessionCapabilitiesAtom,
  chatSessionModelAtom,
  chatSessionProviderAtom,
  modelCatalogAtom,
  modelCatalogLoadedAtom,
  providersAtom,
  providersLoadStateAtom,
} from '@/atoms'
import { getModelDotColor, getModelShortLabel, groupModelsByFamily } from '@/constants/models'
import {
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
import { providerDisplayName, providerKindLabel, type ProviderInstance } from '@/types/provider'
import { ModelFamilyPicker, type ModelSelectOptions } from './ModelFamilyPicker'

/** Which of the two menus is open. Owned by the composer, which also has a mode menu to close. */
export type ProviderModelMenu = 'provider' | 'model' | null

interface ProviderModelPickerProps {
  /** Current session (null/undefined = a conversation not created yet). */
  sessionId?: string | null
  open: ProviderModelMenu
  onOpenChange: (open: ProviderModelMenu) => void
  /** Change the model of a LIVE session (sent over the socket). */
  onChangeModel?: (model: string) => void
  /** Start a new conversation — the way out of a session locked on its provider. */
  onNewConversation?: () => void
}

const CHIP =
  'inline-flex min-w-0 max-w-full items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] border text-gray-300 hover:bg-white/[0.06] transition-all duration-300'

const POPOVER =
  'absolute bottom-full left-0 right-0 sm:right-auto sm:w-64 mb-1 z-20 max-h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl'

/**
 * Provider, then model, of the conversation being composed.
 *
 * - New conversation: pick the instance (the server default is preselected and
 *   its origin shown), then one of ITS models or aliases.
 * - Existing session: the provider is shown but locked — a conversation stays
 *   on its provider — and the model can change only if the provider can do it
 *   live (`set_model_live`).
 * - Backend without provider routes: no provider control at all, and the Claude
 *   model picker exactly as it was.
 */
export function ProviderModelPicker({ sessionId, open, onOpenChange, onChangeModel, onNewConversation }: ProviderModelPickerProps) {
  const list = useAtomValue(providersAtom)
  const loadState = useAtomValue(providersLoadStateAtom)
  const setPickedProvider = useSetAtom(chatSelectedProviderAtom)
  const effectiveId = useAtomValue(chatEffectiveProviderIdAtom)
  const instance = useAtomValue(chatEffectiveProviderAtom)
  const sessionProvider = useAtomValue(chatSessionProviderAtom)
  const [sessionModel, setSessionModel] = useAtom(chatSessionModelAtom)
  const defaultModel = useAtomValue(chatDefaultModelAtom)
  const capabilities = useAtomValue(chatSessionCapabilitiesAtom)
  const { isClaudeCode } = useAtomValue(chatProviderTargetAtom)
  const catalog = useAtomValue(modelCatalogAtom)
  const catalogLoaded = useAtomValue(modelCatalogLoadedAtom)
  const modelGroups = useMemo(() => groupModelsByFamily(catalog), [catalog])
  const [modelJustChanged, setModelJustChanged] = useState(false)
  const baseId = useId()
  const modelHelpId = `${baseId}-model-help`

  const hasSession = !!sessionId
  const showProviders = list !== null && loadState !== 'unsupported'
  const resolvedDefault = showProviders ? (list.default ?? null) : null

  // ── Model ──────────────────────────────────────────────────────────
  // Aliases are offered for a NEW conversation only: the session-creation
  // request takes a logical name, a live model switch takes a model id.
  const aliases = useMemo(
    () => (hasSession ? [] : aliasesForInstance(instance, list?.aliases)),
    [hasSession, instance, list],
  )
  const activeAlias = aliases.find((a) => a.alias === sessionModel) ?? null
  const model = sessionModel ?? defaultModel
  /** The model id behind what is selected (an alias resolves to its target). */
  const activeModelId = activeAlias?.model ?? model ?? ''
  const nameOf = (modelId: string) => (isClaudeCode ? getModelShortLabel(modelId) : providerModelLabel(instance, modelId))
  const modelChipLabel = activeAlias ? activeAlias.alias : model ? nameOf(model) : DEFAULT_MODEL_LABEL
  // Family colors are a Claude presentation. Another provider's model gets no
  // dot rather than the grey "other" one, which would read as a state.
  const modelDot = isClaudeCode ? getModelDotColor(activeModelId) : null
  const modelLocked = hasSession && !capabilities.set_model_live

  const selectModel = (modelId: string, { close }: ModelSelectOptions = { close: true }) => {
    if (modelLocked) return
    if (hasSession && onChangeModel) {
      // Active session — mid-session model change over the socket.
      onChangeModel(modelId)
    } else {
      // No session yet — used when the session is created.
      setSessionModel(modelId)
    }
    if (close) onOpenChange(null)
    setModelJustChanged(true)
    setTimeout(() => setModelJustChanged(false), 1000)
  }

  // ── Provider ───────────────────────────────────────────────────────
  const providerLabel = sessionProvider?.label ?? (instance ? providerDisplayName(instance) : effectiveId)
  const providerKind = providerKindLabel(sessionProvider?.kind ?? instance?.kind)
  const isDefaultProvider = !hasSession && resolvedDefault?.provider === effectiveId

  const selectProvider = (target: ProviderInstance) => {
    if (providerUnavailableReason(target)) return
    // Picking the server default is not a choice to remember: nothing is sent
    // and the server keeps resolving it (same rule as the permission mode).
    setPickedProvider(target.id === resolvedDefault?.provider ? null : target.id)
    // A model belongs to its instance: the one picked for the previous
    // provider must not travel to this one.
    if (target.id !== effectiveId) setSessionModel(null)
    onOpenChange(null)
  }

  const toggle = (menu: Exclude<ProviderModelMenu, null>) => onOpenChange(open === menu ? null : menu)

  return (
    <>
      {showProviders && (
        <div className="min-w-0 sm:relative">
          <button
            type="button"
            onClick={() => toggle('provider')}
            aria-haspopup="true"
            aria-expanded={open === 'provider'}
            aria-label={`Provider: ${providerLabel}`}
            data-testid="provider-chip"
            className={`${CHIP} border-white/[0.08]`}
          >
            {hasSession ? (
              <Lock className="w-2.5 h-2.5 text-gray-500" aria-hidden="true" />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full ${healthDotColor(instance?.health?.status)}`} aria-hidden="true" />
            )}
            <span className="min-w-0 max-w-[7rem] truncate" title={providerLabel}>
              {providerLabel}
            </span>
            {isDefaultProvider && (
              <span className="hidden sm:inline text-[9px] text-gray-500">{routedByLabel(resolvedDefault?.routed_by)}</span>
            )}
            <ChevronDown className="w-2.5 h-2.5 text-gray-500" aria-hidden="true" />
          </button>
          {open === 'provider' && (
            <div data-testid="provider-picker-popover" className={POPOVER}>
              {hasSession ? (
                <div className="px-3 py-2 space-y-1.5">
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
                        // open so it shows the instances to choose from.
                        onOpenChange('provider')
                      }}
                      className="text-[11px] text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                    >
                      {NEW_CONVERSATION_OTHER_PROVIDER_LABEL}
                    </button>
                  )}
                </div>
              ) : (
                <div role="radiogroup" aria-label="Provider" className="py-1">
                  {list.providers.length === 0 && (
                    <div className="px-3 py-2 text-xs text-gray-500">No provider configured</div>
                  )}
                  {list.providers.map((p) => {
                    const reason = providerUnavailableReason(p)
                    const checked = p.id === effectiveId
                    const reasonId = `${baseId}-reason-${p.id}`
                    return (
                      // Kept focusable and announced as disabled, with the reason
                      // as visible text: a greyed-out row that says nothing reads
                      // as a bug.
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-disabled={reason ? true : undefined}
                        aria-describedby={reason ? reasonId : undefined}
                        onClick={() => selectProvider(p)}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          reason
                            ? 'text-gray-500 cursor-not-allowed'
                            : checked
                              ? 'text-gray-100 bg-white/[0.04]'
                              : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${healthDotColor(p.health?.status)}`}
                            aria-hidden="true"
                          />
                          <span className="sr-only">{healthLabel(p.health?.status)}:</span>
                          <span className="truncate">{providerDisplayName(p)}</span>
                          <span className="text-[10px] text-gray-500 shrink-0">{providerKindLabel(p.kind)}</span>
                          {p.id === resolvedDefault?.provider && (
                            <span className="text-[9px] text-gray-500 ml-auto shrink-0">
                              {routedByLabel(resolvedDefault.routed_by)}
                            </span>
                          )}
                        </span>
                        {reason && (
                          <span id={reasonId} className="mt-0.5 block text-[10px] leading-snug text-gray-500">
                            {reason}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Positioned only from `sm` up. Below that the picker's containing
          block is the whole toolbar row, so it spans the input's width
          instead of hanging off a button that sits mid-row — anchored to
          the button, a phone-width screen pushed it off the right edge. */}
      <div className="min-w-0 sm:relative">
        <button
          type="button"
          onClick={() => toggle('model')}
          // Named for what it is: "Default model" alone would read like the
          // "Default" permission mode sitting next to it.
          aria-label={`Model: ${modelChipLabel}`}
          aria-haspopup="true"
          aria-expanded={open === 'model'}
          aria-disabled={modelLocked || undefined}
          aria-describedby={modelLocked ? modelHelpId : undefined}
          data-testid="model-chip"
          className={`${CHIP} ${
            modelJustChanged ? 'border-violet-400/50 ring-1 ring-violet-400/30' : 'border-white/[0.08]'
          } ${modelLocked ? 'text-gray-500 cursor-not-allowed' : ''}`}
        >
          {modelDot && <span className={`w-1.5 h-1.5 rounded-full ${modelDot}`} />}
          <span className="min-w-0 max-w-[9rem] truncate" title={modelChipLabel}>
            {modelChipLabel}
          </span>
          {modelLocked ? (
            <Lock className="w-2.5 h-2.5 text-gray-500" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-2.5 h-2.5 text-gray-500" />
          )}
        </button>
        {/* Always in the document while the control is disabled, so the
            relation holds whether or not the explanation is open on screen. */}
        {modelLocked && open !== 'model' && (
          <span id={modelHelpId} className="sr-only">
            {SET_MODEL_UNSUPPORTED_TEXT}
          </span>
        )}
        {open === 'model' && (
          <div data-testid="model-picker-popover" className={POPOVER}>
            {modelLocked ? (
              <p id={modelHelpId} className="px-3 py-2 text-[11px] leading-snug text-gray-400">
                {SET_MODEL_UNSUPPORTED_TEXT}
              </p>
            ) : (
              <>
                {aliases.length > 0 && (
                  <div role="group" aria-label="Model aliases" className="py-1 border-b border-white/[0.06]">
                    {aliases.map((a) => (
                      <button
                        key={a.alias}
                        type="button"
                        aria-pressed={activeAlias?.alias === a.alias}
                        onClick={() => selectModel(a.alias)}
                        className={`w-full flex items-baseline gap-2 text-left px-3 py-1.5 text-xs transition-colors ${
                          activeAlias?.alias === a.alias
                            ? 'text-gray-100 bg-white/[0.04]'
                            : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                        }`}
                      >
                        <span>{a.alias}</span>
                        <span className="ml-auto truncate text-[10px] text-gray-500">{nameOf(a.model)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {isClaudeCode ? (
                  <ModelFamilyPicker
                    groups={modelGroups}
                    activeModelId={activeModelId}
                    loaded={catalogLoaded}
                    onSelect={selectModel}
                  />
                ) : (
                  <ProviderModelList
                    instance={instance}
                    activeModelId={activeAlias ? '' : activeModelId}
                    onSelect={selectModel}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}

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
  const models = instance?.models ?? []
  if (models.length === 0) {
    return <div className="px-3 py-2 text-xs text-gray-500">No models listed for this provider</div>
  }
  return (
    <div role="group" aria-label="Models" className="py-1">
      {models.map((m) => {
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
            {m.label || m.id}
          </button>
        )
      })}
    </div>
  )
}
