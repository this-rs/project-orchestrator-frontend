import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectsApi } from '@/services/projects'
import { useProjectOptions } from './useProjectOptions'

vi.mock('@/services/projects', () => ({ projectsApi: { list: vi.fn() } }))

const list = vi.mocked(projectsApi.list)
const project = (n: number) => ({ slug: `p-${n}`, name: n % 2 === 0 ? `Project ${n}` : '' })
const pageOf = (from: number, count: number, total: number) => ({
  items: Array.from({ length: count }, (_, i) => project(from + i)),
  total,
  limit: 100,
  offset: from,
})

describe('useProjectOptions', () => {
  // Braces: a function returned from beforeEach is run by vitest as a teardown (here: the mock itself).
  beforeEach(() => {
    list.mockReset()
  })

  it('never asks for more than the 100 items a page the server accepts', async () => {
    list.mockResolvedValue(pageOf(0, 3, 3) as never)
    const { result } = renderHook(() => useProjectOptions())
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(list).toHaveBeenCalledTimes(1)
    const first = list.mock.calls[0][0] as { limit?: number; offset?: number }
    expect(first.limit).toBeLessThanOrEqual(100)
    expect(first.offset).toBe(0)
    expect(result.current).toEqual([
      { slug: 'p-0', name: 'Project 0' },
      { slug: 'p-1', name: 'p-1' },
      { slug: 'p-2', name: 'Project 2' },
    ])
  })

  it('walks the pages when there are more than 100 projects', async () => {
    list
      .mockResolvedValueOnce(pageOf(0, 100, 130) as never)
      .mockResolvedValueOnce(pageOf(100, 30, 130) as never)
    const { result } = renderHook(() => useProjectOptions())
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(list).toHaveBeenCalledTimes(2)
    expect((list.mock.calls[1][0] as { offset?: number }).offset).toBe(100)
    expect(result.current).toHaveLength(130)
  })

  it('gives an empty list when the server refuses', async () => {
    list.mockRejectedValue(new Error('limit cannot exceed 100'))
    const { result } = renderHook(() => useProjectOptions())
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toEqual([])
  })
})
