import { ChevronUp, CircleHelp, CircleSlash, Info, PackageX, Wrench, type LucideIcon } from 'lucide-react'
import type { RefObject } from 'react'
import { useT } from '@/i18n'
import {
  CAUSE_KEYS,
  CAUSE_ORDER,
  degradationMessage,
  engineGaps,
  type DeclaredCapabilities,
  type Degradation,
  type DegradationCause,
} from '@/constants/engine'
import { panelGlass } from '@/components/ui/panelGlass'
import { focusRing } from '@/components/ui/classes'

const CAUSE_ICONS: Readonly<Record<DegradationCause, LucideIcon>> = {
  installation: PackageX,
  harness: Wrench,
  model: CircleSlash,
  unprobed: CircleHelp,
}

/**
 * Above the composer when the engine running this session lists features it
 * cannot provide: the user learns it before missing them, not after — and
 * learns WHY. What this installation lacks (and how to fix it), what Project
 * Orchestrator has not ported yet, what the model really cannot do, and what is
 * simply not measured yet are four separate groups, each named in words (never by colour alone).
 *
 * With `onCollapse`, the banner offers to put itself away: it then lives as an amber icon in the
 * chat header (`CapabilityGapsButton`), which opens the same list on demand.
 */
export function EngineBanner({
  degraded,
  declared,
  onCollapse,
  collapseRef,
}: {
  degraded: readonly string[]
  /** Capabilities of the same `system_init`, as declared (raw). */
  declared?: DeclaredCapabilities | null
  /** Put the banner away as an icon in the chat header. */
  onCollapse?: () => void
  /** The collapse button, for whoever must move focus to it (the header icon that was just used). */
  collapseRef?: RefObject<HTMLButtonElement | null>
}) {
  const { t } = useT()
  const items = engineGaps(degraded, declared)
  if (items.length === 0) return null
  return (
    <div
      role="note"
      data-testid="engine-banner"
      className={`mx-3 mb-1 flex items-start gap-2 rounded-lg border border-amber-500/25 ${panelGlass.warning} px-3 py-1.5 text-[11px] text-amber-200`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <EngineGapsDetail items={items} />
      {onCollapse && (
        <button
          ref={collapseRef}
          type="button"
          onClick={onCollapse}
          data-testid="engine-banner-collapse"
          className={`-my-0.5 -mr-1.5 ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md text-amber-300 transition-colors hover:bg-amber-500/15 hover:text-amber-100 pointer-coarse:-my-3 pointer-coarse:-mr-3 pointer-coarse:size-11 ${focusRing}`}
          title={t('session.degradation.collapse')}
          aria-label={t('session.degradation.collapse')}
        >
          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** The title and the groups by cause: the body of the banner, and of the header icon's popover. */
export function EngineGapsDetail({ items, titleId }: { items: readonly Degradation[]; titleId?: string }) {
  const { t } = useT()
  const groups = CAUSE_ORDER.map((cause) => [cause, items.filter((i) => i.cause === cause)] as const).filter(
    ([, list]) => list.length > 0,
  )
  return (
    <div className="min-w-0 space-y-1">
      <p id={titleId} className="font-medium text-amber-100">{t('session.degradation.title')}</p>
      {groups.map(([cause, list]) => (
        <CauseGroup key={cause} cause={cause} items={list} />
      ))}
    </div>
  )
}

function CauseGroup({ cause, items }: { cause: DegradationCause; items: readonly Degradation[] }) {
  const { t } = useT()
  const Icon = CAUSE_ICONS[cause]
  const keys = CAUSE_KEYS[cause]
  return (
    <section data-testid={`engine-banner-${cause}`} data-cause={cause} aria-label={t(keys.heading)}>
      <p className="flex items-center gap-1 font-medium text-amber-100/90">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>{t(keys.heading)}</span>
        <span className="font-normal text-amber-200/70">— {t(keys.note)}</span>
      </p>
      <ul className="mt-0.5 list-disc pl-6 text-amber-200/80">
        {items.map((item) => {
          const { key, vars } = degradationMessage(item)
          return (
            <li key={item.id} data-feature={item.id}>
              {t(key, vars)}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
