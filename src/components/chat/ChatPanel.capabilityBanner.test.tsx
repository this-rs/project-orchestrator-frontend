/**
 * The capability banner ("Some features are not available in this conversation") can be put away
 * as an amber icon in the chat header: collapse / expand, remembered across reloads, back once
 * when a feature goes missing for the first time, absent when nothing is missing, and usable
 * from the keyboard (Escape closes the popover, focus returns to the icon).
 *
 * Run with: npx vitest run src/components/chat/ChatPanel.capabilityBanner.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  chatPanelModeAtom,
  chatSelectedProjectAtom,
  chatSessionCapabilitiesSnapshotAtom,
  chatSessionEngineAtom,
  chatSessionIdAtom,
  chatWorkspaceHasProjectsAtom,
} from '@/atoms'
import type { Project } from '@/types'
import type { ProvidersResponse } from '@/types/provider'
import { CAPABILITY_BANNER_COLLAPSED_KEY } from './capabilityBannerCollapse'

const chatStub = {
  sessionId: null as string | null,
  isSending: false,
  messages: [] as unknown[],
  isStreaming: false,
  isLoadingHistory: false,
  isReplaying: false,
  hasOlderMessages: false,
  isLoadingOlder: false,
  loadOlderMessages: vi.fn(),
  hasNewerMessages: false,
  isLoadingNewer: false,
  loadNewerMessages: vi.fn(),
  hasLiveActivity: false,
  jumpToTail: vi.fn(),
  respondPermission: vi.fn(),
  respondInput: vi.fn(),
  interrupt: vi.fn(),
  changePermissionMode: vi.fn(),
  changeModel: vi.fn(),
  changeAutoContinue: vi.fn(),
  loadSession: vi.fn(),
  newSession: vi.fn(),
  sendMessage: vi.fn(),
  isCompacting: false,
  wsStatus: 'connected',
  sessionMeta: null,
}

const listProviders = vi.fn()
const getLiveActivity = vi.fn()

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useChat: () => chatStub,
  useDetachedRuns: () => ({ runs: [], hasActiveRuns: false }),
  useVisualViewportHeight: () => undefined,
  useWindowFullscreen: () => false,
  useWorkspaceSlug: () => 'ws',
}))
vi.mock('@/hooks/useChatUrlSync', () => ({ useChatUrlSync: () => undefined }))
vi.mock('@/services/chat', () => ({
  chatApi: {
    getSession: vi.fn().mockResolvedValue(null),
    getLiveActivity: (...a: unknown[]) => getLiveActivity(...a),
  },
}))
vi.mock('@/services/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/providers')>()),
  providersApi: { list: (...a: unknown[]) => listProviders(...a), status: vi.fn() },
}))
vi.mock('@/components/discussions/AttachSessionButton', () => ({ AttachSessionButton: () => null }))
vi.mock('@/components/discussions/DiscussionTreeView', () => ({ DiscussionTreeView: () => null }))
vi.mock('./ChatMessages', () => ({ ChatMessages: ({ isCompacting }: { isCompacting?: boolean }) => <div data-testid="messages">{isCompacting ? 'Compacting context' : null}</div> }))
vi.mock('./ComposerDock', () => ({
  ComposerDock: ({ children }: { children: ReactNode }) => <div data-testid="dock">{children}</div>,
}))
// The real composer is tested on its own; here only what the panel hands it matters.
vi.mock('./ChatInput', () => ({
  ChatInput: (props: { disabled?: boolean; disabledReason?: string | null; activity?: { kind: string }[] }) => (
    <div
      data-testid="input"
      data-disabled={String(!!props.disabled)}
      data-reason={props.disabledReason ?? ''}
      data-activity={(props.activity ?? []).map((a) => a.kind).join(',')}
    />
  ),
}))
vi.mock('./SecretRequestTray', () => ({ SecretRequestTray: () => null }))
vi.mock('./DetachedRunsPanel', () => ({ DetachedRunsPanel: () => null }))
vi.mock('./SessionList', () => ({ SessionList: () => null }))
vi.mock('./ProjectSelect', () => ({ ProjectSelect: () => null }))
vi.mock('./PermissionSettingsPanel', () => ({ PermissionSettingsPanel: () => null }))
vi.mock('./SessionBreadcrumb', () => ({ SessionBreadcrumb: () => null }))

import { ChatPanel } from './ChatPanel'

const CAPS = { images: false, tools: true, resume: true, interactive_permissions: true, context_window: { value: 131072, source: 'probed' } }

function renderPanel({ mode = 'open', degraded }: { mode?: 'open' | 'fullscreen'; degraded: string[] }) {
  const store = createStore()
  store.set(chatPanelModeAtom, mode)
  store.set(chatWorkspaceHasProjectsAtom, true)
  store.set(chatSelectedProjectAtom, { id: 'p1', slug: 'demo', name: 'Demo', root_path: '/repo' } as unknown as Project)
  chatStub.sessionId = 's1'
  store.set(chatSessionIdAtom, 's1')
  store.set(chatSessionCapabilitiesSnapshotAtom, CAPS as never)
  store.set(chatSessionEngineAtom, { engine: 'agent', degraded })
  const utils = render(
    <Provider store={store}>
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    </Provider>,
  )
  return { store, ...utils }
}

const banner = () => screen.queryByTestId('engine-banner')
const icon = () => screen.queryByTestId('capability-gaps-button')
const collapse = () => fireEvent.click(screen.getByRole('button', { name: 'Collapse into an icon' }))
const flushFrames = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  Object.assign(chatStub, { sessionId: null, isSending: false, isStreaming: false, isCompacting: false, messages: [] })
  listProviders.mockResolvedValue({ providers: [] } satisfies ProvidersResponse)
  getLiveActivity.mockResolvedValue({ generated_at: '', sessions: {} })
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

describe('capability banner — collapse into a header icon', () => {
  it.each(['open', 'fullscreen'] as const)('%s: collapses to an amber icon with the count, and the popover expands it back', async (mode) => {
    renderPanel({ mode, degraded: ['message_queue', 'nats', 'images'] })
    expect(banner()).not.toBeNull()
    expect(icon()).toBeNull()

    collapse()
    expect(banner()).toBeNull()
    const button = screen.getByRole('button', { name: 'Unavailable features: 3. Show details' })
    expect(button).toBe(icon())
    // Not colour alone: the count is written, the label and the tooltip say it in words.
    expect(button.textContent).toBe('3')
    expect(button.getAttribute('title')).toBe('Unavailable features: 3. Show details')
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    // In the header, not above the composer.
    expect(within(screen.getByTestId('dock')).queryByTestId('capability-gaps-button')).toBeNull()
    await flushFrames()
    expect(document.activeElement).toBe(button)

    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const popover = screen.getByRole('dialog', { name: 'Some features are not available in this conversation' })
    expect(within(popover).getByRole('region', { name: 'Limits of this model or provider' })).toBeTruthy()
    expect(popover.querySelectorAll('li[data-feature]')).toHaveLength(3)
    // The banner stays away while the popover only shows the list.
    expect(banner()).toBeNull()

    fireEvent.click(within(popover).getByRole('button', { name: 'Show above the message box' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(banner()).not.toBeNull()
    expect(icon()).toBeNull()
    expect(window.localStorage.getItem(CAPABILITY_BANNER_COLLAPSED_KEY)).toBeNull()
    await flushFrames()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Collapse into an icon' }))
  })

  it('remembers the collapsed state across a reload', () => {
    const first = renderPanel({ degraded: ['message_queue', 'images'] })
    collapse()
    expect(JSON.parse(window.localStorage.getItem(CAPABILITY_BANNER_COLLAPSED_KEY) ?? 'null')).toEqual({ seen: ['images', 'message_queue'] })
    first.unmount()

    renderPanel({ degraded: ['message_queue', 'images'] })
    expect(banner()).toBeNull()
    expect(icon()).not.toBeNull()
  })

  it('expands by itself when a feature goes missing for the first time, and stays collapsed when one comes back', () => {
    const { store } = renderPanel({ degraded: ['message_queue', 'nats', 'images'] })
    collapse()
    expect(banner()).toBeNull()

    // A gap fixed: nothing new to see, the icon stays (count updated).
    act(() => store.set(chatSessionEngineAtom, { engine: 'agent', degraded: ['message_queue'] }))
    expect(banner()).toBeNull()
    expect(icon()?.getAttribute('aria-label')).toBe('Unavailable features: 2. Show details')

    // A new gap: the banner is back, once.
    act(() => store.set(chatSessionEngineAtom, { engine: 'agent', degraded: ['message_queue', 'hooks'] }))
    expect(banner()).not.toBeNull()
    expect(icon()).toBeNull()
    expect(within(banner()!).getByText(/hooks/i)).toBeTruthy()

    // Put away again: the new set is remembered.
    collapse()
    expect(banner()).toBeNull()
    act(() => store.set(chatSessionEngineAtom, { engine: 'agent', degraded: ['hooks', 'images'] }))
    expect(banner()).toBeNull()
  })

  it('shows neither the banner nor the icon when nothing is missing', () => {
    window.localStorage.setItem(CAPABILITY_BANNER_COLLAPSED_KEY, JSON.stringify({ seen: ['images'] }))
    renderPanel({ degraded: [] })
    expect(banner()).toBeNull()
    expect(icon()).toBeNull()
    expect(screen.queryByRole('button', { name: /Unavailable features/ })).toBeNull()
  })

  it('keyboard: Escape closes the popover and focus returns to the icon; a click outside closes it', async () => {
    renderPanel({ degraded: ['message_queue', 'images'] })
    collapse()
    const button = icon()!
    button.focus()
    fireEvent.click(button)
    const popover = screen.getByRole('dialog')
    expect(document.activeElement).toBe(popover)

    fireEvent.keyDown(popover, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(button)
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    // The banner stays collapsed: closing the popover is not expanding it.
    expect(banner()).toBeNull()
  })

  it('survives a storage that throws (private window)', () => {
    const realGet = Storage.prototype.getItem
    const realSet = Storage.prototype.setItem
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (key === CAPABILITY_BANNER_COLLAPSED_KEY) throw new Error('denied')
      return realGet.call(this, key)
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === CAPABILITY_BANNER_COLLAPSED_KEY) throw new Error('denied')
      realSet.call(this, key, value)
    })
    try {
      renderPanel({ degraded: ['images'] })
      collapse()
      expect(banner()).toBeNull()
      expect(icon()).not.toBeNull()
    } finally {
      get.mockRestore()
      set.mockRestore()
    }
  })
})
