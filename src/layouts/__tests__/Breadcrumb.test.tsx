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

describe('Breadcrumb: starts at the workspace, Today is not a crumb', () => {
  it('global entry (/today, all the dashboards): "Overview" where the workspace name goes', () => {
    const { container } = renderCrumb('/today')
    // the current page, not a link: there is nowhere further up to go
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(container.textContent).toBe('Overview')
  })

  it('workspace entry (Today filtered on a lane): just the workspace', () => {
    renderCrumb('/workspace/ws/today', 'Studio')
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Studio'])
    expect(screen.getByRole('link', { name: 'Studio' }).getAttribute('href')).toBe('/workspace/ws/today')
  })

  it('a workspace page: <workspace> / Section, no Today crumb and no leading separator', () => {
    const { container } = renderCrumb('/workspace/ws/plans', 'Studio')
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Studio', 'Plans'])
    expect(screen.queryByRole('link', { name: 'Today' })).toBeNull()
    // the workspace name opens the workspace's own Today (its bare path used to redirect to an empty list)
    expect(screen.getByRole('link', { name: 'Studio' }).getAttribute('href')).toBe('/workspace/ws/today')
    // one separator between the two crumbs, none before the first
    expect((container.textContent ?? '').trim()).toBe('Studio/Plans')
  })

  it('every crumb link is as tall as a navigation entry (40px line box), not 20px', () => {
    renderCrumb('/workspace/ws/plans', 'Studio')
    for (const a of screen.getAllByRole('link')) expect(a.className).toContain('leading-10')
  })
})
