/**
 * TodayPage — the day's view across workspaces: the header (the day in one sentence, the workspace
 * filter, four counters), four sections, and the loading / empty / error states of each section. Data: the shared contract fixtures, through the real
 * `useAttention` (only the HTTP layer is mocked).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { workspacesAtom } from '@/atoms'
import type { AttentionResponse } from '@/types/attention'

const get = vi.fn()
const post = vi.fn()
vi.mock('@/services/api', async () => {
  const actual = await vi.importActual<typeof import('@/services/api')>('@/services/api')
  return { ...actual, api: { ...actual.api, get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) } }
})
let emit: (e: unknown) => void = () => {}
vi.mock('@/hooks/useEventBus', () => ({
  useEventBus: (cb: (e: unknown) => void) => {
    emit = cb
  },
}))
// The work dashboard has its own tests (components/today/work); here it is a marker that
// says where the page puts it and which plans the page tells it are already shown.
vi.mock('@/components/today/work/WorkDashboard', () => ({
  WorkDashboard: ({ shownPlanIds }: { shownPlanIds?: ReadonlySet<string> }) => (
    <div data-testid="work-dashboard" data-shown={shownPlanIds ? [...shownPlanIds].sort().join(',') : 'none'} />
  ),
}))
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
// The live agents list has its own tests (components/today/live); it also subscribes to the event
// bus, which would take over this file's `emit`.
vi.mock('@/components/today/live/LiveAgents', () => ({ LiveAgents: () => null }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  window.matchMedia = ((query: string) => {
    const m = /min-width:\s*(\d+)px/.exec(query)
    return {
      matches: m ? width >= Number(m[1]) : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
  }) as typeof window.matchMedia
}

import { TodayPage, DAY_REGION } from '../TodayPage'
import { BAND_TEXT, SECTION_ORDER, TODAY_TEXT, buildBands, shownPlanIds } from '@/components/today/bands'
import { DISCUSSIONS_TEXT } from '@/components/today/PlanRunRow'
import { ROW_TEXT } from '@/components/today/ThreadRow'

const DIR = join(__dirname, '../../services/__fixtures__/attention')
const fixture = (name: string): AttentionResponse => JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8'))
const ALL_SETS = [
  'empty', 'one_band', 'four_bands', 'runner_busy', 'orphan', 'blocked_task', 'forty_threads',
  'multi_link', 'unattached_waiting', 'resumed_run',
]

const workspaces = [
  { id: 'w1', slug: 'acme-freelance', name: 'Acme' },
  { id: 'w2', slug: 'project-orchestrator', name: 'PO' },
] as never

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname + loc.search}</output>
}

function renderPage(entry = '/today', withWorkspaces = true) {
  const store = createStore()
  store.set(workspacesAtom, withWorkspaces ? workspaces : [])
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[entry]}>
        <Where />
        <Routes>
          <Route path="/workspace/:slug/today" element={<TodayPage />} />
          <Route path="/today" element={<TodayPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

/** Text of a request, matched on its beginning (the card may wrap it). */
const snippet = (text: string) => text.replace(/\s+/g, ' ').slice(0, 24)
const hasText = (text: string) => screen.getAllByText(snippet(text), { exact: false }).length > 0

const band = (b: keyof typeof BAND_TEXT) => screen.getByRole('region', { name: BAND_TEXT[b].title })

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  Object.values(toast).forEach((f) => f.mockReset())
  setViewport(1440)
  try {
    window.localStorage.clear()
  } catch {
    /* no storage in this environment */
  }
})

