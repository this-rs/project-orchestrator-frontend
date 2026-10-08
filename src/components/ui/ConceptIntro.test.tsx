/**
 * ConceptIntro: the folded three-sentence introduction of a screen (DESIGN.md § 5).
 * Closed by default, native disclosure semantics, remembers the choice per concept,
 * and keeps working when localStorage is missing or throws.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ConceptIntro } from './ConceptIntro'
import { PageShell } from './PageShell'
import { NOMENCLATURE } from '@/constants/nomenclature'

/** The storage key contract: `po.intro.<concept key>`. */
const introStorageKey = (key: string) => `po.intro.${key}`

const details = () => document.querySelector('details') as HTMLDetailsElement

/** jsdom does not toggle <details> on a summary click: flip `open` and fire `toggle` like a browser would. */
function toggle() {
  const d = details()
  d.open = !d.open
  fireEvent(d, new Event('toggle'))
}

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ConceptIntro', () => {
  it('is closed by default and reads the three lines from the registry', () => {
    render(<ConceptIntro concept="plans" />)
    expect(details().open).toBe(false)
    expect(screen.getByText('What is this?')).toBeTruthy()
    const dts = Array.from(document.querySelectorAll('dt')).map((n) => n.textContent)
    expect(dts).toEqual(['What it is', 'What it is for', 'How it differs'])
    const dds = Array.from(document.querySelectorAll('dd')).map((n) => n.textContent)
    expect(dds).toEqual([NOMENCLATURE.plans.explain.what, NOMENCLATURE.plans.explain.why, NOMENCLATURE.plans.explain.different])
  })

  it('uses a native disclosure: a <summary> inside a <details>, no icon, no badge', () => {
    const { container } = render(<ConceptIntro concept="notes" />)
    const summary = details().querySelector('summary')!
    expect(summary.textContent).toBe('What is this?')
    expect(container.querySelector('svg')).toBeNull()
    expect(details().getAttribute('data-concept-intro')).toBe('notes')
  })

  it('accepts inline lines for a screen that is not a registry concept', () => {
    render(<ConceptIntro concept={{ what: 'A.', why: 'B.', different: 'C.' }} />)
    const dds = Array.from(document.querySelectorAll('dd')).map((n) => n.textContent)
    expect(dds).toEqual(['A.', 'B.', 'C.'])
  })

  it('remembers that the reader opened it, per concept', () => {
    render(<ConceptIntro concept="plans" />)
    toggle()
    expect(details().open).toBe(true)
    expect(window.localStorage.getItem(introStorageKey('plans'))).toBe('1')
    cleanup()

    render(<ConceptIntro concept="plans" />)
    expect(details().open).toBe(true)
    cleanup()

    // another concept starts closed
    render(<ConceptIntro concept="tasks" />)
    expect(details().open).toBe(false)
  })

  it('remembers that the reader closed it again', () => {
    window.localStorage.setItem(introStorageKey('decisions'), '1')
    render(<ConceptIntro concept="decisions" />)
    expect(details().open).toBe(true)
    toggle()
    expect(details().open).toBe(false)
    expect(window.localStorage.getItem(introStorageKey('decisions'))).toBe('0')
  })

  it('does not remember an inline explain unless a storageKey is given', () => {
    const lines = { what: 'A.', why: 'B.', different: 'C.' }
    render(<ConceptIntro concept={lines} />)
    toggle()
    expect(window.localStorage.length).toBe(0)
    cleanup()

    render(<ConceptIntro concept={lines} storageKey="runner" />)
    toggle()
    expect(window.localStorage.getItem(introStorageKey('runner'))).toBe('1')
  })

  it('still renders and toggles when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<ConceptIntro concept="plans" />)
    expect(details().open).toBe(false)
    expect(() => toggle()).not.toThrow()
    expect(details().open).toBe(true)
  })

  it('still renders when there is no localStorage at all', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => undefined })
    try {
      render(<ConceptIntro concept="plans" />)
      expect(details().open).toBe(false)
      expect(() => toggle()).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', original)
    }
  })
})

describe('PageShell intro', () => {
  it('renders the intro under the title, folded', () => {
    render(
      <PageShell title={NOMENCLATURE.plans.plural} intro="plans">
        <p>content</p>
      </PageShell>,
    )
    const h1 = screen.getByRole('heading', { level: 1 })
    const d = details()
    expect(d.open).toBe(false)
    // after the title in DOM order
    expect(h1.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders no intro when none is given', () => {
    render(
      <PageShell title="Plans">
        <p>content</p>
      </PageShell>,
    )
    expect(document.querySelector('details')).toBeNull()
  })
})
