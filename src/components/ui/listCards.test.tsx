/**
 * List-card primitives: Fact, MetaLine "facts", Gauge, StatusIcon and the
 * `icon` variants of StatusText / ToneText / StatusMenu, ProgressLine segments,
 * EntityRow `status` + `tone`, TaskProgress blocked / failed.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Fact, MetaLine } from './MetaLine'
import { Gauge } from './Metrics'
import { StatusIcon, StatusMenu, StatusText, ToneText, TONE_ICONS } from './Status'
import { ProgressLine } from './ProgressLine'
import { EntityRow } from './EntityRow'
import { TaskProgress } from './TaskProgress'
import type { StatusTone } from './statusMeta'

describe('Fact', () => {
  it('renders an icon, the value and a tooltip; truncates when asked', () => {
    const Icon = (props: { className?: string }) => <svg data-testid="ico" {...props} />
    render(
      <Fact icon={Icon as never} title="Project" truncateAt="max-w-[12rem]">
        Frontend
      </Fact>,
    )
    expect(screen.getByTestId('ico').getAttribute('aria-hidden')).toBe('true')
    const value = screen.getByText('Frontend')
    expect(value.className).toContain('truncate')
    expect(value.className).toContain('max-w-[12rem]')
    expect(value.parentElement?.getAttribute('title')).toBe('Project')
  })

  it('wraps long values by default and supports mono', () => {
    render(<Fact mono>abc1234</Fact>)
    const value = screen.getByText('abc1234')
    expect(value.className).toContain('break-words')
    expect(value.className).toContain('font-mono')
    expect(value.className).not.toContain('truncate')
  })
})

describe('MetaLine variant="facts"', () => {
  it('has no separators and skips empty items', () => {
    const { container } = render(<MetaLine variant="facts" items={['a', null, false, 'b']} />)
    expect(screen.queryByText('·')).toBeNull()
    expect(container.querySelectorAll('span')).toHaveLength(2)
  })

  it('renders nothing when every item is empty', () => {
    const { container } = render(<MetaLine variant="facts" items={[null, undefined]} />)
    expect(container.innerHTML).toBe('')
  })

  it('keeps element keys and works with children', () => {
    render(
      <MetaLine variant="facts">
        <Fact key="k">one</Fact>
        <Fact>two</Fact>
      </MetaLine>,
    )
    expect(screen.getByText('one')).toBeTruthy()
    expect(screen.getByText('two')).toBeTruthy()
  })
})

describe('Gauge', () => {
  it('names the metric, states the level in words and exposes the value', () => {
    render(<Gauge label="Energy" value={0.8} level="High" tone="success" title="Energy 80%" />)
    expect(screen.getByText('Energy')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
    expect(screen.getByTitle('Energy 80%')).toBeTruthy()
    expect(screen.getByRole('meter', { name: 'Energy High' })).toBeTruthy()
  })

  it('falls back to the percentage when no level is given', () => {
    render(<Gauge label="Cohesion" value={0.5} />)
    expect(screen.getByRole('meter', { name: 'Cohesion 50%' })).toBeTruthy()
  })
})

describe('StatusIcon and icon variants', () => {
  it('has a glyph for every tone, decorative', () => {
    const tones: StatusTone[] = ['neutral', 'info', 'progress', 'success', 'warning', 'danger', 'muted', 'special']
    for (const tone of tones) expect(TONE_ICONS[tone]).toBeTruthy()
    const { container } = render(<StatusIcon tone="danger" className="extra" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('class')).toContain('extra')
  })

  it('StatusText icon replaces the dot with a glyph and keeps the label', () => {
    const { container } = render(<StatusText kind="plan" status="in_progress" icon />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('.rounded-full')).toBeNull()
    expect(screen.getByText('In progress')).toBeTruthy()
  })

  it('ToneText icon replaces the dot with a glyph', () => {
    const { container, rerender } = render(<ToneText tone="success" label="Enabled" icon />)
    expect(container.querySelector('svg')).toBeTruthy()
    rerender(<ToneText tone="success" label="Enabled" />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('StatusMenu icon shows the glyph in the trigger', () => {
    const { container } = render(<StatusMenu kind="task" status="blocked" icon onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Status: Blocked/ })).toBeTruthy()
    expect(container.querySelector('button svg')).toBeTruthy()
  })
})

describe('ProgressLine segments', () => {
  it('draws the non-empty segments, in order, keeping the accessible value', () => {
    render(
      <ProgressLine
        value={40}
        segments={[
          { pct: 40, className: 'bg-emerald-500' },
          { pct: 0, className: 'bg-indigo-400' },
          { pct: 250, className: 'bg-red-400' },
        ]}
      />,
    )
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('40')
    const segs = Array.from(bar.querySelectorAll<HTMLElement>('[style]'))
    expect(segs).toHaveLength(2)
    expect(segs[0].style.width).toBe('40%')
    expect(segs[1].style.width).toBe('100%')
  })

  it('keeps the single fill without segments (green at 100)', () => {
    render(<ProgressLine value={100} />)
    expect(screen.getByRole('progressbar').innerHTML).toContain('bg-emerald-500/80')
  })
})

describe('EntityRow status + tone', () => {
  it('renders the status line before the facts, and a rail on attention tones', () => {
    const { container } = render(
      <ul>
        <EntityRow title="Task" status={[<span key="s">Blocked</span>, null]} meta={[<span key="m">fact</span>]} tone="warning" />
      </ul>,
    )
    const html = container.innerHTML
    expect(html.indexOf('Blocked')).toBeLessThan(html.indexOf('fact'))
    expect(container.querySelector('span[aria-hidden="true"].absolute')).toBeTruthy()
  })

  it('draws no rail for quiet tones or a selected row, and no status line when empty', () => {
    const { container, rerender } = render(<ul><EntityRow title="A" tone="success" status={[null]} /></ul>)
    expect(container.querySelector('span[aria-hidden="true"].absolute')).toBeNull()
    expect(container.querySelector('.font-medium.text-xs')).toBeNull()
    rerender(<ul><EntityRow title="A" tone="danger" selected status={<span>Failed</span>} /></ul>)
    expect(container.querySelector('span[aria-hidden="true"].absolute')).toBeNull()
    expect(screen.getByText('Failed')).toBeTruthy()
  })

  it('accepts a node as meta', () => {
    render(<ul><EntityRow title="A" meta={<em>custom meta</em>} /></ul>)
    expect(screen.getByText('custom meta')).toBeTruthy()
  })
})

describe('TaskProgress exceptions', () => {
  const counts = { total: 10, completed: 4, in_progress: 2, blocked: 1, pending: 1, failed: 2, percentage: 40 }
  it('spells out blocked and failed, with segments for each', () => {
    render(<TaskProgress counts={counts} />)
    expect(screen.getByText(/1 blocked/)).toBeTruthy()
    expect(screen.getByText(/2 failed/)).toBeTruthy()
    expect(screen.getByRole('progressbar').querySelectorAll('[style]')).toHaveLength(4)
  })
})
