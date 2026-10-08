import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatServerFeaturesAtom, refsAnnouncementAtom } from '@/atoms'
import { ReferenceChip } from './ReferenceChip'
import { RefsAnnouncer } from './RefsAnnouncer'
import type { ChatReference } from '@/refs/types'

const task: ChatReference = { kind: 'task', id: '3adeffc9-c8b0-4e2f-a674-55bfcb293433', label: 'PR 1 — backend' }

describe('ReferenceChip', () => {
  it('names the kind for a screen reader and shows the label', () => {
    render(<ReferenceChip reference={{ ...task, resolution: 'ok' }} />)
    const chip = screen.getByTestId('reference-chip')
    expect(chip.dataset.state).toBe('ok')
    expect(chip.textContent).toBe('Task: PR 1 — backend')
  })

  it.each([
    ['pending', undefined, '(resolving)'],
    ['truncated', 'truncated', '(truncated)'],
    ['unavailable', 'not_found', '(unavailable)'],
    ['unavailable', 'forbidden', '(unavailable)'],
  ] as const)('tells the %s state in words, not by colour alone (%s)', (state, resolution, words) => {
    render(<ReferenceChip reference={{ ...task, resolution }} />)
    const chip = screen.getByTestId('reference-chip')
    expect(chip.dataset.state).toBe(state)
    expect(chip.textContent).toContain(words)
    // an icon (aria-hidden) accompanies the words
    expect(chip.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('does not reveal whether an unavailable entity is missing or forbidden', () => {
    const a = render(<ReferenceChip reference={{ ...task, resolution: 'not_found' }} />)
    const htmlA = a.container.innerHTML
    a.unmount()
    const b = render(<ReferenceChip reference={{ ...task, resolution: 'forbidden' }} />)
    expect(b.container.innerHTML).toBe(htmlA)
  })

  it('falls back to "Kind shortid" for a reference without a label', () => {
    render(<ReferenceChip reference={{ kind: 'rfc', id: '2191fcb0-e07c-49c1-9f29-cb9f7441f914' }} />)
    expect(screen.getByTestId('reference-chip').textContent).toContain('RFC 2191fcb0')
  })

  it('draws no button unless the composer asks for removal; the button is named, focus-visible and >= 24px', () => {
    const { rerender } = render(<ReferenceChip reference={task} />)
    expect(screen.queryByRole('button')).toBeNull()
    const onRemove = vi.fn()
    rerender(<ReferenceChip reference={task} onRemove={onRemove} />)
    const button = screen.getByRole('button', { name: 'Remove Task PR 1 — backend' })
    expect(button.className).toContain('focus-visible:ring-2')
    expect(button.className).toContain('h-6')
    expect(button.className).toContain('w-6')
    expect(button.className).toContain('pointer:coarse')
    fireEvent.click(button)
    expect(onRemove).toHaveBeenCalledWith(task)
  })

  it('keeps secondary text at slate-400 or lighter (never zinc-500 / gray-500)', () => {
    render(<ReferenceChip reference={{ ...task, resolution: 'truncated' }} />)
    const html = screen.getByTestId('reference-chip').outerHTML
    expect(html).toContain('text-slate-400')
    expect(html).not.toMatch(/(zinc|gray)-[56]00/)
  })
})

describe('RefsAnnouncer', () => {
  it('renders nothing while the server does not speak references', () => {
    const store = createStore()
    store.set(refsAnnouncementAtom, 'ignored')
    const { container } = render(<Provider store={store}><RefsAnnouncer /></Provider>)
    expect(container.innerHTML).toBe('')
  })

  it('is a polite, atomic status region carrying the announcement once refs_v1 is on', () => {
    const store = createStore()
    store.set(chatServerFeaturesAtom, ['refs_v1'])
    render(<Provider store={store}><RefsAnnouncer /></Provider>)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.getAttribute('aria-atomic')).toBe('true')
    expect(region.textContent).toBe('')
    act(() => store.set(refsAnnouncementAtom, '1 reference unavailable: Task 3adeffc9'))
    expect(region.textContent).toBe('1 reference unavailable: Task 3adeffc9')
  })
})
