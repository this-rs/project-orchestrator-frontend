import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'

const projectsOfWorkspace = vi.hoisted(() => ({ current: [] as { id: string; name: string; slug: string; profile?: 'software' | 'work' }[] }))

vi.mock('@/components/chat', () => ({ ChatPanel: () => null }))
vi.mock('@/components/auth/UserMenu', () => ({ UserMenu: () => null }))
vi.mock('@/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="sidebar-marker">sidebar</div>,
}))
vi.mock('@/components/ui', () => ({ ToastContainer: () => null, HaloPointer: () => null, Branding: () => <div data-testid="branding" /> }))
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
    listProjects: () => Promise.resolve(projectsOfWorkspace.current),
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

describe('MainLayout menu', { timeout: 30000 }, () => {
  const project = (slug: string, profile?: 'software' | 'work') => ({ id: slug, name: slug, slug, profile })
  const SOFTWARE_ONLY = ['Code', 'Feature graphs', 'Architecture', 'Deployments']
  const EVERYWHERE = ['Overview', 'Projects', 'Plans', 'Tasks', 'Notes', 'Decisions', 'Documents', 'Automation', 'Personas']

  function renderMenu(path = '/workspace/ws/plans') {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/workspace/:slug" element={<MainLayout />}>
            <Route path="plans" element={<div data-testid="page">plans</div>} />
            <Route path="code" element={<div data-testid="page">code page</div>} />
            <Route path="sharing" element={<div data-testid="page">sharing page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  }
  /** The workspace sidebar is rendered twice (desktop + mobile drawer): read the first. */
  const menu = () => within(screen.getAllByRole('navigation', { name: 'Workspace' })[0])
  const link = (name: string) => menu().queryByRole('link', { name })

  beforeEach(() => {
    projectsOfWorkspace.current = []
    window.localStorage.clear()
  })

  it('has four visible groups and the System group folded', async () => {
    projectsOfWorkspace.current = [project('app', 'software')]
    renderMenu()
    await waitFor(() => expect(link('Code')).not.toBeNull())
    for (const name of ['Work', 'Memory', 'Assistants', 'Code']) expect(menu().getAllByText(name).length).toBeGreaterThan(0)
    expect(menu().getByRole('button', { name: 'System' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('a workspace with only work projects shows no software concept', async () => {
    projectsOfWorkspace.current = [project('event', 'work'), project('budget', 'work')]
    renderMenu()
    await waitFor(() => expect(link('Code')).toBeNull())
    for (const name of SOFTWARE_ONLY) expect(link(name), name).toBeNull()
    for (const name of EVERYWHERE) expect(link(name), name).not.toBeNull()
    // the whole Code group goes, heading included
    expect(menu().queryByText('Code', { selector: 'div' })).toBeNull()
  })

  it('a workspace with a software project shows every concept', async () => {
    projectsOfWorkspace.current = [project('app', 'software')]
    renderMenu()
    await waitFor(() => expect(link('Code')).not.toBeNull())
    for (const name of [...SOFTWARE_ONLY, ...EVERYWHERE]) expect(link(name), name).not.toBeNull()
  })

  it('a mixed workspace shows every concept', async () => {
    projectsOfWorkspace.current = [project('event', 'work'), project('app', 'software')]
    renderMenu()
    await waitFor(() => expect(link('Architecture')).not.toBeNull())
    for (const name of [...SOFTWARE_ONLY, ...EVERYWHERE]) expect(link(name), name).not.toBeNull()
  })

  it('a project without the field is a codebase (payloads older than profiles)', async () => {
    projectsOfWorkspace.current = [project('old')]
    renderMenu()
    await waitFor(() => expect(link('Code')).not.toBeNull())
  })

  it('a workspace with no project yet shows no software concept either', async () => {
    projectsOfWorkspace.current = []
    renderMenu()
    await waitFor(() => expect(link('Code')).toBeNull())
    expect(link('Projects')).not.toBeNull()
  })

  it('serves a software URL in a work-only workspace: absent from the menu, not a 404', async () => {
    projectsOfWorkspace.current = [project('event', 'work')]
    renderMenu('/workspace/ws/code')
    expect((await screen.findByTestId('page')).textContent).toBe('code page')
    await waitFor(() => expect(link('Code')).toBeNull())
    expect(screen.getByTestId('page').textContent).toBe('code page')
  })

  describe('System', () => {
    beforeEach(() => {
      projectsOfWorkspace.current = [project('app', 'software')]
    })

    it('is folded by default, opens on click and remembers it', async () => {
      const first = renderMenu()
      await waitFor(() => expect(link('Code')).not.toBeNull())
      expect(link('Sharing & privacy')).toBeNull()
      expect(link('Neural routing')).toBeNull()
      fireEvent.click(menu().getByRole('button', { name: 'System' }))
      for (const name of ['Sharing & privacy', 'MCP federation', 'Neural routing', 'Administration']) expect(link(name), name).not.toBeNull()
      expect(window.localStorage.getItem('po.nav.system.open')).toBe('1')
      first.unmount()
      renderMenu()
      await waitFor(() => expect(link('Sharing & privacy')).not.toBeNull())
    })

    it('stays open while the current page lives inside it', async () => {
      renderMenu('/workspace/ws/sharing')
      await waitFor(() => expect(link('Sharing & privacy')).not.toBeNull())
    })

    it('gives a header button a 36 px target', async () => {
      renderMenu()
      await waitFor(() => expect(link('Code')).not.toBeNull())
      expect(menu().getByRole('button', { name: 'System' }).className).toContain('min-h-9')
    })

    it('still works when storage is blocked', async () => {
      const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      try {
        renderMenu()
        await waitFor(() => expect(link('Code')).not.toBeNull())
        fireEvent.click(menu().getByRole('button', { name: 'System' }))
        expect(link('Administration')).not.toBeNull()
      } finally {
        get.mockRestore()
        set.mockRestore()
      }
    })
  })
})
