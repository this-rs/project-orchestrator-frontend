/**
 * A declared row that has an overflow menu: on a touch screen "Add to chat" is a visible
 * button beside the menu, not only an entry inside it. jsdom evaluates no media query:
 * this checks that the button exists, is a real button reachable by name, and is shown
 * by the coarse-pointer variant only (the measured size is in the browser check).
 *
 * Run with: npx vitest run src/components/ui/EntityRow.touch.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { chatDraftInputAtom, chatServerFeaturesAtom } from '@/atoms'
import { EntityRow } from './EntityRow'

const ID = '57cf05c9-25b6-495d-ab07-de4b11d64736'

function mount(on = true) {
  const store = createStore()
  if (on) store.set(chatServerFeaturesAtom, ['refs_v1'])
  render(
    <Provider store={store}>
      <MemoryRouter>
        <EntityRow title="Auth flow" entityRef={{ kind: 'plan', id: ID }} actions={[{ label: 'Delete', onClick: () => {} }]} />
      </MemoryRouter>
    </Provider>,
  )
  return store
}

describe('EntityRow with a menu - touch', () => {
  it('has a real "Add to chat" button next to the menu, shown on coarse pointers only', () => {
    const store = mount()
    const wrap = screen.getByTestId('row-add-touch')
    expect(wrap.className).toMatch(/\bhidden\b/)
    expect(wrap.className).toMatch(/pointer-coarse:contents/)
    const button = screen.getByRole('button', { name: /Add .* to chat/ })
    expect(wrap.contains(button)).toBe(true)
    expect(button.className).toMatch(/pointer-coarse:size-11/)
    fireEvent.click(button)
    expect(store.get(chatDraftInputAtom)).toBe(`#plan:${ID} `)
  })

  it('is the row it was without refs_v1: no button', () => {
    mount(false)
    expect(screen.queryByTestId('row-add-touch')).toBeNull()
  })
})
