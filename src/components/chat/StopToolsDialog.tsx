/**
 * The confirmation in front of "stop the session's tools".
 *
 * Opening it sends nothing. It lists what is running, grouped by kind, every
 * row ticked (the person asked to stop), with quick selections above. Only the
 * primary button sends:
 * - everything ticked → `onConfirmAll`: the session-wide stop, which also
 *   reaches the foreground tools this list cannot show;
 * - otherwise one targeted `cancel-task` per ticked row that has a task id
 *   (bounded concurrency), through the shared store: one request per task, no
 *   replay, the answer survives an unmount. Foreground tools are NOT stopped,
 *   and the dialog says so.
 */
import { useId, useRef, useState } from 'react'
import { useT } from '@/i18n'
import { Dialog } from '@/components/ui/Dialog'
import type { RunningItem } from './runningActivity'
import {
  GROUP_ORDER, RECENT_THRESHOLD_MINUTES, STOP_CONCURRENCY, ageMs, groupOf, keepGroup, onlyOld, planStop, runPool, selectAll,
  selectNone, type Selection, type StopGroup,
} from './stopSelection'
import { taskFeedbackText, useTaskStopper } from './useTaskStopper'

interface Props {
  open: boolean
  onClose: () => void
  items: ReadonlyArray<RunningItem>
  /** The session-wide stop (`CancelAllTools`'s own, identity-guarded). */
  onConfirmAll: () => void
}

export function StopToolsDialog({ open, onClose, items, onConfirmAll }: Props) {
  const { t } = useT()
  const descriptionId = useId()
  return (
    <Dialog open={open} onClose={onClose} title={t('chatA-activity.stopDialog.title')} size="lg" describedBy={descriptionId}>
      {/* Mounted only while open: every opening starts from "everything ticked". */}
      {open && <Body items={items} onClose={onClose} onConfirmAll={onConfirmAll} descriptionId={descriptionId} />}
    </Dialog>
  )
}

