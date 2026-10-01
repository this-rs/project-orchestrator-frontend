/**
 * TodayPage — the day's view across workspaces: summary, "Commence par ça", four sections,
 * workspace chips, and the loading / empty / error states of each section. Data: the shared contract fixtures, through the real
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
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
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

import { TodayPage } from '../TodayPage'
import { BAND_TEXT, SECTION_ORDER, TODAY_TEXT } from '@/components/today/bands'
import { DISCUSSIONS_TEXT } from '@/components/today/PlanRunRow'
import { START_TEXT } from '@/components/today/TodayView'

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
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("Aujourd'hui")
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    expect(document.body.textContent).not.toMatch(/T['’]attend|Tourne|Coincé|Pensée/i) // (fixture titles are data, not interface)
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
    expect(screen.getByRole('region', { name: START_TEXT.title }).getAttribute('data-start')).toBe('loading')
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
  it('"En cours" is grouped by plan: one row per plan, with its progress and its workspace as a label', async () => {
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
      expect(within(row as HTMLElement).queryByTestId('progress-text')?.textContent ?? '0/0 faites').toMatch(/^\d+\/\d+ faites$/)
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

  it('unattached sessions are shown in their lane, labelled "sans fil", with their pending requests', async () => {
    const data = fixture('unattached_waiting')
    get.mockResolvedValue(data)
    renderPage()
    const live = data.unattached.filter((u) => u.state === 'live' && u.pending.length > 0)
    const dead = data.unattached.filter((u) => u.state === 'dead')
    await waitFor(() => expect(hasText(live[0].pending[0].text)).toBe(true))
    // live + pending => band 1, every one of them
    for (const u of live) for (const r of u.pending) expect(within(band('waiting')).getAllByText(snippet(r.text), { exact: false }).length).toBeGreaterThan(0)
    expect(within(band('waiting')).getAllByText(/sans fil/i).length).toBeGreaterThanOrEqual(live.length)
    // dead => band 3, labelled, never lost
    for (const u of dead) expect(within(band('stuck')).getByText(u.title)).toBeTruthy()
    expect(within(band('stuck')).getAllByTestId('no-thread-label').length).toBe(dead.length)
    // nothing lost: counters add up to every request and session
    const total = data.waiting.length + data.orphans.length + data.thinking.length + data.threads.length + data.unattached.length
    expect(total).toBeGreaterThan(0)
  })

  it('an orphan request is a "reprendre la session" row in the stuck band, never an Allow button', async () => {
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

describe('TodayPage: discussions and "Rattacher à…" (assembly)', () => {
  const route = (data: AttentionResponse) =>
    get.mockImplementation(async (url: string) => (String(url).startsWith('/attention') ? data : []))

  it('a plan row of "En cours" unfolds the discussion tree OF ITS PLAN', async () => {
    const data = fixture('four_bands')
    route(data)
    renderPage()
    const running = data.threads.find((t) => t.band === 'running')!
    await waitFor(() => expect(within(band('running')).getAllByRole('button', { name: DISCUSSIONS_TEXT.show }).length).toBeGreaterThan(0))
    expect(get.mock.calls.some((c) => String(c[0]).includes('/sessions'))).toBe(false) // nothing before the click
    fireEvent.click(within(band('running')).getAllByRole('button', { name: DISCUSSIONS_TEXT.show })[0])
    await waitFor(() => expect(get).toHaveBeenCalledWith(`/plans/${running.plan!.id}/sessions`))
  })

  it('"Rattacher à…" is on every thread-less row (À traiter, À reprendre) and on no threaded one', async () => {
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
    expect(screen.getByText(/La pastille de la barre compte tous les workspaces/)).toBeTruthy()
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

describe.each([360, 1440])('TodayPage: the %ipx rendering of every contract fixture', (width) => {
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
      const labels = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
      const bandLabels = labels.filter((l) => Object.values(BAND_TEXT).some((t) => t.title === l))
      expect(bandLabels.slice(0, 4)).toEqual(SECTION_ORDER.map((b) => BAND_TEXT[b].title))
      // "Commence par ça" comes first, before the sections
      expect(labels[0]).toBe(START_TEXT.title)
    }
    const root = document.body
    // A phone is one column; the two-column grid is opt-in at the lg breakpoint only.
    const grid = root.querySelector('[data-band]')?.parentElement
    if (grid && !isEmpty) {
      expect(grid.className).toContain('grid-cols-1')
      expect(grid.className).toContain('lg:grid-cols-2')
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
  it('has no Autoriser/Refuser in "À traiter" and is reachable through "Reprendre la session" in "À reprendre"', async () => {
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
    expect(within(stuck).getByRole('button', { name: 'Reprendre la session' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Autoriser' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull()
    expect(screen.queryByTestId('attention-card')).toBeNull()
  })
})

describe('TodayPage: the day, in order', () => {
  it('one column on a phone in the order À traiter, À reprendre, En cours, À suivre; two columns from 1024 px', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    const grid = screen.getByTestId('sections')
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('lg:grid-cols-2')
    // phone order = DOM order
    expect(SECTION_ORDER.map((b) => BAND_TEXT[b].title)).toEqual(['À traiter', 'À reprendre', 'En cours', 'À suivre'])
    const nodes = SECTION_ORDER.map((b) => band(b))
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    // large screens: what asks for the user stacks on the left, "En cours" on the right, "À suivre" spans both
    expect(band('waiting').className).toContain('lg:col-start-1')
    expect(band('stuck').className).toContain('lg:col-start-1')
    expect(band('running').className).toContain('lg:col-start-2')
    expect(band('thinking').parentElement!.className).toContain('lg:col-span-2')
    // nothing is two columns on a phone
    for (const b of ['waiting', 'stuck', 'running'] as const) expect(band(b).className).not.toMatch(/(^|\s)col-(start|span)-/)
  })

  it('"Commence par ça" comes before the sections and says why', async () => {
    const data = fixture('four_bands')
    get.mockResolvedValue(data)
    renderPage()
    await waitFor(() => expect(screen.getByRole('region', { name: START_TEXT.title }).getAttribute('data-start')).toBe('waiting'))
    const start = screen.getByRole('region', { name: START_TEXT.title })
    expect(screen.getByTestId('start-why').textContent).toMatch(/^Pourquoi : un agent vivant attend ta réponse depuis /)
    // a POINTER to the oldest request, not a second copy of its card: the text and the
    // Autoriser buttons exist ONCE on the page, in "À traiter"
    const oldest = [...data.waiting].sort((a, b) => b.age_secs - a.age_secs)[0]
    expect(within(start).queryByText(snippet(oldest.text), { exact: false })).toBeNull()
    expect(within(start).queryByRole('button', { name: 'Autoriser' })).toBeNull()
    expect(within(start).getByRole('button', { name: /Voir en haut de « À traiter »/ })).toBeTruthy()
    expect(screen.getAllByText(snippet(oldest.text), { exact: false })).toHaveLength(1)
    expect(screen.getAllByTestId('attention-card')).toHaveLength(data.waiting.length)
    expect(start.compareDocumentPosition(band('waiting')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('with nothing to answer or resume, it says nothing blocks and how many threads advance alone', async () => {
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
    await waitFor(() => expect(screen.getByRole('region', { name: START_TEXT.title }).getAttribute('data-start')).toBe('calm'))
    expect(screen.getByTestId('start-title').textContent).toMatch(/^Rien ne te bloque : \d+ (fil avance seul|fils avancent seuls)$/)
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
    await waitFor(() => expect(screen.getByRole('region', { name: START_TEXT.title }).getAttribute('data-start')).toBe('incomplete'))
  })

  it('"À suivre" is folded by default with a discreet count, and its header counter opens it', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(within(band('thinking')).getByRole('button', { name: /À suivre/ })).toBeTruthy())
    const toggle = within(band('thinking')).getByRole('button', { name: /À suivre/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('today-thinking-body')!.hidden).toBe(true)
    fireEvent.click(within(screen.getByRole('list', { name: TODAY_TEXT.summaryLabel })).getByRole('button', { name: /à suivre/ }))
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
    // the summary reads in the SAME order as the sections: "2 à traiter · 1 à reprendre · 3 en cours · ..."
    expect(screen.getByRole('list', { name: TODAY_TEXT.summaryLabel }).textContent!.replace(/\s+/g, ' ').trim()).toMatch(/^\d+ à traiter ?· ?\d+ à reprendre ?· ?\d+ en cours ?· ?\d+ à suivre$/)
  })
})

describe('TodayPage: workspace chips', () => {
  it('are a row of compact chips under the summary, not a big selector', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    const chips = screen.getByRole('group', { name: TODAY_TEXT.laneFilterLabel })
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tous', 'Acme', 'PO'])
    expect(within(chips).getByRole('button', { name: 'Tous' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /filter/i })).toBeNull()
    // under the summary
    const summary = screen.getByRole('list', { name: TODAY_TEXT.summaryLabel })
    expect(summary.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

  it('a chip filters, is reflected in the URL, and "Tous" clears it', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(band('waiting').getAttribute('data-state')).toBe('ready'))
    fireEvent.click(screen.getByRole('button', { name: 'PO' }))
    expect(screen.getByTestId('where').textContent).toBe('/today?workspace=project-orchestrator')
    await waitFor(() => expect(get.mock.calls.at(-1)![0]).toBe('/attention?workspace_slug=project-orchestrator'))
    expect(screen.getByRole('button', { name: 'PO' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Tous' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Tous' }))
    expect(screen.getByTestId('where').textContent).toBe('/today')
  })
})
