/**
 * The logo of the workspace menu is the link to Today; the workspace name is a separate button
 * that opens the switcher (a link cannot live inside a button). Choosing another workspace
 * lands on ITS Today.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { Provider } from 'jotai'

vi.mock('@/hooks', () => ({ useWorkspace: () => ({ id: 'w1', slug: 'studio', name: 'Studio' }) }))
vi.mock('@/hooks/useAttentionCount', () => ({ useAttentionCount: () => 3 }))
vi.mock('@/services', () => ({ workspacesApi: { create: vi.fn() } }))
vi.mock('@/atoms', async () => {
  const { atom } = await import('jotai')
  return {
    workspacesAtom: atom([
      { id: 'w1', name: 'Studio', slug: 'studio' },
      { id: 'w2', name: 'Lab', slug: 'lab' },
    ]),
  }
})

import { WorkspaceSwitcher } from '../WorkspaceSwitcher'

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}

const renderSwitcher = (collapsed: boolean) =>
  render(
    <Provider>
      <MemoryRouter initialEntries={['/workspace/studio/plans']}>
        <Routes>
          <Route path="*" element={<><WorkspaceSwitcher collapsed={collapsed} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )

describe('WorkspaceSwitcher', () => {
  it('the logo is the link to Today and carries the attention badge', () => {
    renderSwitcher(false)
    const logo = screen.getByRole('link', { name: 'Today' })
    expect(logo.getAttribute('href')).toBe('/today')
    expect(logo.querySelector('img[src="/logo-32.png"]')).not.toBeNull()
    expect(within(logo).getByTestId('attention-badge').className).toContain('absolute')
  })

  it('the workspace name is a button that opens the list, not part of the link', () => {
    renderSwitcher(false)
    const name = screen.getByRole('button', { name: /Studio/ })
    expect(name.closest('a')).toBeNull()
    expect(name.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(name)
    expect(name.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Lab')).toBeTruthy()
  })

  it('choosing another workspace opens ITS Today', () => {
    renderSwitcher(false)
    fireEvent.click(screen.getByRole('button', { name: /Studio/ }))
    fireEvent.click(screen.getByText('Lab'))
    expect(screen.getByTestId('where').textContent).toBe('/workspace/lab/today')
  })

  it('collapsed: the logo is still the Today link and a small button keeps the list reachable', () => {
    renderSwitcher(true)
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/today')
    const toggle = screen.getByRole('button', { name: 'Changer de workspace' })
    fireEvent.click(toggle)
    expect(screen.getByText('Lab')).toBeTruthy()
  })
})
