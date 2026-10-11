/**
 * The person's lasting approvals (`always`, P11b): listed with what each covers, revoked one by one.
 *
 * Run with: npx vitest run src/components/chat/LastingPermissionRules.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({
  listPermissionRules: vi.fn(),
  revokePermissionRule: vi.fn(),
}))
vi.mock('@/services/chat', () => ({ chatApi: api }))

import { LastingPermissionRules } from './LastingPermissionRules'

const rule = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id,
  project: 'proj',
  engine: 'claude_code',
  tool: 'Bash',
  rule: text,
  created_at: '2026-10-11T00:00:00Z',
  session_id: 's1',
  holds: true,
  ...extra,
})

describe('LastingPermissionRules', () => {
  beforeEach(() => vi.resetAllMocks())

  it('lists each rule with its project and the exact call it covers', async () => {
    api.listPermissionRules.mockResolvedValue({
      enabled: true,
      rules: [rule('r1', 'Bash: cat README.md'), rule('r2', 'mcp__nexus__Bash: ls', { holds: false })],
    })
    render(<LastingPermissionRules />)
    expect(await screen.findByText('Bash: cat README.md')).toBeTruthy()
    expect(screen.getAllByText('proj')).toHaveLength(2)
    // A rule the backend no longer grants is shown as such.
    expect(screen.getByText('No longer applies')).toBeTruthy()
  })

  it('revokes a rule: the API is called and the rule leaves the list', async () => {
    api.listPermissionRules.mockResolvedValue({ enabled: true, rules: [rule('r1', 'Bash: cat README.md')] })
    api.revokePermissionRule.mockResolvedValue(undefined)
    render(<LastingPermissionRules />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke: Bash: cat README.md' }))
    await waitFor(() => expect(screen.queryByText('Bash: cat README.md')).toBeNull())
    expect(api.revokePermissionRule).toHaveBeenCalledWith('r1')
    expect(screen.getByRole('status').textContent).toMatch(/asked again/)
  })

  it('a failed revocation keeps the rule and says so', async () => {
    api.listPermissionRules.mockResolvedValue({ enabled: true, rules: [rule('r1', 'Bash: ls')] })
    api.revokePermissionRule.mockRejectedValue(new Error('500'))
    render(<LastingPermissionRules />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke: Bash: ls' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be revoked/)
    expect(screen.getByText('Bash: ls')).toBeTruthy()
  })

  it('empty, disabled on this server, or unreadable: each said plainly', async () => {
    api.listPermissionRules.mockResolvedValueOnce({ enabled: true, rules: [] })
    const { unmount } = render(<LastingPermissionRules />)
    expect(await screen.findByText('No call is allowed for good.')).toBeTruthy()
    unmount()

    api.listPermissionRules.mockResolvedValueOnce({ enabled: false, rules: [] })
    const second = render(<LastingPermissionRules />)
    expect(await screen.findByText('This server keeps no lasting approvals.')).toBeTruthy()
    second.unmount()

    api.listPermissionRules.mockRejectedValueOnce(new Error('403'))
    render(<LastingPermissionRules />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be loaded/)
  })
})
