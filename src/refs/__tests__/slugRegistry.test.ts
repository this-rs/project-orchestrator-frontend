/**
 * A link names a project or a workspace by its slug; the chat reference needs
 * its id. The registry learns the pairs from the lists the application
 * already fetches (no per-screen code), and answers from memory.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))
vi.mock('@/services/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/api')>()),
  api: { get: getMock },
}))

import { projectsApi } from '@/services/projects'
import { workspacesApi } from '@/services/workspaces'
import { clearSlugRegistry, lookupSlug, rememberSlugs } from '../slugRegistry'

const P1 = '00333b5f-2d0a-4467-9c98-155e55d2b7e5'
const W1 = '7a1d9c34-52e8-4b6f-a0c3-1e8f4d2b6a95'

afterEach(() => {
  clearSlugRegistry()
  getMock.mockReset()
})

describe('slugRegistry', () => {
  it('remembers and answers by kind; an unknown slug or kind is null; a malformed entry is ignored', () => {
    rememberSlugs('project', [{ slug: 'my-project', id: P1 }, { slug: 'x' } as never, { id: P1 } as never])
    expect(lookupSlug('project', 'my-project')).toBe(P1)
    expect(lookupSlug('project', 'x')).toBeNull()
    expect(lookupSlug('workspace', 'my-project')).toBeNull()
  })

  it('learns the projects of a workspace from workspacesApi.listProjects', async () => {
    getMock.mockResolvedValue([{ id: P1, slug: 'my-project' }])
    await workspacesApi.listProjects('po')
    expect(lookupSlug('project', 'my-project')).toBe(P1)
  })

  it('learns the projects of projectsApi.list and projectsApi.get', async () => {
    getMock.mockResolvedValue({ items: [{ id: P1, slug: 'a' }], total: 1 })
    await projectsApi.list()
    expect(lookupSlug('project', 'a')).toBe(P1)
    getMock.mockResolvedValue({ id: P1, slug: 'b' })
    await projectsApi.get('b')
    expect(lookupSlug('project', 'b')).toBe(P1)
  })

  it('learns the workspaces from workspacesApi.list and get', async () => {
    getMock.mockResolvedValue({ items: [{ id: W1, slug: 'po' }], total: 1 })
    await workspacesApi.list()
    expect(lookupSlug('workspace', 'po')).toBe(W1)
    getMock.mockResolvedValue({ id: W1, slug: 'other' })
    await workspacesApi.get('other')
    expect(lookupSlug('workspace', 'other')).toBe(W1)
  })

  it('a failed request teaches nothing and still fails', async () => {
    getMock.mockRejectedValue(new Error('boom'))
    await expect(workspacesApi.listProjects('po')).rejects.toThrow('boom')
    expect(lookupSlug('project', 'my-project')).toBeNull()
  })
})
