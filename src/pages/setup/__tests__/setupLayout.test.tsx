/**
 * The chrome of the setup assistant after the design migration (DESIGN.md § 2,
 * § 9, § Matière): one display title and its lead per step, progress as a bar
 * AND words, glass buttons with a single primary, the blocked reason always
 * visible (never on hover), and nothing that could overflow a 390 px screen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { setupConfigAtom, setupStepAtom, defaultSetupConfig, trayNavigationAtom, infraValidAtom } from '@/atoms/setup'
import { installMatchMedia } from '@/pages/__tests__/testUtils'

const envMock = vi.hoisted(() => ({ tauri: false }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(null) }))
vi.mock('@/services/env', () => ({
  get isTauri() {
    return envMock.tauri
  },
  fetchSetupStatus: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  useDragRegion: () => ({}),
}))

import { SetupLayout } from '../SetupLayout'
import { SetupWizard } from '../SetupWizard'
import { SETUP_STEPS, SETUP_TEXT } from '../text'

installMatchMedia()

function renderLayout(step: number, props: Partial<React.ComponentProps<typeof SetupLayout>> = {}, tray = false) {
  const store = createStore()
  store.set(setupConfigAtom, { ...defaultSetupConfig })
  store.set(setupStepAtom, step)
  store.set(trayNavigationAtom, tray)
  const utils = render(
    <Provider store={store}>
      <MemoryRouter>
        <SetupLayout {...props}>
          <div data-testid="step-body">body</div>
        </SetupLayout>
      </MemoryRouter>
    </Provider>,
  )
  return { store, ...utils }
}

const glassButtons = (root: HTMLElement) => Array.from(root.querySelectorAll('button.btn'))
const primaries = (root: HTMLElement) => Array.from(root.querySelectorAll('.btn-primary'))

describe('setup assistant: the chrome of a step', () => {
  beforeEach(() => {
    envMock.tauri = false
  })

  it('names the step once in the display scale, with the lead in the site’s words', () => {
    renderLayout(1)
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.textContent).toBe('Authentication')
    expect(title.className).toContain('display-2')
    expect(screen.getByText(SETUP_STEPS[1].lead)).toBeTruthy()
    // Only one display title on the screen (DESIGN.md § 2).
    expect(document.querySelectorAll('.display-2, .display-3')).toHaveLength(1)
  })

  it('says the prerequisites honestly, with the site’s own words', () => {
    const leads = SETUP_STEPS.map((s) => s.lead).join(' ')
    expect(leads).toMatch(/Docker Desktop is required/)
    expect(leads).toMatch(/Chat runs on Claude Code with your own account, or on a model you connect/)
    expect(leads).toMatch(/The AI itself is not included/)
    expect(leads).toMatch(/a few minutes/)
    expect(leads).toMatch(/no Project Orchestrator account to create/)
  })

  it('shows the progress as a segmented bar AND words, never colour alone', () => {
    renderLayout(2)
    const bar = screen.getByRole('progressbar', { name: SETUP_TEXT.progressLabel })
    expect(bar.getAttribute('aria-valuenow')).toBe('75')
    expect(screen.getByText('Step 3 of 4')).toBeTruthy()
    const list = screen.getByRole('list')
    const items = within(list).getAllByRole('listitem')
    const words = items.map((li) => li.textContent ?? '')
    expect(words[0]).toMatch(/^Infrastructure, done$/)
    expect(words[1]).toMatch(/^Authentication, done$/)
    expect(words[2]).toMatch(/^3Chat AI$/)
    expect(words[3]).toMatch(/^4Launch$/)
    expect(items[2].getAttribute('aria-current')).toBe('step')
    expect(items[0].getAttribute('aria-current')).toBeNull()
  })

  it('renders every button as glass and exactly one primary (Next)', () => {
    const { container } = renderLayout(1)
    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(0)
    expect(glassButtons(container)).toHaveLength(buttons.length)
    const prim = primaries(container)
    expect(prim).toHaveLength(1)
    expect(prim[0].textContent).toBe('Next')
    expect(screen.getByRole('button', { name: 'Previous' }).className).toContain('btn-ghost')
  })

  it('says why Next is disabled in a line that is always visible, not on hover', () => {
    renderLayout(0, { nextDisabled: true })
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    const reason = screen.getByRole('status')
    expect(reason.textContent).toBe(SETUP_TEXT.blocked)
    expect(next.getAttribute('aria-describedby')).toBe(reason.id)
    expect(document.querySelector('[class*="group-hover:opacity"]')).toBeNull()
  })

  it('keeps « Finish » on the last step and « Close » in reconfigure mode, as a ghost button', () => {
    renderLayout(3, { showClose: true, freeNavigation: true }, true)
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy()
    const close = screen.getByRole('button', { name: SETUP_TEXT.closeAria })
    expect(close.className).toContain('btn-ghost')
    // Free navigation: the other steps are buttons; the current one is not.
    fireEvent.click(screen.getByRole('button', { name: /Infrastructure/ }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Infrastructure')
    expect(screen.queryByRole('button', { name: /^1 Infrastructure/ })).toBeNull()
  })

  it('has nothing that could overflow a phone: no nowrap, no transition-all, wrapping rows', () => {
    const { container } = renderLayout(0, { nextDisabled: true })
    const html = container.innerHTML
    expect(html).not.toMatch(/whitespace-nowrap/)
    expect(html).not.toMatch(/transition-all/)
    expect(html).not.toMatch(/\btransition\b(?!-)/)
    // The header and the lead can wrap; the title column never forces a width.
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('break-words')
  })
})

describe('setup assistant: the wizard as a whole', () => {
  beforeEach(() => {
    envMock.tauri = false
  })

  it('renders the step page under the chrome with one primary on screen and the step title once', async () => {
    const store = createStore()
    store.set(setupConfigAtom, { ...defaultSetupConfig })
    store.set(setupStepAtom, 0)
    store.set(infraValidAtom, true)
    const { container } = render(
      <Provider store={store}>
        <MemoryRouter>
          <SetupWizard />
        </MemoryRouter>
      </Provider>,
    )
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Infrastructure')
    expect(screen.getByRole('button', { name: /^Docker \(recommended\)/ }).getAttribute('aria-pressed')).toBe('true')
    expect(primaries(container)).toHaveLength(1)
    // Every <button> of the step page that looks like a button is glass; choice cards are not buttons in that sense.
    const stray = Array.from(container.querySelectorAll('button')).filter(
      (b) => !b.classList.contains('btn') && !b.hasAttribute('aria-pressed') && b.getAttribute('role') !== 'radio' && b.getAttribute('role') !== 'switch',
    )
    expect(stray).toHaveLength(0)
    expect(container.innerHTML).not.toMatch(/transition-all/)
  })
})