describe('TodayPage: structure', () => {
  it('shows the four labelled sections in a fixed order, counters in the header', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('region', { name: BAND_TEXT.waiting.title }).length).toBe(1))
    await waitFor(() => expect(within(band('waiting')).getAllByRole('region').length).toBeGreaterThan(0))
    const nodes = SECTION_ORDER.map((b) => band(b))
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const counters = screen.getByRole('list', { name: TODAY_TEXT.summaryLabel })
    expect(within(counters).getByText(BAND_TEXT.waiting.summary)).toBeTruthy()
    // 2 waiting requests in the fixture
    expect(counters.querySelector('[data-counter="waiting"]')!.textContent).toContain('2')
  })

  it('an empty band shrinks to one line, it is not hidden', async () => {
    get.mockResolvedValue(fixture('one_band')) // running only
    renderPage()
    await waitFor(() => expect(within(band('running')).getAllByRole('listitem').length).toBeGreaterThan(0))
    for (const b of ['waiting', 'stuck', 'thinking'] as const) {
      const el = band(b)
      expect(within(el).getByText(BAND_TEXT[b].empty)).toBeTruthy()
      expect(el.querySelectorAll('li, button, a').length).toBe(0)
    }
  })

  it('the title is short, and no visible text keeps the former jargon', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    // The h1 names the page and the date; the day itself is said by the headline under it.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Today · \S+, \S+ \d{1,2}$/)
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    expect(document.body.textContent).not.toMatch(/T['’]attend|Tourne|Coincé|Pensée/i) // (fixture titles are data, not interface)
    // nor the engineer's words: the page speaks of assistants, conversations and plans
    expect(document.body.textContent).not.toMatch(/sans fil|\bCLI\b|\brunner\b|agent vivant|\brun\b/i)
    expect(screen.queryByText(/What is moving/)).toBeNull()
  })

  it('an empty band is ONE line: title, count and "nothing" side by side', async () => {
    get.mockResolvedValue(fixture('one_band'))
    renderPage()
    await waitFor(() => expect(within(band('running')).getAllByRole('listitem').length).toBeGreaterThan(0))
    for (const b of ['waiting', 'stuck', 'thinking'] as const) {
      const el = band(b)
      const line = within(el).getByText(BAND_TEXT[b].empty).parentElement!
      expect(line).not.toBe(el)
      expect(line.contains(el.querySelector('h2'))).toBe(true)
    }
  })

  it('the waiting band holds the full request text and the answer buttons', async () => {
    const data = fixture('four_bands')
    get.mockResolvedValue(data)
    renderPage()
    await waitFor(() => expect(hasText(data.waiting[0].text)).toBe(true))
    expect(within(band('waiting')).getAllByRole('button').length).toBeGreaterThan(0)
  })
})

