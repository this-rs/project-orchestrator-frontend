/**
 * The chat hook asks which kinds the server resolves, once it speaks references.
 *
 * Run with: npx vitest run src/refs/source/__tests__/kindsSync.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatServerFeaturesAtom, currentUserAtom } from '@/atoms'
import fixture from '../../__fixtures__/kinds_response.json'
import { ApiError } from '@/services/api'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))
vi.mock('@/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api')>()),
  api: { get: getMock },
}))

import { actorKinds, clearRefKinds, getActiveKinds, isActiveKind } from '../../kinds'
import { useRefKindsSync } from '../../useActiveKinds'

let store: ReturnType<typeof createStore>
const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>
const mount = (scope = 'scope-1') => renderHook(() => useRefKindsSync(scope), { wrapper })
const flush = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
  store = createStore()
  getMock.mockReset()
  clearRefKinds()
})
afterEach(() => clearRefKinds())

describe('useRefKindsSync', () => {
  it('asks nothing while the server does not speak references', async () => {
    mount()
    await flush()
    expect(getMock).not.toHaveBeenCalled()
  })

  it('learns the kinds of the server once refs_v1 is announced', async () => {
    getMock.mockResolvedValue(fixture.response)
    store.set(currentUserAtom, { id: 'u-kinds-1' } as never)
    store.set(chatServerFeaturesAtom, ['refs_v1'])
    mount()
    await flush()
    expect(getMock).toHaveBeenCalledWith('/refs/kinds', undefined)
    expect(isActiveKind('milestone')).toBe(true)
    expect(actorKinds()).toEqual(['persona', 'skill'])
  })

  it('keeps the five historical kinds on a server without the route', async () => {
    getMock.mockRejectedValue(new ApiError(404, 'nope'))
    store.set(currentUserAtom, { id: 'u-kinds-2' } as never)
    store.set(chatServerFeaturesAtom, ['refs_v1'])
    mount('scope-2')
    await flush()
    expect(getActiveKinds().map((k) => k.kind)).toEqual(['plan', 'task', 'note', 'decision', 'rfc'])
  })
})