function Body({ items, onClose, onConfirmAll, descriptionId }: Omit<Props, 'open'> & { descriptionId: string }) {
  const { t } = useT()
  const { operations, keyFor, stopTask } = useTaskStopper()
  const [now] = useState(() => Date.now())
  const [selection, setSelection] = useState<Selection>(() => selectAll(items.filter((i) => !operations[i.taskId ? keyFor(i.taskId) : ''])))
  const [submitted, setSubmitted] = useState<ReadonlyArray<RunningItem> | null>(null)
  const sending = useRef(false)

  // A row with a request already on file for its task cannot be sent again.
  const requested = (i: RunningItem) => !!i.taskId && !!operations[keyFor(i.taskId)]
  const selectable = items.filter((i) => !requested(i))
  const live = new Set([...selection].filter((id) => selectable.some((i) => i.id === id)))
  const plan = planStop(selectable, live)
  const count = plan.mode === 'all' ? selectable.length : plan.targets.length
  const groups = GROUP_ORDER.map((group) => ({ group, rows: items.filter((i) => groupOf(i) === group) })).filter((g) => g.rows.length > 0)

  const toggle = (id: string) => setSelection((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const age = (item: RunningItem): string => {
    const ms = ageMs(item, now)
    if (ms === undefined) return t('chatA-activity.stopDialog.age.unknown')
    const minutes = Math.floor(ms / 60_000)
    if (minutes < 1) return t('chatA-activity.stopDialog.age.lessThanMinute')
    return minutes < 60
      ? t('chatA-activity.stopDialog.age.minutes', { count: minutes })
      : t('chatA-activity.stopDialog.age.hours', { count: Math.floor(minutes / 60) })
  }

  const confirm = () => {
    if (sending.current) return
    if (plan.mode === 'all') {
      onConfirmAll()
      return
    }
    if (plan.targets.length === 0) return
    sending.current = true
    setSubmitted(plan.targets)
    void runPool(plan.targets, STOP_CONCURRENCY, (item) => stopTask(item.taskId!))
  }

  const btn = 'px-2 py-0.5 rounded border border-white/[0.1] text-[11px] text-gray-300 hover:bg-white/[0.06] disabled:opacity-40'
  const quick = (label: string, apply: () => Selection, hint?: string) => (
    <button type="button" className={btn} title={hint} onClick={() => setSelection(apply())}>{label}</button>
  )
  const hasGroup = (g: StopGroup) => selectable.some((i) => groupOf(i) === g)

  if (submitted) {
    return (
      <div className="space-y-3 text-sm text-gray-200">
        <p id={descriptionId} className="text-xs text-gray-400">{t('chatA-activity.stopDialog.resultsIntro')}</p>
        <ul className="space-y-1" aria-label={t('chatA-activity.stopDialog.results')}>
          {submitted.map((item) => {
            const op = operations[keyFor(item.taskId!)]
            return (
              <li key={item.id} role="status" className="text-xs" data-result={op?.phase === 'answered' ? op.feedback.kind : 'sending'}>
                <strong>{item.title}: </strong>
                {op?.phase === 'answered' ? taskFeedbackText(t, op.feedback) : t('chatA-activity.row.stopping')}
              </li>
            )
          })}
        </ul>
        <div className="flex justify-end">
          <button type="button" className={btn} onClick={onClose}>{t('chatA-activity.stopDialog.close')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-sm text-gray-200">
      <p id={descriptionId} className="text-xs text-gray-400">
        {t('chatA-activity.stopDialog.description')} {t('chatA-activity.cancelAll.explain')}
      </p>

      {items.length === 0 ? (
        <p className="text-xs">{t('chatA-activity.stopDialog.empty')}</p>
      ) : (
        <>
          <div role="group" aria-label={t('chatA-activity.stopDialog.quick.label')} className="flex flex-wrap gap-1.5">
            {quick(t('chatA-activity.stopDialog.quick.all'), () => selectAll(selectable))}
            {quick(t('chatA-activity.stopDialog.quick.none'), selectNone)}
            {quick(t('chatA-activity.stopDialog.quick.onlyOld'), () => onlyOld(selectable, live, now),
              t('chatA-activity.stopDialog.quick.onlyOldHint', { minutes: RECENT_THRESHOLD_MINUTES }))}
            {hasGroup('background') && quick(t('chatA-activity.stopDialog.quick.keepBackground'), () => keepGroup(selectable, live, 'background'))}
            {hasGroup('monitor') && quick(t('chatA-activity.stopDialog.quick.keepMonitors'), () => keepGroup(selectable, live, 'monitor'))}
            {hasGroup('agent') && quick(t('chatA-activity.stopDialog.quick.keepAgents'), () => keepGroup(selectable, live, 'agent'))}
          </div>
          <p className="text-xs tabular-nums" role="status" aria-live="polite">
            {t('chatA-activity.stopDialog.selected', { selected: live.size, total: selectable.length })}
          </p>
          <div className="max-h-[40vh] overflow-y-auto space-y-2">
            {groups.map(({ group, rows }) => (
              <section key={group} aria-label={t(`chatA-activity.stopDialog.group.${group}`)}>
                <h4 className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">{t(`chatA-activity.stopDialog.group.${group}`)}</h4>
                <ul>
                  {rows.map((item) => requested(item) ? (
                    <li key={item.id} className="py-0.5 text-xs text-gray-400">
                      <strong>{item.title}: </strong>{t('chatA-activity.stopDialog.alreadyRequested')}
                    </li>
                  ) : (
                    <li key={item.id}>
                      <label className="flex items-center gap-2 py-0.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={live.has(item.id)} onChange={() => toggle(item.id)} />
                        <span className="flex-1 min-w-0 truncate" title={item.title}>{item.title}</span>
                        <span className="shrink-0 tabular-nums text-gray-500">{age(item)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {plan.mode === 'partial' && (
        <div role="note" className="text-xs text-amber-300 space-y-1">
          <p>{t('chatA-activity.stopDialog.foregroundWarning')}</p>
          {plan.untargetable.length > 0 && (
            <p>{t('chatA-activity.stopDialog.untargetableWarning', { count: plan.untargetable.length })}</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className={btn} onClick={onClose}>{t('chatA-activity.stopDialog.cancel')}</button>
        <button
          type="button"
          className="px-3 py-1 rounded bg-red-600/80 text-white text-xs hover:bg-red-600 disabled:opacity-40"
          disabled={count === 0 && items.length > 0}
          onClick={confirm}
        >
          {items.length === 0
            ? t('chatA-activity.cancelAll.confirm')
            : t(count === 1 ? 'chatA-activity.stopDialog.confirmOne' : 'chatA-activity.stopDialog.confirmMany', { count })}
        </button>
      </div>
    </div>
  )
}
