import { atom, useAtomValue, useStore } from 'jotai'
import { useState } from 'react'
import { chatApi } from '@/services/chat'
import { readCancelFailure } from '@/utils/cancelFailure'
import { useT } from '@/i18n'

type Phase = 'idle' | 'sending' | 'signalled' | 'capped' | 'uncertain' | 'refused'
const phaseBySessionAtom = atom<Record<string, Phase>>({})

/** Session-wide, not a control for an individual tool. */
export function CancelAllTools({ sessionId, available }: { sessionId: string; available: boolean }) {
  const { t } = useT()
  const store = useStore()
  const phases = useAtomValue(phaseBySessionAtom)
  const phase = phases[sessionId] ?? 'idle'
  const [confirming, setConfirming] = useState(false)
  const setPhase = (next: Phase) => store.set(phaseBySessionAtom, (prev) => ({ ...prev, [sessionId]: next }))
  if (!available && (phase === 'idle' || phase === 'capped')) return null

  const submit = async () => {
    // The store check is synchronous, including across two mounted controls.
    const current = store.get(phaseBySessionAtom)[sessionId] ?? 'idle'
    if (!available || !confirming || (current !== 'idle' && current !== 'capped')) return
    setConfirming(false)
    setPhase('sending')
    try {
      const result = await chatApi.cancelTools(sessionId)
      if (result.capped === true) {
        // The backend explicitly reports no action at the rate cap.
        setPhase('capped')
      } else if (result.capped === false && Array.isArray(result.killed_pids)) {
        setPhase('signalled')
      } else {
        setPhase('uncertain')
      }
    } catch (err) {
      const failure = readCancelFailure(err)
      // A timeout, network failure, or relay error can follow an actual signal.
      // Never automatically repeat the request, even if a response says retryable.
      if (failure.code === 'unsupported' || failure.status === 422) setPhase('refused')
      else setPhase('uncertain')
    }
  }

  return (
    <div className="px-2.5 py-1.5 text-xs text-gray-300" data-testid="cancel-all-tools">
      {(phase === 'idle' || phase === 'capped') && !confirming && (
        <button type="button" className="text-amber-300 underline" onClick={() => setConfirming(true)}>
          {t('chatA-activity.cancelAll.open')}
        </button>
      )}
      {phase === 'capped' && <p role="status">{t('chatA-activity.cancelAll.capped')}</p>}
      {(phase === 'idle' || phase === 'capped') && confirming && (
        <div role="group" aria-label={t('chatA-activity.cancelAll.open')}>
          <p>{t('chatA-activity.cancelAll.explain')}</p>
          <div className="flex gap-3 mt-1">
            <button type="button" className="text-amber-300 underline" onClick={() => void submit()}>{t('chatA-activity.cancelAll.confirm')}</button>
            <button type="button" className="underline" onClick={() => setConfirming(false)}>{t('chatA-activity.cancelAll.back')}</button>
          </div>
        </div>
      )}
      {phase === 'sending' && <p role="status">{t('chatA-activity.cancelAll.sending')}</p>}
      {phase === 'signalled' && <p role="status">{t('chatA-activity.cancelAll.signalled')}</p>}
      {phase === 'uncertain' && <p role="status">{t('chatA-activity.cancelAll.uncertain')}</p>}
      {phase === 'refused' && <p role="status">{t('chatA-activity.cancelAll.refused')}</p>}
      {available && (phase === 'signalled' || phase === 'uncertain' || phase === 'refused') && (
        <button type="button" className="underline mt-1" onClick={() => setPhase('idle')}>
          {t('chatA-activity.cancelAll.reset')}
        </button>
      )}
    </div>
  )
}
