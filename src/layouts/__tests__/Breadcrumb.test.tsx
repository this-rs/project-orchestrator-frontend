import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'jotai'
import { Breadcrumb } from '../MainLayout'

function renderCrumb(pathname: string, workspaceName?: string) {
  return render(
    <Provider>
      <MemoryRouter>
        <Breadcrumb pathname={pathname} workspaceName={workspaceName} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('Breadcrumb on the two Today entries', () => {
  it('workspace entry: Workspace / Today', () => {
    renderCrumb('/workspace/ws/today', 'Studio')
    expect(screen.getByRole('link', { name: 'Studio' }).getAttribute('href')).toBe('/workspace/ws')
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/workspace/ws/today')
  })

  it('global entry: no workspace claimed, Home / Today', () => {
    renderCrumb('/today')
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/today')
    expect(screen.queryByText('Studio')).toBeNull()
  })
})
