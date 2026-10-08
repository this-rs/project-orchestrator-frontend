import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ChevronDown, Sparkles } from 'lucide-react'
import {
  chatForcedTargetAtom,
  chatRoutingModeAtom,
  chatRoutingSettingsAtom,
  chatRoutingSlugAtom,
  chatSessionRoutingAtom,
  loadRoutingSettingsAtom,
  providersAtom,
} from '@/atoms'
import { routedByKey } from '@/constants/providers'
import { useT } from '@/i18n'
import { providerDisplayName } from '@/types/provider'
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
 * reads "Forced: …". The chip is never called "Auto": that word is the
 * auto-continue toggle's.
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

  if (mode === 'primary') return picker()

  const hasSession = !!sessionId
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
  if (advanced && hasSession) return picker()

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
