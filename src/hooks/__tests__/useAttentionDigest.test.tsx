import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { Provider } from 'jotai'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AttentionResponse } from '@/types/attention'

const get = vi.fn()
vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<typeof import('@/services/api')>('@/services/api')
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a) } }
})
vi.mock('@/hooks/useEventBus', () => ({ useEventBus: () => {} }))

import { useAttentionCountSource, useAttentionCount, useAttentionDigest, useRequestAttentionRefresh } from '../useAttentionCount'
import { buildAttentionDigest } from '@/atoms/attentionDigest'

const fixture = (name: string): AttentionResponse =>
  JSON.parse(readFileSync(join(__dirname, '../../services/__fixtures__/attention', `${name}.json`), 'utf8'))

function Probe() {
  useAttentionCountSource()
  const digest = useAttentionDigest()
  const count = useAttentionCount()
  const refresh = useRequestAttentionRefresh()
  return (
    <div>
      <span data-testid="count">{String(count)}</span>
      <span data-testid="dead">{Object.keys(digest.deadPending).join(',')}</span>
      <span data-testid="runner">{digest.runner?.status ?? 'none'}</span>
      <button onClick={refresh}>refresh</button>
    </div>
  )
}

describe('attention digest (shared with the badge source)', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockResolvedValue(fixture('empty'))
  })

  it('buildAttentionDigest lists dead sessions with a pending request and the runner owner', () => {
    const orphan = fixture('orphan')
    const d = buildAttentionDigest(orphan)
    expect(d.status).toBe('ready')
    expect(Object.keys(d.deadPending)).toEqual(orphan.orphans.map((o) => o.session_id))
    expect(buildAttentionDigest(fixture('runner_busy')).runner?.status).toBe('busy')
    // a LIVE session waiting, or a dead one with nothing pending, is not a "resume" candidate
    expect(buildAttentionDigest(fixture('unattached_waiting')).deadPending).toEqual({})
  })

  it('is fed by the SAME single fetch as the count, and a refresh request refetches that one source', async () => {
    const data = fixture('orphan')
    get.mockResolvedValue(data)
    render(
      <Provider>
        <Probe />
      </Provider>,
    )
    await waitFor(() => expect(screen.getByTestId('runner').textContent).toBe(data.runner.status))
    expect(get).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('dead').textContent).toBe(data.orphans.map((o) => o.session_id).join(','))

    fireEvent.click(screen.getByText('refresh'))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    expect(get.mock.calls.every((c) => String(c[0]).startsWith('/attention'))).toBe(true)
  })

  it('an unreadable payload leaves the digest unknown, never invented', async () => {
    get.mockRejectedValue(new Error('boom'))
    render(
      <Provider>
        <Probe />
      </Provider>,
    )
    await waitFor(() => expect(get).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.getByTestId('dead').textContent).toBe('')
    expect(screen.getByTestId('runner').textContent).toBe('none')
  })
})
