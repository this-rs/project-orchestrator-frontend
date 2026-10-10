/**
 * Network tools of native agent sessions: consented origins, search engines
 * (vault reference only, never a key value), browser switch.
 *
 * Run with: npx vitest run src/components/settings/NetworkTools.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { ApiError } from '@/services/api'
import type { NetworkToolsOverview, SearchEngine } from '@/types/networkTools'

const overview = vi.fn()
const allowOrigin = vi.fn()
const revokeOrigin = vi.fn()
const setBrowser = vi.fn()
const searchEngines = vi.fn()
const createSearchEngine = vi.fn()
const deleteSearchEngine = vi.fn()
vi.mock('@/services/networkTools', async (orig) => ({
  ...(await orig<typeof import('@/services/networkTools')>()),
  networkToolsApi: {
    overview: (...a: unknown[]) => overview(...a),
    allowOrigin: (...a: unknown[]) => allowOrigin(...a),
    revokeOrigin: (...a: unknown[]) => revokeOrigin(...a),
    setBrowser: (...a: unknown[]) => setBrowser(...a),
    searchEngines: (...a: unknown[]) => searchEngines(...a),
    createSearchEngine: (...a: unknown[]) => createSearchEngine(...a),
    deleteSearchEngine: (...a: unknown[]) => deleteSearchEngine(...a),
  },
}))
let proof = false
const createGrant = vi.fn()
vi.mock('@/services/vault', async (orig) => {
  const real = await orig<typeof import('@/services/vault')>()
  return {
    ...real,
    hasUnlockProof: () => proof,
    vaultApi: { ...real.vaultApi, createGrant: (...a: unknown[]) => createGrant(...a) },
  }
})
vi.mock('@/services/projects', () => ({
  projectsApi: { list: vi.fn().mockResolvedValue({ items: [{ slug: 'acme', name: 'Acme' }] }) },
}))

import { NetworkTools } from './NetworkTools'
import { mountSettings } from './settingsTestKit'

const BRAVE: SearchEngine = {
  id: 'brave',
  engine: 'brave',
  base_url: null,
  credential_ref: 'vault:brave-key',
  origin: 'https://api.search.brave.com',
  grant_id: 'tool:brave',
  key_granted: false,
  origin_consented: false,
}
const SEARX: SearchEngine = {
  id: 'searx',
  engine: 'searxng',
  base_url: 'https://searx.example.org',
  credential_ref: 'none',
  origin: 'https://searx.example.org',
  grant_id: 'tool:searx',
  key_granted: false,
  origin_consented: true,
}

const state = (over: Partial<NetworkToolsOverview> = {}): NetworkToolsOverview => ({
  project: 'acme',
  origins: [{ origin: 'https://docs.rs', consented_by: 'alice', consented_at: '2026-10-01T10:00:00Z' }],
  browser: { allowed: false },
  search_engines: [BRAVE, SEARX],
  ...over,
})

const apiError = (status: number, code?: string, error = 'server sentence that quotes INPUT-ECHO') =>
  new ApiError(status, JSON.stringify(code ? { error, code, retryable: false } : { error }))

const mount = () => mountSettings(<NetworkTools />, { url: '/providers?project=acme#network-tools' })

beforeEach(() => {
  proof = false
  overview.mockReset().mockResolvedValue(state())
  allowOrigin.mockReset().mockImplementation((_slug: string, origin: string) =>
    Promise.resolve({ origin: new URL(origin).origin, consented_by: 'me', consented_at: '2026-10-10T10:00:00Z' }),
  )
  revokeOrigin.mockReset().mockResolvedValue(undefined)
  setBrowser.mockReset().mockImplementation((_slug: string, allowed: boolean) => Promise.resolve({ allowed, authorized_by: 'me' }))
  searchEngines.mockReset().mockResolvedValue([BRAVE, SEARX])
  createSearchEngine.mockReset().mockImplementation((draft: SearchEngine) => Promise.resolve({ ...BRAVE, ...draft }))
  deleteSearchEngine.mockReset().mockResolvedValue(undefined)
  createGrant.mockReset().mockResolvedValue({ id: 'g1' })
})

describe('NetworkTools — consented origins', () => {
  it('lists the consented origins of the chosen project with who allowed them, and every search engine with its key and origin state', async () => {
    mount()
    const row = await screen.findByTestId('tool-origin-https://docs.rs')
    expect(overview).toHaveBeenCalledWith('acme')
    expect(row.textContent).toContain('https://docs.rs')
    expect(row.textContent).toContain('Allowed by alice')
    const brave = screen.getByTestId('search-engine-brave')
    expect(brave.textContent).toContain('https://api.search.brave.com')
    expect(brave.textContent).toContain('Key brave-key not granted')
    expect(brave.textContent).toContain('Origin not allowed for Acme')
    const searx = screen.getByTestId('search-engine-searx')
    expect(searx.textContent).toContain('No key needed')
    expect(searx.textContent).toContain('Origin allowed for Acme')
  })

  it('without a project, lists the search engines alone and asks to choose a project for origins and browser', async () => {
    mountSettings(<NetworkTools />, { url: '/providers' })
    await screen.findByTestId('search-engine-brave')
    expect(searchEngines).toHaveBeenCalledWith()
    expect(overview).not.toHaveBeenCalled()
    expect(screen.getAllByText('Choose a project to see what its agents may reach.')).toHaveLength(2)
  })

  it('adding an origin PUTs { origin } for the project and announces the normalised origin in a status line', async () => {
    mount()
    await screen.findByTestId('tool-origin-https://docs.rs')
    fireEvent.change(screen.getByLabelText('Origin or address'), { target: { value: 'https://crates.io/crates/serde' } })
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(allowOrigin).toHaveBeenCalledWith('acme', 'https://crates.io/crates/serde'))
    await waitFor(() => expect(screen.getByTestId('network-tools-status-origins').textContent).toBe('Origin https://crates.io allowed.'))
    expect(screen.getByTestId('network-tools-status-origins').getAttribute('role')).toBe('status')
    await waitFor(() => expect(overview).toHaveBeenCalledTimes(2))
    expect((screen.getByLabelText('Origin or address') as HTMLInputElement).value).toBe('')
  })

  it('an address that is not a URL is refused before any request, with a translated message', async () => {
    mount()
    await screen.findByTestId('tool-origin-https://docs.rs')
    fireEvent.change(screen.getByLabelText('Origin or address'), { target: { value: 'docs rs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a full address starting with https:// (or http://).')
    expect(allowOrigin).not.toHaveBeenCalled()
  })

  it('a server refusal invalid_tool_origin shows its translated message by code, never the server sentence', async () => {
    allowOrigin.mockRejectedValue(apiError(400, 'invalid_tool_origin'))
    mount()
    await screen.findByTestId('tool-origin-https://docs.rs')
    fireEvent.change(screen.getByLabelText('Origin or address'), { target: { value: 'http://10.0.0.1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    const card = await screen.findByTestId('network-tools-error')
    expect(card.getAttribute('data-error-code')).toBe('invalid_tool_origin')
    expect(card.textContent).toContain('This is not a valid origin. Enter an https address such as https://docs.rs.')
    expect(card.textContent).not.toContain('INPUT-ECHO')
    expect(card.textContent).not.toContain('10.0.0.1')
  })

  it('revoking an origin asks for confirmation (danger) then DELETEs that exact origin', async () => {
    mount()
    const row = within(await screen.findByTestId('tool-origin-https://docs.rs'))
    fireEvent.click(row.getByRole('button', { name: 'Withdraw the origin https://docs.rs' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Withdraw https://docs.rs from project Acme?')
    expect(revokeOrigin).not.toHaveBeenCalled()
    const confirm = within(dialog).getByRole('button', { name: 'Withdraw the origin' })
    expect(confirm.className).toContain('btn-danger')
    fireEvent.click(confirm)
    await waitFor(() => expect(revokeOrigin).toHaveBeenCalledWith('acme', 'https://docs.rs'))
  })

  it('a 403 (agent token) shows the error card saying only a signed-in person can make the change', async () => {
    revokeOrigin.mockRejectedValue(apiError(403, undefined, 'forbidden for agent tokens'))
    mount()
    fireEvent.click(within(await screen.findByTestId('tool-origin-https://docs.rs')).getByRole('button', { name: 'Withdraw the origin https://docs.rs' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Withdraw the origin' }))
    const card = await screen.findByTestId('network-tools-error')
    expect(card.getAttribute('role')).toBe('alert')
    expect(card.getAttribute('data-error-code')).toBe('forbidden')
    expect(card.textContent).toContain('A signed-in person must make this change')
    expect(card.textContent).toContain('Only a signed-in person can make this change (an agent cannot).')
  })

  it('an unknown project (404 project_not_found) is said by its code', async () => {
    overview.mockRejectedValue(apiError(404, 'project_not_found'))
    mount()
    const card = await screen.findByTestId('network-tools-error')
    expect(card.getAttribute('data-error-code')).toBe('project_not_found')
    expect(card.textContent).toContain('This project no longer exists.')
  })
})

describe('NetworkTools — search engines', () => {
  it('adding a Brave engine sends credential_ref vault:<name>, and the form has no password field nor any field taking a key value', async () => {
    mount()
    await screen.findByTestId('search-engine-brave')
    const form = screen.getByRole('form', { name: 'Add a search engine' })
    expect(form.querySelector('input[type="password"]')).toBeNull()
    const labels = Array.from(form.querySelectorAll('label')).map((l) => l.textContent)
    expect(labels).toEqual(['Identifier', 'Engine', 'Name of the secret in the vault'])
    expect(within(form).queryByLabelText(/api key|key value/i)).toBeNull()
    fireEvent.change(within(form).getByLabelText('Identifier'), { target: { value: 'brave-2' } })
    fireEvent.change(within(form).getByLabelText('Name of the secret in the vault'), { target: { value: 'brave-key' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add the engine' }))
    await waitFor(() =>
      expect(createSearchEngine).toHaveBeenCalledWith({ id: 'brave-2', engine: 'brave', credential_ref: 'vault:brave-key' }),
    )
    await waitFor(() => expect(screen.getByTestId('network-tools-status-engines').textContent).toBe('Search engine brave-2 added.'))
  })

  it('the secret field refuses anything but a vault secret name (a pasted key with spaces or slashes is not sent)', async () => {
    mount()
    await screen.findByTestId('search-engine-brave')
    const form = screen.getByRole('form', { name: 'Add a search engine' })
    fireEvent.change(within(form).getByLabelText('Identifier'), { target: { value: 'brave-2' } })
    fireEvent.change(within(form).getByLabelText('Name of the secret in the vault'), { target: { value: 'BSA/abc+def ghi=' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add the engine' }))
    expect((await within(form).findByRole('alert')).textContent).toContain('A secret name')
    expect(createSearchEngine).not.toHaveBeenCalled()
  })

  it('a SearXNG engine requires a base_url, then is sent with that base_url and credential_ref none', async () => {
    mount()
    await screen.findByTestId('search-engine-brave')
    const form = screen.getByRole('form', { name: 'Add a search engine' })
    fireEvent.change(within(form).getByLabelText('Engine'), { target: { value: 'searxng' } })
    expect(within(form).queryByLabelText('Name of the secret in the vault')).toBeNull()
    fireEvent.change(within(form).getByLabelText('Identifier'), { target: { value: 'searx-2' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add the engine' }))
    expect((await within(form).findByRole('alert')).textContent).toBe(
      'Enter the full address of the instance, starting with https:// (or http://).',
    )
    expect(createSearchEngine).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByLabelText('Address of the SearXNG instance'), { target: { value: 'https://search.example.org' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add the engine' }))
    await waitFor(() =>
      expect(createSearchEngine).toHaveBeenCalledWith({
        id: 'searx-2',
        engine: 'searxng',
        base_url: 'https://search.example.org',
        credential_ref: 'none',
      }),
    )
  })

  it('an engine id outside [a-z0-9-] is refused client-side; a 409 search_engine_exists is translated', async () => {
    createSearchEngine.mockRejectedValue(apiError(409, 'search_engine_exists'))
    mount()
    await screen.findByTestId('search-engine-brave')
    const form = screen.getByRole('form', { name: 'Add a search engine' })
    fireEvent.change(within(form).getByLabelText('Identifier'), { target: { value: 'Brave_1' } })
    fireEvent.change(within(form).getByLabelText('Name of the secret in the vault'), { target: { value: 'brave-key' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add the engine' }))
    expect((await within(form).findByRole('alert')).textContent).toContain('1 to 48 lowercase letters')
    expect(createSearchEngine).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByLabelText('Identifier'), { target: { value: 'brave' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add the engine' }))
    const card = await screen.findByTestId('network-tools-error')
    expect(card.getAttribute('data-error-code')).toBe('search_engine_exists')
    expect(card.textContent).toContain('A search engine with this identifier already exists.')
  })

  it('deleting an engine asks for confirmation (danger) then DELETEs it', async () => {
    mount()
    fireEvent.click(within(await screen.findByTestId('search-engine-searx')).getByRole('button', { name: 'Delete the search engine searx' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Delete the search engine searx?')
    expect(deleteSearchEngine).not.toHaveBeenCalled()
    const confirm = within(dialog).getByRole('button', { name: 'Delete the engine' })
    expect(confirm.className).toContain('btn-danger')
    fireEvent.click(confirm)
    await waitFor(() => expect(deleteSearchEngine).toHaveBeenCalledWith('searx'))
  })

  it('the one-click consent of an engine PUTs the engine origin for the selected project', async () => {
    mount()
    const brave = within(await screen.findByTestId('search-engine-brave'))
    expect(within(screen.getByTestId('search-engine-searx')).queryByRole('button', { name: /Allow the origin/ })).toBeNull()
    fireEvent.click(brave.getByRole('button', { name: 'Allow the origin of brave for Acme' }))
    await waitFor(() => expect(allowOrigin).toHaveBeenCalledWith('acme', 'https://api.search.brave.com'))
  })

  it('granting the key explains the provider scope tool:<id>, then creates a vault grant for the named secret only', async () => {
    proof = true
    mount()
    fireEvent.click(within(await screen.findByTestId('search-engine-brave')).getByRole('button', { name: 'Grant the key of brave' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('under the grant scope provider tool:brave')
    expect(within(dialog).getByRole('link', { name: 'Or grant it from the vault page' }).getAttribute('href')).toBe('/vault')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Grant the key' }))
    await waitFor(() =>
      expect(createGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          secrets: { kind: 'names', names: ['brave-key'] },
          scope: { kind: 'provider', value: 'tool:brave' },
        }),
      ),
    )
    await waitFor(() => expect(screen.getByTestId('network-tools-status-engines').textContent).toBe('Key of brave granted.'))
  })

  it('granting the key without an unlock proof offers the vault unlock in place and never calls the vault grant', async () => {
    mount()
    fireEvent.click(within(await screen.findByTestId('search-engine-brave')).getByRole('button', { name: 'Grant the key of brave' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByLabelText(/vault/i)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Grant the key' }))
    const card = await screen.findByTestId('network-tools-error')
    expect(card.getAttribute('data-error-code')).toBe('vault_locked')
    expect(within(card).getByRole('link', { name: 'Open the vault' })).toBeTruthy()
    expect(createGrant).not.toHaveBeenCalled()
  })
})

describe('NetworkTools — browser', () => {
  it('the browser switch is a role=switch with aria-checked, PUTs { allowed } and says the browser is attached once installed', async () => {
    mount()
    const toggle = await screen.findByRole('switch', { name: 'Allow the browser for Acme' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(document.getElementById(toggle.getAttribute('aria-describedby')!)?.textContent).toContain(
      'only once its executable is installed on the server',
    )
    overview.mockResolvedValue(state({ browser: { allowed: true, authorized_by: 'me', authorized_at: '2026-10-10T10:00:00Z' } }))
    fireEvent.click(toggle)
    await waitFor(() => expect(setBrowser).toHaveBeenCalledWith('acme', true))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Allow the browser for Acme' }).getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByTestId('network-tools-status-browser').textContent).toBe('Browser allowed.')
  })
})

describe('networkToolsApi — wire', () => {
  it('revokeOrigin DELETEs with the origin URL-encoded in the query; allowOrigin and setBrowser PUT their bodies', async () => {
    const real = await vi.importActual<typeof import('@/services/networkTools')>('@/services/networkTools')
    const { api } = await import('@/services/api')
    const del = vi.spyOn(api, 'delete').mockResolvedValue(undefined as never)
    const put = vi.spyOn(api, 'put').mockResolvedValue({} as never)
    await real.networkToolsApi.revokeOrigin('my proj', 'https://docs.rs:8443')
    expect(del).toHaveBeenCalledWith('/projects/my%20proj/network-tools/origins?origin=https%3A%2F%2Fdocs.rs%3A8443')
    await real.networkToolsApi.allowOrigin('acme', 'https://docs.rs')
    expect(put).toHaveBeenCalledWith('/projects/acme/network-tools/origins', { origin: 'https://docs.rs' })
    await real.networkToolsApi.setBrowser('acme', false)
    expect(put).toHaveBeenCalledWith('/projects/acme/network-tools/browser', { allowed: false })
    del.mockRestore()
    put.mockRestore()
  })
})
