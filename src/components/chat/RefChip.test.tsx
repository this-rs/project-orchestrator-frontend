import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import tokens from '@/refs/__fixtures__/tokens.json'
import { MarkdownText } from './MarkdownText'
import { RefChip } from './RefChip'
import { ReferenceChip } from './ReferenceChip'
import { REF_CHIP_HEIGHT, REF_CHIP_HIT } from './chipGeometry'
import type { ChatReference } from '@/refs/types'

const plan = tokens.valid[0]
const task: ChatReference = { kind: 'task', id: '3adeffc9-c8b0-4e2f-a674-55bfcb293433', label: 'PR 1 — backend' }

/** The classes that apply at rest: no variant prefix (`hover:`, `focus-visible:`, `data-[…]:`, …). */
const atRest = (el: Element) => el.className.split(/\s+/).filter((c) => c && !c.includes(':'))

const cite = () =>
  render(
    <MemoryRouter initialEntries={['/workspace/acme/today']}>
      <Routes>
        <Route path="/workspace/:slug/*" element={<MarkdownText citeRefs content={`Voir ${plan.token} pour le détail.`} />} />
      </Routes>
    </MemoryRouter>,
  )

describe('RefChip — inline density (citations in the agent prose)', () => {
  it('reads as text at rest: no background, no visible border, the text colour, a dotted underline', () => {
    cite()
    const chip = screen.getByTestId('cited-ref')
    expect(chip.dataset.density).toBe('inline')
    expect(chip.dataset.revealed).toBe('false')
    const rest = atRest(chip)
    expect(rest.filter((c) => c.startsWith('bg-') && c !== 'bg-transparent')).toEqual([])
    expect(rest).toContain('border-transparent')
    expect(rest).toContain('text-inherit')
    expect(rest).toContain('underline')
    expect(rest).toContain('decoration-dotted')
    // the icon is dimmed, not hidden
    const icon = chip.querySelector('svg[aria-hidden="true"]')!
    expect(icon.getAttribute('class')).toContain('opacity-50')
  })

  it('keeps the name readable and the link usable at rest (hover is never the only way)', () => {
    cite()
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(`/workspace/acme/plans/${plan.ref.id}`)
    expect(link.textContent).toBe('Plan: Plan 57cf05c9')
  })

  it('reveals the full chip on hover, keyboard focus and press', () => {
    cite()
    const cls = screen.getByTestId('cited-ref').className
    for (const v of ['hover:', 'focus-visible:', 'active:', 'data-[revealed=true]:']) {
      expect(cls).toContain(`${v}bg-indigo-500/10`)
      expect(cls).toContain(`${v}border-indigo-400/30`)
    }
    const icon = screen.getByTestId('cited-ref').querySelector('svg')!.getAttribute('class')!
    expect(icon).toContain('group-hover:opacity-100')
    expect(icon).toContain('group-focus-visible:opacity-100')
    expect(icon).toContain('group-data-[revealed=true]:opacity-100')
  })

  it('is revealed while it holds the focus, and back to rest on blur', () => {
    cite()
    const chip = screen.getByTestId('cited-ref')
    fireEvent.focus(chip)
    expect(chip.dataset.revealed).toBe('true')
    fireEvent.blur(chip)
    expect(chip.dataset.revealed).toBe('false')
  })

  it('does not move the line when revealed: border and padding are there at rest, the icon keeps its size', () => {
    cite()
    const chip = screen.getByTestId('cited-ref')
    const rest = atRest(chip)
    expect(rest).toContain('border')
    expect(rest).toContain('px-1.5')
    // nothing that changes the box is behind a variant
    expect(chip.className).not.toMatch(/(hover|focus-visible|active|data-\[revealed=true\]):(p[xy]?|m[xy]?|border-\d|h|w|text-(xs|sm|base))-/)
    const icon = chip.querySelector('svg')!.getAttribute('class')!
    expect(icon).toContain('h-3')
    expect(icon).toContain('w-3')
  })

  it('stays a 24px target with a 2px focus ring, the target drawn by ::before, not by the line', () => {
    cite()
    const cls = screen.getByTestId('cited-ref').className
    expect(cls).toContain(REF_CHIP_HIT)
    expect(cls).toMatch(/\brelative\b/)
    expect(cls).toContain('focus-visible:ring-2')
  })

  it('fits inside its line of text: 20px drawn, 16px counted, nothing taller on touch', () => {
    cite()
    const cls = screen.getByTestId('cited-ref').className
    for (const c of REF_CHIP_HEIGHT.split(' ')) expect(cls.split(' ')).toContain(c)
    expect(cls).toContain('align-baseline')
    // what made a line with a chip taller than the others
    expect(cls).not.toMatch(/\bmin-h-|\bh-(6|11)\b|pointer[-:]coarse[^ ]*:(min-)?h-/)
  })

  it('never whispers a problem: a non-ok state is drawn full even when asked inline', () => {
    render(<RefChip testId="c" density="inline" kind="task" name="T" state="unavailable" />)
    const chip = screen.getByTestId('c')
    expect(chip.dataset.density).toBe('full')
    expect(chip.textContent).toContain('(unavailable)')
    expect(atRest(chip)).toContain('bg-red-500/10')
  })
})

describe('RefChip — full density (composer and user bubble)', () => {
  it('is always the full chip: background and border at rest, the icon at full strength', () => {
    render(<ReferenceChip reference={{ ...task, resolution: 'ok' }} />)
    const chip = screen.getByTestId('reference-chip')
    expect(chip.dataset.density).toBe('full')
    expect(chip.dataset.revealed).toBeUndefined()
    const rest = atRest(chip)
    expect(rest).toContain('bg-indigo-500/10')
    expect(rest).toContain('border-indigo-400/30')
    expect(rest).not.toContain('underline')
    expect(chip.querySelector('svg')!.getAttribute('class')).not.toContain('opacity-50')
  })

  it('shares its geometry with the inline chip', () => {
    render(<ReferenceChip reference={{ ...task, resolution: 'ok' }} />)
    const full = atRest(screen.getByTestId('reference-chip'))
    for (const c of ['inline-flex', 'rounded-md', 'border', 'px-1.5', 'gap-1', 'text-xs', ...REF_CHIP_HEIGHT.split(' ')]) expect(full).toContain(c)
  })
})
