import { CircleHelp, CircleSlash, Info, Wrench, type LucideIcon } from 'lucide-react'
import { useT } from '@/i18n'
import {
  CAUSE_KEYS,
  classifyDegradations,
  degradationMessage,
  type DeclaredCapabilities,
  type Degradation,
  type DegradationCause,
} from '@/constants/engine'
import { panelGlass } from '@/components/ui/panelGlass'

const CAUSE_ICONS: Readonly<Record<DegradationCause, LucideIcon>> = {
  harness: Wrench,
  model: CircleSlash,
  unprobed: CircleHelp,
}

const CAUSES: readonly DegradationCause[] = ['harness', 'model', 'unprobed']

/**
 * Above the composer when the engine running this session lists features it
 * cannot provide: the user learns it before missing them, not after — and
 * learns WHY. What Project Orchestrator has not ported yet, what the model
 * really cannot do, and what is simply not measured yet are three separate
 * groups, each named in words (never by colour alone).
 */
export function EngineBanner({
  degraded,
  declared,
}: {
  degraded: readonly string[]
  /** Capabilities of the same `system_init`, as declared (raw). */
  declared?: DeclaredCapabilities | null
}) {
  const { t } = useT()
  if (degraded.length === 0) return null
  const items = classifyDegradations(degraded, declared)
  if (items.length === 0) return null
  const groups = CAUSES.map((cause) => [cause, items.filter((i) => i.cause === cause)] as const).filter(
    ([, list]) => list.length > 0,
  )
  return (
    <div
      role="note"
      data-testid="engine-banner"
      className={`mx-3 mb-1 flex items-start gap-2 rounded-lg border border-amber-500/25 ${panelGlass.warning} px-3 py-1.5 text-[11px] text-amber-200`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-amber-100">{t('session.degradation.title')}</p>
        {groups.map(([cause, list]) => (
          <CauseGroup key={cause} cause={cause} items={list} />
        ))}
      </div>
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
