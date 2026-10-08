/**
 * A kanban card is a reference source AND a dnd-kit draggable. The two drags
 * must not step on each other, and the add button must work from the keyboard.
 *
 * Run with: npx vitest run src/components/kanban/__tests__/BoardCardRefs.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { chatDraftInputAtom, chatServerFeaturesAtom } from '@/atoms'
import { ReferenceSourceHost } from '@/refs/source'
import { makeDataTransfer, PLAN_ID } from '@/refs/source/__tests__/testDnd'
import { BoardCard } from '../BoardCard'

let store: ReturnType<typeof createStore>
const onDragStart = vi.fn()

function Board() {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart}>
      <BoardCard
        id="card-1"
        dataKey="plan"
        item={{ id: PLAN_ID }}
        ariaLabel="Auth flow"
        title="Auth flow"
        entityRef={{ kind: 'plan', id: PLAN_ID, label: 'Auth flow' }}
        meta={[<button key="s">Status</button>]}
      />
    </DndContext>
  )
}

function mount() {
  store.set(chatServerFeaturesAtom, ['refs_v1'])
  return render(
    <Provider store={store}>
      <ReferenceSourceHost />
      <Board />
    </Provider>,
  )
}

const addButton = () => screen.getByRole('button', { name: /Add .*Auth flow.* to chat/ })

beforeEach(() => {
  store = createStore()
  onDragStart.mockClear()
})

describe('BoardCard: Add to chat from the keyboard', () => {
  for (const code of ['Enter', 'Space']) {
    it(`${code} on the button does not start the board's keyboard drag (the native click then adds the reference)`, () => {
      mount()
      fireEvent.keyDown(addButton(), { code, key: code === 'Space' ? ' ' : 'Enter' })
      // The browser turns Enter/Space on a focused button into a click.
      fireEvent.click(addButton())
      expect(onDragStart).not.toHaveBeenCalled()
      expect(document.body.textContent).not.toMatch(/Draggable item/)
      expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
    })
  }

  it('Enter on the card itself still starts the keyboard drag of the board (non-regression)', () => {
    mount()
    fireEvent.keyDown(screen.getByRole('group', { name: 'Auth flow' }), { code: 'Enter', key: 'Enter' })
    expect(document.body.textContent).toMatch(/Picked up draggable item/)
  })
})

describe('BoardCard: dragging to the chat', () => {
  it('the grip is a native reference drag: it carries the MIME + text/plain payload', () => {
    mount()
    const grip = screen.getByTestId('ref-grip')
    expect(grip.getAttribute('draggable')).toBe('true')
    const dt = makeDataTransfer()
    fireEvent.dragStart(grip, { dataTransfer: dt })
    expect(dt.getData('application/x-po-ref')).toBe(JSON.stringify({ kind: 'plan', id: PLAN_ID }))
    expect(dt.getData('text/plain')).toBe(`#plan:${PLAN_ID}`)
  })

  it('pressing and moving on the grip does not start the board drag; on the card body it does', () => {
    mount()
    const press = (el: Element) => {
      fireEvent.pointerDown(el, { button: 0, isPrimary: true, clientX: 0, clientY: 0, pointerId: 1 })
      fireEvent.pointerMove(document, { isPrimary: true, clientX: 40, clientY: 40, pointerId: 1 })
    }
    press(screen.getByTestId('ref-grip'))
    expect(onDragStart).not.toHaveBeenCalled()
    fireEvent.pointerUp(document, { pointerId: 1 })
    press(screen.getByRole('group', { name: 'Auth flow' }))
    expect(onDragStart).toHaveBeenCalledTimes(1)
  })

  it('the card is not a button containing buttons', () => {
    mount()
    expect(screen.queryByRole('button', { name: 'Auth flow' })).toBeNull()
  })
})
