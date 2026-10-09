/**
 * The generic drop zone: an address dropped on the chat is converted when it
 * is a page of this application that IS an entity (or, only when the server
 * announced the `link` kind, an external http(s) address); anything else is
 * refused with a short, announced sentence. Text drops keep working.
 *
 * jsdom dispatches the events; the real drag is checked in a browser.
 *
 * Run with: npx vitest run src/refs/source/__tests__/urlDrop.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { chatDraftInputAtom, chatServerFeaturesAtom } from '@/atoms'
import { ChatInput } from '@/components/chat/ChatInput'
import fixture from '../../__fixtures__/kinds_response.json'
import { HISTORICAL_KINDS, clearRefKinds, parseKindsResponse, setActiveKinds } from '../../kinds'
import { ReferenceSourceHost, RefDropOverlay, addRefToChatAtom, useRefDropTarget } from '..'
import { PLAN_ID, makeDataTransfer } from './testDnd'

vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({ chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) } }))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))

const PERSONA_ID = '9a2c4e6f-0b1d-4385-a7c9-d1e3f5a7b9c0'
const appUrl = (path: string) => `${window.location.origin}${path}`
let store: ReturnType<typeof createStore>

/** A panel-like zone: not a text field. */
function Panel() {
  const drop = useRefDropTarget()
  return (
    <div data-testid="panel" {...drop.zoneProps} className="relative">
      panel
      {drop.over && <RefDropOverlay />}
    </div>
  )
}

function mount(opts: { features?: string[] } = {}) {
  store.set(chatServerFeaturesAtom, opts.features ?? ['refs_v1'])
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ReferenceSourceHost />
        <Panel />
        <ChatInput onSend={vi.fn()} onQueue={vi.fn()} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId="s1" />
      </MemoryRouter>
    </Provider>,
  )
}
const uriDrag = (uri: string, extra: Record<string, string> = {}) => makeDataTransfer({ 'text/uri-list': uri, 'text/plain': uri, ...extra })
const announcer = () => screen.getByTestId('refs-add-announcer').textContent
const textarea = () => screen.getByRole('combobox') as HTMLTextAreaElement

beforeEach(() => {
  store = createStore()
  localStorage.clear()
  setActiveKinds(parseKindsResponse(fixture.response)!)
})
afterEach(() => clearRefKinds())

