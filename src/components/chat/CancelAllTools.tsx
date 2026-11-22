import { atom, useAtomValue, useStore } from 'jotai'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { chatApi } from '@/services/chat'
import { getAuthMode } from '@/services/auth'
import { parseJwtExp } from '@/services/authManager'
import { RequestIdentityChangedError } from '@/services/api'
import { authModeAtom, authModeConfirmedAtom, currentUserAtom } from '@/atoms/auth'
import { readCancelFailure } from '@/utils/cancelFailure'
import { useT } from '@/i18n'
import type { RunningItem } from './runningActivity'
import { StopToolsDialog } from './StopToolsDialog'

type Phase = 'idle' | 'sending' | 'signalled' | 'capped' | 'uncertain' | 'refused' | 'unauthenticated' | 'forbidden' | 'ownerUnreachable' | 'identityChanged'
const phaseBySessionAtom = atom<Partial<Record<string, Phase>>>({})
// A request from an older login epoch may still reach the server. Keep its
// uncertainty for the same principal/session, but never block another user.
const pendingByPrincipalAtom = atom<Partial<Record<string, 'sending' | 'uncertain' | 'signalled'>>>({})
// A confirmation is valid only until somebody starts or resets an operation.
const operationVersionAtom = atom<Partial<Record<string, number>>>({})
const authEpochAtom = atom(0)
const observedStores = new WeakSet<object>()
// Longer than the backend's owner/relay bounds, but finite if a proxy never answers.
const CANCEL_ALL_TIMEOUT_MS = 30_000

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
export function CancelAllTools({ sessionId, available, unsupported = false, items = [] }: { sessionId: string; available: boolean; unsupported?: boolean; items?: ReadonlyArray<RunningItem> }) {
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
  return <CancelAllToolsScoped key={JSON.stringify([scope, available])} sessionId={sessionId} available={available} unsupported={unsupported} items={items} scope={scope} userId={userId} mode={mode} modeConfirmed={modeConfirmed} epoch={epoch} />
}