describe('TodayPage: states', () => {
  it('first load: every band shows a skeleton, no spinner, and the header does not move', async () => {
    let resolve!: (v: unknown) => void
    get.mockReturnValue(new Promise((r) => (resolve = r)))
    renderPage()
    expect(screen.getByTestId('today-header').getAttribute('data-start')).toBe('loading')
    for (const b of ['waiting', 'running', 'stuck', 'thinking'] as const) {
      expect(band(b).getAttribute('data-state')).toBe('loading')
      expect(within(band(b)).getAllByRole('status').length).toBeGreaterThan(0)
    }
    const heading = screen.getByRole('heading', { level: 1 })
    resolve(fixture('four_bands'))
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    expect(screen.getByRole('heading', { level: 1 })).toBe(heading)
    // same four bands before and after: nothing is added or removed around them
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(4)
  })

  it('nothing at all: one composed empty state with a link to the plans', async () => {
    get.mockResolvedValue(fixture('empty'))
    renderPage()
    await waitFor(() => expect(screen.getByText(TODAY_TEXT.emptyAll)).toBeTruthy())
    expect(screen.getByRole('link', { name: TODAY_TEXT.plans }).getAttribute('href')).toBe('/workspace/acme-freelance/plans')
    expect(screen.queryByText(TODAY_TEXT.noMatch)).toBeNull()
  })

  it('first launch, no workspace yet: the empty state leads to the workspace selector', async () => {
    get.mockResolvedValue(fixture('empty'))
    renderPage('/today', false)
    await waitFor(() => expect(screen.getByText(TODAY_TEXT.emptyAll)).toBeTruthy())
    expect(screen.getByRole('link', { name: TODAY_TEXT.createWorkspace }).getAttribute('href')).toBe('/workspace-selector')
    expect(screen.queryByRole('link', { name: TODAY_TEXT.plans })).toBeNull()
  })

  it('nothing for a lane: "no result" with a way to clear the filter, not the global empty state', async () => {
    get.mockResolvedValue(fixture('empty'))
    renderPage('/today?workspace=project-orchestrator')
    await waitFor(() => expect(screen.getByText(TODAY_TEXT.noMatch)).toBeTruthy())
    expect(screen.queryByText(TODAY_TEXT.emptyAll)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: TODAY_TEXT.clearFilter }))
    expect(screen.getByTestId('where').textContent).toBe('/today')
  })

  it('/api/attention unavailable: each band shows its own error with a retry, the page stays', async () => {
    get.mockRejectedValue(new Error('404 not found'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('error'))
    for (const b of ['waiting', 'running', 'stuck', 'thinking'] as const) {
      expect(within(band(b)).getByRole('alert').textContent).toContain('404 not found')
    }
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    get.mockResolvedValue(fixture('four_bands'))
    fireEvent.click(within(band('waiting')).getByRole('button', { name: TODAY_TEXT.retry }))
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('a failed source degrades ITS band only; the other bands stay usable', async () => {
    const data = fixture('four_bands') as AttentionResponse & { source_errors: unknown }
    data.source_errors = [{ source: 'runs', bands: ['running'], message: 'runs timeout' }]
    get.mockResolvedValue(data)
    renderPage()
    await waitFor(() => expect(within(band('running')).getByRole('alert').textContent).toContain('runs timeout'))
    expect(within(band('waiting')).queryByRole('alert')).toBeNull()
    expect(within(band('stuck')).queryByRole('alert')).toBeNull()
    expect(within(band('waiting')).getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('a failed refresh keeps the page and says the data may be stale', async () => {
    const data = fixture('four_bands')
    get.mockResolvedValueOnce(data)
    renderPage()
    await waitFor(() => expect(hasText(data.waiting[0].text)).toBe(true))
    expect(screen.queryByText(TODAY_TEXT.staleRefresh)).toBeNull()
    get.mockRejectedValue(new Error('boom'))
    act(() => emit({ entity_type: 'attention_changed', action: 'updated', entity_id: 'x', payload: {}, timestamp: '' }))
    await waitFor(() => expect(screen.getByText(TODAY_TEXT.staleRefresh)).toBeTruthy(), { timeout: 3000 })
    expect(hasText(data.waiting[0].text)).toBe(true)
    expect(band('waiting').getAttribute('data-state')).toBe('ready')
  })
})

describe('TodayPage: plans, workspaces and sessions without a thread', () => {
  it('"In progress" is grouped by plan: one row per plan, with its progress and its workspace as a label', async () => {
    const data = fixture('forty_threads')
    get.mockResolvedValue(data)
    renderPage()
    await waitFor(() => expect(band('running').querySelectorAll('li[data-variant="running"]').length).toBeGreaterThan(0))
    const rows = [...band('running').querySelectorAll('li[data-variant="running"]')]
    const planIds = new Set(data.threads.filter((t) => t.band === 'running').map((t) => t.plan?.id ?? t.id))
    expect(rows.length).toBe(planIds.size)
    expect(band('running').querySelectorAll('[data-lane]').length).toBe(0) // the workspace is not the axis
    for (const row of rows) {
      expect(within(row as HTMLElement).getByTestId('lane-label').textContent).toBeTruthy()
      expect(within(row as HTMLElement).queryByTestId('progress-text')?.textContent ?? '0/0').toMatch(/^\d+\/\d+$/)
    }
  })

  it('a workspace chip asks the server for that workspace, and there are no workspace headings', async () => {
    get.mockResolvedValue(fixture('runner_busy'))
    renderPage('/today?workspace=project-orchestrator')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toBe('/attention?workspace_slug=project-orchestrator')
    await waitFor(() => expect(band('running').getAttribute('data-state')).toBe('ready'))
    expect(band('running').querySelectorAll('h3').length).toBe(0)
    expect(band('stuck').querySelectorAll('h3').length).toBe(0)
  })

  it('unattached sessions are shown in their lane, labelled as free conversations, with their pending requests', async () => {
    const data = fixture('unattached_waiting')
    get.mockResolvedValue(data)
    renderPage()
    const live = data.unattached.filter((u) => u.state === 'live' && u.pending.length > 0)
    const dead = data.unattached.filter((u) => u.state === 'dead')
    await waitFor(() => expect(hasText(live[0].pending[0].text)).toBe(true))
    // live + pending => band 1, every one of them
    for (const u of live) for (const r of u.pending) expect(within(band('waiting')).getAllByText(snippet(r.text), { exact: false }).length).toBeGreaterThan(0)
    expect(within(band('waiting')).getAllByText(/Free conversation/).length).toBeGreaterThanOrEqual(live.length)
    // dead => band 3, labelled, never lost
    for (const u of dead) expect(within(band('stuck')).getByText(u.title)).toBeTruthy()
    expect(within(band('stuck')).getAllByTestId('no-thread-label').length).toBe(dead.length)
    // nothing lost: counters add up to every request and session
    const total = data.waiting.length + data.orphans.length + data.thinking.length + data.threads.length + data.unattached.length
    expect(total).toBeGreaterThan(0)
  })

  it('an orphan request is a "resume the conversation" row in the stuck band, never an Allow button', async () => {
    get.mockResolvedValue(fixture('orphan'))
    renderPage()
    await waitFor(() => expect(band('stuck').querySelector('[data-variant="orphan"]')).toBeTruthy())
    expect(within(band('stuck')).queryByRole('button', { name: /autoriser|allow/i })).toBeNull()
    expect(within(band('waiting')).queryAllByRole('button').length).toBe(0)
  })

  it('answering a permission posts to the session and the card leaves the band', async () => {
    const data = fixture('four_bands')
    get.mockResolvedValue(data)
    post.mockResolvedValue(undefined)
    renderPage()
    const perm = data.waiting.find((r) => r.kind === 'permission')!
    await waitFor(() => expect(hasText(perm.text)).toBe(true))
    get.mockResolvedValue({ ...data, waiting: data.waiting.filter((r) => r !== perm) })
    const card = screen.getAllByText(snippet(perm.text), { exact: false })[0].closest('section')!
    fireEvent.click(within(card).getAllByRole('button')[0])
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect(post.mock.calls[0][0]).toBe(`/chat/sessions/${perm.session_id}/permissions/${perm.request_id}`)
    await waitFor(() => expect(screen.queryAllByText(snippet(perm.text), { exact: false })).toHaveLength(0))
  })
})

describe('TodayPage: discussions and "Attach to…" (assembly)', () => {
  const route = (data: AttentionResponse) =>
    get.mockImplementation(async (url: string) => (String(url).startsWith('/attention') ? data : []))

  it('a plan row of "In progress" unfolds the discussion tree OF ITS PLAN', async () => {
    const data = fixture('four_bands')
    route(data)
    renderPage()
    const running = data.threads.find((t) => t.band === 'running')!
    await waitFor(() => expect(within(band('running')).getAllByRole('button', { name: DISCUSSIONS_TEXT.show }).length).toBeGreaterThan(0))
    expect(get.mock.calls.some((c) => String(c[0]).includes('/sessions'))).toBe(false) // nothing before the click
    fireEvent.click(within(band('running')).getAllByRole('button', { name: DISCUSSIONS_TEXT.show })[0])
    await waitFor(() => expect(get).toHaveBeenCalledWith(`/plans/${running.plan!.id}/sessions`))
  })

  it('"Rattacher à…" (the attach slot) is on every thread-less row (Waiting for you, To resume) and on no threaded one', async () => {
    const data = fixture('unattached_waiting')
    route(data)
    renderPage()
    const dead = data.unattached.filter((u) => u.state === 'dead')
    const live = data.unattached.filter((u) => u.state === 'live' && u.pending.length > 0)
    await waitFor(() => expect(within(band('stuck')).getAllByTestId('no-thread-label').length).toBe(dead.length))
    expect(within(band('stuck')).getAllByRole('button', { name: 'Rattacher à…' })).toHaveLength(dead.length)
    expect(within(band('waiting')).getAllByRole('button', { name: 'Rattacher à…' })).toHaveLength(live.length)
  })

  it('a request whose session HAS a thread gets no "Rattacher à…"', async () => {
    route(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(within(band('waiting')).getAllByTestId('attention-card').length).toBeGreaterThan(0))
    expect(within(band('waiting')).queryByRole('button', { name: 'Rattacher à…' })).toBeNull()
  })
})

describe('TodayPage: lane filter in the URL', () => {
  it('/workspace/:slug/today starts on that lane and widening lands on /today', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage('/workspace/acme-freelance/today')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toBe('/attention?workspace_slug=acme-freelance')
    fireEvent.click(screen.getByRole('button', { name: TODAY_TEXT.allLanes }))
    expect(screen.getByTestId('where').textContent).toBe('/today')
  })

  it('a filtered page says which workspace it shows and that the badge is global', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage('/workspace/acme-freelance/today')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(screen.getByText(TODAY_TEXT.laneNote('Acme'))).toBeTruthy()
    expect(screen.getByText(/The badge in the header counts every workspace/)).toBeTruthy()
  })

  it('narrowing on /today is reflected in the query string and widening clears it', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage('/today?workspace=project-orchestrator')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toBe('/attention?workspace_slug=project-orchestrator')
    fireEvent.click(screen.getByRole('button', { name: TODAY_TEXT.allLanes }))
    expect(screen.getByTestId('where').textContent).toBe('/today')
  })

  it('an unknown workspace in the URL is ignored (every lane)', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage('/today?workspace=ghost')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toBe('/attention')
  })
})

