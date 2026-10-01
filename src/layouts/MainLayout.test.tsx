import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'

vi.mock('@/components/chat', () => ({ ChatPanel: () => null }))
vi.mock('@/components/auth/UserMenu', () => ({ UserMenu: () => null }))
vi.mock('@/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="sidebar-marker">sidebar</div>,
}))
vi.mock('@/components/ui', () => ({ ToastContainer: () => null, Branding: () => null }))
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
