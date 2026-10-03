/**
 * The chrome around Today: a GLOBAL mode (the workspaces, nothing of any
 * workspace), Today one click from anywhere THROUGH THE LOGO of the menu (not an icon in the
 * header), and the attention badge fed by one shared fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Provider } from 'jotai'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CrudEvent } from '@/types'
import type { AttentionResponse } from '@/types/attention'

const get = vi.fn()
vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<typeof import('@/services/api')>('@/services/api')
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a) } }
})

const listeners: Array<(e: CrudEvent) => void> = []
vi.mock('@/hooks/useEventBus', () => ({
  useEventBus: (cb?: (e: CrudEvent) => void) => {
    if (cb) listeners.push(cb)
  },
}))

const WORKSPACES = [
  { id: 'w1', name: 'Studio', slug: 'studio' },
  { id: 'w2', name: 'Lab', slug: 'lab' },
]
vi.mock('@/services/workspaces', () => ({
  workspacesApi: {
    list: vi.fn(async () => ({ items: WORKSPACES, total: 2 })),
    listProjects: vi.fn(async () => []),
  },
}))
vi.mock('@/components/chat', () => ({ ChatPanel: () => <div data-testid="chat-panel" /> }))
vi.mock('@/components/auth/UserMenu', () => ({ UserMenu: () => null }))
vi.mock('@/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher">Studio</div>,
}))

import { MainLayout } from '../MainLayout'
import { GlobalRouteLayout } from '@/components/GlobalRouteLayout'
import { RootRedirect } from '@/App'
import { ATTENTION_DEBOUNCE_MS } from '@/hooks/useAttention'

const fixture = (name: string): AttentionResponse =>
  JSON.parse(readFileSync(join(__dirname, '../../services/__fixtures__/attention', `${name}.json`), 'utf8'))

/**
 * A payload whose band 1 holds exactly `n` live pending requests. Each request's session is
 * declared live (a session of unknown state is never actionable, so it would not count).
 */
function withWaiting(n: number): AttentionResponse {
  const base = fixture('empty')
  const tpl = fixture('four_bands').waiting[0]
  const sessionTpl = fixture('unattached_waiting').unattached[0]
  return {
    ...base,
    unattached: Array.from({ length: n }, (_, i) => ({ ...sessionTpl, id: `s${i}`, state: 'live' as const, pending: [] })),
    waiting: Array.from({ length: n }, (_, i) => ({ ...tpl, request_id: `r${i}`, session_id: `s${i}`, thread_id: null })),
  }
}

function renderAt(entry: string) {
  return render(
    <Provider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route element={<GlobalRouteLayout />}>
            <Route path="/today" element={<div data-testid="page">today page</div>} />
          </Route>
          <Route path="/workspace/:slug" element={<MainLayout />}>
            <Route path="plans" element={<div data-testid="page">plans page</div>} />
            <Route path="today" element={<div data-testid="page">lane today</div>} />
            <Route path="overview" element={<div data-testid="page">overview page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

const attentionCalls = () => get.mock.calls.filter((c) => String(c[0]).startsWith('/attention')).length

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  get.mockReset()
  listeners.length = 0
  get.mockResolvedValue(withWaiting(0))
})
afterEach(() => vi.useRealTimers())

describe('routing', () => {
  it('"/" opens Today (not the overview of a workspace)', async () => {
    renderAt('/')
    expect((await screen.findByTestId('page')).textContent).toContain('today page')
  })

  it('a workspace path still opens its page', async () => {
    renderAt('/workspace/studio/plans')
    expect((await screen.findByTestId('page')).textContent).toContain('plans page')
  })
})

describe('global chrome (/today)', () => {
  it('names the product next to the logo and lists the workspaces, with nothing of a workspace', async () => {
    renderAt('/today')
    const nav = (await screen.findAllByRole('navigation', { name: 'Application' }))[0]
    expect(screen.getAllByText('Project Orchestrator').length).toBeGreaterThan(0)
    // Today is not a row of the menu: it is the logo
    expect(within(nav).queryByRole('link', { name: /^Today$/ })).toBeNull()
    await waitFor(() => expect(within(nav).queryByRole('link', { name: 'Lab' })).not.toBeNull())
    // entering a workspace lands on ITS Today (the overview page it used to open came up empty)
    expect(within(nav).getByRole('link', { name: 'Studio' }).getAttribute('href')).toBe('/workspace/studio/today')
    for (const own of ['Projects', 'Plans', 'Tasks', 'Objectives', 'Architecture', 'Overview', 'Trajectory', 'Notes']) {
      expect(screen.queryByRole('link', { name: own })).toBeNull()
    }
    expect(screen.queryByTestId('workspace-switcher')).toBeNull()
  })
})

describe('Today is the logo of the menu, not an icon in the header', () => {
  // the global sidebar is rendered twice (desktop + mobile drawer): every instance must agree
  const logoLinks = () => screen.getAllByRole('link', { name: 'Today' })

  it('the header holds no Today link on the global page nor on a workspace page', async () => {
    const g = renderAt('/today')
    expect(await screen.findByRole('banner')).toBeTruthy()
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: 'Today' })).toBeNull()
    g.unmount()
    renderAt('/workspace/studio/plans')
    await screen.findByRole('banner')
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: 'Today' })).toBeNull()
  })

  it('the logo of the global menu is a link to /today and carries the product logo', async () => {
    renderAt('/today')
    await screen.findByRole('banner')
    const links = logoLinks()
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      expect(a.getAttribute('href')).toBe('/today')
      expect(a.querySelector('img[src="/logo-32.png"]')).not.toBeNull()
    }
  })

  it('is the current page on /today and not elsewhere', async () => {
    const g = renderAt('/today')
    await screen.findByRole('banner')
    expect(logoLinks()[0].getAttribute('aria-current')).toBe('page')
    g.unmount()
    renderAt('/workspace/studio/plans')
    await screen.findByRole('banner')
    // in a workspace the logo belongs to the workspace switcher (mocked here): no Today link in the header
    expect(within(screen.getByRole('banner')).queryByRole('link', { name: 'Today' })).toBeNull()
  })
})

