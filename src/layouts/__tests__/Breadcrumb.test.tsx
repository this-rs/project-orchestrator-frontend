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

describe('Breadcrumb: Today is the root', () => {
  it('global entry: just "Today", no workspace claimed, never "Home"', () => {
    renderCrumb('/today')
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Today'])
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/today')
    expect(screen.queryByText('Home')).toBeNull()
    expect(screen.queryByText('Studio')).toBeNull()
  })

  it('workspace entry (Today filtered on a lane): Today / <workspace>, with no second "Today"', () => {
    renderCrumb('/workspace/ws/today', 'Studio')
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Today', 'Studio'])
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/today')
    expect(screen.getByRole('link', { name: 'Studio' }).getAttribute('href')).toBe('/workspace/ws/today')
  })

  it('a workspace page: Today / <workspace> / Section', () => {
    renderCrumb('/workspace/ws/plans', 'Studio')
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Today', 'Studio', 'Plans'])
    expect(screen.getByRole('link', { name: 'Studio' }).getAttribute('href')).toBe('/workspace/ws')
  })

  it('every crumb link is as tall as a navigation entry (40px line box), not 20px', () => {
    renderCrumb('/workspace/ws/plans', 'Studio')
    for (const a of screen.getAllByRole('link')) expect(a.className).toContain('leading-10')
  })
})
