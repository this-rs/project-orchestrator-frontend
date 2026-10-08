import { useEffect, useId, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, Sparkles } from 'lucide-react'
import {
  chatForcedTargetAtom,
  chatRoutingModeAtom,
  chatRoutingSettingsAtom,
  chatRoutingSlugAtom,
  chatSessionRoutingAtom,
  loadRoutingSettingsAtom,
  chatSelectedProviderAtom,
  chatSessionModelAtom,
  providersAtom,
  setRoutingModeAtom,
} from '@/atoms'
import { routedByKey } from '@/constants/providers'
import { useT } from '@/i18n'
import { providerDisplayName } from '@/types/provider'
import { ROUTING_MODES, type ProviderRoutingMode } from '@/types/routing'
import { ProviderModelPicker, type ProviderModelMenu } from './ProviderModelPicker'

interface RoutingModePickerProps {
  /** Current session (null/undefined = a conversation not created yet). */
  sessionId?: string | null
  open: ProviderModelMenu
  onOpenChange: (open: ProviderModelMenu) => void
  onChangeModel?: (model: string) => void
  onNewConversation?: () => void
}

const CHIP =
  'inline-flex min-w-0 max-w-full items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/[0.04] border border-white/[0.08] text-gray-300 hover:bg-white/[0.06] transition-colors duration-300'

const POPOVER =
  'absolute bottom-full left-0 right-0 sm:right-auto sm:w-72 mb-1 z-20 max-h-[min(22rem,55dvh)] overflow-y-auto overscroll-contain bg-surface-popover border border-white/[0.08] rounded-lg shadow-xl'

/**
 * Where the conversation being composed runs, by ROUTING MODE.
 *
 * - `primary` — exactly the provider/model picker (`ProviderModelPicker`).
 * - `mixed` — a chip "Primary: <provider · model> · PO routes executors": the
 *   primary pilots, PO routes the executors. No selector for the pilot here.
 * - `full` — no model selector at all: a chip "PO chooses" whose tooltip says
 *   why PO chose what it chose (`route_reason`, `routed_by`), once a session exists.
 *
 * In `mixed` and `full` an "Advanced" link opens the provider/model picker to
 * FORCE a target for this conversation (request level, explicit); the chip then
 * reads "Forced: …". In `full`, the chip reads "Auto" (PO decides), and it
 * switches to the chat's own model as soon as the user picks one in that chat.
 */
