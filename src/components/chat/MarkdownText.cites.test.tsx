import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import tokens from '@/refs/__fixtures__/tokens.json'
import { MarkdownText } from './MarkdownText'
import type { ReactNode } from 'react'

const plan = tokens.valid[0]
const rfc = tokens.valid[4]

const inWorkspace = (ui: ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/workspace/acme/today']}>
      <Routes>
        <Route path="/workspace/:slug/*" element={ui} />
      </Routes>
    </MemoryRouter>,
  )

describe('MarkdownText — entities cited by the agent', () => {
  it('turns a valid #plan:uuid into a link that opens the plan', () => {
    inWorkspace(<MarkdownText citeRefs content={`Voir ${plan.token} pour le détail.`} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(`/workspace/acme/plans/${plan.ref.id}`)
    expect(link.getAttribute('data-kind')).toBe('plan')
    expect(link.textContent).toContain('Plan 57cf05c9')
    expect(screen.queryByText(plan.token, { exact: false })).toBeNull()
  })

  it('opens each kind where the application shows it', () => {
    const text = tokens.valid.map((v) => v.token).join(' ; ')
    inWorkspace(<MarkdownText citeRefs content={text} />)
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      `/workspace/acme/plans/${tokens.valid[0].ref.id}`,
      `/workspace/acme/tasks/${tokens.valid[1].ref.id}`,
      `/workspace/acme/notes/${tokens.valid[2].ref.id}`,
      `/workspace/acme/decisions/${tokens.valid[3].ref.id}`,
      `/workspace/acme/rfcs/${tokens.valid[4].ref.id}`,
    ])
  })

  it('shows the resolved label when it is known', () => {
    inWorkspace(<MarkdownText citeRefs knownRefs={[{ ...rfc.ref, label: 'Références v3' } as never]} content={`cf. ${rfc.token}`} />)
    expect(screen.getByRole('link').textContent).toContain('Références v3')
  })

  it('names the kind for a screen reader, and is a 24px target (44px on touch)', () => {
    inWorkspace(<MarkdownText citeRefs content={plan.token} />)
    const link = screen.getByRole('link')
    expect(link.textContent).toMatch(/^Plan: /)
    expect(link.className).toContain('min-h-6')
    expect(link.className).toContain('[@media(pointer:coarse)]:min-h-11')
    expect(link.className).toContain('focus-visible:ring-2')
  })

  it('leaves tokens in inline code and fenced blocks alone', () => {
    const { container } = inWorkspace(
      <MarkdownText citeRefs content={``+'`'+plan.token+'`'+`\n\n`+'```\n'+rfc.token+'\n```'} />,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).toContain(plan.token)
    expect(container.textContent).toContain(rfc.token)
  })

  it('leaves malformed or unknown tokens as plain text', () => {
    const text = tokens.invalid.map((v) => v.token).join(' ')
    const { container } = inWorkspace(<MarkdownText citeRefs content={text} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).toContain('#plan:not-a-uuid')
    expect(container.textContent).toContain('#persona:')
  })

  it('does nothing unless the caller says the text is the agent\'s own (note bodies, tool results)', () => {
    const { container } = inWorkspace(<MarkdownText content={`Voir ${plan.token}`} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).toContain(plan.token)
  })

  it('keeps the token as text when no workspace is known (no dead link)', () => {
    const { container } = render(
      <MemoryRouter><MarkdownText citeRefs content={`Voir ${plan.token}`} /></MemoryRouter>,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).toContain(plan.token)
  })

  it('does not nest a chip in a markdown link', () => {
    inWorkspace(<MarkdownText citeRefs content={`[ ${plan.token} ](https://example.com) et [x](${plan.token})`} />)
    expect(screen.queryByTestId('cited-ref')).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('renders without a router too (plain anchor)', () => {
    render(<MarkdownText citeRefs content={plan.token} />)
    expect(screen.queryByRole('link')).toBeNull() // no workspace: text
  })
})
