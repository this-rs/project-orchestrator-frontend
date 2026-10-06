/**
 * The conversation header is ONE line: title, then the scope chip and the provider badge.
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
  it('lays the title, the scope and the badge out on one row, never stacked', () => {
    renderHeader({
      title: 'Refonte du sélecteur',
      scope: { kind: 'project', label: 'project-orchestrator-backend', to: '/projects/x' },
      badge: <span>DeepSeek · v4-pro</span>,
    })
    const row = screen.getByTestId('chat-header-title')
    expect(row.className).toMatch(/\bflex\b/)
    expect(row.className).toMatch(/\bitems-center\b/)
    expect(row.className).not.toMatch(/\bflex-col\b/)
    // None of the three is a block of its own: a block is a line.
    for (const el of Array.from(row.children)) {
      expect((el as HTMLElement).className).not.toMatch(/(^|\s)block(\s|$)/)
    }
  })

  it('the title is what gives way: it truncates and keeps its full text as a tooltip', () => {
    renderHeader({ title: 'A very long title '.repeat(10) })
    const title = screen.getByText(/A very long title/)
    expect(title.className).toMatch(/\btruncate\b/)
    expect(title.className).toMatch(/\bmin-w-0\b/)
    expect(title.getAttribute('title')).toBe(title.textContent)
  })

  it('keeps the violet tone for a workspace and the indigo one for a project', () => {
    const { unmount } = renderHeader({ title: 't', scope: { kind: 'workspace', label: 'ws', to: '/workspace/ws' } })
    const ws = screen.getByTestId('chat-header-scope')
    expect(ws.getAttribute('data-scope')).toBe('workspace')
    expect(ws.className).toMatch(/purple/)
    expect(ws.textContent).toContain('⬡')
    unmount()
    renderHeader({ title: 't', scope: { kind: 'project', label: 'p', to: '/projects/p' } })
    const project = screen.getByTestId('chat-header-scope')
    expect(project.className).toMatch(/indigo/)
    expect(project.textContent).not.toContain('⬡')
    expect(project.getAttribute('href')).toBe('/projects/p')
  })

  it('on a narrow width the chips go first, the badge before the scope, and the title stays', () => {
    renderHeader({
      title: 't',
      scope: { kind: 'project', label: 'p', to: '/projects/p' },
      badge: <span data-testid="b">badge</span>,
    })
    // `hidden sm:inline-flex` for the scope, `hidden md:inline-flex` for the badge.
    expect(screen.getByTestId('chat-header-scope').className).toMatch(/\bhidden\b.*\bsm:inline-flex\b/)
    expect(screen.getByTestId('b').parentElement!.className).toMatch(/\bhidden\b.*\bmd:inline-flex\b/)
  })

  it('renders only the title when it belongs to nothing', () => {
    renderHeader({ title: 'New conversation' })
    expect(screen.queryByTestId('chat-header-scope')).toBeNull()
    expect(screen.getByText('New conversation')).toBeTruthy()
  })
})
