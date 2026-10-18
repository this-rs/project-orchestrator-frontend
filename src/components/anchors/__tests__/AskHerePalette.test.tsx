/**
 * « Demander ici »: opened by Cmd/Ctrl+K, usable with the keyboard alone and
 * with a screen reader; the page's entity is a pre-checked SUGGESTION whose exact
 * snapshot is shown (allow-list, secrets hidden, "not verified"); Enter asks.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const anchors = vi.hoisted(() => ({ listAnchoredSessions: vi.fn() }))
vi.mock('@/services/anchors', async (orig) => ({ ...(await orig<typeof import('@/services/anchors')>()), anchorsApi: anchors }))

import { chatPanelModeAtom, chatServerFeaturesAtom } from '@/atoms/chat'
import { askHereOpenAtom, askHereRequestAtom, uiContextAtom } from '@/atoms/anchors'
import { AnchorsUnavailableError } from '@/services/anchors'
import { AskHerePalette } from '../AskHerePalette'
import { claimModK } from '../askHereShortcut'

const PLAN = '22222222-2222-4222-8222-222222222222'

function renderPalette(opts: { path?: string; context?: { kind: string; id: string; label?: string } | null; refs?: boolean } = {}) {
  const store = createStore()
  store.set(chatPanelModeAtom, 'closed')
  store.set(chatServerFeaturesAtom, opts.refs === false ? [] : ['refs_v1'])
  if (opts.context !== undefined) store.set(uiContextAtom, opts.context)
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[opts.path ?? '/workspace/ws/today']}>
        <button type="button">outside</button>
        <AskHerePalette />
      </MemoryRouter>
    </Provider>,
  )
  return store
}
const pressModK = (init: KeyboardEventInit = { metaKey: true }) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...init })))
const question = () => screen.getByRole('textbox', { name: 'Your question' })

beforeEach(() => {
  vi.clearAllMocks()
  anchors.listAnchoredSessions.mockResolvedValue({ items: [] })
})

describe('AskHerePalette', () => {
  it('Cmd+K (or Ctrl+K) opens a labelled dialog whose question box has the focus', async () => {
    renderPalette({ context: { kind: 'plan', id: PLAN, label: 'Auth flow' } })
    expect(screen.queryByRole('dialog')).toBeNull()
    pressModK({ ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Ask here' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    await waitFor(() => expect(document.activeElement).toBe(question()))
    expect(screen.getByText(/Enter asks · Shift\+Enter adds a line · Esc closes/)).toBeTruthy()
  })

  it('leaves Cmd+K alone while a screen owns it, and with another modifier', () => {
    renderPalette({ context: { kind: 'plan', id: PLAN } })
    const release = claimModK()
    pressModK()
    expect(screen.queryByRole('dialog')).toBeNull()
    release()
    pressModK({ metaKey: true, shiftKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the page entity is a pre-checked suggestion, with the exact snapshot sent, secrets hidden, labelled not verified', async () => {
    const store = renderPalette({ context: { kind: 'plan', id: PLAN, label: 'Auth sk-ant-abcdefghijklmnopqrstuvwx' } })
    act(() => store.set(askHereOpenAtom, true))
    const box = (await screen.findByTestId('ask-here-suggestion')) as HTMLInputElement
    expect(box.checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Auth \[hidden\]|Auth sk-ant/ })).toBe(box)
    const snap = screen.getByTestId('ask-here-snapshot')
    expect(snap.textContent).toContain('plan')
    expect(snap.textContent).toContain(PLAN)
    expect(screen.getByTestId('ask-here-snapshot-name').textContent).toBe('Auth [hidden]')
    expect(snap.textContent).toMatch(/Not verified/)
    expect(snap.textContent).toMatch(/look like secrets are hidden/)
    // Unchecked: no snapshot leaves.
    fireEvent.click(box)
    expect(screen.queryByTestId('ask-here-snapshot')).toBeNull()
  })

  it('Enter asks: the question with the page as reference AND as a focus anchor, the chat opens, the palette closes', async () => {
    const store = renderPalette({ context: { kind: 'plan', id: PLAN, label: 'Auth flow' } })
    act(() => store.set(askHereOpenAtom, true))
    await waitFor(() => expect(anchors.listAnchoredSessions).toHaveBeenCalledWith({ target_type: 'plan', target_id: PLAN, limit: 1 }))
    fireEvent.change(question(), { target: { value: 'Why is it blocked?' } })
    fireEvent.keyDown(question(), { key: 'Enter' })
    const req = store.get(askHereRequestAtom)
    expect(req).toMatchObject({
      text: `Why is it blocked? #plan:${PLAN}`,
      refs: [{ kind: 'plan', id: PLAN, label: 'Auth flow' }],
      anchors: [{ target_type: 'plan', target_id: PLAN, roles: ['focus'], snapshot_name: 'Auth flow' }],
    })
    expect(store.get(chatPanelModeAtom)).toBe('open')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Shift+Enter is a new line; an empty question is refused out loud and asks nothing', async () => {
    const store = renderPalette({ context: null, path: '/workspace/ws/today' })
    act(() => store.set(askHereOpenAtom, true))
    await screen.findByRole('dialog')
    expect(screen.getByText(/Nothing on this page can be anchored/)).toBeTruthy()
    fireEvent.keyDown(question(), { key: 'Enter', shiftKey: true })
    expect(store.get(askHereRequestAtom)).toBeNull()
    fireEvent.keyDown(question(), { key: 'Enter' })
    expect(screen.getByRole('alert').textContent).toBe('Write a question first.')
    expect(store.get(askHereRequestAtom)).toBeNull()
    expect(question().getAttribute('aria-invalid')).toBe('true')
    // The button asks too, once there is a question; nothing about a page is attached.
    fireEvent.change(question(), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(store.get(askHereRequestAtom)).toMatchObject({ text: 'Hello', refs: [], anchors: [] })
  })

  it('an unchecked suggestion sends neither reference nor anchor', async () => {
    const store = renderPalette({ context: { kind: 'plan', id: PLAN } })
    act(() => store.set(askHereOpenAtom, true))
    fireEvent.click(await screen.findByTestId('ask-here-suggestion'))
    fireEvent.change(question(), { target: { value: 'Q' } })
    fireEvent.keyDown(question(), { key: 'Enter' })
    expect(store.get(askHereRequestAtom)).toMatchObject({ text: 'Q', refs: [], anchors: [] })
  })

  it('without the anchors routes it says so, and the page still travels as a reference', async () => {
    anchors.listAnchoredSessions.mockRejectedValue(new AnchorsUnavailableError())
    const store = renderPalette({ path: `/workspace/ws/plans/${PLAN}` })
    act(() => store.set(askHereOpenAtom, true))
    expect(await screen.findByTestId('ask-here-anchors-unavailable')).toBeTruthy()
    fireEvent.change(question(), { target: { value: 'Q' } })
    fireEvent.keyDown(question(), { key: 'Enter' })
    expect(store.get(askHereRequestAtom)).toMatchObject({ refs: [{ kind: 'plan', id: PLAN }], anchors: [] })
  })

  it('a kind that cannot be anchored is offered as a reference only; without refs_v1 nothing of the page is sent but the anchor', async () => {
    const store = renderPalette({ context: { kind: 'rfc', id: PLAN, label: 'RFC 1' } })
    act(() => store.set(askHereOpenAtom, true))
    expect(await screen.findByText(/cannot be anchored: it is sent as a reference/)).toBeTruthy()
    fireEvent.change(question(), { target: { value: 'Q' } })
    fireEvent.keyDown(question(), { key: 'Enter' })
    expect(store.get(askHereRequestAtom)).toMatchObject({ refs: [{ kind: 'rfc' }], anchors: [] })
  })

  it('without refs_v1 the anchor alone carries the page', async () => {
    const store = renderPalette({ context: { kind: 'plan', id: PLAN }, refs: false })
    act(() => store.set(askHereOpenAtom, true))
    await screen.findByTestId('ask-here-snapshot')
    fireEvent.change(question(), { target: { value: 'Q' } })
    fireEvent.keyDown(question(), { key: 'Enter' })
    expect(store.get(askHereRequestAtom)).toMatchObject({ text: 'Q', refs: [], anchors: [{ target_type: 'plan' }] })
  })

  it('Escape and Cancel close it without asking', async () => {
    const store = renderPalette({ context: { kind: 'plan', id: PLAN } })
    act(() => store.set(askHereOpenAtom, true))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => store.set(askHereOpenAtom, true))
    await screen.findByRole('dialog')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(store.get(askHereRequestAtom)).toBeNull()
  })
})
