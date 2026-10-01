import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThinkingList } from '../ThinkingList'
import type { ThinkingItem, ThinkingKind } from '@/types/attention'

const m = vi.hoisted(() => ({
  decide: vi.fn(),
  confirm: vi.fn(),
  invalidate: vi.fn(),
  post: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/services/attention', () => ({ attentionApi: { decide: m.decide } }))
vi.mock('@/services/notes', () => ({ notesApi: { confirm: m.confirm, invalidate: m.invalidate } }))
vi.mock('@/services/api', () => ({ api: { post: m.post } }))
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ success: m.success, error: m.error, info: vi.fn(), warning: vi.fn() }) }))

const KEY = 'today.thinking.collapsed'
const item = (kind: ThinkingKind, id: string, title: string): ThinkingItem => ({
  id,
  kind,
  title,
  workspace: 'acme',
  status: kind === 'note_review' ? 'needs_review' : 'proposed',
  thread_id: null,
  since: '2026-09-30T10:00:00Z',
  age_secs: 3600,
})
const ITEMS = [
  item('rfc', 'r1', 'Adopt Rust'),
  item('decision', 'd1', 'Use Neo4j'),
  item('note_review', 'n1', 'Stale gotcha'),
  item('alert', 'a1', 'Disk almost full'),
]
const setup = (items = ITEMS, onChanged?: () => void) =>
  render(
    <MemoryRouter>
      <ThinkingList items={items} onChanged={onChanged} />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }))
  vi.clearAllMocks()
  m.decide.mockResolvedValue({})
  m.confirm.mockResolvedValue({})
  m.invalidate.mockResolvedValue({})
  m.post.mockResolvedValue({})
  window.localStorage.clear()
  // Folded by default: the action tests start from an opened section.
  window.localStorage.setItem(KEY, '0')
})
afterEach(() => vi.restoreAllMocks())

describe('ThinkingList', () => {
  it('groups by nature with a quiet count', () => {
    setup()
    for (const g of ['RFC', 'Décisions', 'Notes à relire', 'Alertes']) expect(screen.getByRole('region', { name: new RegExp(g) })).toBeTruthy()
    expect(screen.getByRole('button', { name: /À suivre/ }).textContent).toContain('4')
  })

  it('shows an empty state when nothing is left to decide', () => {
    setup([])
    expect(screen.getByText('Rien à suivre')).toBeTruthy()
  })

  it('title opens the item (RFC, decision, note); an alert has no page', () => {
    setup()
    expect(screen.getByRole('link', { name: 'Adopt Rust' }).getAttribute('href')).toBe('/workspace/acme/rfcs/r1')
    expect(screen.getByRole('link', { name: 'Use Neo4j' }).getAttribute('href')).toBe('/workspace/acme/decisions/d1')
    expect(screen.getByRole('link', { name: 'Stale gotcha' }).getAttribute('href')).toBe('/workspace/acme/notes/n1')
    expect(screen.queryByRole('link', { name: 'Disk almost full' })).toBeNull()
  })

  it('RFC accept acts in place, optimistically, with a toast and no confirmation', async () => {
    const onChanged = vi.fn()
    setup(ITEMS, onChanged)
    fireEvent.click(screen.getByRole('button', { name: 'Accepter Adopt Rust' }))
    expect(screen.queryByText('Adopt Rust')).toBeNull() // gone before the server answers
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(m.success).toHaveBeenCalledWith(expect.stringMatching(/^Accepté : /)))
    expect(m.decide).toHaveBeenCalledWith('rfc', 'r1', 'accept')
    expect(onChanged).toHaveBeenCalled()
  })

  it('rejecting an RFC asks for confirmation first, and cancel does nothing', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter Adopt Rust' }))
    expect(m.decide).not.toHaveBeenCalled()
    const dlg = await screen.findByText('Rejeter cette RFC ?')
    expect(dlg).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(m.decide).not.toHaveBeenCalled()
    expect(screen.getByText('Adopt Rust')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter Adopt Rust' }))
    const confirm = await screen.findByText('Rejeter cette RFC ?')
    fireEvent.click(within(confirm.closest('[role="dialog"]') ?? document.body).getByRole('button', { name: 'Rejeter' }))
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith('rfc', 'r1', 'reject'))
  })

  it.each([
    ['Accepter Use Neo4j', () => expect(m.decide).toHaveBeenCalledWith('decision', 'd1', 'accept')],
    ['Confirmer Stale gotcha', () => expect(m.confirm).toHaveBeenCalledWith('n1')],
    ['Invalider Stale gotcha', () => expect(m.invalidate).toHaveBeenCalledWith('n1', expect.any(String))],
    ['Acquitter Disk almost full', () => expect(m.post).toHaveBeenCalledWith('/alerts/a1/acknowledge', { acknowledged_by: 'today' })],
  ])('%s acts in place without confirmation', async (name, check) => {
    setup()
    fireEvent.click(screen.getByRole('button', { name }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(m.success).toHaveBeenCalled())
    check()
  })

  it('a failed action brings the row back and says so', async () => {
    m.confirm.mockRejectedValue(new Error('boom'))
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer Stale gotcha' }))
    await waitFor(() => expect(m.error).toHaveBeenCalledWith('Non enregistré : boom'))
    expect(screen.getByText('Stale gotcha')).toBeTruthy()
    expect(m.success).not.toHaveBeenCalled()
  })

  it('collapses and remembers it in localStorage', () => {
    const { unmount } = setup()
    const toggle = screen.getByRole('button', { name: /À suivre/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(window.localStorage.getItem(KEY)).toBe('1')
    expect(screen.queryByRole('region', { name: /RFC/ })).toBeNull()
    unmount()
    setup()
    expect(screen.getByRole('button', { name: /À suivre/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('still works when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    setup()
    const toggle = screen.getByRole('button', { name: /À suivre/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false') // unreadable storage: folded
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('is FOLDED by default (nothing stored), with a discreet count, and opening is remembered', () => {
    window.localStorage.clear()
    const { unmount } = setup()
    const toggle = screen.getByRole('button', { name: /À suivre/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.textContent).toContain('4')
    expect(document.getElementById('today-thinking-body')!.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(window.localStorage.getItem(KEY)).toBe('0')
    unmount()
    setup()
    expect(screen.getByRole('button', { name: /À suivre/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('can be driven by the page (controlled fold state)', () => {
    const onCollapsedChange = vi.fn()
    render(
      <MemoryRouter>
        <ThinkingList items={ITEMS} collapsed onCollapsedChange={onCollapsedChange} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /À suivre/ }))
    expect(onCollapsedChange).toHaveBeenCalledWith(false)
  })
})