function CancelAllToolsScoped({ sessionId, available, unsupported, items, scope, userId, mode, modeConfirmed, epoch }: {
  sessionId: string; available: boolean; unsupported: boolean; items: ReadonlyArray<RunningItem>; scope: string; userId: string | null;
  mode: 'none' | 'required'; modeConfirmed: boolean; epoch: number
}) {
  const { t } = useT()
  const store = useStore()
  const unsupportedId = useId()
  const phases = useAtomValue(phaseBySessionAtom)
  const pending = useAtomValue(pendingByPrincipalAtom)
  const versions = useAtomValue(operationVersionAtom)
  const principal = JSON.stringify([sessionId, userId, mode])
  const version = versions[principal] ?? 0
  const ownPhase = phases[scope]
  const phase = ownPhase === undefined || ownPhase === 'idle'
    ? pending[principal] ?? ownPhase ?? 'idle'
    : ownPhase
  const [confirmationVersion, setConfirmationVersion] = useState<number | null>(null)
  const confirming = confirmationVersion !== null && confirmationVersion === version
  const active = useRef(false)
  useLayoutEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const setPhase = (next: Phase) => store.set(phaseBySessionAtom, (prev) => ({ ...prev, [scope]: next }))
  const setPending = (next: 'sending' | 'uncertain' | 'signalled' | null) => store.set(pendingByPrincipalAtom, (prev) => {
    const updated = { ...prev }
    if (next) updated[principal] = next
    else delete updated[principal]
    return updated
  })
  const invalidateConfirmations = () => store.set(operationVersionAtom, (prev) => ({ ...prev, [principal]: (prev[principal] ?? 0) + 1 }))
  if (!available && phase === 'idle') {
    if (!unsupported) return null
    return <div className="px-2.5 py-1.5 text-xs text-gray-300" data-testid="cancel-all-tools">
      <button type="button" disabled aria-describedby={unsupportedId}>{t('chatA-activity.cancelAll.open')}</button>
      <p id={unsupportedId}>{t('chatA-activity.cancelAll.unsupported')}</p>
    </div>
  }

  const submit = async () => {
    // The store check is synchronous, including across two mounted controls.
    const current = store.get(phaseBySessionAtom)[scope] ?? 'idle'
    if (!available || !confirming || confirmationVersion !== (store.get(operationVersionAtom)[principal] ?? 0) || store.get(pendingByPrincipalAtom)[principal] || (current !== 'idle' && current !== 'capped')) return
    invalidateConfirmations()
    setConfirmationVersion(null)
    setPending('sending')
    setPhase('sending')
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const sameIdentity = (token: string | null) => {
        if (!active.current || !available || !modeConfirmed || store.get(authEpochAtom) !== epoch || store.get(authModeAtom) !== mode ||
            store.get(authModeConfirmedAtom) !== modeConfirmed || getAuthMode() !== mode ||
            (store.get(currentUserAtom)?.id ?? null) !== userId) return false
        // No cookie-only authentication: in required mode the exact Bearer sent
        // must name the person who confirmed; this action never refreshes it.
        const exp = token ? parseJwtExp(token) : null
        return mode === 'none' ? modeConfirmed && token === null :
          !!userId && tokenSubject(token) === userId && exp !== null && exp > Math.floor(Date.now() / 1000)
      }
      const result = await Promise.race([
        chatApi.cancelTools(sessionId, sameIdentity, controller.signal),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            // Aborting cannot undo a request already received by the server.
            reject(new Error('cancel tools timed out'))
            controller.abort()
          }, CANCEL_ALL_TIMEOUT_MS)
        }),
      ])
      if (result.capped === true) {
        // One responder hit its cap; another owner may still act.
        setPending('uncertain')
        setPhase('capped')
      } else if (result.capped === false && Array.isArray(result.killed_pids)) {
        // Every scope for this principal must acknowledge the first response:
        // another owner may still be acting, even after the login epoch changes.
        setPending('signalled')
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
      } else if (failure.status === 409 && failure.ownerUnreachable) {
        setPending('uncertain')
        setPhase('ownerUnreachable')
      } else if (failure.status === 401) {
        setPending('uncertain')
        setPhase('unauthenticated')
      } else if (failure.status === 403) {
        setPending('uncertain')
        setPhase('forbidden')
      } else if (failure.status === 422 && failure.code === 'unsupported') {
        setPending('uncertain')
        setPhase('refused')
      } else {
        setPending('uncertain')
        setPhase('uncertain')
      }
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }

  return (
    <div className="px-2.5 py-1.5 text-xs text-gray-300" data-testid="cancel-all-tools">
      {!available && unsupported && <>
        <button type="button" disabled aria-describedby={unsupportedId}>{t('chatA-activity.cancelAll.open')}</button>
        <p id={unsupportedId}>{t('chatA-activity.cancelAll.unsupported')}</p>
      </>}
      {phase === 'idle' && (
        <button type="button" aria-haspopup="dialog" className="text-amber-300 underline" onClick={() => setConfirmationVersion(store.get(operationVersionAtom)[principal] ?? 0)}>
          {t('chatA-activity.cancelAll.open')}
        </button>
      )}
      {phase === 'capped' && <p role="status">{t('chatA-activity.cancelAll.capped')}</p>}
      {/* Opening only asks; nothing is sent until the dialog's confirmation. */}
      {phase === 'idle' && (
        <StopToolsDialog open={confirming} onClose={() => setConfirmationVersion(null)} items={items} onConfirmAll={() => void submit()} />
      )}
      {phase === 'sending' && <p role="status">{t('chatA-activity.cancelAll.sending')}</p>}
      {phase === 'signalled' && <p role="status">{t('chatA-activity.cancelAll.signalled')}</p>}
      {phase === 'uncertain' && <p role="status">{t('chatA-activity.cancelAll.uncertain')}</p>}
      {phase === 'ownerUnreachable' && <p role="status">{t('chatA-activity.cancelAll.ownerUnreachable')}</p>}
      {phase === 'unauthenticated' && <p role="status">{t('chatA-activity.cancel.unauthenticatedNotice')}</p>}
      {phase === 'forbidden' && <p role="status">{t('chatA-activity.cancel.forbiddenNotice')}</p>}
      {phase === 'refused' && <p role="status">{t('chatA-activity.cancelAll.refused')} {t('chatA-activity.cancelAll.uncertain')}</p>}
      {phase === 'identityChanged' && <p role="status">{t('chatA-activity.cancelAll.identityChanged')}</p>}
      {available && (phase === 'signalled' || phase === 'uncertain' || phase === 'refused' || phase === 'capped' || phase === 'unauthenticated' || phase === 'forbidden' || phase === 'ownerUnreachable' || phase === 'identityChanged') && (
        <button type="button" className="underline mt-1" onClick={() => { invalidateConfirmations(); setPending(null); setPhase('idle') }}>
          {t('chatA-activity.cancelAll.reset')}
        </button>
      )}
    </div>
  )
}
