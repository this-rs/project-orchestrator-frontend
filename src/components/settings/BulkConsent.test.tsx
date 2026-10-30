import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'

const consents = vi.fn()
const allow = vi.fn()
const revoke = vi.fn()
const list = vi.fn()
vi.mock('@/services/providers', async (orig) => ({
  ...(await orig<typeof import('@/services/providers')>()),
  providersApi: {
    consents: (...a: unknown[]) => consents(...a),
    allow: (...a: unknown[]) => allow(...a),
    revoke: (...a: unknown[]) => revoke(...a),
    list: (...a: unknown[]) => list(...a),
    status: vi.fn(),
  },
}))
vi.mock('@/services/projects', () => ({
  projectsApi: {
    list: vi.fn().mockResolvedValue({
      items: [
        { slug: 'acme', name: 'Acme' },
        { slug: 'other', name: 'Other' },
        { slug: 'this', name: 'this' },
      ],
    }),
  },
}))

import { BulkConsent } from './BulkConsent'
import { CLAUDE, DEEPSEEK, LOCAL, mountSettings, response } from './settingsTestKit'

beforeEach(() => {
  consents.mockReset().mockResolvedValue([])
  allow.mockReset().mockResolvedValue({})
  revoke.mockReset().mockResolvedValue(undefined)
  list.mockReset().mockResolvedValue(response([CLAUDE, DEEPSEEK, LOCAL]))
})

describe('BulkConsent', () => {
  it('authorises a provider across several selected projects in one gesture', async () => {
    mountSettings(<BulkConsent />, { list })
    fireEvent.click(screen.getByTestId('bulk-project-toggle'))
    fireEvent.click(await screen.findByLabelText('Acme'))
    fireEvent.click(await screen.findByLabelText('this'))

    const row = await screen.findByTestId('bulk-consent-deepseek')
    expect(row.textContent).toContain('Allowed on 0 of 2 selected projects')

    fireEvent.click(within(row).getByRole('button', { name: 'Allow' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('The content of 2 projects will be sent to https://api.deepseek.com')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Allow https://api.deepseek.com' }))

    await waitFor(() => {
      expect(allow).toHaveBeenCalledWith('acme', 'deepseek', 'https://api.deepseek.com')
      expect(allow).toHaveBeenCalledWith('this', 'deepseek', 'https://api.deepseek.com')
    })
  })
})
