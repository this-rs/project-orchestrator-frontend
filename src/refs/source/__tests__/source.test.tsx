/**
 * The declaration side: `data-po-ref`, the single delegated dragstart, the
 * MIME payload, the non-drag add path (button, menu entry, shortcut).
 *
 * Run with: npx vitest run src/refs/source
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { chatDraftInputAtom, chatPanelModeAtom, chatRefLabelsAtom, chatServerFeaturesAtom, toastMessagesAtom } from '@/atoms'
import { EntityRow } from '@/components/ui/EntityRow'
import { PageHeader } from '@/components/ui/PageHeader'
import {
  AddToChatButton,
  ReferenceSourceHost,
  addRefToChatAtom,
  chatComposerBlockedAtom,
  draggingRefAtom,
  refsAddAnnouncementAtom,
  useReferenceSource,
} from '..'
import { NOTE_ID, PLAN_ID, TASK_ID, makeDataTransfer } from './testDnd'

let store: ReturnType<typeof createStore>

function Source({ kind = 'plan', id = PLAN_ID, label = 'Auth flow', drag }: { kind?: string; id?: string; label?: string; drag?: boolean }) {
  const props = useReferenceSource({ kind, id, label }, { drag })
  return (
    <div data-testid="src" {...props}>
      <a href="/plans/x">link</a>
      <span data-testid="text">some selected text</span>
    </div>
  )
}

function mount(ui: React.ReactNode, features: string[] | null = ['refs_v1']) {
  if (features) store.set(chatServerFeaturesAtom, features)
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ReferenceSourceHost />
        {ui}
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => {
  store = createStore()
})
afterEach(() => vi.useRealTimers())

describe('declaration', () => {
  it('puts data-po-ref (kind:id), the label for display, and makes the element draggable', () => {
    mount(<Source />)
    const el = screen.getByTestId('src')
    expect(el.getAttribute('data-po-ref')).toBe(`plan:${PLAN_ID}`)
    expect(el.getAttribute('data-po-ref-label')).toBe('Auth flow')
    expect(el.getAttribute('draggable')).toBe('true')
  })

  it('refuses a kind outside the closed list and a malformed id: nothing is declared', () => {
    mount(<><Source kind="persona" /><Source kind="plan" id="not-a-uuid" /></>)
    for (const el of screen.getAllByTestId('src')) {
      expect(el.hasAttribute('data-po-ref')).toBe(false)
      expect(el.hasAttribute('draggable')).toBe(false)
    }
  })

  it('leaves the DOM exactly as it was without refs_v1', () => {
    mount(<Source />, null)
    const el = screen.getByTestId('src')
    expect(el.hasAttribute('data-po-ref')).toBe(false)
    expect(el.hasAttribute('draggable')).toBe(false)
    expect(screen.queryByTestId('refs-add-announcer')).toBeNull()
  })

  it('drag: false keeps the declaration but marks the drag off (kanban keeps its own drag)', () => {
    mount(<Source drag={false} />)
    const el = screen.getByTestId('src')
    expect(el.getAttribute('data-po-ref-drag')).toBe('off')
    expect(el.hasAttribute('draggable')).toBe(false)
  })
})

describe('ReferenceSourceHost — the one dragstart listener', () => {
  it('writes the custom MIME ({kind,id} only) AND the #kind:id token as text/plain, from a nested element', () => {
    mount(<Source />)
    const dt = makeDataTransfer({ 'text/uri-list': 'http://x/plans/x', 'text/plain': 'link' })
    fireEvent.dragStart(screen.getByText('link'), { dataTransfer: dt })
    expect(JSON.parse(dt.getData('application/x-po-ref'))).toEqual({ kind: 'plan', id: PLAN_ID })
    expect(dt.getData('text/plain')).toBe(`#plan:${PLAN_ID}`)
    // The native <a href> payload is neutralised: no URL leaves with the drag.
    expect(dt.getData('text/uri-list')).toBe('')
    expect(dt.effectAllowed).toBe('copy')
    // A label travels nowhere on the wire payload.
    expect(dt.getData('application/x-po-ref')).not.toContain('Auth flow')
  })

  it('remembers what is in flight for the drop zones, and forgets it at dragend', () => {
    mount(<Source />)
    fireEvent.dragStart(screen.getByTestId('src'), { dataTransfer: makeDataTransfer() })
    expect(store.get(draggingRefAtom)).toEqual({ kind: 'plan', id: PLAN_ID, label: 'Auth flow' })
    fireEvent.dragEnd(screen.getByTestId('src'))
    expect(store.get(draggingRefAtom)).toBeNull()
  })

  it('ignores a dragged text selection (the target is a text node) and leaves the payload alone', () => {
    mount(<Source />)
    const dt = makeDataTransfer({ 'text/plain': 'some selected text' })
    fireEvent.dragStart(screen.getByTestId('text').firstChild as Node, { dataTransfer: dt })
    expect(dt.getData('application/x-po-ref')).toBe('')
    expect(dt.getData('text/plain')).toBe('some selected text')
    expect(store.get(draggingRefAtom)).toBeNull()
  })

  it('ignores an element that opted out, an undeclared element, and an attribute that does not validate', () => {
    mount(
      <>
        <Source drag={false} />
        <div data-testid="plain"><a href="/x">plain</a></div>
        <div data-testid="bad" data-po-ref="persona:whatever"><a href="/y">bad</a></div>
      </>,
    )
    for (const target of [screen.getByText('link'), screen.getByText('plain'), screen.getByText('bad')]) {
      const dt = makeDataTransfer({ 'text/plain': 'native' })
      fireEvent.dragStart(target, { dataTransfer: dt })
      expect(dt.getData('application/x-po-ref')).toBe('')
      expect(dt.getData('text/plain')).toBe('native')
    }
  })

  it('does nothing without refs_v1', () => {
    mount(<div data-testid="raw" data-po-ref={`plan:${PLAN_ID}`} />, null)
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('raw'), { dataTransfer: dt })
    expect(dt.getData('application/x-po-ref')).toBe('')
  })

  it('is one listener at the document: an element mounted later is covered with no handler of its own', () => {
    const { rerender } = mount(<div />)
    rerender(
      <Provider store={store}>
        <MemoryRouter>
          <ReferenceSourceHost />
          <Source kind="note" id={NOTE_ID} />
        </MemoryRouter>
      </Provider>,
    )
    const dt = makeDataTransfer()
    fireEvent.dragStart(screen.getByTestId('src'), { dataTransfer: dt })
    expect(dt.getData('text/plain')).toBe(`#note:${NOTE_ID}`)
  })
})

describe('the non-drag add path', () => {
  it('"Add to chat" is a named, keyboard-reachable button of at least 24px that adds the reference and opens the chat', () => {
    mount(<AddToChatButton entity={{ kind: 'task', id: TASK_ID, label: 'Ship PR 6' }} />)
    const btn = screen.getByRole('button', { name: 'Add “Ship PR 6” to chat' })
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('Alt+Shift+A')
    expect(btn.className).toMatch(/\bsize-8\b/) // 32px; min-h-6/min-w-6 floor = 24px
    expect(btn.className).toMatch(/focus-visible:ring-2/)
    expect(btn.className).toMatch(/pointer-coarse:size-11/)
    expect(store.get(chatPanelModeAtom)).toBe('closed')
    fireEvent.click(btn)
    expect(store.get(chatDraftInputAtom)).toBe(`#task:${TASK_ID} `)
    expect(store.get(chatPanelModeAtom)).toBe('open')
    expect(store.get(chatRefLabelsAtom)[`task:${TASK_ID}`]?.label).toBe('Ship PR 6')
    expect(screen.getByTestId('refs-add-announcer').textContent).toContain('Ship PR 6 added to the message.')
    expect(store.get(toastMessagesAtom).at(-1)?.message).toContain('added')
  })

  it('renders nothing without refs_v1', () => {
    mount(<AddToChatButton entity={{ kind: 'task', id: TASK_ID, label: 'Ship PR 6' }} />, null)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('Alt+Shift+A on a focused declared element adds it; in a text field it is left alone', () => {
    mount(
      <>
        <Source />
        <div data-po-ref={`plan:${PLAN_ID}`}><input data-testid="field" /></div>
      </>,
    )
    fireEvent.keyDown(screen.getByText('link'), { key: 'Å', code: 'KeyA', altKey: true, shiftKey: true })
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
    store.set(chatDraftInputAtom, '')
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'Å', code: 'KeyA', altKey: true, shiftKey: true })
    expect(store.get(chatDraftInputAtom)).toBe('')
  })

  it('EntityRow with entityRef: declared, and "Add to chat" comes first in the row menu (also with no other action)', () => {
    mount(
      <ul>
        <EntityRow as="li" title="Auth flow" entityRef={{ kind: 'plan', id: PLAN_ID }} actions={[{ label: 'Delete', onClick: () => {} }]} />
        <EntityRow as="li" title="Bare row" entityRef={{ kind: 'task', id: TASK_ID }} />
      </ul>,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].getAttribute('data-po-ref')).toBe(`plan:${PLAN_ID}`)
    expect(rows[0].getAttribute('data-po-ref-label')).toBe('Auth flow')
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Auth flow' }))
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(items).toEqual(['Add to chat', 'Delete'])
    fireEvent.click(screen.getAllByRole('menuitem')[0])
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
    expect(rows[1].getAttribute('data-po-ref')).toBe(`task:${TASK_ID}`)
    expect(screen.getByRole('button', { name: 'Add “Bare row” to chat' })).toBeTruthy()
  })

  it('EntityRow and PageHeader stay what they were without refs_v1', () => {
    mount(
      <>
        <ul><EntityRow as="li" title="Auth flow" entityRef={{ kind: 'plan', id: PLAN_ID }} /></ul>
        <PageHeader title="Auth flow" entityRef={{ kind: 'plan', id: PLAN_ID }} />
      </>,
      null,
    )
    expect(document.querySelector('[data-po-ref]')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('PageHeader declares its title and offers "Add to chat" in its menu', () => {
    mount(<PageHeader title="Auth flow" entityRef={{ kind: 'plan', id: PLAN_ID }} />)
    expect(screen.getByRole('heading', { name: 'Auth flow' }).getAttribute('data-po-ref')).toBe(`plan:${PLAN_ID}`)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Auth flow' }))
    expect(screen.getByRole('menuitem', { name: 'Add to chat' })).toBeTruthy()
  })
})

describe('addRefToChatAtom — idempotence, cap, blocked', () => {
  const add = (id: string, kind = 'task') => store.set(addRefToChatAtom, { ref: { kind, id }, via: 'drop' })
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  beforeEach(() => store.set(chatServerFeaturesAtom, ['refs_v1']))

  it('adding the same entity twice makes ONE reference (and says so), whatever the case of the id', () => {
    expect(add(TASK_ID).status).toBe('added')
    const again = add(TASK_ID.toUpperCase())
    expect(again.status).toBe('duplicate')
    expect(again.message).toMatch(/already in the message/)
    expect(store.get(chatDraftInputAtom).match(/#task:/g)).toHaveLength(1)
  })

  it('stops at 20 references with a clear message and keeps the draft intact', () => {
    for (let i = 1; i <= 20; i++) expect(add(uuid(i)).status).toBe('added')
    const before = store.get(chatDraftInputAtom)
    const r = add(uuid(21))
    expect(r.status).toBe('full')
    expect(r.message).toBe(`Reference limit reached: a message carries at most 20. Task ${uuid(21).slice(0, 8)} was not added.`)
    expect(store.get(chatDraftInputAtom)).toBe(before)
    // Still announced and visible.
    expect(store.get(refsAddAnnouncementAtom).text).toBe(r.message)
    expect(store.get(toastMessagesAtom).at(-1)?.message).toBe(r.message)
  })

  it('a composer that cannot take text (disabled, read-only) refuses with its reason; the draft is not touched', () => {
    store.set(chatComposerBlockedAtom, 'this conversation is read-only')
    const r = add(TASK_ID)
    expect(r.status).toBe('blocked')
    expect(r.message).toContain('read-only')
    expect(store.get(chatDraftInputAtom)).toBe('')
  })

  it('does not block an entity of another workspace or project: the server decides', () => {
    expect(store.set(addRefToChatAtom, { ref: { kind: 'note', id: NOTE_ID }, label: 'Elsewhere', via: 'drop' }).status).toBe('added')
  })

  it('refuses a payload that is not a closed-list reference, and does nothing without refs_v1', () => {
    expect(store.set(addRefToChatAtom, { ref: { kind: 'skill', id: TASK_ID }, via: 'drop' }).status).toBe('invalid')
    store.set(chatServerFeaturesAtom, [])
    expect(add(TASK_ID).status).toBe('off')
  })
})
