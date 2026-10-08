import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Reveal } from './Reveal'
import { CountUp } from './CountUp'
import { SpotlightCard } from './SpotlightCard'

// vitest runs with css: false, so read the stylesheet as text.
const indexCss = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8')

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

/** An IntersectionObserver that reports every observed element as intersecting at once. */
class ImmediateIO {
  static instances: ImmediateIO[] = []
  disconnected = false
  constructor(private cb: IntersectionObserverCallback) {
    ImmediateIO.instances.push(this)
  }
  observe(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
  disconnect() {
    this.disconnected = true
  }
  unobserve() {}
  takeRecords() {
    return []
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  ImmediateIO.instances = []
})

describe('Reveal', () => {
  it('trigger="load" is pure CSS: the ui-rise-in class and its variables, nothing hidden by JS', () => {
    mockReducedMotion(false)
    render(
      <Reveal trigger="load" delay={0.1} data-testid="r">
        hello
      </Reveal>,
    )
    const el = screen.getByTestId('r')
    expect(el.className).toBe('ui-rise-in')
    expect(el.style.getPropertyValue('--rise-y')).toBe('12px')
    expect(el.style.getPropertyValue('--rise-duration')).toBe('400ms')
    expect(el.style.getPropertyValue('--rise-delay')).toBe('100ms')
    expect(el.style.opacity).toBe('')
  })

  it('the rise never exceeds 12 px', () => {
    mockReducedMotion(false)
    render(
      <Reveal trigger="load" distance={40} data-testid="r">
        x
      </Reveal>,
    )
    expect(screen.getByTestId('r').style.getPropertyValue('--rise-y')).toBe('12px')
  })

  it('.ui-rise-in runs on --ease-standard and is off under reduced motion', () => {
    const rule = indexCss.match(/\n\.ui-rise-in\s*\{([^}]*)\}/)
    expect(rule?.[1]).toMatch(/var\(--ease-standard\)/)
    expect(rule?.[1]).toMatch(/var\(--rise-duration, 400ms\)/)
    const off = indexCss.search(/\.ui-rise-in\s*\{\s*animation:\s*none;?\s*\}/)
    expect(off).toBeGreaterThan(0)
    const before = indexCss.slice(0, off)
    expect(before.slice(before.lastIndexOf('@media'))).toMatch(/prefers-reduced-motion: reduce/)
  })

  it('trigger="view" hides a below-the-fold block after mount, then animates it in on --ease-standard', () => {
    mockReducedMotion(false)
    vi.stubGlobal('IntersectionObserver', ImmediateIO)
    const animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }))
    const proto = HTMLElement.prototype as HTMLElement & { animate: unknown }
    const original = proto.animate
    proto.animate = animate
    window.innerHeight = 800
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 1200 } as DOMRect)
    try {
      render(<Reveal data-testid="r">below</Reveal>)
      expect(animate).toHaveBeenCalledTimes(1)
      const [frames, options] = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions]
      expect(frames[0]).toEqual({ opacity: 0, translate: '0px 12px' })
      expect(options.duration).toBe(400)
      expect(options.easing).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
    } finally {
      proto.animate = original
      rectSpy.mockRestore()
    }
  })

  it('does nothing under reduced motion (no observer, no inline style)', () => {
    mockReducedMotion(true)
    vi.stubGlobal('IntersectionObserver', ImmediateIO)
    render(<Reveal data-testid="r">still</Reveal>)
    expect(ImmediateIO.instances).toHaveLength(0)
    const el = screen.getByTestId('r')
    expect(el.style.opacity).toBe('')
    expect(el.className).toBe('')
  })
})

