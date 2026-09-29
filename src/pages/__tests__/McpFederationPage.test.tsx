import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { McpServerSummary } from '@/services/mcpFederation'
import { installMatchMedia } from './testEnv'

const api = vi.hoisted(() => ({
  listServers: vi.fn(),
  listServerTools: vi.fn(),
  probeServer: vi.fn(),
  reconnectServer: vi.fn(),
  disconnectServer: vi.fn(),
  connectServer: vi.fn(),
}))
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services/mcpFederation', () => ({ mcpFederationApi: api }))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
}))

installMatchMedia()

import { McpFederationPage } from '../McpFederationPage'

const stats = {
  call_count: 120,
  error_count: 6,
  latency_p50: 40,
  latency_p95: 180,
  error_rate: 0.05,
  last_call_at: null,
  last_error: 'timeout while calling search',
}
const servers: McpServerSummary[] = [
  {
    id: 'gh',
    display_name: 'GitHub',
    status: 'connected',
    transport_type: 'stdio',
    tool_count: 12,
    connected_at: new Date().toISOString(),
    stats,
    circuit_breaker_state: 'closed',
    server_name: null,
  },
  {
    id: 'slack',
    display_name: null,
    status: 'error',
    transport_type: 'sse',
    tool_count: 1,
    connected_at: null,
    stats: { ...stats, latency_p50: null, latency_p95: null },
    circuit_breaker_state: 'open',
    server_name: null,
  },
]

describe('McpFederationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listServers.mockResolvedValue(servers)
    api.listServerTools.mockResolvedValue({
      tools: [
        {
          name: 'search_issues',
          fqn: 'gh::search_issues',
          description: 'Search GitHub issues',
          input_schema: {},
          category: 'search',
          similar_internal: [['note_search', 0.82]],
          profile: { latency_ms: 35, response_shape: 'array', pagination: false, error_format: null, probed_at: '' },
        },
      ],
    })
    api.disconnectServer.mockResolvedValue({ success: true })
    api.reconnectServer.mockResolvedValue({ success: true })
  })

  it('lists servers with status, transport, tools and circuit state', async () => {
    render(<McpFederationPage />)
    const gh = (await screen.findByRole('button', { name: 'GitHub' })).closest('li')!
    expect(within(gh).getByText('Connected')).toBeTruthy()
    expect(within(gh).getByText('Stdio')).toBeTruthy()
    expect(within(gh).getByText('12 tools')).toBeTruthy()
    const slack = screen.getByRole('button', { name: 'slack' }).closest('li')!
    expect(within(slack).getByText('Error')).toBeTruthy()
    expect(within(slack).getByText('Circuit open')).toBeTruthy()
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(screen.getByText('13')).toBeTruthy()
  })

  it('expands a server to show its stats and every tool field (no hidden columns on phones)', async () => {
    render(<McpFederationPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }))
    expect(await screen.findByText('search_issues')).toBeTruthy()
    expect(api.listServerTools).toHaveBeenCalledWith('gh')
    expect(screen.getByText('Search GitHub issues')).toBeTruthy()
    expect(screen.getByText('returns array')).toBeTruthy()
    expect(screen.getByText(/note_search \(82%\)/)).toBeTruthy()
    expect(screen.getByText('timeout while calling search')).toBeTruthy()
    expect(screen.getByText(/180 ms at p95/)).toBeTruthy()
  })

  it('offers reconnect only for unreachable servers and confirms disconnect', async () => {
    render(<McpFederationPage />)
    await screen.findByRole('button', { name: 'GitHub' })
    fireEvent.click(screen.getByRole('button', { name: 'Actions for GitHub' }))
    expect(screen.queryByRole('menuitem', { name: 'Reconnect' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }))
    expect(api.disconnectServer).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' }).at(-1)!)
    await waitFor(() => expect(api.disconnectServer).toHaveBeenCalledWith('gh'))

    fireEvent.click(screen.getByRole('button', { name: 'Actions for slack' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reconnect' }))
    await waitFor(() => expect(api.reconnectServer).toHaveBeenCalledWith('slack'))
  })

  it('shows the empty state with a connect action', async () => {
    api.listServers.mockResolvedValue([])
    render(<McpFederationPage />)
    expect(await screen.findByText('No MCP servers connected')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Connect server/ })).toBeTruthy()
  })
})
