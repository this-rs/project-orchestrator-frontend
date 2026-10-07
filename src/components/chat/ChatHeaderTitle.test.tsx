/**
 * The conversation header: the title first, the workspace or project in small type under it.
 *
 * Run with: npx vitest run src/components/chat/ChatHeaderTitle.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChatHeaderTitle } from './ChatHeaderTitle'

const renderHeader = (props: Parameters<typeof ChatHeaderTitle>[0]) =>
  render(
    <MemoryRouter>
      <ChatHeaderTitle {...props} />
    </MemoryRouter>,
  )

describe('ChatHeaderTitle', () => {
  it('takes the free width of the bar, and is the one that truncates', () => {
    renderHeader({ title: 'A very long title '.repeat(10) })
    const root = screen.getByTestId('chat-header-title')
    expect(root.className).toMatch(/\bflex-1\b/)
    expect(root.className).toMatch(/\bmin-w-0\b/)
    const title = screen.getByText(/A very long title/)
    expect(title.className).toMatch(/\btruncate\b/)
    expect(title.getAttribute('title')).toBe(title.textContent)
  })

  it('puts the scope under the title in 10 px type, truncating on its own', () => {
    renderHeader({ title: 'Refonte', scope: { kind: 'project', label: 'project-orchestrator-backend', to: '/projects/x' } })
    const root = screen.getByTestId('chat-header-title')
    expect(root.className).toMatch(/\bflex-col\b/)
    const [title, scope] = Array.from(root.children) as HTMLElement[]
    expect(title.textContent).toBe('Refonte')
    expect(scope).toBe(screen.getByTestId('chat-header-scope'))
    expect(scope.className).toMatch(/text-\[10px\]/)
    expect(scope.className).toMatch(/\btruncate\b/)
    expect(scope.getAttribute('href')).toBe('/projects/x')
  })

  it('keeps the violet tone for a workspace and the indigo one for a project, as plain text', () => {
    const { unmount } = renderHeader({ title: 't', scope: { kind: 'workspace', label: 'ws', to: '/workspace/ws' } })
    const ws = screen.getByTestId('chat-header-scope')
    expect(ws.getAttribute('data-scope')).toBe('workspace')
    expect(ws.className).toMatch(/purple/)
    expect(ws.textContent).toContain('⬡')
    // A note, not a box: no border, no fill.
    expect(ws.className).not.toMatch(/\bborder\b|\bbg-/)
    unmount()
    renderHeader({ title: 't', scope: { kind: 'project', label: 'p', to: '/projects/p' } })
    const project = screen.getByTestId('chat-header-scope')
    expect(project.className).toMatch(/indigo/)
    expect(project.textContent).not.toContain('⬡')
  })

  // The bug: chips shown by WINDOW width (`sm:`, `md:`) took the whole bar of a narrow docked
  // panel on a wide screen and pushed the title under the buttons.
  it('never depends on the width of the window: no breakpoint on the title or the scope', () => {
    renderHeader({ title: 't', scope: { kind: 'project', label: 'p', to: '/projects/p' } })
    const root = screen.getByTestId('chat-header-title')
    const all = [root, ...Array.from(root.querySelectorAll('*'))] as HTMLElement[]
    for (const el of all) {
      expect(el.className, el.outerHTML).not.toMatch(/\b(sm|md|lg|xl):/)
      expect(el.className).not.toMatch(/\bhidden\b/)
    }
  })

  it('renders only the title when it belongs to nothing', () => {
    renderHeader({ title: 'New conversation' })
    expect(screen.queryByTestId('chat-header-scope')).toBeNull()
    expect(screen.getByText('New conversation')).toBeTruthy()
  })
})
