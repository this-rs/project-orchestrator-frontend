/**
 * Kanban card on a touch screen: the "Add to chat" button is a real, positioned
 * 44px target that stays off the title, and the 20px native-drag grip (a mouse
 * affordance) does not pretend to be a touch target. jsdom computes no layout
 * and no media queries: these are the classes that make the CSS do it, not pixels
 * (the measured sizes are in the browser check).
 *
 * Run with: npx vitest run src/components/kanban/BoardCard.touch.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { chatServerFeaturesAtom } from '@/atoms'
import { PlanKanbanCard } from './PlanKanbanCard'

const PLAN = { id: '57cf05c9-25b6-495d-ab07-de4b11d64736', title: 'Auth flow', description: 'd', status: 'draft', priority: 5, created_at: '2026-01-01T00:00:00Z' } as never

function mount() {
  const store = createStore()
  store.set(chatServerFeaturesAtom, ['refs_v1'])
  render(
    <Provider store={store}>
      <MemoryRouter>
        <PlanKanbanCard plan={PLAN} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('kanban card - touch', () => {
  it('the add button is 44px on a coarse pointer', () => {
    mount()
    expect(screen.getByRole('button', { name: /Add .* to chat/ }).className).toMatch(/pointer-coarse:size-11/)
  })

  it('the add button really is absolutely positioned in the corner (a plain `absolute` loses to the button\'s own `relative`: it needs the important modifier)', () => {
    mount()
    const cls = screen.getByRole('button', { name: /Add .* to chat/ }).className
    expect(cls).toMatch(/(^|\s)absolute!(\s|$)/)
    expect(cls).toMatch(/\bright-1\b/)
    expect(cls).toMatch(/\btop-1\b/)
  })

  it('the card leaves room for the 44px button on a coarse pointer so it never covers the title', () => {
    mount()
    const card = document.querySelector('[data-po-ref]') as HTMLElement
    expect(card.className).toMatch(/\[@media\(pointer:coarse\)\]:pr-12/)
  })

  it('the 20px drag grip is not offered on a coarse pointer (the button is the one-finger equivalent)', () => {
    mount()
    expect(screen.getByTestId('ref-grip').className).toMatch(/pointer-coarse:hidden/)
  })
})
