import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Rocket } from 'lucide-react'
import { EntityCard } from './EntityCard'
import { EntityGrid } from './EntityGrid'
import { Surface } from './Surface'
import { SkeletonCard } from './Skeleton'
import { TONE_CLASSES } from './statusMeta'
import { NOMENCLATURE } from '@/constants/nomenclature'

function inRouter(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/list']}>
      <Routes>
        <Route path="/list" element={ui} />
        <Route path="/items/:id" element={<div>detail page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}
const card = (c: HTMLElement) => c.querySelector('[data-entity-card]') as HTMLElement

describe('EntityCard slots', () => {
  it('renders title, description, trailing, status, meta, context, leading, titleSuffix and children', () => {
    render(
      <ul>
        <EntityCard
          concept="plans"
          title="Auth flow"
          titleSuffix={<span>lock</span>}
          leading={<span>lead</span>}
          trailing="3h"
          description="Rework the login"
          status={['Running', null, 'P8']}
          meta={['backend', null, '3 tasks']}
          context={<span>ctx</span>}
        >
          <span>expanded body</span>
        </EntityCard>
      </ul>,
    )
    for (const t of ['Auth flow', 'lock', 'lead', '3h', 'Rework the login', 'Running', 'P8', 'backend', '3 tasks', 'ctx', 'expanded body']) {
      expect(screen.getByText(t)).toBeTruthy()
    }
    expect(screen.queryByText('·')).toBeNull()
  })

  it('omits the empty slots (no description line, no footer)', () => {
    const { container } = render(<ul><EntityCard concept="notes" title="Bare" /></ul>)
    expect(container.querySelector('[data-card-primary]')).toBeNull()
    expect(container.querySelectorAll('[data-entity-card] > div').length).toBe(1)
  })

  it('reads the tint and the icon from NOMENCLATURE; icon can be overridden', () => {
    const { container, rerender } = render(<ul><EntityCard concept="plans" title="A" /></ul>)
    expect(card(container).style.getPropertyValue('--entity-tint')).toBe(NOMENCLATURE.plans.tint)
    expect(card(container).dataset.concept).toBe('plans')
    const tile = container.querySelector('[data-card-tile]')!
    expect(tile.getAttribute('aria-hidden')).toBe('true')
    expect(tile.innerHTML).toBe(render(<NOMENCLATURE.plans.icon className="size-[18px]" />).container.innerHTML)
    rerender(<ul><EntityCard concept="tasks" icon={Rocket} title="A" /></ul>)
    expect(card(container).style.getPropertyValue('--entity-tint')).toBe(NOMENCLATURE.tasks.tint)
    expect(container.querySelector('[data-card-tile]')!.innerHTML).toBe(render(<Rocket className="size-[18px]" />).container.innerHTML)
  })

  it('is opaque: no glass, no blur, no shadow; the wash is capped at 11 %', () => {
    const { container } = render(<ul><EntityCard concept="plans" title="A" /></ul>)
    const cls = card(container).className
    expect(cls).not.toMatch(/glass|backdrop|blur|shadow/)
    expect(cls).toContain('_11%,transparent),transparent_55%')
  })

  it('primaryAction sits above the title button and the ⋯ menu names the card', () => {
    const act = vi.fn()
    const open = vi.fn()
    inRouter(
      <ul>
        <EntityCard
          concept="plans"
          title="Auth flow"
          onClick={open}
          primaryAction={<button onClick={act}>Start</button>}
          actions={[{ label: 'Edit', onClick: () => {} }]}
        />
      </ul>,
    )
    const primary = screen.getByRole('button', { name: 'Start' })
    expect(primary.closest('[data-card-primary]')!.className).toContain('z-10')
    fireEvent.click(primary)
    expect(act).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Actions for Auth flow' })).toBeTruthy()
  })

  it('menuLabel and ariaLabel: the menu name does not inherit the verb of ariaLabel', () => {
    render(
      <ul>
        <EntityCard concept="plans" title={<b>Rich</b>} ariaLabel="Expand Rich" menuLabel="Rich" onClick={() => {}} actions={[{ label: 'Edit', onClick: () => {} }]} />
      </ul>,
    )
    expect(screen.getByRole('button', { name: 'Expand Rich' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Actions for Rich' })).toBeTruthy()
  })

  it('a node in actions is rendered as-is', () => {
    render(<ul><EntityCard concept="plans" title="A" actions={<span>custom</span>} /></ul>)
    expect(screen.getByText('custom')).toBeTruthy()
  })

  it('muted dims the title; viewTransitionName is set on it', () => {
    render(<ul><EntityCard concept="plans" title="Old" muted viewTransitionName="vt-1" /></ul>)
    const t = screen.getByText('Old')
    expect(t.className).toContain('text-gray-400')
    expect(t.style.getPropertyValue('view-transition-name')).toBe('vt-1')
  })
})

/**
 * jsdom does not turn Enter / Space into a click nor move focus on Tab. What it CAN prove, and what a
 * browser needs to do both natively: the activation control is a real <button>/<a> (never a div with a
 * key handler), it is focusable, and the tab order is the DOM order. The real keys are exercised in
 * the browser pass (`npm run qa:shots`, docs/DESIGN_QA.md).
 */
const tabbables = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('a[href],button,[tabindex]')).filter((e) => e.tabIndex >= 0)

describe('EntityCard keyboard and aria', () => {
  it('one real button: focusable, a native <button type=button> (Enter / Space activate it in a browser), click opens', () => {
    const open = vi.fn()
    const { container } = render(<ul><EntityCard concept="plans" title="Auth flow" onClick={open} /></ul>)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    const btn = screen.getByRole('button', { name: 'Auth flow' })
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('type')).toBe('button')
    expect(btn.tabIndex).toBe(0)
    expect(tabbables(container)).toEqual([btn])
    btn.focus()
    expect(document.activeElement).toBe(btn)
    fireEvent.click(btn)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('href: the title is a real link (Enter navigates natively), click navigates, aria-current when selected', () => {
    const { container } = inRouter(<ul><EntityCard concept="plans" title="Auth flow" href="/items/1" selected /></ul>)
    const link = screen.getByRole('link', { name: 'Auth flow' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('aria-current')).toBe('page')
    expect(tabbables(container)).toEqual([link])
    fireEvent.click(link, { button: 0 })
    expect(screen.getByText('detail page')).toBeTruthy()
  })

  it('Tab order is title, primary action, menu; neither opens the card', () => {
    const open = vi.fn()
    const act = vi.fn()
    const { container } = render(
      <ul>
        <EntityCard concept="plans" title="T" onClick={open} primaryAction={<button onClick={act}>Go</button>} actions={[{ label: 'Edit', onClick: () => {} }]} />
      </ul>,
    )
    const order = tabbables(container).map((e) => e.getAttribute('aria-label') ?? e.textContent)
    expect(order).toEqual(['T', 'Go', 'Actions for T'])
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    fireEvent.click(screen.getByRole('button', { name: 'Actions for T' }))
    expect(act).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
  })

  it('focus is visible: the stretched button draws a ring on the whole card', () => {
    render(<ul><EntityCard concept="plans" title="T" onClick={() => {}} /></ul>)
    const cls = screen.getByRole('button').className
    expect(cls).toContain("after:inset-0")
    expect(cls).toContain('focus-visible:after:ring-2')
    expect(cls).toContain('outline-none')
  })

  it('aria: pressed / expanded reflect selected / expanded; a non-interactive card has no button', () => {
    const { rerender } = render(<ul><EntityCard concept="plans" title="T" onClick={() => {}} selected expanded /></ul>)
    const b = screen.getByRole('button', { name: 'T' })
    expect(b.getAttribute('aria-pressed')).toBe('true')
    expect(b.getAttribute('aria-expanded')).toBe('true')
    rerender(<ul><EntityCard concept="plans" title="T" /></ul>)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is a list item by default, a div or article on request', () => {
    const { container, rerender } = render(<ul><EntityCard concept="plans" title="T" /></ul>)
    expect(card(container).tagName).toBe('LI')
    rerender(<div><EntityCard concept="plans" title="T" as="article" /></div>)
    expect(card(container).tagName).toBe('ARTICLE')
  })
})

describe('EntityCard motion (class contract: jsdom has no CSS media queries)', () => {
  it('the 3 px rise is gated on a fine pointer AND no reduced motion, and moves only `translate`', () => {
    const { container } = render(<ul><EntityCard concept="plans" title="T" /></ul>)
    const cls = card(container).className
    expect(cls).toContain('pointer-fine:motion-safe:hover:-translate-y-[3px]')
    expect(cls).toContain('transition-[translate]')
    expect(cls).not.toContain('transition-all')
    // no unconditional hover movement
    expect(cls.split(/\s+/).filter((c) => /^hover:.*translate/.test(c))).toEqual([])
  })

  it('the halo is shown with a fine pointer only and moves nothing (opacity)', () => {
    const { container } = render(<ul><EntityCard concept="plans" title="T" tone="progress" /></ul>)
    const halo = container.querySelector('[data-card-halo]')!
    expect(halo.className).toContain('hidden')
    expect(halo.className).toContain('pointer-fine:block')
    expect(halo.className).toContain('pointer-fine:group-hover/card:opacity-100')
    expect(halo.className).not.toMatch(/translate|scale|shadow|blur/)
    expect(halo.className).toContain('18%')
  })
})

describe('EntityCard tone', () => {
  it.each(['progress', 'info', 'warning', 'danger', 'special'] as const)('%s: rail, edge and halo in the tone', (tone) => {
    const { container } = render(<ul><EntityCard concept="plans" title="T" tone={tone} /></ul>)
    expect(container.querySelector('[data-card-rail]')!.className).toContain(TONE_CLASSES[tone].dot)
    expect(container.querySelector('[data-card-edge]')!.className).toContain(TONE_CLASSES[tone].text)
    expect(container.querySelector('[data-card-halo]')!.className).toContain(TONE_CLASSES[tone].text)
    expect(card(container).dataset.tone).toBe(tone)
  })

  it('success: edge and halo but no rail (as a row)', () => {
    const { container } = render(<ul><EntityCard concept="plans" title="T" tone="success" /></ul>)
    expect(container.querySelector('[data-card-rail]')).toBeNull()
    expect(container.querySelector('[data-card-edge]')).toBeTruthy()
  })

  it.each(['neutral', 'muted'] as const)('%s: hairline only, no rail, no edge, no halo', (tone) => {
    const { container } = render(<ul><EntityCard concept="plans" title="T" tone={tone} /></ul>)
    expect(container.querySelector('[data-card-rail],[data-card-edge],[data-card-halo]')).toBeNull()
  })

  it('the edge is 35 % and 55 % on hover / focus; the rail is a decoration', () => {
    const { container } = render(<ul><EntityCard concept="plans" title="T" tone="warning" /></ul>)
    const edge = container.querySelector('[data-card-edge]')!
    expect(edge.className).toContain('opacity-35')
    expect(edge.className).toContain('group-hover/card:opacity-55')
    expect(edge.className).toContain('group-focus-within/card:opacity-55')
    expect(container.querySelector('[data-card-rail]')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('the status words stay: colour never carries the state alone', () => {
    render(<ul><EntityCard concept="plans" title="T" tone="danger" status={['Failed']} /></ul>)
    expect(screen.getByText('Failed')).toBeTruthy()
  })
})

describe('EntityCard selected', () => {
  it('draws an indigo ring and rail (over any tone), and marks the card', () => {
    const { container } = render(<ul><EntityCard concept="plans" title="T" onClick={() => {}} selected tone="warning" /></ul>)
    expect(card(container).className).toContain('ring-indigo-500/50')
    expect(card(container).hasAttribute('data-selected')).toBe(true)
    expect(container.querySelector('[data-card-rail]')!.className).toContain('bg-indigo-500')
    expect(screen.getByText('T').parentElement!.className).toContain('text-gray-50')
  })

  it('not selected: no ring, no marker', () => {
    const { container } = render(<ul><EntityCard concept="plans" title="T" /></ul>)
    expect(card(container).className).not.toContain('ring-indigo')
    expect(card(container).hasAttribute('data-selected')).toBe(false)
  })
})

describe('EntityGrid, Surface, SkeletonCard', () => {
  it('EntityGrid is a labelled list with 1 / 2 / 3 column recipes', () => {
    const { container, rerender } = render(<EntityGrid aria-label="Plans"><EntityCard concept="plans" title="A" /></EntityGrid>)
    const ul = screen.getByRole('list', { name: 'Plans' })
    expect(within(ul).getAllByRole('listitem')).toHaveLength(1)
    expect(ul.className).toContain('xl:grid-cols-3')
    rerender(<EntityGrid columns={2}><EntityCard concept="plans" title="A" /></EntityGrid>)
    expect(container.querySelector('ul')!.className).toContain('md:grid-cols-2')
    expect(container.querySelector('ul')!.className).not.toContain('grid-cols-3')
    rerender(<EntityGrid columns={1}><EntityCard concept="plans" title="A" /></EntityGrid>)
    expect(container.querySelector('ul')!.className).not.toContain('md:grid-cols-2')
  })

  it('EntityGrid skips off-screen rendering for long lists only', () => {
    const many = Array.from({ length: 30 }, (_, i) => <EntityCard key={i} concept="plans" title={`P${i}`} />)
    const { container, rerender } = render(<EntityGrid>{many}</EntityGrid>)
    expect(container.querySelector('ul')!.className).toContain('content-visibility:auto')
    rerender(<EntityGrid>{many.slice(0, 3)}</EntityGrid>)
    expect(container.querySelector('ul')!.className).not.toContain('content-visibility')
    rerender(<EntityGrid lazy>{many.slice(0, 3)}</EntityGrid>)
    expect(container.querySelector('ul')!.className).toContain('content-visibility:auto')
  })

  it('Surface: padding none / sm / md, interactive, as, passthrough', () => {
    const { container } = render(
      <>
        <Surface padding="none" data-testid="n">a</Surface>
        <Surface padding="sm" data-testid="s">b</Surface>
        <Surface data-testid="m" interactive as="section" aria-label="x">c</Surface>
      </>,
    )
    expect(screen.getByTestId('n').className).not.toMatch(/\bp-[34]\b/)
    expect(screen.getByTestId('s').className).toContain('p-3')
    const m = screen.getByTestId('m')
    expect(m.className).toContain('p-4')
    expect(m.className).toContain('hover:border-white/[0.12]')
    expect(m.tagName).toBe('SECTION')
    expect(m.className).not.toMatch(/glass|shadow|backdrop/)
    expect(container.querySelectorAll('.rounded-xl').length).toBe(3)
  })

  it('SkeletonCard is hidden from assistive tech and opaque', () => {
    const { container } = render(<SkeletonCard lines={2} />)
    const el = container.firstElementChild!
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.className).not.toMatch(/shadow|glass/)
  })
})
