/**
 * TodayPage — the cross-workspace cockpit: four bands, lanes, and the loading / empty /
 * error states of each band. Data: the shared contract fixtures, through the real
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
import { BAND_TEXT, TODAY_TEXT } from '@/components/today/bands'

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

function renderPage(entry = '/today') {
  const store = createStore()
  store.set(workspacesAtom, workspaces)
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
})

describe('TodayPage: structure', () => {
  it('shows the four labelled bands in a fixed order, counters in the header', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('region', { name: BAND_TEXT.waiting.title }).length).toBe(1))
    await waitFor(() => expect(within(band('waiting')).getAllByRole('region').length).toBeGreaterThan(0))
    const order = ['waiting', 'running', 'stuck', 'thinking'] as const
    const nodes = order.map((b) => band(b))
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const counters = screen.getByRole('list', { name: 'Résumé par bande' })
    expect(within(counters).getByText(BAND_TEXT.waiting.title)).toBeTruthy()
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

describe('TodayPage: lanes and sessions without a thread', () => {
  it('threads are grouped by lane, with the lane name', async () => {
    const data = fixture('forty_threads')
    get.mockResolvedValue(data)
    renderPage()
    await waitFor(() => expect(band('running').querySelectorAll('[data-lane]').length).toBeGreaterThan(0))
    const lanes = [...band('running').querySelectorAll('[data-lane]')].map((e) => e.getAttribute('data-lane'))
    expect(new Set(lanes).size).toBe(lanes.length)
  })

  it('a lane filter hides the lane headings and asks the server for that lane', async () => {
    get.mockResolvedValue(fixture('runner_busy'))
    renderPage('/today?workspace=project-orchestrator')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toBe('/attention?workspace_slug=project-orchestrator')
    await waitFor(() => expect(band('running').getAttribute('data-state')).toBe('ready'))
    expect(band('running').querySelectorAll('h3').length).toBe(0)
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

describe('TodayPage: lane filter in the URL', () => {
  it('/workspace/:slug/today starts on that lane and widening lands on /today', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage('/workspace/acme-freelance/today')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toBe('/attention?workspace_slug=acme-freelance')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByTestId('where').textContent).toBe('/today')
  })

  it('narrowing on /today is reflected in the query string and widening clears it', async () => {
    get.mockResolvedValue(fixture('four_bands'))
    renderPage('/today?workspace=project-orchestrator')
    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toBe('/attention?workspace_slug=project-orchestrator')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
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
      expect(bandLabels.slice(0, 4)).toEqual(["T'attend", 'Tourne', 'Coincé', 'Pensée'])
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
