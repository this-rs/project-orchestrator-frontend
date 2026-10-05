import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Provider } from 'jotai'

vi.mock('@/services/env', () => ({ isTauri: true }))
vi.mock('@/components/settings/UpdatesSection', () => ({
  UpdatesSection: () => <div>updates section</div>,
}))
vi.mock('@/components/chat/PermissionSettingsPanel', () => ({
  PermissionSettingsPanel: () => <div>permission panel</div>,
}))

import { SettingsPage } from '../SettingsPage'

describe('SettingsPage', () => {
  it('renders the explained Chat & AI section and goes back', () => {
    render(
      <Provider>
        <MemoryRouter initialEntries={['/settings']}>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/" element={<p>home</p>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Chat & AI' })).toBeTruthy()
    expect(screen.getByText('permission panel')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Updates' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('home')).toBeTruthy()
  })
})
