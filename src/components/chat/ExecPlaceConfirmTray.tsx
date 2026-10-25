/**
 * ExecPlaceConfirmTray — « Exécuter dans X ? » (Autoriser / Refuser).
 *
 * A delegation into an ephemeral worktree waits for a PERSON. The harness announces it (a task
 * `Updated` event `execution_place_confirmation_required`, or the 202 `confirmation_required` of a
 * delegation started from the UI); this card carries the answer to the existing routes:
 * `POST /execution-places/{id}/confirm` (with the path EXACTLY as announced) and `…/reject`.
 *
 * - The path comes from the event, is shown read-only, and is sent back untouched: the object of
 *   the request is asserted by the harness, the answer comes from a human, a model never answers.
 * - Nothing is stored here beyond the display state: the server's `place_confirmation` is the only
 *   store of consent. In `bypassPermissions` the server confirms alone — no event, so no card.
 * - Shown in a HUMAN session only (never in a child / agent / mirror conversation), once per
 *   `placement_id`.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { FolderGit2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { panelGlass } from '@/components/ui/panelGlass'
import { useT } from '@/i18n'
import { useEventBus } from '@/hooks/useEventBus'
import { execConfirmRequestsAtom, type ExecConfirmRequest } from '@/atoms'
import { executionPlaceApi } from '@/services/executionPlace'
import { ApiError } from '@/services/api'
import type { CrudEvent } from '@/types'
import { execConfirmFromEvent } from '@/utils/executionPlace'

interface Props {
  /** The session is a person's own conversation (not spawned, not a mirror). */
  humanSession: boolean
}

export function ExecPlaceConfirmTray({ humanSession }: Props) {
  const [requests, setRequests] = useAtom(execConfirmRequestsAtom)

  const patch = useCallback(
    (placementId: string, change: Partial<ExecConfirmRequest>) =>
      setRequests((cur) => cur.map((r) => (r.placementId === placementId ? { ...r, ...change } : r))),
    [setRequests],
  )

  const onEvent = useCallback(
    (event: CrudEvent) => {
      const found = execConfirmFromEvent(event)
      if (!found) return
      let isNew = false
      setRequests((cur) => {
        if (cur.some((r) => r.placementId === found.placementId)) return cur
        isNew = true
        return [...cur, { ...found, expiresAt: null, state: 'pending', error: null }]
      })
      if (!isNew) return
      // The event carries no deadline: ask the server (best effort — the card works without it).
      void executionPlaceApi
        .get(found.placementId)
        .then((v) => patch(found.placementId, { expiresAt: v.expires_at ?? null }))
        .catch(() => {})
    },
    [setRequests, patch],
  )
  useEventBus(onEvent)

  if (!humanSession || requests.length === 0) return null
  return (
    <div className="mx-3 mb-2 space-y-2" aria-live="polite">
      {requests.map((r) => (
        <ExecPlaceConfirmCard key={r.placementId} request={r} onChange={(c) => patch(r.placementId, c)} />
      ))}
    </div>
  )
}

function useNow(deadline: string | null, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline || !active) return
    const ms = Date.parse(deadline) - Date.now()
    if (!(ms > 0)) return
    // setTimeout overflows past ~24.8 days (it would fire at once): wait in capped slices.
    const id = setTimeout(() => setNow(Date.now()), Math.min(ms + 50, 2 ** 31 - 1))
    return () => clearTimeout(id)
  }, [deadline, active])
  return now
}

export function ExecPlaceConfirmCard({
  request,
  onChange,
}: {
  request: ExecConfirmRequest
  onChange: (change: Partial<ExecConfirmRequest>) => void
}) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const now = useNow(request.expiresAt, request.state === 'pending')
  const expired =
    request.state === 'expired' ||
    (request.state === 'pending' && !!request.expiresAt && Date.parse(request.expiresAt) <= now)

  const fail = (e: unknown) => {
    const status = e instanceof ApiError ? e.status : 0
    if (status === 410) return onChange({ state: 'expired', error: null })
    const key =
      status === 403 ? 'execConfirm.error.forbidden' : status === 409 ? 'execConfirm.error.conflict' : 'execConfirm.error.other'
    const detail = e instanceof Error && e.message ? ` (${e.message})` : ''
    onChange({ error: `${t(key)}${detail}` })
  }

  const answer = async (kind: 'confirm' | 'reject') => {
    setBusy(true)
    onChange({ error: null })
    try {
      if (kind === 'confirm') {
        await executionPlaceApi.confirm(request.placementId, request.path)
        onChange({ state: 'confirmed' })
      } else {
        await executionPlaceApi.reject(request.placementId)
        onChange({ state: 'rejected' })
      }
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  const state: ExecConfirmRequest['state'] = expired ? 'expired' : request.state
  const pending = state === 'pending'

  return (
    <div role="group" aria-label={t('execConfirm.aria')} className={`rounded-lg border border-amber-500/30 ${panelGlass.warning} p-3 text-sm`}>
      <div className="flex items-start gap-2">
        <FolderGit2 className="mt-0.5 size-4 shrink-0 text-amber-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-100">{t('execConfirm.title')}</p>
          <p className="mt-1 break-all font-mono text-xs text-gray-300" data-testid="exec-confirm-path">
            {request.path}
          </p>
          {pending ? (
            <p className="mt-1 text-xs text-gray-400">{t('execConfirm.hint')}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-300" role="status">
              {t(`execConfirm.state.${state}`)}
            </p>
          )}
          {request.error && (
            <p className="mt-1 text-xs text-red-400" role="alert">
              {request.error}
            </p>
          )}
        </div>
      </div>
      {pending && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void answer('reject')}>
            {t('execConfirm.reject')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void answer('confirm')}>
            {t('execConfirm.allow')}
          </Button>
        </div>
      )}
    </div>
  )
}