export function RoutingModePicker({ sessionId, open, onOpenChange, onChangeModel, onNewConversation }: RoutingModePickerProps) {
  const { t } = useT()
  const slug = useAtomValue(chatRoutingSlugAtom)
  const load = useSetAtom(loadRoutingSettingsAtom)
  const mode = useAtomValue(chatRoutingModeAtom)
  const settings = useAtomValue(chatRoutingSettingsAtom)
  const list = useAtomValue(providersAtom)
  const sessionRouting = useAtomValue(chatSessionRoutingAtom)
  const [forced, setForced] = useAtom(chatForcedTargetAtom)
  /** The Advanced path was opened (and nothing forced yet): the provider/model picker replaces the chip. */
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    void load({ slug })
  }, [load, slug])

  // Closing the advanced menu without forcing anything goes back to the mode chip.
  useEffect(() => {
    if (open === null && !forced) setAdvanced(false)
  }, [open, forced])

  const setMode = useSetAtom(setRoutingModeAtom)
  const setPickedProvider = useSetAtom(chatSelectedProviderAtom)
  const setSessionModel = useSetAtom(chatSessionModelAtom)
  const [modeError, setModeError] = useState<string | null>(null)

  /** Switch the mode in place. Auto hands the choice back to PO: any earlier pick of this draft is dropped. */
  const changeMode = async (next: ProviderRoutingMode) => {
    setModeError(null)
    if (next === 'full') {
      setPickedProvider(null)
      setSessionModel(null)
      setForced(false)
    }
    const failure = await setMode({ slug, mode: next })
    if (failure) setModeError(failure === 'forbidden' ? t('routing.settings.errors.forbidden') : t('routing.menu.saveFailed'))
  }

  const picker = (props: { chipPrefix?: string } = {}) => (
    <ProviderModelPicker
      sessionId={sessionId}
      open={open}
      onOpenChange={onOpenChange}
      onChangeModel={onChangeModel}
      onNewConversation={onNewConversation}
      {...props}
    />
  )

  const hasSession = !!sessionId

  // A conversation not created yet, on a server that has the router: ONE menu,
  // the three modes at the top and, under them, what that mode lets you choose.
  if (!hasSession && settings) {
    const header = <RoutingModeTabs mode={mode} onChange={(m) => void changeMode(m)} error={modeError} />
    return (
      <ProviderModelPicker
        sessionId={sessionId}
        open={open}
        onOpenChange={onOpenChange}
        onChangeModel={onChangeModel}
        onNewConversation={onNewConversation}
        onForce={setForced}
        header={header}
        autoPanel={mode === 'full' ? <AutoPanel /> : undefined}
        chipPrefix={mode === 'mixed' ? `${t('routing.modes.mixed.label')} · ` : ''}
      />
    )
  }

  if (mode === 'primary') return picker()

  /** This chat got the user's own choice (recorded by the picker, `routed_by: request`). */
  const ownChoice = hasSession && sessionRouting?.routed_by === 'request'
  // "Forced: " in the language of the user; the target itself follows in the chip.
  const forcedPrefix = t('routing.picker.forced', { target: '' }).trimEnd() + ' '
  if ((advanced || forced) && !hasSession) {
    return (
      <ProviderModelPicker
        sessionId={sessionId}
        open={open}
        onOpenChange={onOpenChange}
        onChangeModel={onChangeModel}
        onNewConversation={onNewConversation}
        onForce={setForced}
        chipPrefix={forced ? forcedPrefix : ''}
      />
    )
  }
  // A chat the user gave its own model shows that model, whatever the menu's
  // state: closing the menu after choosing must not bring "Auto" back.
  if ((advanced || ownChoice) && hasSession) return picker()

  // The primary of mixed mode: the setting, else what the server defaults to.
  const primary = settings?.primary ?? (list?.default ? { provider: list.default.provider, model: list.default.model ?? list.default.alias ?? null, alias: null } : null)
  const primaryInstance = primary ? (list?.providers.find((p) => p.id === primary.provider) ?? null) : null
  const primaryTarget = primary
    ? [primaryInstance ? providerDisplayName(primaryInstance) : primary.provider, primary.model ?? primary.alias].filter(Boolean).join(' · ')
    : t('routing.routedBy.default')

  const reason = hasSession ? (sessionRouting?.route_reason ?? null) : null
  const routedBy = hasSession ? (sessionRouting?.routed_by ?? null) : null
  const fullTooltip = !hasSession
    ? t('routing.picker.willChoose')
    : [reason ? t('routing.reason', { reason }) : null, routedBy ? t('routing.picker.routedBy', { by: t(routedByKey(routedBy)) }) : null]
        .filter(Boolean)
        .join('\n') || t('routing.badge.poChooses')

  const chipText = mode === 'mixed' ? t('routing.picker.primary', { target: primaryTarget }) : t('routing.badge.poChooses')
  const chipTitle = mode === 'mixed' ? chipText : fullTooltip
  const isOpen = open === 'routing'

  return (
    <div className="min-w-0 sm:relative">
      <button
        type="button"
        onClick={() => onOpenChange(isOpen ? null : 'routing')}
        aria-label={t('routing.picker.aria', { mode: t(`routing.modes.${mode}.label`) })}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title={chipTitle}
        data-testid="routing-chip"
        data-mode={mode}
        className={CHIP}
      >
        <Sparkles className="w-2.5 h-2.5 text-violet-300" aria-hidden="true" />
        <span className="min-w-0 max-w-[18rem] truncate">{chipText}</span>
        <ChevronDown className="w-2.5 h-2.5 text-gray-500" aria-hidden="true" />
      </button>
      {isOpen && (
        <div data-testid="routing-popover" className={`${POPOVER} px-3 py-2 space-y-1.5`}>
          <div className="text-xs text-gray-100">{t(`routing.modes.${mode}.label`)}</div>
          <p className="text-[11px] leading-snug text-gray-400">{t(`routing.modes.${mode}.description`)}</p>
          {mode === 'full' && (
            <p data-testid="routing-reason" className="whitespace-pre-line text-[11px] leading-snug text-gray-300">
              {fullTooltip}
            </p>
          )}
          <button
            type="button"
            data-testid="routing-advanced"
            onClick={() => {
              setAdvanced(true)
              onOpenChange('target')
            }}
            className="text-[11px] text-indigo-300 hover:text-indigo-200 underline underline-offset-2 text-left"
          >
            {t('routing.advanced.force')}
          </button>
        </div>
      )}
    </div>
  )
}

/** The three modes as one radio group: the same words everywhere (`routing.modes.*`). */
function RoutingModeTabs({ mode, onChange, error }: { mode: ProviderRoutingMode; onChange: (mode: ProviderRoutingMode) => void; error: string | null }) {
  const { t } = useT()
  const id = useId()
  // Reading order: from the widest decision (Auto) to the narrowest (Strict).
  const order: ProviderRoutingMode[] = ['full', 'mixed', 'primary']
  return (
    <div className="px-2 pt-2 pb-1.5 border-b border-white/[0.06]" data-testid="routing-tabs">
      <div role="radiogroup" aria-label={t('routing.menu.modeLegend')} className="grid grid-cols-3 gap-0.5 rounded-md bg-white/[0.04] p-0.5">
        {order
          .filter((m) => (ROUTING_MODES as readonly string[]).includes(m))
          .map((m) => {
            const active = m === mode
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                aria-describedby={`${id}-hint`}
                data-testid={`routing-mode-${m}`}
                onClick={() => onChange(m)}
                className={`rounded px-1.5 py-1 text-[11px] transition-colors ${
                  active ? 'bg-white/[0.10] text-gray-100' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t(`routing.modes.${m}.label`)}
              </button>
            )
          })}
      </div>
      <p id={`${id}-hint`} className="mt-1.5 px-1 text-[10px] leading-snug text-gray-500">
        {t(`routing.modes.${mode}.description`)}
      </p>
      {error && (
        <p role="alert" className="mt-1 px-1 text-[10px] leading-snug text-amber-300">
          {error}
        </p>
      )}
    </div>
  )
}

/** Auto: nothing to pick. Says so, and where the reasons will show once the conversation exists. */
function AutoPanel() {
  const { t } = useT()
  return (
    <p data-testid="routing-auto-panel" className="px-3 py-2.5 text-[11px] leading-snug text-gray-400">
      {t('routing.picker.willChoose')}
    </p>
  )
}
