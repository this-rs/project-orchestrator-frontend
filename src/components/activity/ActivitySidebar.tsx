/**
 * The hub's filters: what kind of thing to watch, in what state, and whether the
 * cards may animate.
 *
 * Deliberately chips rather than multi-selects: a filter you must open to read is
 * a filter nobody checks, and this screen exists to answer "is everything fine?"
 * at a glance. The chips carry the counts the snapshot already computed, so the
 * answer is visible without toggling anything.
 *
 * Scope (project / workspace) is *not* here: the page is mounted under a
 * workspace, so its scope is the URL. A second scope selector would let the two
 * disagree.
 */
import { Switch } from '@/components/ui'
import { useT } from '@/i18n'
import type { ActivityCounts, ActivityCategory } from '@/types/activity'
import { CARD_CATEGORIES, CATEGORY_META } from './categoryMeta'

interface ActivitySidebarProps {
  categories: ActivityCategory[]
  onToggleCategory: (category: ActivityCategory) => void
  statuses: string[]
  onToggleStatus: (status: string) => void
  pulse: boolean
  onTogglePulse: (enabled: boolean) => void
  counts?: ActivityCounts
}

/** Statuses the server can put on an event, in the order a person cares about them.
 * The label keys are listed literally on purpose: `t()` is typed against the
 * catalogue, so a renamed key must break the build here, not the screen. */
const STATUS_FILTERS = ['running', 'pending', 'completed', 'failed', 'cancelled'] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_LABELS: Record<StatusFilter, Parameters<ReturnType<typeof useT>['t']>[0]> = {
  running: 'activity.status.running',
  pending: 'activity.status.queued',
  completed: 'activity.status.done',
  failed: 'activity.status.failed',
  cancelled: 'activity.status.cancelled',
}

export function ActivitySidebar({
  categories,
  onToggleCategory,
  statuses,
  onToggleStatus,
  pulse,
  onTogglePulse,
  counts,
}: ActivitySidebarProps) {
  const { t } = useT()

  const countFor = (category: ActivityCategory): number => {
    switch (category) {
      case 'plan_run':
        return counts?.plan_runs ?? 0
      case 'protocol_run':
        return counts?.protocol_runs ?? 0
      case 'chat_session':
        return counts?.chat_sessions ?? 0
      default:
        return 0
    }
  }

  return (
    <aside className="flex flex-col gap-4 lg:w-[260px] lg:shrink-0">
      <section>
        <h2 className="mb-2 text-[11px] font-medium text-gray-500">{t('activity.hub.filterType')}</h2>
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={categories.length === 0}
            onClick={() => categories.forEach(onToggleCategory)}
            label={t('activity.hub.all')}
          />
          {CARD_CATEGORIES.map((category) => {
            const meta = CATEGORY_META[category]
            const active = categories.includes(category)
            return (
              <Chip
                key={category}
                active={active}
                onClick={() => onToggleCategory(category)}
                label={meta.label()}
                count={countFor(category)}
                tint={meta.tint}
              />
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-medium text-gray-500">{t('activity.hub.filterStatus')}</h2>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((status) => (
            <Chip
              key={status}
              active={statuses.includes(status)}
              onClick={() => onToggleStatus(status)}
              label={STATUS_LABELS[status]}
            />
          ))}
        </div>
      </section>

      <section className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">{t('activity.hub.pulse')}</span>
        <Switch checked={pulse} onChange={onTogglePulse} ariaLabel={t('activity.hub.pulse')} />
      </section>
    </aside>
  )
}

interface ChipProps {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  tint?: string
}

function Chip({ active, onClick, label, count, tint }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
        active
          ? 'border-white/20 bg-white/[0.08] text-gray-100'
          : 'border-white/[0.06] text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
      }`}
    >
      {tint && (
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: tint }}
          aria-hidden="true"
        />
      )}
      {label}
      {count !== undefined && count > 0 && (
        <span className="tabular-nums text-gray-500">{count}</span>
      )}
    </button>
  )
}
