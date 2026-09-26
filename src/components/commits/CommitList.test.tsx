import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { Commit } from '@/types'

const getCommitFiles = vi.fn()
vi.mock('@/services', () => ({ commitsApi: { getCommitFiles: (...a: unknown[]) => getCommitFiles(...a) } }))

import { CommitList } from './CommitList'

const commits: Commit[] = [
  { sha: 'abcdef1234567890', message: 'feat: login form', author: 'theo', timestamp: new Date().toISOString(), files_changed: ['a.ts', 'b.ts'] },
  { sha: '1234567abcdef', message: 'fix: typo', timestamp: new Date().toISOString(), files_changed: ['a.ts'] },
]

describe('CommitList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCommitFiles.mockResolvedValue({ items: [{ file_path: 'src/a.ts', additions: 3, deletions: 1 }] })
  })

  it('renders rows with short sha, author and file count', () => {
    render(<CommitList commits={commits} />)
    const row = screen.getByRole('button', { name: 'feat: login form' }).closest('li')!
    expect(within(row).getByRole('button', { name: 'Copy SHA abcdef1' })).toBeTruthy()
    expect(within(row).getByText('theo')).toBeTruthy()
    expect(within(row).getByText('2 files')).toBeTruthy()
    expect(screen.getByText('1 file')).toBeTruthy()
  })

  it('expands a row to load its files', async () => {
    render(<CommitList commits={commits} />)
    fireEvent.click(screen.getByRole('button', { name: 'feat: login form' }))
    await waitFor(() => expect(getCommitFiles).toHaveBeenCalledWith('abcdef1234567890'))
    expect(await screen.findByText('src/a.ts')).toBeTruthy()
    expect(screen.getByText('+3')).toBeTruthy()
    expect(screen.getByText('-1')).toBeTruthy()
  })

  it('shows the empty message', () => {
    render(<CommitList commits={[]} emptyMessage="Nothing linked" />)
    expect(screen.getByText('Nothing linked')).toBeTruthy()
  })
})
