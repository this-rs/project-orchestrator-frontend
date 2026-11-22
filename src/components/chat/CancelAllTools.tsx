import { atom, useAtomValue, useStore } from 'jotai'
import { useLayoutEffect, useRef, useState } from 'react'
import { chatApi } from '@/services/chat'
import { getAuthMode } from '@/services/auth'
import { RequestIdentityChangedError } from '@/services/api'
import { authModeAtom, authModeConfirmedAtom, currentUserAtom } from '@/atoms/auth'
import { readCancelFailure } from '@/utils/cancelFailure'
import { useT } from '@/i18n'

type Phase = 'idle' | 'sending' | 'signalled' | 'capped' | 'uncertain' | 'refused' | 'identityChanged'
const phaseBySessionAtom = atom<Partial<Record<string, Phase>>>({})
// A request from an older login epoch may still reach the server. Keep its
// uncertainty for the same principal/session, but never block another user.
const pendingByPrincipalAtom = atom<Partial<Record<string, 'sending' | 'uncertain'>>>({})
const authEpochAtom = atom(0)
const observedStores = new WeakSet<object>()

/** Compare a token's declared subject only; the server still verifies its signature. */
function tokenSubject(token: string | null): string | null {
  try {
    if (!token || token.split('.').length !== 3) return null
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4))) as { sub?: unknown }
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch { return null }
}

/** Session-wide, not a control for an individual tool. */
export function CancelAllTools({ sessionId, available }: { sessionId: string; available: boolean }) {
  const store = useStore()
  const userId = useAtomValue(currentUserAtom)?.id ?? null
  const mode = useAtomValue(authModeAtom)
  const modeConfirmed = useAtomValue(authModeConfirmedAtom)
  const epoch = useAtomValue(authEpochAtom)
  useLayoutEffect(() => {
    if (observedStores.has(store)) return
    observedStores.add(store)
    const changed = () => store.set(authEpochAtom, (n) => n + 1)
    // Keep observing for the life of this store: navigation away during a request
    // must not erase an intervening account change (including A → B → A).
    store.sub(currentUserAtom, changed)
    store.sub(authModeAtom, changed)
    store.sub(authModeConfirmedAtom, changed)
  }, [store])
  const scope = JSON.stringify([sessionId, userId, mode, modeConfirmed, epoch])
  return <CancelAllToolsScoped key={JSON.stringify([scope, available])} sessionId={sessionId} available={available} scope={scope} userId={userId} mode={mode} modeConfirmed={modeConfirmed} epoch={epoch} />
}

function CancelAllToolsScoped({ sessionId, available, scope, userId, mode, modeConfirmed, epoch }: {
  sessionId: string; available: boolean; scope: string; userId: string | null;
  mode: 'none' | 'required'; modeConfirmed: boolean; epoch: number
}) {
  const { t } = useT()
  const store = useStore()
  const phases = useAtomValue(phaseBySessionAtom)
  const pending = useAtomValue(pendingByPrincipalAtom)
  const principal = JSON.stringify([sessionId, userId, mode])
  const ownPhase = phases[scope]
  const phase = ownPhase === undefined || ownPhase === 'idle' || ownPhase === 'capped'
    ? pending[principal] ?? ownPhase ?? 'idle'
    : ownPhase
  const [confirming, setConfirming] = useState(false)
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const setPhase = (next: Phase) => store.set(phaseBySessionAtom, (prev) => ({ ...prev, [scope]: next }))
  const setPending = (next: 'sending' | 'uncertain' | null) => store.set(pendingByPrincipalAtom, (prev) => {
    const updated = { ...prev }
    if (next) updated[principal] = next
    else delete updated[principal]
    return updated
  })
  if (!available && (phase === 'idle' || phase === 'capped')) return null

  const submit = async () => {
    // The store check is synchronous, including across two mounted controls.
    const current = store.get(phaseBySessionAtom)[scope] ?? 'idle'
    if (!available || !confirming || store.get(pendingByPrincipalAtom)[principal] || (current !== 'idle' && current !== 'capped')) return
    setConfirming(false)
    setPending('sending')
    setPhase('sending')
    try {
      const sameIdentity = (token: string | null) => {
        if (!active.current || !available || !modeConfirmed || store.get(authEpochAtom) !== epoch || store.get(authModeAtom) !== mode ||
            store.get(authModeConfirmedAtom) !== modeConfirmed || getAuthMode() !== mode ||
            (store.get(currentUserAtom)?.id ?? null) !== userId) return false
        // No cookie-only authentication: in required mode the exact Bearer sent
        // must name the person who confirmed, even after an awaited refresh.
        return mode === 'none' ? modeConfirmed && token === null : !!userId && tokenSubject(token) === userId
      }
      const result = await chatApi.cancelTools(sessionId, sameIdentity)
      if (result.capped === true) {
        // The backend explicitly reports no action at the rate cap.
        setPending(null)
        setPhase('capped')
      } else if (result.capped === false && Array.isArray(result.killed_pids)) {
        setPending(null)
        setPhase('signalled')
      } else {
        setPending('uncertain')
        setPhase('uncertain')
      }
    } catch (err) {
      const failure = readCancelFailure(err)
      // A timeout, network failure, or relay error can follow an actual signal.
      // Never automatically repeat the request, even if a response says retryable.
      if (err instanceof RequestIdentityChangedError) {
        setPending(null)
        setPhase('identityChanged')
      } else if (failure.code === 'unsupported' || failure.status === 422) {
        setPending(null)
        setPhase('refused')
      } else {
        setPending('uncertain')
        setPhase('uncertain')
      }
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
      {phase === 'identityChanged' && <p role="status">{t('chatA-activity.cancelAll.identityChanged')}</p>}
      {available && (phase === 'signalled' || phase === 'uncertain' || phase === 'refused' || phase === 'identityChanged') && (
        <button type="button" className="underline mt-1" onClick={() => { setPending(null); setPhase('idle') }}>
          {t('chatA-activity.cancelAll.reset')}
        </button>
      )}
    </div>
  )
}
