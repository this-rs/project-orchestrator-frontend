/**
 * SkillBrowser — the shared catalog is an entity LIST (one row per published
 * skill, trust + status in the meta line), not a grid of cards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { PublishedSkillSummary } from '@/types'
import { installDomStubs } from './domStubs'

installDomStubs()

const search = vi.fn()
vi.mock('@/services', () => ({
  registryApi: { search: (...a: unknown[]) => search(...a) },
}))

import { SkillBrowser } from '../SkillBrowser'

const published: PublishedSkillSummary[] = [
  {
    id: 'r1',
    name: 'Auth tokens',
    description: 'JWT handling',
    tags: ['auth', 'jwt'],
    trust_score: 0.82,
    trust_level: 'high',
    source_project_name: 'Origin',
    published_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    note_count: 4,
    protocol_count: 1,
    import_count: 3,
    is_remote: true,
  },
  {
    id: 'r2',
    name: 'Retry policy',
    description: '',
    tags: [],
    trust_score: 0.2,
    trust_level: 'untrusted',
    source_project_name: 'Other',
    published_at: new Date().toISOString(),
    note_count: 1,
    protocol_count: 0,
    import_count: 0,
    is_remote: false,
  },
]

describe('SkillBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    search.mockResolvedValue({ items: published, total: 2, limit: 25, offset: 0 })
  })

  it('renders one row per skill with trust, source, counts and tags in the meta line', async () => {
    const onImport = vi.fn()
    render(<SkillBrowser onImport={onImport} />)
    const list = await screen.findByRole('list', { name: 'Published skills' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const row = rows[0]
    expect(within(row).getByText('High trust')).toBeTruthy()
    expect(within(row).getByText('82%')).toBeTruthy()
    expect(within(row).getByText('from Origin')).toBeTruthy()
    expect(within(row).getByText('Remote')).toBeTruthy()
    expect(within(row).getByText('4 notes')).toBeTruthy()
    expect(within(row).getByText('1 protocol')).toBeTruthy()
    expect(within(row).getByText('3 imports')).toBeTruthy()
    expect(within(row).getByText('#auth #jwt')).toBeTruthy()
    expect(within(row).getByText('2h')).toBeTruthy()
    expect(screen.getByText('2 published skills')).toBeTruthy()
    // Untrusted level is spelled out, not colour-only
    expect(within(rows[1]).getByText('Untrusted')).toBeTruthy()
  })

  it('opens the import preview from the row and from the ⋯ menu', async () => {
    const onImport = vi.fn()
    render(<SkillBrowser onImport={onImport} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Auth tokens' }))
    expect(onImport).toHaveBeenCalledWith(published[0])
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Retry policy' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }))
    expect(onImport).toHaveBeenLastCalledWith(published[1])
  })

  it('searches server-side after a debounce and filters by trust', async () => {
    render(<SkillBrowser onImport={vi.fn()} />)
    await screen.findByText('Auth tokens')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the shared catalog' }), { target: { value: 'auth' } })
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ query: 'auth' })), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'High (80%+)', hidden: true }))
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ min_trust: 0.8 })))
    expect(screen.getByRole('button', { name: 'Filters (1 active)' })).toBeTruthy()
  })

  it('distinguishes an empty catalog from no match (with a clear action)', async () => {
    search.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
    render(<SkillBrowser onImport={vi.fn()} />)
    expect(await screen.findByText('No published skills yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Low (30%+)', hidden: true }))
    expect(await screen.findByText('No matching skills')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear' }).at(-1)!)
    expect(await screen.findByText('No published skills yet')).toBeTruthy()
  })
})
