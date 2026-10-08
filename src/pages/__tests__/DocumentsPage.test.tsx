/**
 * DocumentsPage — files attached to the work: list, filter by project, upload,
 * delete — and an honest word for every way an upload can end (the server's
 * status codes each mean something different to the person who chose the file).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const list = vi.fn()
const upload = vi.fn()
const remove = vi.fn()
const listProjects = vi.fn()
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }

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

import { ApiError } from '@/services/api'
import { DocumentsPage, documentKind, formatBytes } from '../DocumentsPage'
import { uploadFailureText, uploadOutcomeNote } from '../documents/uploadOutcome'

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

/** The project filter is a ui `Select` behind the Filters button (native popover content is hidden to jsdom). */
const pickProject = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(screen.getByRole('option', { name, hidden: true }))
}

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
    toast.warning.mockReset()
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
    await waitFor(() => expect(screen.getByText('Could not load the documents')).toBeTruthy())
  })
  describe('against the real backend contract', () => {
    // The API answers 400 to any listing without a scope (project_id / session_id / entity).
    const scoped = (byProject: Record<string, ReturnType<typeof doc>[]>) =>
      list.mockImplementation(async (params: { project_id?: string; limit?: number }) => {
        if (!params?.project_id) throw new Error('400 Bad Request: documents listing requires a scope')
        if ((params.limit ?? 0) > 100) throw new Error('400 Bad Request: limit > 100')
        const items = byProject[params.project_id] ?? []
        return { items, total: items.length }
      })

    it('"All projects" reads each project and merges the documents, newest first', async () => {
      listProjects.mockResolvedValue([
        { id: 'p1', name: 'Budget 2027' },
        { id: 'p2', name: 'Voyage' },
      ])
      scoped({
        p1: [doc('1', 'old.xlsx', 'xlsx', { project_id: 'p1', created_at: '2026-01-01T00:00:00Z' })],
        p2: [doc('2', 'new.pdf', 'pdf', { project_id: 'p2', created_at: '2026-06-01T00:00:00Z' })],
      })
      renderPage()
      await waitFor(() => expect(screen.getByText('new.pdf')).toBeTruthy())
      const names = screen.getAllByRole('listitem').map((li) => li.textContent ?? '')
      expect(names.findIndex((t) => t.includes('new.pdf'))).toBeLessThan(names.findIndex((t) => t.includes('old.xlsx')))
      expect(screen.queryByText('Could not load the documents')).toBeNull()
    })

    it('never lists without a scope', async () => {
      listProjects.mockResolvedValue([{ id: 'p1', name: 'Budget 2027' }])
      scoped({ p1: [] })
      renderPage()
      await waitFor(() => expect(screen.getByText('No documents yet')).toBeTruthy())
      for (const [params] of list.mock.calls) expect(params.project_id).toBeTruthy()
    })

    it('disables upload until a project is chosen when there are several', async () => {
      listProjects.mockResolvedValue([
        { id: 'p1', name: 'Budget 2027' },
        { id: 'p2', name: 'Voyage' },
      ])
      scoped({})
      renderPage()
      await waitFor(() => expect(screen.getByText('No documents yet')).toBeTruthy())
      const btn = screen.getAllByRole('button', { name: /^upload$/i })[0] as HTMLButtonElement
      expect(btn.disabled).toBe(true)
      pickProject('Voyage')
      await waitFor(() => expect((screen.getAllByRole('button', { name: /^upload$/i })[0] as HTMLButtonElement).disabled).toBe(false))
    })

    it('uploads into the chosen project', async () => {
      listProjects.mockResolvedValue([
        { id: 'p1', name: 'Budget 2027' },
        { id: 'p2', name: 'Voyage' },
      ])
      scoped({})
      upload.mockResolvedValue(doc('9', 'a.pdf', 'pdf'))
      renderPage()
      await waitFor(() => expect(screen.getByText('No documents yet')).toBeTruthy())
      pickProject('Voyage')
      await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'p2' })))
      fireEvent.change(screen.getByLabelText('Choose files to upload'), { target: { files: [new File(['x'], 'a.pdf')] } })
      await waitFor(() => expect(upload).toHaveBeenCalledWith(expect.anything(), { projectId: 'p2' }))
    })
  })

  describe('what an upload says when it ends', () => {
    const api = (status: number, error?: string) => new ApiError(status, error === undefined ? '' : JSON.stringify({ error }))

    it('415: names the formats this server reads instead of a raw error', () => {
      const text = uploadFailureText(api(415, 'no extractor for this content (sniffed: application/x-foo)'), 'notes.foo')
      expect(text).toMatch(/^notes\.foo is in a format this server cannot read/)
      expect(text).toMatch(/PDF, plain text and Markdown/)
      expect(text).toMatch(/Word, Excel or PowerPoint when this server was built with them/)
      expect(text).not.toMatch(/sniffed|extractor/)
    })

    it('501: the file is fine, the build lacks the reader — and says which one', () => {
      const text = uploadFailureText(api(501, 'PDF support is not compiled in — rebuild with the `pdf` feature'), 'report.pdf')
      expect(text).toMatch(/report\.pdf is fine/)
      expect(text).toMatch(/built without PDF support/)
      expect(text).not.toMatch(/rebuild|feature/)
    })

    it('413 keeps the limit the server states; 422 blames the file; 0 and 408 blame the network', () => {
      expect(uploadFailureText(api(413, 'blob of 60000000 bytes exceeds the 52428800-byte limit'), 'big.pdf')).toBe(
        'big.pdf is too large. blob of 60000000 bytes exceeds the 52428800-byte limit',
      )
      expect(uploadFailureText(api(422, 'input is empty'), 'empty.txt')).toBe('empty.txt could not be read: input is empty.')
      expect(uploadFailureText(new ApiError(0, 'Network error'), 'a.pdf')).toMatch(/never reached the server/)
      expect(uploadFailureText(new ApiError(408, 'Upload timed out'), 'a.pdf')).toMatch(/did not answer in time/)
      expect(uploadFailureText(new Error('boom'), 'a.pdf')).toBe('Could not upload a.pdf.')
    })

    it('a stored-but-unreadable file is said so, a readable one says nothing', () => {
      expect(uploadOutcomeNote({ filename: 'deliverables.zip', extracted: false, chunk_count: 0, warnings: ['…'] })).toMatch(
        /deliverables\.zip is stored and can be opened, but it has no readable text/,
      )
      expect(uploadOutcomeNote({ filename: 'scan.pdf', extracted: true, chunk_count: 0, warnings: [] })).toMatch(/no text could be read/)
      expect(uploadOutcomeNote({ filename: 'ok.md', extracted: true, chunk_count: 3, warnings: [] })).toBeNull()
    })

    it('shows the 415 sentence as a toast and still adds the files that went through', async () => {
      list.mockResolvedValue({ items: [], total: 0 })
      upload
        .mockRejectedValueOnce(api(415, 'no extractor for this content (sniffed: application/x-foo)'))
        .mockResolvedValueOnce(doc('3', 'ok.md', 'markdown', { extracted: true, warnings: [] }))
      renderPage()
      await waitFor(() => expect(screen.getByText('No documents yet')).toBeTruthy())
      fireEvent.change(screen.getByLabelText('Choose files to upload'), {
        target: { files: [new File(['x'], 'notes.foo'), new File(['y'], 'ok.md')] },
      })
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
      expect(toast.error.mock.calls[0][0]).toMatch(/^notes\.foo is in a format this server cannot read\. It reads PDF/)
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Document added'))
    })

    it('warns when a file is stored without text, and the list says it is not readable', async () => {
      list.mockResolvedValue({ items: [doc('4', 'deliverables.zip', 'binary', { project_id: 'p1', extracted: false })], total: 1 })
      upload.mockResolvedValue(doc('5', 'photo.png', 'binary', { extracted: false, chunk_count: 0, warnings: ['no text'] }))
      renderPage()
      await waitFor(() => expect(screen.getByText('deliverables.zip')).toBeTruthy())
      expect(screen.getByText('Stored, not readable')).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Choose files to upload'), { target: { files: [new File(['x'], 'photo.png')] } })
      await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/^photo\.png is stored and can be opened/)))
    })
  })
})
