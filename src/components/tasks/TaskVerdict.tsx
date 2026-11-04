import { useState } from 'react'
import { useT } from '@/i18n'
import { feedbackApi } from '@/services/feedback'

interface TaskVerdictProps {
  taskId: string
  projectId?: string
  /** Called once the verdict is stored, so the caller can refresh what it shows. */
  onRecorded?: () => void
}

/**
 * A human's verdict on a task: did it deliver?
 *
 * Two buttons and nothing else. It exists because the reward had no way of being
 * contradicted: an agent's own "completed" never counts (RM-7), so the only signal left
 * is a person saying so. Without this, `learning_stats` stays at zero and the routing
 * reward keeps learning from nothing.
 */
export function TaskVerdict({ taskId, projectId, onRecorded }: TaskVerdictProps) {
  const { t } = useT()
  const [sending, setSending] = useState<1 | -1 | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recorded, setRecorded] = useState(false)
  // Resolved during render, not inside the async handler: a translator read after an
  // await belongs to a render that may be gone, and an exception there would escape the
  // catch that is supposed to SHOW the failure.
  const failureMessage = t('tasks.verdict.failed')

  const send = async (score: 1 | -1) => {
    if (sending !== null) return
    setSending(score)
    setError(null)
    try {
      await feedbackApi.submit({
        target_type: 'task',
        target_id: taskId,
        score,
        ...(projectId ? { project_id: projectId } : {}),
      })
      setRecorded(true)
      onRecorded?.()
    } catch {
      // An unrecorded verdict that looks recorded would be the same defect as an
      // unrewarded turn that looks rewarded: the failure has to be visible.
      setError(failureMessage)
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-400">{t('tasks.verdict.prompt')}</span>
      <button
        type="button"
        onClick={() => send(1)}
        disabled={sending !== null}
        className="rounded border border-emerald-600/60 px-2 py-0.5 text-xs text-emerald-300 hover:bg-emerald-600/20 disabled:opacity-50"
      >
        {t('tasks.verdict.delivered')}
      </button>
      <button
        type="button"
        onClick={() => send(-1)}
        disabled={sending !== null}
        className="rounded border border-rose-600/60 px-2 py-0.5 text-xs text-rose-300 hover:bg-rose-600/20 disabled:opacity-50"
      >
        {t('tasks.verdict.missed')}
      </button>
      {recorded && !error && (
        <span className="text-xs text-slate-400">{t('tasks.verdict.recorded')}</span>
      )}
      {error && (
        <span role="alert" className="text-xs text-rose-400">
          {error}
        </span>
      )}
    </div>
  )
}
