import { useEffect, useId, useState, type ReactNode } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  chatForcedTargetAtom,
  chatRoutingModeAtom,
  chatRoutingSettingsAtom,
  chatRoutingSlugAtom,
  chatSessionRoutingAtom,
  loadRoutingSettingsAtom,
  chatSelectedProviderAtom,
  chatSessionModelAtom,
  setRoutingModeAtom,
} from '@/atoms'
import { routedByKey } from '@/constants/providers'
import { useT } from '@/i18n'
import type { RoutedBy } from '@/types/provider'
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

/**
 * Where the conversation runs, in ONE menu (new conversation or existing one).
 *
 * The menu opens on the three routing modes - Auto, Mixed, Strict - and, under
 * them, what the mode in force lets you choose:
 * - Auto: nothing to pick. PO decides on the whole chain; once a conversation
 *   exists, the menu says what it chose and why.
 * - Mixed: the provider/model list is the pilot; PO routes the executors.
 * - Strict: the provider/model list is the one model of the whole chain.
 *
 * An existing conversation stays on its provider (the list is locked on it) and
 * can switch model when the provider can do it live. A server without the
 * router has no modes: the plain provider/model picker.
 */
export function RoutingModePicker({ sessionId, open, onOpenChange, onChangeModel, onNewConversation }: RoutingModePickerProps) {
  const { t } = useT()
  const slug = useAtomValue(chatRoutingSlugAtom)
  const load = useSetAtom(loadRoutingSettingsAtom)
  const mode = useAtomValue(chatRoutingModeAtom)
  const settings = useAtomValue(chatRoutingSettingsAtom)
  const sessionRouting = useAtomValue(chatSessionRoutingAtom)
  const setForced = useSetAtom(chatForcedTargetAtom)
  const setMode = useSetAtom(setRoutingModeAtom)
  const setPickedProvider = useSetAtom(chatSelectedProviderAtom)
  const setSessionModel = useSetAtom(chatSessionModelAtom)
  const [modeError, setModeError] = useState<string | null>(null)

  useEffect(() => {
    void load({ slug })
  }, [load, slug])

  const hasSession = !!sessionId
  const picker = (extra: { header?: ReactNode; autoPanel?: ReactNode; chipPrefix?: string } = {}) => (
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

  /** Switch the mode in place. On a draft, Auto hands the choice back to PO: any earlier pick is dropped. */
  const changeMode = async (next: ProviderRoutingMode) => {
    setModeError(null)
    if (next === 'full' && !hasSession) {
      setPickedProvider(null)
      setSessionModel(null)
      setForced(false)
    }
    const failure = await setMode({ slug, mode: next })
    if (failure) setModeError(failure === 'forbidden' ? t('routing.settings.errors.forbidden') : t('routing.menu.saveFailed'))
  }

  // A chat the user gave its own model (recorded by the picker, `routed_by: request`) is no longer PO's to decide.
  const ownChoice = hasSession && sessionRouting?.routed_by === 'request'
  const header = <RoutingModeTabs mode={mode} onChange={(m) => void changeMode(m)} error={modeError} />
  const autoPanel =
    mode === 'full' && !ownChoice ? (
      <AutoPanel
        reason={hasSession ? (sessionRouting?.route_reason ?? null) : null}
        routedBy={hasSession ? (sessionRouting?.routed_by ?? null) : null}
        decided={hasSession}
      />
    ) : undefined
  return picker({ header, autoPanel, chipPrefix: mode === 'mixed' && !hasSession ? `${t('routing.modes.mixed.label')} · ` : '' })
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

/** Auto: nothing to pick. Says what PO will do, or - once the conversation exists - what it did and why. */
function AutoPanel({ reason, routedBy, decided }: { reason: string | null; routedBy: RoutedBy | null; decided: boolean }) {
  const { t } = useT()
  const lines = decided
    ? [reason ? t('routing.reason', { reason }) : null, routedBy ? t('routing.picker.routedBy', { by: t(routedByKey(routedBy)) }) : null].filter(Boolean)
    : [t('routing.picker.willChoose')]
  return (
    <p data-testid="routing-auto-panel" className="whitespace-pre-line px-3 py-2.5 text-[11px] leading-snug text-gray-400">
      {lines.join('\n') || t('routing.badge.poChooses')}
    </p>
  )
}
