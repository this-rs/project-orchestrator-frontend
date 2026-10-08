/**
 * Real components that were annotated, rendered: the declaration reaches the DOM.
 * (The ratchet guards that every such component is declared; this checks that
 * a declaration actually produces the attribute, the drag opt-out and the button.)
 *
 * Run with: npx vitest run src/refs/source/__tests__/annotated.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { chatDraftInputAtom, chatServerFeaturesAtom } from '@/atoms'
import { PlanKanbanCard } from '@/components/kanban/PlanKanbanCard'
import { EntityLink } from '@/components/chat/tools/mcp/utils'
import { ReferenceSourceHost } from '..'
import { NOTE_ID, PLAN_ID, TASK_ID } from './testDnd'

function mount(ui: React.ReactNode, on = true) {
  const store = createStore()
  if (on) store.set(chatServerFeaturesAtom, ['refs_v1'])
  render(
    <Provider store={store}>
      <MemoryRouter>
        <ReferenceSourceHost />
        {ui}
      </MemoryRouter>
    </Provider>,
  )
  return store
}

describe('annotated components', () => {
  it('a kanban card is declared with the drag OFF (the board owns the pointer drag) and still has the button', () => {
    const plan = { id: PLAN_ID, title: 'Auth flow', description: 'd', status: 'draft', priority: 5, created_at: '2026-01-01T00:00:00Z' } as never
    const store = mount(<PlanKanbanCard plan={plan} />)
    const card = document.querySelector('[data-po-ref]') as HTMLElement
    expect(card.getAttribute('data-po-ref')).toBe(`plan:${PLAN_ID}`)
    expect(card.getAttribute('data-po-ref-drag')).toBe('off')
    expect(card.hasAttribute('draggable')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Add “Auth flow” to chat' }))
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${PLAN_ID} `)
  })

  it('a kanban card is exactly what it was without refs_v1', () => {
    const plan = { id: PLAN_ID, title: 'Auth flow', description: 'd', status: 'draft', priority: 5, created_at: '2026-01-01T00:00:00Z' } as never
    mount(<PlanKanbanCard plan={plan} />, false)
    expect(document.querySelector('[data-po-ref],[data-po-ref-drag]')).toBeNull()
    expect(screen.queryByRole('button', { name: /Add .* to chat/ })).toBeNull()
  })

  it('the tool-call entity link declares plans and tasks, and leaves other entity types undeclared', () => {
    mount(
      <>
        <EntityLink entityType="task" id={TASK_ID}>t</EntityLink>
        <EntityLink entityType="project" id="some-slug">p</EntityLink>
        <EntityLink entityType="note" id={NOTE_ID}>n</EntityLink>
      </>,
    )
    expect(screen.getByText('t').getAttribute('data-po-ref')).toBe(`task:${TASK_ID}`)
    expect(screen.getByText('p').hasAttribute('data-po-ref')).toBe(false)
    // note links go to the notes list, not to the note: still declared by id (a note id is an entity id).
    expect(screen.getByText('n').getAttribute('data-po-ref')).toBe(`note:${NOTE_ID}`)
  })
})
