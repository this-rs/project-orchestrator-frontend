import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'

vi.mock('@/components/chat', () => ({ ChatPanel: () => null }))
vi.mock('@/components/auth/UserMenu', () => ({ UserMenu: () => null }))
vi.mock('@/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="sidebar-marker">sidebar</div>,
}))
vi.mock('@/components/ui', () => ({ ToastContainer: () => null, Branding: () => <div data-testid="branding" /> }))
vi.mock('@/hooks', async () => ({
  ChromeWorkspaceSlugContext: (await import('react')).createContext<string | null>(null),
  useAttentionCountSource: () => {},
  useMediaQuery: () => true,
  useCrudEventRefresh: () => {},
  useModelCatalogEvents: () => {},
  useDragRegion: () => () => {},
  useWindowFullscreen: () => false,
  useViewTransition: () => ({ navigate: () => {} }),
  useWorkspace: () => null,
}))
vi.mock('@/services/env', () => ({ isTauri: false }))
vi.mock('@/services/workspaces', () => ({
  workspacesApi: {
    list: () => Promise.resolve({ items: [] }),
    listProjects: () => Promise.resolve([]),
  },
}))

import { MainLayout } from './MainLayout'

function Boom(): never {
  throw new Error('page exploded')
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/workspace/ws/boom']}>
      <Routes>
        <Route path="/workspace/:slug" element={<MainLayout />}>
          <Route path="boom" element={<Boom />} />
          <Route path="ok" element={<div>healthy page</div>} />
        </Route>
      </Routes>
      <Link to="/workspace/ws/ok">go-ok</Link>
    </MemoryRouter>,
  )
}

describe('MainLayout error isolation', { timeout: 30000 }, () => {
  let errSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => errSpy.mockRestore())

  it('shows a fallback and keeps the sidebar mounted when a page throws', () => {
    renderApp()
    expect(screen.getAllByTestId('sidebar-marker').length).toBeGreaterThan(0)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('recovers when navigating to another route', () => {
    renderApp()
    fireEvent.click(screen.getByText('go-ok'))
    expect(screen.getByText('healthy page')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('MainLayout content area', { timeout: 30000 }, () => {
  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/workspace/:slug" element={<MainLayout />}>
            <Route path="plans" element={<div data-testid="page">plans</div>} />
            <Route path="chat/:sessionId" element={<div data-testid="page">conversation</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  }

  it('scrolls an ordinary page and puts the footer under it', () => {
    renderAt('/workspace/ws/plans')
    const wrapper = screen.getByTestId('page').parentElement!
    expect(wrapper.parentElement!.className).toContain('overflow-y-auto')
    expect(screen.getByTestId('branding')).toBeTruthy()
  })

  it('is not a second scroller around a conversation, which fills the area and scrolls inside itself', () => {
    renderAt('/workspace/ws/chat/0b1c2d3e')
    const wrapper = screen.getByTestId('page').parentElement!
    // The wrapper must be allowed to shrink to the area (min-h-0), or `h-full` in the page means nothing.
    expect(wrapper.className).toContain('min-h-0')
    expect(wrapper.parentElement!.className).not.toMatch(/overflow-y-auto|overflow-auto/)
    // A footer under a page that fills the area is exactly the extra height that made the layout scroll.
    expect(screen.queryByTestId('branding')).toBeNull()
  })
})
