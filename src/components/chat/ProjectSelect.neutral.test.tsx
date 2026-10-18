/**
 * The scope picker of a new conversation offers « No project (neutral place) »,
 * and says when the project list has answered (a new chat waits until then).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatAllProjectsModeAtom, chatNeutralPlaceAtom, chatProjectsLoadedAtom, chatSelectedProjectAtom, chatWorkspaceHasProjectsAtom } from '@/atoms'

const listProjects = vi.fn()
const slug = vi.hoisted(() => ({ value: 'ws' as string | null }))
vi.mock('@/services', () => ({ workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) } }))
vi.mock('@/hooks', () => ({ useWorkspaceSlug: () => slug.value, useWorkspace: () => ({ name: 'Main' }) }))

import { ProjectSelect } from './ProjectSelect'

const P1 = { id: 'p1', slug: 'demo', name: 'Demo', root_path: '/Users/me/demo' }

function renderSelect() {
  const store = createStore()
  render(
    <Provider store={store}>
      <ProjectSelect />
    </Provider>,
  )
  return store
}

beforeEach(() => {
  vi.clearAllMocks()
  slug.value = 'ws'
})

describe('ProjectSelect — no project', () => {
  it('marks the list as loaded, and « No project » switches new chats to the neutral place and back', async () => {
    listProjects.mockResolvedValue([P1])
    const store = renderSelect()
    await waitFor(() => expect(store.get(chatProjectsLoadedAtom)).toBe(true))
    expect(store.get(chatWorkspaceHasProjectsAtom)).toBe(true)
    fireEvent.click(await screen.findByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'No project (neutral place)', hidden: true }))
    expect(store.get(chatNeutralPlaceAtom)).toBe(true)
    // The folder of a project is not shown for a neutral chat.
    expect(screen.queryByText('~/demo')).toBeNull()
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Demo', hidden: true }))
    expect(store.get(chatNeutralPlaceAtom)).toBe(false)
    expect(store.get(chatAllProjectsModeAtom)).toBe(false)
    expect(store.get(chatSelectedProjectAtom)?.id).toBe('p1')
  })

  it('an empty workspace, an unreadable list or no workspace still answer "loaded"', async () => {
    listProjects.mockResolvedValue([])
    const store = renderSelect()
    await waitFor(() => expect(store.get(chatProjectsLoadedAtom)).toBe(true))
    expect(store.get(chatWorkspaceHasProjectsAtom)).toBe(false)

    listProjects.mockRejectedValue(new Error('offline'))
    const failed = renderSelect()
    await waitFor(() => expect(failed.get(chatProjectsLoadedAtom)).toBe(true))

    slug.value = null
    const none = renderSelect()
    await waitFor(() => expect(none.get(chatProjectsLoadedAtom)).toBe(true))
  })
})
