/**
 * Tests for CollapsibleSection shared UI component.
 *
 * Verifies collapse/expand behavior, slot rendering,
 * and event propagation for headerRight.
 *
 * Run with: npx vitest run src/components/ui/CollapsibleSection.test.tsx
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CollapsibleSection } from './CollapsibleSection'

// Minimal icon stub
const TestIcon = () => <span data-testid="icon">★</span>

describe('CollapsibleSection', () => {
  it('renders title and icon', () => {
    render(
      <CollapsibleSection title="My Section" icon={<TestIcon />}>
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('My Section')).toBeTruthy()
    expect(screen.getByTestId('icon')).toBeTruthy()
  })

  it('starts collapsed by default', () => {
    render(
      <CollapsibleSection title="Collapsed" icon={<TestIcon />}>
        <p>Hidden content</p>
      </CollapsibleSection>,
    )
    expect(screen.queryByText('Hidden content')).toBeNull()
  })

  it('starts open when defaultOpen=true', () => {
    render(
      <CollapsibleSection title="Open" icon={<TestIcon />} defaultOpen>
        <p>Visible content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('Visible content')).toBeTruthy()
  })

  it('toggles content on click', () => {
    render(
      <CollapsibleSection title="Toggle" icon={<TestIcon />}>
        <p>Toggled content</p>
      </CollapsibleSection>,
    )

    // Initially hidden
    expect(screen.queryByText('Toggled content')).toBeNull()

    // Click to open
    fireEvent.click(screen.getByText('Toggle'))
    expect(screen.getByText('Toggled content')).toBeTruthy()

    // Click to close
    fireEvent.click(screen.getByText('Toggle'))
    expect(screen.queryByText('Toggled content')).toBeNull()
  })

  it('renders description when provided', () => {
    render(
      <CollapsibleSection
        title="With Desc"
        icon={<TestIcon />}
        description="A helpful description"
      >
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByText('A helpful description')).toBeTruthy()
  })

  it('does not render description when omitted', () => {
    render(
      <CollapsibleSection title="No Desc" icon={<TestIcon />}>
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.queryByText('A helpful description')).toBeNull()
  })

  it('renders headerRight slot', () => {
    render(
      <CollapsibleSection
        title="With Action"
        icon={<TestIcon />}
        headerRight={<button data-testid="action-btn">Action</button>}
      >
        <p>Content</p>
      </CollapsibleSection>,
    )
    expect(screen.getByTestId('action-btn')).toBeTruthy()
  })

  it('headerRight click does not toggle section (stopPropagation)', () => {
    const onClick = vi.fn()
    render(
      <CollapsibleSection
        title="Propagation"
        icon={<TestIcon />}
        headerRight={
          <button data-testid="action-btn" onClick={onClick}>
            Action
          </button>
        }
      >
        <p>Should stay hidden</p>
      </CollapsibleSection>,
    )

    // Click the action button — should NOT open the section
    fireEvent.click(screen.getByTestId('action-btn'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Should stay hidden')).toBeNull()
  })
})
