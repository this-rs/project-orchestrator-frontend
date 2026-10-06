/**
 * The user menu is how people reach `/vault` (and the provider form links to
 * it): the entry must exist and lead to that route.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { UserMenu } from '../UserMenu'
import { currentUserAtom } from '@/atoms'

describe('UserMenu vault entry', () => {
  vi.stubGlobal('__APP_VERSION__', 'test')
  it('navigates to /vault', () => {
    const store = createStore()
    store.set(currentUserAtom, { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' } as never)
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <UserMenu />
          <Routes>
            <Route path="/" element={<p>home</p>} />
            <Route path="/vault" element={<p>vault route</p>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    )
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button', { name: 'Vault' }))
    expect(screen.getByText('vault route')).toBeTruthy()
  })
})
