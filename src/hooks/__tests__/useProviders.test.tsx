/**
 * Loading the provider instances for the chat.
 *
 * Run with: npx vitest run src/hooks/__tests__/useProviders.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Provider, createStore } from 'jotai'

const list = vi.fn()
vi.mock('@/services/providers', () => ({
  providersApi: { list: (...a: unknown[]) => list(...a) },
}))

import { chatSelectedProjectAtom, providersLoadStateAtom } from '@/atoms'
import { ApiError } from '@/services/api'
import type { Project } from '@/types'
import type { ProvidersResponse } from '@/types/provider'
import { useProviders } from '../useProviders'

const response = (allowed: boolean): ProvidersResponse => ({
  providers: [
    { id: 'claude-code', kind: 'claude_code', label: 'Claude Code', health: { status: 'healthy' }, models: [] },
    {
      id: 'deepseek',
      kind: 'openai_compatible',
      label: 'DeepSeek',
      health: { status: 'healthy' },
      models: [{ id: 'deepseek-chat' }],
      allowed_for_project: allowed,
    },
  ],
  default: { provider: 'claude-code', routed_by: 'configured_default' },
})

const project = (slug: string) => ({ id: slug, slug, name: slug }) as unknown as Project

function setup(slug?: string) {
  const store = createStore()
  if (slug) store.set(chatSelectedProjectAtom, project(slug))
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  return { ...renderHook(() => useProviders(), { wrapper }), store }
}

beforeEach(() => {
  list.mockReset()
})

describe('useProviders', () => {
  it('loads the instances on mount, asking about the selected project', async () => {
    list.mockResolvedValue(response(true))
    const { result } = setup('alpha')
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(list).toHaveBeenCalledWith({ project_slug: 'alpha' })
    expect(result.current.providers.map((p) => p.id)).toEqual(['claude-code', 'deepseek'])
    expect(result.current.default?.routed_by).toBe('configured_default')
  })

  it('asks without a project when none is selected', async () => {
    list.mockResolvedValue(response(true))
    const { result } = setup()
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(list).toHaveBeenCalledWith({})
  })

  it('fetches again when the project changes, and stays `ready` meanwhile', async () => {
    list.mockResolvedValueOnce(response(true))
    const { result, store } = setup('alpha')
    await waitFor(() => expect(result.current.state).toBe('ready'))

    let resolve: (value: ProvidersResponse) => void = () => {}
    list.mockReturnValueOnce(new Promise<ProvidersResponse>((r) => (resolve = r)))
    act(() => store.set(chatSelectedProjectAtom, project('beta')))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ project_slug: 'beta' }))
    // The list of the previous project is still the one in use: no blink to `loading`.
    expect(store.get(providersLoadStateAtom)).toBe('ready')

    await act(async () => resolve(response(false)))
    expect(result.current.providers[1].allowed_for_project).toBe(false)
  })

  it('drops the answer about a project that is no longer the selected one', async () => {
    let resolveAlpha: (value: ProvidersResponse) => void = () => {}
    list.mockReturnValueOnce(new Promise<ProvidersResponse>((r) => (resolveAlpha = r)))
    list.mockResolvedValueOnce(response(false))
    const { result, store } = setup('alpha')
    act(() => store.set(chatSelectedProjectAtom, project('beta')))
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.providers[1].allowed_for_project).toBe(false)

    // The slow answer for `alpha` arrives last and must not win.
    await act(async () => resolveAlpha(response(true)))
    expect(result.current.providers[1].allowed_for_project).toBe(false)
  })

  it('a backend without provider routes (404) is `unsupported`, with nothing to list', async () => {
    list.mockRejectedValue(new ApiError(404, 'Not Found'))
    const { result } = setup('alpha')
    await waitFor(() => expect(result.current.state).toBe('unsupported'))
    expect(result.current.providers).toEqual([])
    expect(result.current.default).toBeNull()
  })

  it('refresh() fetches again on demand', async () => {
    list.mockResolvedValue(response(true))
    const { result } = setup('alpha')
    await waitFor(() => expect(result.current.state).toBe('ready'))
    await act(async () => {
      await result.current.refresh()
    })
    expect(list).toHaveBeenCalledTimes(2)
  })
})
