/**
 * API Tokens page — lists, creates, revokes MCP tokens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApiTokensPage } from '../ApiTokensPage'
import type { McpToken, CreateMcpTokenResponse } from '@/services/mcpTokens'

// ConfirmDialog uses useReducedMotion → window.matchMedia
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

const list = vi.fn<() => Promise<McpToken[]>>()
const create = vi.fn<() => Promise<CreateMcpTokenResponse>>()
const revoke = vi.fn<() => Promise<void>>()
const purge = vi.fn<() => Promise<{ purged: number }>>()

vi.mock('@/services/mcpTokens', () => ({
  mcpTokensApi: {
    list: (...a: unknown[]) => list(...a),
    create: (...a: unknown[]) => create(...a),
    revoke: (...a: unknown[]) => revoke(...a),
    purge: (...a: unknown[]) => purge(...a),
  },
  mcpTokensErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'error'),
}))

vi.mock('@/services/api', async (orig) => ({
  ...(await orig<typeof import('@/services/api')>()),
  apiErrorMessage: (e: unknown) => (e instanceof Error ? e.message : 'error'),
}))

const ACTIVE_TOKEN: McpToken = {
  jti: 'jti-1',
  user_id: 'u1',
  label: 'CI Pipeline',
  scope: 'mcp:read mcp:write',
  expires_at: '2099-12-31T23:59:59Z',
  created_at: '2026-10-01T00:00:00Z',
  revoked: false,
}

const REVOKED_TOKEN: McpToken = {
  ...ACTIVE_TOKEN,
  jti: 'jti-2',
  label: 'Old Script',
  revoked: true,
}

function mount() {
  render(
    <MemoryRouter>
      <ApiTokensPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  list.mockReset().mockResolvedValue([ACTIVE_TOKEN])
  create.mockReset()
  revoke.mockReset().mockResolvedValue(undefined)
  purge.mockReset().mockResolvedValue({ purged: 0 })
})

describe('ApiTokensPage', () => {
  it('renders the token list', async () => {
    mount()
    await waitFor(() => expect(screen.getByText('CI Pipeline')).toBeTruthy())
    expect(screen.getByText('mcp:read mcp:write')).toBeTruthy()
  })

  it('shows empty state when no tokens', async () => {
    list.mockResolvedValue([])
    mount()
    await waitFor(() => expect(screen.getByText(/no api tokens/i)).toBeTruthy())
  })

  it('creates a token and shows the reveal', async () => {
    const response: CreateMcpTokenResponse = {
      token: 'eyJ.secret.token',
      jti: 'jti-new',
      label: 'My Token',
      scope: 'mcp:read mcp:write',
      expires_at: '2099-06-01T00:00:00Z',
    }
    create.mockResolvedValue(response)
    mount()

    await waitFor(() => expect(screen.getByText('CI Pipeline')).toBeTruthy())

    // Fill the form
    fireEvent.change(screen.getByLabelText(/label/i), { target: { value: 'My Token' } })
    fireEvent.click(screen.getByRole('button', { name: /create token/i }))

    await waitFor(() => expect(screen.getByDisplayValue('eyJ.secret.token')).toBeTruthy())
    expect(screen.getByText(/copy this token now/i)).toBeTruthy()
  })

  it('revokes a token after confirmation', async () => {
    mount()
    await waitFor(() => expect(screen.getByText('CI Pipeline')).toBeTruthy())

    // Click revoke
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }))

    // Confirm dialog
    await waitFor(() => expect(screen.getByText(/revoke this token/i)).toBeTruthy())
  })

  it('shows revoked tokens as greyed out', async () => {
    list.mockResolvedValue([ACTIVE_TOKEN, REVOKED_TOKEN])
    mount()
    await waitFor(() => expect(screen.getByText('Old Script')).toBeTruthy())
    // The revoked row should have opacity-50
    const row = screen.getByText('Old Script').closest('tr')
    expect(row?.className).toContain('opacity-50')
  })
})
