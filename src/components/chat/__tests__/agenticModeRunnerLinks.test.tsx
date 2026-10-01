/**
 * Regression: the "Open runner dashboard" links of AgenticModePill and
 * AgenticModeBanner used to navigate to `/workspace/:slug/runner/:planId`,
 * a route that does not exist (NotFound). The runner lives at
 * `/workspace/:slug/plans/:planId/runner` (App.tsx).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import type { ReactElement } from 'react'
import type { DetachedRun } from '@/hooks'

vi.mock('@/services/runner', () => ({
  useRunnerStatus: () => ({ snapshot: null, error: null }),
}))

import { AgenticModePill } from '../AgenticModePill'
import { AgenticModeBanner } from '../AgenticModeBanner'

function RunnerProbe() {
  const { slug, planId } = useParams()
  return <div>runner:{slug}:{planId}</div>
}

/** Mirrors the App.tsx route tree for the two paths involved. */
function renderInChat(ui: ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/workspace/acme/chat/s1']}>
      <Routes>
        <Route path="/workspace/:slug/chat/:sessionId" element={ui} />
        <Route path="/workspace/:slug/plans/:planId/runner" element={<RunnerProbe />} />
        <Route path="*" element={<div>not-found</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const run = (over: Partial<DetachedRun> = {}): DetachedRun => ({
  sessionId: 'child-1',
  title: 'Run plan',
  model: 'opus',
  isStreaming: false,
  startedAt: new Date().toISOString(),
  planId: 'plan-42',
  runId: 'run-1',
  ...over,
})

describe('agentic mode runner links', () => {
  it('AgenticModePill opens the plan runner route', () => {
    renderInChat(<AgenticModePill runs={[run()]} hasActiveRuns={false} />)
    fireEvent.click(screen.getByRole('button', { name: /agentic mode/i }))
    fireEvent.click(screen.getByText('Open runner dashboard'))
    expect(screen.getByText('runner:acme:plan-42')).toBeTruthy()
    expect(screen.queryByText('not-found')).toBeNull()
  })

  it('AgenticModePill offers no dashboard link when no run has a plan', () => {
    renderInChat(<AgenticModePill runs={[run({ planId: undefined })]} hasActiveRuns={false} />)
    fireEvent.click(screen.getByRole('button', { name: /agentic mode/i }))
    expect(screen.queryByText('Open runner dashboard')).toBeNull()
  })

  it('AgenticModeBanner "Dashboard" opens the plan runner route', () => {
    renderInChat(
      <AgenticModeBanner runs={[run({ isStreaming: true })]} onViewRun={() => {}} onStopRun={() => {}} />,
    )
    fireEvent.click(screen.getByTitle('Open the full runner dashboard'))
    expect(screen.getByText('runner:acme:plan-42')).toBeTruthy()
    expect(screen.queryByText('not-found')).toBeNull()
  })
})
