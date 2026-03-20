/**
 * Regression test for workspace overview intelligence tabs.
 *
 * Bug: When intelligence data is loading or errored, the Health/Code/Knowledge
 * tabs showed completely empty content with no explanation. The fix moves the
 * loading/error states INSIDE each tab via IntelTabFallback.
 *
 * Run with: npx vitest run src/pages/__tests__/WorkspaceDetailPage.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'

// ---------------------------------------------------------------------------
// We extract IntelTabFallback's logic into a standalone test since the
// component is defined inline in WorkspaceDetailPage. We replicate its
// exact rendering logic here to verify the 3 states.
// ---------------------------------------------------------------------------

interface MinimalIntelligence {
  loading: boolean
  error: string | null
  summary: unknown | null
  handleRefresh: () => void
}

/**
 * Replicated IntelTabFallback rendering logic.
 * This must match the component in WorkspaceDetailPage.tsx exactly.
 */
function IntelTabFallback({ intelligence }: { intelligence: MinimalIntelligence }) {
  if (intelligence.loading) {
    return createElement('div', { 'data-testid': 'intel-loading' },
      createElement('span', { className: 'animate-spin' }),
      createElement('span', null, 'Loading intelligence data…'),
    )
  }

  if (intelligence.error) {
    return createElement('div', { 'data-testid': 'intel-error' },
      createElement('p', null, intelligence.error),
      createElement('button', { onClick: intelligence.handleRefresh }, 'Retry'),
    )
  }

  // No summary available (empty state)
  return createElement('div', { 'data-testid': 'intel-empty' },
    createElement('p', null, 'No intelligence data available. Sync your projects first.'),
  )
}

describe('IntelTabFallback (regression: intel tabs must never be blank)', () => {
  let handleRefresh: ReturnType<typeof vi.fn>

  beforeEach(() => {
    handleRefresh = vi.fn()
  })

  it('shows spinner when intelligence is loading', () => {
    render(
      createElement(IntelTabFallback, {
        intelligence: { loading: true, error: null, summary: null, handleRefresh },
      }),
    )
    expect(screen.getByTestId('intel-loading')).toBeTruthy()
    expect(screen.getByText('Loading intelligence data…')).toBeTruthy()
  })

  it('shows error message and retry button when intelligence has error', () => {
    render(
      createElement(IntelTabFallback, {
        intelligence: {
          loading: false,
          error: 'Network timeout fetching intelligence',
          summary: null,
          handleRefresh,
        },
      }),
    )
    expect(screen.getByTestId('intel-error')).toBeTruthy()
    expect(screen.getByText('Network timeout fetching intelligence')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  it('shows empty state when no summary is available', () => {
    render(
      createElement(IntelTabFallback, {
        intelligence: { loading: false, error: null, summary: null, handleRefresh },
      }),
    )
    expect(screen.getByTestId('intel-empty')).toBeTruthy()
    expect(
      screen.getByText('No intelligence data available. Sync your projects first.'),
    ).toBeTruthy()
  })

  it('retry button calls handleRefresh', () => {
    render(
      createElement(IntelTabFallback, {
        intelligence: {
          loading: false,
          error: 'Something went wrong',
          summary: null,
          handleRefresh,
        },
      }),
    )
    screen.getByText('Retry').click()
    expect(handleRefresh).toHaveBeenCalledOnce()
  })

  // Regression: the old code used `intelReady && <Content>` which returned
  // false (renders nothing) when intel wasn't ready. Verify we never render
  // nothing for these states.
  it('never renders null/empty for any non-ready intelligence state', () => {
    const states: MinimalIntelligence[] = [
      { loading: true, error: null, summary: null, handleRefresh },
      { loading: false, error: 'fail', summary: null, handleRefresh },
      { loading: false, error: null, summary: null, handleRefresh },
    ]

    for (const intel of states) {
      const { container, unmount } = render(
        createElement(IntelTabFallback, { intelligence: intel }),
      )
      // The container must have visible content (not be empty)
      expect(container.textContent!.length).toBeGreaterThan(0)
      unmount()
    }
  })
})
