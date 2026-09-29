import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConceptNote, MetricList, TagChips } from '../concepts'
import { TrustBadge, TrustScoreBar } from '../TrustBadge'

describe('ConceptNote', () => {
  it('shows the summary and reveals details on tap (no hover)', () => {
    render(
      <ConceptNote summary="What is this?">
        <p>Long explanation</p>
      </ConceptNote>,
    )
    expect(screen.getByText('What is this?')).toBeTruthy()
    expect(screen.queryByText('Long explanation')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Learn more' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByText('Long explanation')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('has no toggle without details', () => {
    render(<ConceptNote summary="Only a line" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('MetricList', () => {
  it('renders label, value, level and hint; skips hidden items', () => {
    render(
      <MetricList
        items={[
          { label: 'Energy', value: '82%', level: { label: 'High', tone: 'success' }, ratio: 0.82, hint: 'recent activity' },
          { label: 'Secret', value: '1', hint: 'never shown', hidden: true },
        ]}
      />,
    )
    expect(screen.getByText('Energy')).toBeTruthy()
    expect(screen.getByText('82%')).toBeTruthy()
    expect(screen.getByText('High')).toBeTruthy()
    expect(screen.getByText('recent activity')).toBeTruthy()
    expect(screen.queryByText('Secret')).toBeNull()
  })

  it('renders nothing when every item is hidden', () => {
    const { container } = render(<MetricList items={[{ label: 'x', value: 1, hint: 'h', hidden: true }]} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('TagChips', () => {
  it('lists tags in a labelled list, nothing when empty', () => {
    const { container, rerender } = render(<TagChips tags={['auth', 'jwt']} />)
    expect(screen.getByRole('list', { name: 'Tags' })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    rerender(<TagChips tags={[]} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('TrustBadge', () => {
  it('spells out the level and the score inline (no tooltip-only info)', () => {
    render(<TrustBadge trustScore={0.82} trustLevel="high" />)
    expect(screen.getByText('High trust')).toBeTruthy()
    expect(screen.getByText('82%')).toBeTruthy()
  })

  it('falls back to untrusted for an unknown level', () => {
    render(<TrustBadge trustScore={0.1} trustLevel={'weird' as never} />)
    expect(screen.getByText('Untrusted')).toBeTruthy()
  })

  it('TrustScoreBar shows label, percentage and the explanation', () => {
    render(<TrustScoreBar trustScore={0.5} trustLevel="medium" />)
    expect(screen.getByText('Medium trust')).toBeTruthy()
    expect(screen.getByText('50%')).toBeTruthy()
    expect(screen.getByText(/Trust score/)).toBeTruthy()
  })
})
