/**
 * A run that streams is shown ONCE: in the activity bar above the composer.
 * It used to be shown three times in this panel (a header pill, a banner, the
 * runs panel), each with its own polling. The runs panel now keeps only the
 * finished runs.
 *
 * Run with: npx vitest run src/components/chat/ChatPanel.runs.test.tsx
 */
import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { chatPanelModeAtom } from '@/atoms'

const chatStub = {
  sessionId: 's1',
  isSending: false,
  messages: [],
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
  isCompacting: false,
  wsStatus: 'connected',
}

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useChat: () => chatStub,
  useDetachedRuns: () => ({ runs: detached.runs, hasActiveRuns: detached.runs.some((r) => r.isStreaming) }),
  useVisualViewportHeight: () => undefined,
  useWindowFullscreen: () => false,
  useWorkspaceSlug: () => 'ws',
}))
vi.mock('@/hooks/useChatUrlSync', () => ({ useChatUrlSync: () => undefined }))
vi.mock('@/components/discussions/AttachSessionButton', () => ({ AttachSessionButton: () => null }))
vi.mock('@/components/discussions/DiscussionTreeView', () => ({ DiscussionTreeView: () => null }))
vi.mock('./ChatMessages', () => ({
  ChatMessages: ({ bottomInset }: { bottomInset?: number }) => <div data-testid="messages" data-inset={bottomInset} />,
}))
vi.mock('./ComposerDock', () => ({
  ComposerDock: ({ onHeight, children }: { onHeight: (h: number) => void; children: ReactNode }) => {
    useEffect(() => onHeight(64), [onHeight])
    return <div data-testid="dock">{children}</div>
  },
}))
vi.mock('./ChatInput', () => ({
  ChatInput: (props: { activity?: RunningItem[]; runActions?: RunActions }) => {
    seen.activity = props.activity ?? []
    seen.runActions = props.runActions
    return <div data-testid="input" />
  },
}))
vi.mock('./CompactionBanner', () => ({ CompactionBanner: () => null }))
vi.mock('./SecretRequestTray', () => ({ SecretRequestTray: () => null }))
vi.mock('./DetachedRunsPanel', () => ({
  DetachedRunsPanel: ({ runs, hasActiveRuns }: { runs: DetachedRun[]; hasActiveRuns: boolean }) => (
    <div data-testid="runs-panel" data-active={String(hasActiveRuns)}>
      {runs.map((r) => r.sessionId).join(',')}
    </div>
  ),
}))
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))
vi.mock('@/services/chat', () => ({
  chatApi: {
    getSession: vi.fn().mockResolvedValue(null),
    interruptSession: (id: string) => interruptSession(id),
  },
}))
vi.mock('./SessionList', () => ({ SessionList: () => null }))
vi.mock('./ProjectSelect', () => ({ ProjectSelect: () => null }))
vi.mock('./PermissionSettingsPanel', () => ({ PermissionSettingsPanel: () => null }))
vi.mock('./SessionBreadcrumb', () => ({ SessionBreadcrumb: () => null }))

import type { DetachedRun } from '@/hooks'
import type { RunningItem } from './runningActivity'
import type { RunActions } from './ActivityBar'
import { ChatPanel } from './ChatPanel'

const detached: { runs: DetachedRun[] } = { runs: [] }
const seen: { activity: RunningItem[]; runActions?: RunActions } = { activity: [] }
const navigate = vi.fn()
const interruptSession = vi.fn((_: string) => Promise.resolve({ delivered: true }))

const run = (sessionId: string, isStreaming: boolean, planId?: string): DetachedRun => ({
  sessionId,
  title: `Run ${sessionId}`,
  model: 'm',
  isStreaming,
  startedAt: '2026-10-03T12:00:00Z',
  planId,
  runId: planId && `run-of-${planId}`,
})

function renderPanel(mode: 'open' | 'fullscreen') {
  const store = createStore()
  store.set(chatPanelModeAtom, mode)
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChatPanel />
      </MemoryRouter>
    </Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  detached.runs = []
  seen.activity = []
  seen.runActions = undefined
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

describe.each(['fullscreen', 'open'] as const)('ChatPanel (%s): detached runs', (mode) => {
  it('a streaming run goes to the activity bar, a finished one stays in the runs panel', async () => {
    detached.runs = [run('live', true, 'plan-1'), run('done', false)]
    renderPanel(mode)
    await screen.findByTestId('input')
    expect(seen.activity).toEqual([
      { id: 'live', kind: 'run', title: 'Run live', startedAt: '2026-10-03T12:00:00Z', sessionId: 'live', planId: 'plan-1' },
    ])
    const panel = screen.getByTestId('runs-panel')
    expect(panel).toHaveTextContent('done')
    expect(panel).not.toHaveTextContent('live')
    expect(panel.getAttribute('data-active')).toBe('false')
  })

  it('shows no runs panel when every run is streaming, and no banner or pill at all', async () => {
    detached.runs = [run('live', true, 'plan-1')]
    renderPanel(mode)
    await screen.findByTestId('input')
    expect(screen.queryByTestId('runs-panel')).toBeNull()
    expect(screen.queryByText(/agentic mode/i)).toBeNull()
    expect(screen.queryByTitle(/agentic/i)).toBeNull()
  })

  it('gives the bar what it needs to open, stop, and reach the dashboard of a run', async () => {
    detached.runs = [run('live', true, 'plan-1')]
    renderPanel(mode)
    await screen.findByTestId('input')
    seen.runActions!.view('live')
    expect(chatStub.loadSession).toHaveBeenCalledWith('live')
    seen.runActions!.stop('live')
    expect(interruptSession).toHaveBeenCalledWith('live')
    seen.runActions!.dashboard('plan-1')
    expect(navigate).toHaveBeenCalledWith('/workspace/ws/plans/plan-1/runner')
  })
})