describe('TodayPage: no simulated data path', () => {
  it('ignores ?demo=: it still calls the API and shows no demo banner', async () => {
    get.mockResolvedValue(fixture('empty'))
    renderPage('/today?demo=four_bands')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toBe('/attention')
    expect(screen.queryByTestId('demo-banner')).toBeNull()
  })

  it('does not ship a demo module nor a fixture glob in the page code', () => {
    const src = readFileSync(join(__dirname, '../TodayPage.tsx'), 'utf8')
    expect(src).not.toMatch(/demo|__fixtures__|import\.meta\.glob/i)
  })
})

describe.each([360, 390, 1440])('TodayPage: the %ipx rendering of every contract fixture', (width) => {
  it.each(ALL_SETS)('%s renders its bands without a fixed width or a horizontal scroller', async (name) => {
    setViewport(width)
    const data = fixture(name)
    get.mockResolvedValue(data)
    renderPage('/today')
    const isEmpty =
      data.threads.length + data.waiting.length + data.orphans.length + data.thinking.length + data.unattached.length === 0
    await waitFor(() => {
      if (isEmpty) expect(screen.getByText(TODAY_TEXT.emptyAll)).toBeTruthy()
      else expect(band('waiting').getAttribute('data-state')).toBe('ready')
    })
    if (!isEmpty) {
      // four bands, fixed order, tab order = DOM order
      // The user's own day is a region too; it is not one of the four bands.
      const PAGE_REGIONS = [DAY_REGION]
      const labels = screen
        .getAllByRole('region')
        .map((r) => r.getAttribute('aria-label'))
        .filter((l) => !PAGE_REGIONS.includes(l ?? ''))
      const bandLabels = labels.filter((l) => Object.values(BAND_TEXT).some((t) => t.title === l))
      expect(bandLabels.slice(0, 4)).toEqual(SECTION_ORDER.map((b) => BAND_TEXT[b].title))
      // The header (the day in one sentence) comes first, before the sections
      const header = screen.getByTestId('today-header')
      expect(header.compareDocumentPosition(band('waiting')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const root = document.body
    // One column by default; two columns are opt-in from a wide CONTAINER (not a window breakpoint:
    // the chat panel, once open, takes its width from the content).
    const grid = root.querySelector('[data-testid="sections"]')
    if (grid && !isEmpty) {
      expect(grid.className).toContain('grid-cols-1')
      expect(grid.className).toMatch(/@4xl\/today:grid-cols-/)
      expect(grid.className).not.toMatch(/(^|\s)(sm|md|lg|xl):grid-cols-/)
    }
    // Nothing forces a width wider than the viewport, nothing scrolls sideways.
    for (const el of root.querySelectorAll<HTMLElement>('*')) {
      expect(el.className?.toString() ?? '').not.toMatch(/overflow-x-(auto|scroll)/)
      const w = el.style.width
      if (w.endsWith('px')) expect(parseInt(w, 10)).toBeLessThanOrEqual(width)
    }
  })
})

describe('TodayPage: no entrance animation', () => {
  it('bands and rows carry no entrance animation (only the temporal pulse of a running state)', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    for (const b of ['waiting', 'running', 'stuck', 'thinking'] as const) {
      const html = band(b).outerHTML
      expect(html).not.toMatch(/animate-(?!pulse|ping|spin)|fade-in|slide-in|zoom-in|stagger/)
    }
  })
})

describe('TodayPage: a dead free session with a pending request', () => {
  it('has no Allow/Deny in "Waiting for you" and is reachable through "Resume the conversation" in "To resume"', async () => {
    const base = fixture('unattached_waiting')
    const live = base.unattached.find((u) => u.state === 'live' && u.pending.length > 0)!
    const dead = {
      ...live,
      id: 'dead-free-session',
      title: 'Session libre arrêtée',
      state: 'dead' as const,
      pending: [{ ...live.pending[0], request_id: 'req_dead_free', kind: 'permission' as const, session_id: 'dead-free-session' }],
    }
    get.mockResolvedValue({ ...base, waiting: [], unattached: [dead] })
    renderPage('/today')
    const stuck = await screen.findByRole('region', { name: BAND_TEXT.stuck.title })
    expect(within(stuck).getByRole('button', { name: ROW_TEXT.resumeSession })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull()
    expect(screen.queryByTestId('attention-card')).toBeNull()
  })
})

describe('TodayPage: the day, in order', () => {
  it('one column on a phone in the order Waiting for you, To resume, In progress, To read; two columns from a wide container', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    const grid = screen.getByTestId('sections')
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toMatch(/@4xl\/today:grid-cols-/)
    // the columns follow the container, so the page root declares it
    expect(grid.closest('[class*="@container/today"]')).toBeTruthy()
    // phone order = DOM order
    expect(SECTION_ORDER.map((b) => BAND_TEXT[b].title)).toEqual(['Waiting for you', 'To resume', 'In progress', 'To read'])
    const nodes = SECTION_ORDER.map((b) => band(b))
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // large screens: what asks for the user (and their day) stacks on the left, what advances alone on the right
    const main = screen.getByTestId('sections-main')
    const side = screen.getByTestId('sections-side')
    expect(main.parentElement).toBe(grid)
    expect(side.parentElement).toBe(grid)
    expect(main.contains(band('waiting'))).toBe(true)
    expect(main.contains(band('stuck'))).toBe(true)
    expect(side.contains(band('running'))).toBe(true)
    expect(side.contains(band('thinking'))).toBe(true)
    // nothing is two columns on a phone
    for (const b of ['waiting', 'stuck', 'running'] as const) expect(band(b).className).not.toMatch(/(^|\s)col-(start|span)-/)
  })

  it('what waits on the user comes FIRST: the day sits under the queue, never above it', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    const day = screen.getByRole('region', { name: DAY_REGION })
    const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    // DOM order (= phone order): À traiter, À reprendre, the day, En cours, À lire
    expect(after(band('waiting'), day)).toBe(true)
    expect(after(band('stuck'), day)).toBe(true)
    expect(after(day, band('running'))).toBe(true)
    expect(after(day, band('thinking'))).toBe(true)
    expect(screen.getByTestId('sections-main').contains(day)).toBe(true)
    // the first band of the page is the queue, and no region frames the page above it
    expect(document.querySelector('[data-band]')).toBe(band('waiting'))
    expect(screen.queryByRole('region', { name: 'Ce qui attend ta réponse' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Tableau de bord du jour' })).toBeNull()
  })

  it('has ONE summary line and ONE workspace filter', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    expect(screen.getAllByRole('list', { name: TODAY_TEXT.summaryLabel })).toHaveLength(1)
    expect(screen.getAllByRole('group', { name: TODAY_TEXT.laneFilterLabel })).toHaveLength(1)
  })

  it('tells the day which plans the queue already shows, so a plan appears once', async () => {
    const data = fixture('four_bands')
    get.mockResolvedValue(data)
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    const expected = [...shownPlanIds(buildBands(data))].sort()
    expect(expected.length).toBeGreaterThan(0)
    expect(screen.getByTestId('work-dashboard').getAttribute('data-shown')).toBe(expected.join(','))
  })

  it('keeps the day on screen when nothing waits, runs or is to resume', async () => {
    get.mockResolvedValue(fixture('empty'))
    renderPage()
    expect(await screen.findByText(TODAY_TEXT.emptyAll)).toBeTruthy()
    expect(screen.getByRole('region', { name: DAY_REGION })).toBeTruthy()
  })

  it('the header says the day in one sentence and why, before the sections, without copying a card', async () => {
    const data = fixture('four_bands')
    get.mockResolvedValue(data)
    renderPage()
    await waitFor(() => expect(screen.getByTestId('today-header').getAttribute('data-start')).toBe('waiting'))
    const header = screen.getByTestId('today-header')
    expect(screen.getByTestId('start-title').textContent).toMatch(/^(An assistant is|\d+ assistants are) waiting for your answer$/)
    expect(screen.getByTestId('start-why').textContent).toMatch(/^(It has been|The oldest has been) waiting for /)
    // the headline is NOT a second copy of the oldest request: its text and its Autoriser
    // buttons exist ONCE on the page, in "À traiter"
    const oldest = [...data.waiting].sort((a, b) => b.age_secs - a.age_secs)[0]
    expect(within(header).queryByText(snippet(oldest.text), { exact: false })).toBeNull()
    expect(within(header).queryByRole('button', { name: 'Allow' })).toBeNull()
    expect(screen.getAllByText(snippet(oldest.text), { exact: false })).toHaveLength(1)
    expect(screen.getAllByTestId('attention-card')).toHaveLength(data.waiting.length)
    expect(header.compareDocumentPosition(band('waiting')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // the former "Commence par ça" pointer section is gone
    expect(screen.queryByRole('region', { name: 'Commence par ça' })).toBeNull()
  })

  it('with nothing to answer or resume, it says nothing blocks and how many plans advance alone', async () => {
    const data = fixture('four_bands')
    get.mockResolvedValue({
      ...data,
      waiting: [],
      orphans: [],
      unattached: [],
      thinking: [],
      threads: data.threads.filter((t) => t.band === 'running'),
    })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('today-header').getAttribute('data-start')).toBe('calm'))
    expect(screen.getByTestId('start-title').textContent).toMatch(/^Nothing is blocking you: \d+ (plan is moving on its own|plans are moving on their own)$/)
  })

  it('a failed source never lets it claim that nothing blocks', async () => {
    const data = fixture('four_bands')
    get.mockResolvedValue({
      ...data,
      waiting: [],
      orphans: [],
      unattached: [],
      thinking: [],
      threads: data.threads.filter((t) => t.band === 'running'),
      source_errors: [{ source: 'chat', bands: ['waiting'], message: 'chat down' }],
    })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('today-header').getAttribute('data-start')).toBe('incomplete'))
    expect(screen.getByTestId('start-title').textContent).not.toMatch(/Nothing is blocking you/)
  })

  it('"To read" is folded by default with a discreet count, and its header counter opens it', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(within(band('thinking')).getByRole('button', { name: new RegExp(BAND_TEXT.thinking.title) })).toBeTruthy())
    const toggle = within(band('thinking')).getByRole('button', { name: new RegExp(BAND_TEXT.thinking.title) })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('today-thinking-body')!.hidden).toBe(true)
    fireEvent.click(within(screen.getByRole('list', { name: TODAY_TEXT.summaryLabel })).getByRole('button', { name: new RegExp(BAND_TEXT.thinking.summary) }))
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('every summary counter is a button that brings its section into view', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.id)
    }
    try {
      const summary = screen.getByRole('list', { name: TODAY_TEXT.summaryLabel })
      for (const b of ['waiting', 'running', 'stuck', 'thinking'] as const) {
        fireEvent.click(within(summary).getByRole('button', { name: new RegExp(BAND_TEXT[b].summary) }))
      }
    } finally {
      Element.prototype.scrollIntoView = original
    }
    expect(scrolled).toEqual(['today-waiting', 'today-running', 'today-stuck', 'today-thinking'])
    // the counters read in the SAME order as the sections
    const counters = [...screen.getByRole('list', { name: TODAY_TEXT.summaryLabel }).querySelectorAll('[data-counter]')]
    expect(counters.map((c) => c.getAttribute('data-counter'))).toEqual([...SECTION_ORDER])
    for (const c of counters) expect(c.textContent).toMatch(/^\d+/)
  })
})

