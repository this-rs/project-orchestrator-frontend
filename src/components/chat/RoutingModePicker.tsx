import { useEffect, useState, type ReactNode } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  chatForcedTargetAtom,
  chatRoutingModeAtom,
  chatRoutingSettingsAtom,
  chatRoutingSlugAtom,
  chatSessionRoutingAtom,
  loadRoutingSettingsAtom,
} from '@/atoms'
import { routedByKey } from '@/constants/providers'
import { useT } from '@/i18n'
import type { RoutedBy } from '@/types/provider'
import { DraftRoutingMenu, AutoSwitch } from './RoutingSelectionMenu'
import { ProviderModelPicker, type ProviderModelMenu } from './ProviderModelPicker'

interface RoutingModePickerProps {
  /** Current session (null/undefined = a conversation not created yet). */
  sessionId?: string | null
  open: ProviderModelMenu
  onOpenChange: (open: ProviderModelMenu) => void
  onChangeModel?: (model: string) => void
  onNewConversation?: () => void
}

/**
 * Where the conversation runs, in ONE menu.
 *
 * - A new conversation (`DraftRoutingMenu`): the Auto switch, then one section
 *   per provider with its models to tick. The mode is read from the ticks.
 * - An existing conversation: it keeps the mode it was opened with and its
 *   provider. In Auto the menu says what PO chose and why; the switch only
 *   flips the view to the model list, where a model can be switched live when
 *   the provider can do it.
 * - A server without the router has no modes: the plain provider/model picker.
 */
export function RoutingModePicker({ sessionId, open, onOpenChange, onChangeModel, onNewConversation }: RoutingModePickerProps) {
  const slug = useAtomValue(chatRoutingSlugAtom)
  const load = useSetAtom(loadRoutingSettingsAtom)
  const mode = useAtomValue(chatRoutingModeAtom)
  const settings = useAtomValue(chatRoutingSettingsAtom)
  const sessionRouting = useAtomValue(chatSessionRoutingAtom)
  const setForced = useSetAtom(chatForcedTargetAtom)
  /** What the switch of an existing chat shows: it cannot change the chat's mode, only the view. */
  const [view, setView] = useState<{ session: string; auto: boolean } | null>(null)

  useEffect(() => {
    void load({ slug })
  }, [load, slug])

  const picker = (extra: { header?: ReactNode; autoPanel?: ReactNode } = {}) => (
    <ProviderModelPicker
      sessionId={sessionId}
      open={open}
      onOpenChange={onOpenChange}
      onChangeModel={onChangeModel}
      onNewConversation={onNewConversation}
      onForce={setForced}
      {...extra}
    />
  )

  // No router on this server: no modes, the plain picker.
  if (!settings) return picker()
  if (!sessionId) return <DraftRoutingMenu open={open} onOpenChange={onOpenChange} />

  // A chat the user gave its own model (recorded by the picker, `routed_by: request`) is no longer PO's to decide.
  const ownChoice = sessionRouting?.routed_by === 'request'
  const auto = view?.session === sessionId ? view.auto : mode === 'full' && !ownChoice
  const header = <AutoSwitch checked={auto} onChange={(on) => setView({ session: sessionId, auto: on })} />
  const autoPanel = auto ? (
    <AutoPanel reason={sessionRouting?.route_reason ?? null} routedBy={sessionRouting?.routed_by ?? null} />
  ) : undefined
  return picker({ header, autoPanel })
}

/** Auto, once the conversation exists: what PO chose and why. */
function AutoPanel({ reason, routedBy }: { reason: string | null; routedBy: RoutedBy | null }) {
  const { t } = useT()
  const lines = [reason ? t('routing.reason', { reason }) : null, routedBy ? t('routing.picker.routedBy', { by: t(routedByKey(routedBy)) }) : null].filter(Boolean)
  return (
    <p data-testid="routing-auto-panel" className="whitespace-pre-line px-3 py-2.5 text-[11px] leading-snug text-gray-400">
      {lines.join('\n') || t('routing.badge.poChooses')}
    </p>
  )
}
