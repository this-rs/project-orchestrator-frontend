import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, configure } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider, createStore } from 'jotai'
import { setupConfigAtom, defaultSetupConfig } from '@/atoms/setup'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@/services/env', () => ({
  get isTauri() {
    return true
  },
  fetchSetupStatus: vi.fn().mockResolvedValue(false),
}))

import { InfrastructurePage } from '../InfrastructurePage'

configure({ asyncUtilTimeout: 10_000 })

// vitest cuts a test at 5 s by default, shorter than the waits below (10 s, and 9 s for the
// poll that recovers): on a loaded machine the page's first render alone can take that long,
// so the test was cut before its own wait ended. Give the whole file the time it asks for.
vi.setConfig({ testTimeout: 30_000 })

function renderDockerMode() {
  const store = createStore()
  store.set(setupConfigAtom, { ...defaultSetupConfig, infraMode: 'docker' })
  render(
    <Provider store={store}>
      <MemoryRouter>
        <InfrastructurePage />
      </MemoryRouter>
    </Provider>,
  )
}

/** What `check_docker` answers; every other command resolves with nothing. */
function checkDockerAnswers(answer: () => Promise<unknown>) {
  invokeMock.mockImplementation((cmd: string) => (cmd === 'check_docker' ? answer() : Promise.resolve(undefined)))
}

describe('setup wizard: what the Docker banner says', () => {
  beforeEach(() => invokeMock.mockReset())

  it('says Docker is running when the daemon answers', async () => {
    checkDockerAnswers(() => Promise.resolve({ available: true, status: 'running' }))
    renderDockerMode()
    expect(await screen.findByText('Docker Desktop is running')).toBeTruthy()
  })

  it('says it is installed but not running when only the app is found', async () => {
    checkDockerAnswers(() => Promise.resolve({ available: false, status: 'installed' }))
    renderDockerMode()
    expect(await screen.findByText('Docker Desktop is not running')).toBeTruthy()
    expect(screen.queryByText('Docker Desktop is required')).toBeNull()
  })

  // The bug: a frozen Docker Desktop takes the connection and never answers. It was shown as
  // "not running" with an Open button that cannot help, and the page waited for ever.
  it('says Docker is not responding, not that it is not running, when the daemon takes the connection and never answers', async () => {
    checkDockerAnswers(() => Promise.resolve({ available: false, status: 'unresponsive' }))
    renderDockerMode()
    expect(await screen.findByText('Docker Desktop is not responding')).toBeTruthy()
    expect(screen.getByText(/quit it/i)).toBeTruthy()
    expect(screen.queryByText('Docker Desktop is not running')).toBeNull()
    expect(screen.queryByText('Docker Desktop is required')).toBeNull()
  })

  it('says it is required only when no trace of Docker was found', async () => {
    checkDockerAnswers(() => Promise.resolve({ available: false, status: 'not_installed' }))
    renderDockerMode()
    expect(await screen.findByText('Docker Desktop is required')).toBeTruthy()
  })

  // The bug: a check that FAILS (the command refused, a timeout, a broken bridge) was
  // reported as "not installed", sending someone who has Docker to install it.
  it('does not claim Docker is missing when the check itself fails, and shows why', async () => {
    checkDockerAnswers(() => Promise.reject(new Error('command check_docker not allowed')))
    renderDockerMode()
    expect(await screen.findByText(/could not check docker/i)).toBeTruthy()
    expect(screen.getByText(/command check_docker not allowed/)).toBeTruthy()
    expect(screen.queryByText('Docker Desktop is required')).toBeNull()
    expect(screen.getByRole('button', { name: /check again/i })).toBeTruthy()
  })

  it('recovers by itself once a later check succeeds', async () => {
    let calls = 0
    checkDockerAnswers(() => {
      calls += 1
      return calls === 1
        ? Promise.reject(new Error('bridge not ready'))
        : Promise.resolve({ available: true, status: 'running' })
    })
    renderDockerMode()
    expect(await screen.findByText(/could not check docker/i)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Docker Desktop is running')).toBeTruthy(), {
      timeout: 9_000,
    })
  })
})