describe('TodayPage: workspace chips', () => {
  it('are one compact strip in the header, above the counters, not a big selector', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    const chips = screen.getByRole('group', { name: TODAY_TEXT.laneFilterLabel })
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual([TODAY_TEXT.allLanes, 'Acme', 'PO'])
    expect(within(chips).getByRole('button', { name: TODAY_TEXT.allLanes }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /filter/i })).toBeNull()
    // The lane filters the whole page (the queue and the day): the strip sits in the header, above the counters.
    expect(screen.getByTestId('today-header').contains(chips)).toBe(true)
    const summary = screen.getByRole('list', { name: TODAY_TEXT.summaryLabel })
    expect(summary.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    for (const b of within(chips).getAllByRole('button')) expect(b.className).toContain('min-h-9')
  })

  it('tapping a chip keeps the page up (no skeleton flash) while the other lane loads', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    const seen: (string | null)[] = []
    const obs = new MutationObserver(() => seen.push(document.getElementById('today-waiting')?.getAttribute('data-state') ?? null))
    obs.observe(document.body, { attributes: true, childList: true, subtree: true })
    fireEvent.click(screen.getByRole('button', { name: 'PO' }))
    await waitFor(() => expect(get.mock.calls.at(-1)![0]).toBe('/attention?workspace_slug=project-orchestrator'))
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    obs.disconnect()
    expect(seen).not.toContain('loading')
  })

  it('a chip filters, is reflected in the URL, and "All" clears it', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    fireEvent.click(screen.getByRole('button', { name: 'PO' }))
    expect(screen.getByTestId('where').textContent).toBe('/today?workspace=project-orchestrator')
    await waitFor(() => expect(get.mock.calls.at(-1)![0]).toBe('/attention?workspace_slug=project-orchestrator'))
    expect(screen.getByRole('button', { name: 'PO' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: TODAY_TEXT.allLanes }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: TODAY_TEXT.allLanes }))
    expect(screen.getByTestId('where').textContent).toBe('/today')
  })
})