describe('an address dropped on the panel', () => {
  it('a page of this application that is an entity becomes the reference, with the hover frame', () => {
    mount()
    const dt = uriDrag(appUrl(`/workspace/po/plans/${PLAN_ID}`))
    fireEvent.dragEnter(screen.getByTestId('panel'), { dataTransfer: dt })
    expect(screen.getByTestId('ref-drop-overlay').textContent).toContain('Drop to add')
    expect(fireEvent.dragOver(screen.getByTestId('panel'), { dataTransfer: dt })).toBe(false)
    fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: dt })
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
    expect(screen.queryByTestId('ref-drop-overlay')).toBeNull()
  })

  it('an actor page becomes @persona:uuid', () => {
    mount()
    fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: uriDrag(appUrl(`/workspace/po/personas/${PERSONA_ID}`)) })
    expect(store.get(chatDraftInputAtom)).toBe(`@persona:${PERSONA_ID} `)
  })

  it('a page of this application that is not an entity is refused, out loud, and adds nothing', () => {
    mount()
    fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: uriDrag(appUrl('/workspace/po/plans')) })
    expect(store.get(chatDraftInputAtom)).toBe('')
    expect(announcer()?.trim()).toBe('This item cannot be added to the chat.')
  })

  it('an external address is refused while the server has no `link` kind', () => {
    setActiveKinds(HISTORICAL_KINDS)
    mount()
    fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: uriDrag('https://example.com/docs') })
    expect(store.get(chatDraftInputAtom)).toBe('')
    expect(announcer()).toContain('cannot be added')
  })

  it('an external address becomes #link:url once the server announces the `link` kind', () => {
    mount()
    fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: uriDrag('https://example.com/docs?page=2') })
    expect(store.get(chatDraftInputAtom)).toBe('#link:https://example.com/docs?page=2 ')
  })

  it('never turns a javascript: or credentialed address into a reference', () => {
    mount()
    for (const u of ['javascript:alert(1)', 'https://u:p@example.com/', 'file:///etc/passwd']) {
      fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: uriDrag(u) })
    }
    expect(store.get(chatDraftInputAtom)).toBe('')
  })

  it('ignores the comment lines of a uri-list', () => {
    mount()
    fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: uriDrag(`# a comment\r\n${appUrl(`/workspace/po/plans/${PLAN_ID}`)}`) })
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
  })

  it('does nothing without refs_v1', () => {
    mount({ features: [] })
    const dt = uriDrag(appUrl(`/workspace/po/plans/${PLAN_ID}`))
    expect(fireEvent.dragOver(screen.getByTestId('panel'), { dataTransfer: dt })).toBe(true)
    fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: dt })
    expect(store.get(chatDraftInputAtom)).toBe('')
  })

  it('leaves a file dragged from a web page (it carries its address too) to the attachments', () => {
    mount()
    const dt = makeDataTransfer({ 'text/uri-list': appUrl(`/workspace/po/plans/${PLAN_ID}`) }, [new File(['x'], 'a.png', { type: 'image/png' })])
    expect(fireEvent.dragOver(screen.getByTestId('panel'), { dataTransfer: dt })).toBe(true)
    fireEvent.drop(screen.getByTestId('panel'), { dataTransfer: dt })
    expect(store.get(chatDraftInputAtom)).toBe('')
  })

  it('leaves plain dragged text alone', () => {
    mount()
    const dt = makeDataTransfer({ 'text/plain': 'just words' })
    expect(fireEvent.dragOver(screen.getByTestId('panel'), { dataTransfer: dt })).toBe(true)
  })
})

describe('a reference that a token cannot spell', () => {
  it('a file whose path holds a space is refused with a reason: the draft text is the source of truth and has no way to write it', () => {
    mount()
    const PID = '00333b5f-2d0a-4467-9c98-155e55d2b7e5'
    const result = store.set(addRefToChatAtom, { ref: { kind: 'file', id: `${PID}:my notes.md` }, via: 'button' })
    expect(result.status).toBe('invalid')
    expect(store.get(chatDraftInputAtom)).toBe('')
    const ok = store.set(addRefToChatAtom, { ref: { kind: 'file', id: `${PID}:src/a.rs` }, via: 'button' })
    expect(ok.status).toBe('added')
    expect(store.get(chatDraftInputAtom)).toBe(`#file:${PID}:src/a.rs `)
  })
})

describe('an address dropped on the text field of the composer', () => {
  it('keeps the native text drop (the field is not claimed during the drag)', () => {
    mount()
    const dt = uriDrag('https://example.com/docs', { 'text/plain': 'https://example.com/docs' })
    expect(fireEvent.dragOver(textarea(), { dataTransfer: dt })).toBe(true)
    expect(screen.queryByTestId('ref-drop-overlay')).toBeNull()
  })

  it('but an entity page dropped there still becomes the reference (the drop is cancelled so the URL text is not inserted)', () => {
    mount()
    const ev = fireEvent.drop(textarea(), { dataTransfer: uriDrag(appUrl(`/workspace/po/plans/${PLAN_ID}`)) })
    expect(ev).toBe(false)
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
  })

  it('and an address nobody can make a reference of is left to the field, untouched', () => {
    setActiveKinds(HISTORICAL_KINDS)
    mount()
    const ev = fireEvent.drop(textarea(), { dataTransfer: uriDrag('https://example.com/docs') })
    expect(ev).toBe(true)
    expect(store.get(chatDraftInputAtom)).toBe('')
    expect(screen.getByTestId('refs-add-announcer').textContent).toBe('')
  })
})