describe('CountUp', () => {
  it('renders the final value in tabular-nums, with prefix and suffix (AnimatedCounter-compatible props)', () => {
    mockReducedMotion(true)
    render(<CountUp value={1500} prefix="$" suffix="/mo" duration={800} className="text-lg" />)
    const el = screen.getByText('$1,500/mo')
    expect(el.className).toBe('tabular-nums text-lg')
  })

  it('under reduced motion: final value, no observer, no tween', () => {
    mockReducedMotion(true)
    vi.stubGlobal('IntersectionObserver', ImmediateIO)
    render(<CountUp value={42} suffix="%" />)
    expect(screen.getByText('42%')).toBeTruthy()
    expect(ImmediateIO.instances).toHaveLength(0)
  })

  it('starts from `from` once the number is on screen, and the tween is capped at 600 ms', () => {
    mockReducedMotion(false)
    vi.stubGlobal('IntersectionObserver', ImmediateIO)
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    const now = vi.spyOn(performance, 'now').mockReturnValue(0)
    try {
      const { unmount } = render(<CountUp value={250} from={10} duration={5000} />)
      // The first frame has not run: the text node shows the start value.
      expect(screen.getByText('10')).toBeTruthy()
      expect(raf).toHaveBeenCalledTimes(1)
      // Run the frame at t = 600ms: a 5 s request is clamped to the ceiling, so the tween is done.
      const tick = raf.mock.calls[0][0]
      tick(600)
      expect(screen.getByText('250')).toBeTruthy()
      expect(raf).toHaveBeenCalledTimes(1)
      unmount()
    } finally {
      raf.mockRestore()
      now.mockRestore()
    }
  })

  it('restores the final value when unmounted mid-tween', () => {
    mockReducedMotion(false)
    vi.stubGlobal('IntersectionObserver', ImmediateIO)
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    try {
      const { container, unmount } = render(<CountUp value={99} />)
      const span = container.firstElementChild as HTMLSpanElement
      expect(span.textContent).toBe('0')
      unmount()
      expect(span.textContent).toBe('99')
    } finally {
      raf.mockRestore()
    }
  })
})

describe('SpotlightCard', () => {
  it('is a plain surface whose halo follows a mouse pointer', () => {
    render(
      <SpotlightCard data-testid="card" radius={120}>
        content
      </SpotlightCard>,
    )
    const card = screen.getByTestId('card')
    expect(card.className).toMatch(/\bgroup\/spot\b/)
    expect(card.className).toMatch(/\brounded-xl\b/)
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50 } as DOMRect)
    fireEvent.pointerMove(card, { pointerType: 'mouse', clientX: 160, clientY: 80 })
    expect(card.style.getPropertyValue('--mx')).toBe('60px')
    expect(card.style.getPropertyValue('--my')).toBe('30px')
    const halo = card.querySelector('[data-spotlight-halo]') as HTMLElement
    expect(halo.style.background).toContain('120px')
    expect(halo.style.background).toContain('rgba(99,102,241,0.10)')
  })

  it('ignores touch and pen pointers', () => {
    render(<SpotlightCard data-testid="card">content</SpotlightCard>)
    const card = screen.getByTestId('card')
    fireEvent.pointerMove(card, { pointerType: 'touch', clientX: 10, clientY: 10 })
    fireEvent.pointerMove(card, { pointerType: 'pen', clientX: 10, clientY: 10 })
    expect(card.style.getPropertyValue('--mx')).toBe('')
  })

  it('the halo is decorative, shows only for a fine pointer on hover, and never under reduced motion', () => {
    render(<SpotlightCard data-testid="card">content</SpotlightCard>)
    const halo = screen.getByTestId('card').querySelector('[data-spotlight-halo]') as HTMLElement
    expect(halo.getAttribute('aria-hidden')).toBe('true')
    expect(halo.className).toMatch(/\bpointer-events-none\b/)
    expect(halo.className).toMatch(/\bopacity-0\b/)
    expect(halo.className).toMatch(/\bpointer-fine:group-hover\/spot:opacity-100\b/)
    expect(halo.className).toMatch(/\bmotion-reduce:hidden\b/)
    expect(halo.className).not.toMatch(/scale|translate/)
  })
})
