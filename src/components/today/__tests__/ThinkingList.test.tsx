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
})
afterEach(() => vi.restoreAllMocks())

describe('ThinkingList', () => {
  it('groups by nature with a quiet count', () => {
    setup()
    for (const g of ['RFC', 'Decisions', 'Notes to review', 'Alerts']) expect(screen.getByRole('region', { name: new RegExp(g) })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Threads of thought/ }).textContent).toContain('4')
  })

  it('shows an empty state when nothing is left to decide', () => {
    setup([])
    expect(screen.getByText('Nothing to decide.')).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'Accept Adopt Rust' }))
    expect(screen.queryByText('Adopt Rust')).toBeNull() // gone before the server answers
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(m.success).toHaveBeenCalledWith('Accepted'))
    expect(m.decide).toHaveBeenCalledWith('rfc', 'r1', 'accept')
    expect(onChanged).toHaveBeenCalled()
  })

  it('rejecting an RFC asks for confirmation first, and cancel does nothing', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Reject Adopt Rust' }))
    expect(m.decide).not.toHaveBeenCalled()
    const dlg = await screen.findByText('Reject this RFC?')
    expect(dlg).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(m.decide).not.toHaveBeenCalled()
    expect(screen.getByText('Adopt Rust')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reject Adopt Rust' }))
    const confirm = await screen.findByText('Reject this RFC?')
    fireEvent.click(within(confirm.closest('[role="dialog"]') ?? document.body).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(m.decide).toHaveBeenCalledWith('rfc', 'r1', 'reject'))
  })

  it.each([
    ['Accept Use Neo4j', () => expect(m.decide).toHaveBeenCalledWith('decision', 'd1', 'accept')],
    ['Confirm Stale gotcha', () => expect(m.confirm).toHaveBeenCalledWith('n1')],
    ['Invalidate Stale gotcha', () => expect(m.invalidate).toHaveBeenCalledWith('n1', expect.any(String))],
    ['Acknowledge Disk almost full', () => expect(m.post).toHaveBeenCalledWith('/alerts/a1/acknowledge', { acknowledged_by: 'today' })],
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
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Stale gotcha' }))
    await waitFor(() => expect(m.error).toHaveBeenCalledWith('Not saved: boom'))
    expect(screen.getByText('Stale gotcha')).toBeTruthy()
    expect(m.success).not.toHaveBeenCalled()
  })

  it('collapses and remembers it in localStorage', () => {
    const { unmount } = setup()
    const toggle = screen.getByRole('button', { name: /Threads of thought/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(window.localStorage.getItem(KEY)).toBe('1')
    expect(screen.queryByRole('region', { name: /RFC/ })).toBeNull()
    unmount()
    setup()
    expect(screen.getByRole('button', { name: /Threads of thought/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('still works when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    setup()
    const toggle = screen.getByRole('button', { name: /Threads of thought/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })
})
