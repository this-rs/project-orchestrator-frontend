import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, configure } from '@testing-library/react'
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

configure({ asyncUtilTimeout: 30_000 })

function renderExternal() {
  const store = createStore()
  store.set(setupConfigAtom, {
    ...defaultSetupConfig,
    infraMode: 'external',
    neo4jUri: 'nas.local:7687',
    meilisearchUrl: 'nas.local:7700',
    natsUrl: 'nas.local:4222',
  })
  render(
    <Provider store={store}>
      <MemoryRouter>
        <InfrastructurePage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('setup wizard: testing a remote service', () => {
  beforeEach(() => invokeMock.mockReset())

  it('shows WHY a test failed, not just "Failed"', async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { service?: string }) => {
      if (cmd === 'test_connection_detailed' && args?.service === 'neo4j') {
        return {
          ok: false,
          verifiedBy: 'tcp',
          kind: 'unreachable',
          hint: 'macOS may be blocking this app from the local network. Open System Settings → Privacy & Security → Local Network, enable Project Orchestrator, then relaunch it.',
        }
      }
      return null
    })
    renderExternal()
    fireEvent.click(screen.getAllByTitle(/test neo4j connection/i)[0])
    expect((await screen.findByRole('alert')).textContent).toMatch(/Local Network/)
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(invokeMock).toHaveBeenCalledWith('test_connection_detailed', {
      service: 'neo4j',
      url: 'nas.local:7687',
    })
  })

  it('says so when only the connection could be checked (TLS)', async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === 'test_connection_detailed'
        ? { ok: true, verifiedBy: 'tcp', kind: null, hint: null }
        : null,
    )
    renderExternal()
    fireEvent.click(screen.getAllByTitle(/test neo4j connection/i)[0])
    expect(await screen.findByText(/handshake itself was not checked/i)).toBeTruthy()
    expect(screen.getByText('Connected')).toBeTruthy()
  })

  it('shows an error of the call itself (a bad address) instead of a bare "Failed"', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'test_connection_detailed') throw '“bolt://” is not an address'
      return null
    })
    renderExternal()
    fireEvent.click(screen.getAllByTitle(/test neo4j connection/i)[0])
    expect((await screen.findByRole('alert')).textContent).toMatch(/is not an address/)
  })

  it('falls back to the plain test on a desktop build older than the detailed command', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'test_connection_detailed') throw 'Command test_connection_detailed not found'
      if (cmd === 'test_connection') return true
      return null
    })
    renderExternal()
    fireEvent.click(screen.getAllByTitle(/test neo4j connection/i)[0])
    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
    expect(invokeMock).toHaveBeenCalledWith('test_connection', { service: 'neo4j', url: 'nas.local:7687' })
  })

  it('clears the reason when the address is edited', async () => {
    invokeMock.mockImplementation(async (cmd: string) =>
      cmd === 'test_connection_detailed'
        ? { ok: false, verifiedBy: 'tcp', kind: 'refused', hint: 'Nothing is listening on nas.local:7687. Is the service started?' }
        : null,
    )
    renderExternal()
    fireEvent.click(screen.getAllByTitle(/test neo4j connection/i)[0])
    expect(await screen.findByRole('alert')).toBeTruthy()
    const uri = screen.getByDisplayValue('nas.local:7687')
    fireEvent.change(uri, { target: { value: 'nas.local:7688' } })
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
