import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricList, TagChips } from '../concepts'
import { TrustBadge, TrustScoreBar } from '../TrustBadge'

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