describe('workspace chrome', () => {
  it('starts with the workspace switcher: no "← Today" row above it, and no Today in the Focus group', async () => {
    renderAt('/workspace/studio/plans')
    await screen.findAllByTestId('workspace-switcher')
    expect(screen.queryByRole('link', { name: /← Today/ })).toBeNull()
    const nav = screen.getAllByRole('navigation', { name: 'Workspace' })[0]
    expect(within(nav).queryByRole('link', { name: /^Today$/ })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Overview' })).not.toBeNull()
  })
})

describe('attention badge', () => {
  it('shows nothing at 0', async () => {
    renderAt('/today')
    await waitFor(() => expect(attentionCalls()).toBe(1))
    await act(async () => {})
    expect(screen.queryByTestId('attention-badge')).toBeNull()
  })

  it('3 requests: "3 demandes en attente", on the Today logo of the global menu, never in the header', async () => {
    get.mockResolvedValue(withWaiting(3))
    const g = renderAt('/today')
    expect((await screen.findAllByLabelText('3 demandes en attente')).length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('attention-badge')[0].textContent).toContain('3')
    expect(within(screen.getAllByRole('link', { name: 'Today' })[0]).queryByLabelText('3 demandes en attente')).not.toBeNull()
    g.unmount()
    renderAt('/workspace/studio/plans')
    // the header no longer carries the badge: it moved onto the logo with the link
    await screen.findByRole('banner')
    expect(within(screen.getByRole('banner')).queryByLabelText('3 demandes en attente')).toBeNull()
  })

  it('1 request reads in the singular', async () => {
    get.mockResolvedValue(withWaiting(1))
    renderAt('/today')
    expect((await screen.findAllByLabelText('1 demande en attente')).length).toBeGreaterThan(0)
  })

  it('100 requests: "99+" with the full count in the aria-label', async () => {
    get.mockResolvedValue(withWaiting(100))
    renderAt('/today')
    const badges = await screen.findAllByLabelText('100 demandes en attente')
    expect(badges[0].textContent).toContain('99+')
  })

  it('a failing source hides the badge and never breaks the navigation', async () => {
    get.mockRejectedValue(new Error('boom'))
    renderAt('/today')
    await waitFor(() => expect(attentionCalls()).toBe(1))
    await act(async () => {})
    expect(screen.queryByTestId('attention-badge')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Today' }).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('page')).not.toBeNull()
  })

  it('ONE shared fetch for every badge (desktop and mobile menus), then one refetch per attention_changed burst', async () => {
    get.mockResolvedValue(withWaiting(2))
    renderAt('/today')
    await screen.findAllByLabelText('2 demandes en attente')
    // the desktop and the mobile logo both show it: still one request
    expect(screen.getAllByTestId('attention-badge').length).toBeGreaterThanOrEqual(2)
    expect(attentionCalls()).toBe(1)

    vi.useFakeTimers()
    get.mockResolvedValue(withWaiting(5))
    const evt = { entity_type: 'attention', action: 'updated', entity_id: 'x', payload: {}, timestamp: '' } as unknown as CrudEvent
    act(() => {
      listeners.forEach((l) => {
        l(evt)
        l(evt)
        l(evt)
      })
    })
    expect(attentionCalls()).toBe(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTENTION_DEBOUNCE_MS + 10)
    })
    expect(attentionCalls()).toBe(2)
    vi.useRealTimers()
    await waitFor(() => expect(screen.getAllByLabelText('5 demandes en attente').length).toBeGreaterThan(0))
  })

  it('the badge takes no room in the flow when it arrives (corner variant is absolute)', async () => {
    get.mockResolvedValue(withWaiting(3))
    renderAt('/today')
    const logo = (await screen.findAllByRole('link', { name: 'Today' }))[0]
    await waitFor(() => expect(within(logo).queryByTestId('attention-badge')).not.toBeNull())
    expect(within(logo).getByTestId('attention-badge').className).toContain('absolute')
  })
})
