/**
 * DocumentsPage — files attached to the work: list, filter by project, upload, delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const list = vi.fn()
const upload = vi.fn()
const remove = vi.fn()
const listProjects = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services/documents', () => ({
  documentsApi: {
    list: (...a: unknown[]) => list(...a),
    upload: (...a: unknown[]) => upload(...a),
    remove: (...a: unknown[]) => remove(...a),
    rawUrl: (id: string) => `/raw/${id}`,
  },
}))
vi.mock('@/services/workspaces', () => ({
  workspacesApi: { listProjects: (...a: unknown[]) => listProjects(...a) },
}))
vi.mock('@/hooks', () => ({ useToast: () => toast, useWorkspaceSlug: () => 'ws' }))

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

import { DocumentsPage, documentKind, formatBytes } from '../DocumentsPage'

const doc = (id: string, filename: string, format: string, extra = {}) => ({
  id,
  filename,
  format,
  size_bytes: 2048,
  sha256: id,
  page_count: 3,
  chunk_count: 4,
  created_at: new Date().toISOString(),
  project_id: null,
  ...extra,
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <DocumentsPage />
    </MemoryRouter>,
  )

describe('documentKind / formatBytes', () => {
  it('names formats the way people do', () => {
    expect(documentKind('xlsx').label).toBe('Spreadsheet')
    expect(documentKind('pptx').label).toBe('Presentation')
    expect(documentKind('pdf').label).toBe('PDF')
    expect(documentKind('weird').label).toBe('WEIRD')
    expect(documentKind('').label).toBe('File')
  })
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('DocumentsPage', () => {
  beforeEach(() => {
    list.mockReset()
    upload.mockReset()
    remove.mockReset()
    listProjects.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    listProjects.mockResolvedValue([{ id: 'p1', name: 'Budget 2027' }])
  })

  it('lists documents with kind, pages, size and project', async () => {
    list.mockResolvedValue({ items: [doc('1', 'budget.xlsx', 'xlsx', { project_id: 'p1' })], total: 1 })
    renderPage()
    await waitFor(() => expect(screen.getByText('budget.xlsx')).toBeTruthy())
    expect(screen.getByText('Spreadsheet')).toBeTruthy()
    expect(screen.getByText('3 pages')).toBeTruthy()
    expect(screen.getByText('2.0 KB')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText('Budget 2027').length).toBeGreaterThan(0))
  })

  it('shows an empty state', async () => {
    list.mockResolvedValue({ items: [], total: 0 })
    renderPage()
    await waitFor(() => expect(screen.getByText('No documents yet')).toBeTruthy())
  })

  it('uploads chosen files and reloads', async () => {
    list.mockResolvedValue({ items: [], total: 0 })
    upload.mockResolvedValue(doc('2', 'deck.pptx', 'pptx'))
    renderPage()
    await waitFor(() => expect(screen.getByText('No documents yet')).toBeTruthy())
    const input = screen.getByLabelText('Choose files to upload') as HTMLInputElement
    const file = new File(['x'], 'deck.pptx')
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Document added'))
    expect(list.mock.calls.length).toBeGreaterThan(1)
  })

  it('shows an error state', async () => {
    list.mockRejectedValueOnce(new Error('down'))
    renderPage()
    await waitFor(() => expect(screen.getByText('Failed to load documents')).toBeTruthy())
  })
})
