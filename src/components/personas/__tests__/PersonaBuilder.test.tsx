/**
 * PersonaBuilder — 4 stacked steps (mode → configure → preview → create),
 * every choice is a list row, navigation buttons at the bottom of each step.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const detect = vi.fn()
const create = vi.fn()
const autoBuild = vi.fn()
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services', () => ({
  personasApi: {
    detect: (...a: unknown[]) => detect(...a),
    create: (...a: unknown[]) => create(...a),
    autoBuild: (...a: unknown[]) => autoBuild(...a),
  },
}))
vi.mock('@/hooks', () => ({
  useToast: () => toast,
  useWorkspaceSlug: () => 'ws',
}))

import { PersonaBuilder } from '../PersonaBuilder'

function renderBuilder(onClose = vi.fn(), projects = [{ id: 'p1', name: 'Alpha' }]) {
  render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="/new" element={<PersonaBuilder projectId="p1" projects={projects} onClose={onClose} />} />
        <Route path="/workspace/ws/personas/:id" element={<div>persona detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return onClose
}

describe('PersonaBuilder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('manual mode: mode → configure → create, name required, navigates to the new persona', async () => {
    const onClose = renderBuilder()
    const modes = screen.getByRole('list', { name: 'Build mode' })
    expect(within(modes).getAllByRole('listitem')).toHaveLength(4)
    fireEvent.click(within(modes).getByRole('button', { name: 'Manual' }))
    expect(screen.getByText('Configure — Manual')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Skip to create/ }))
    expect(screen.getByRole('heading', { name: 'Create persona' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Create persona/ }))
    expect(toast.error).toHaveBeenCalledWith('Name is required')
    expect(create).not.toHaveBeenCalled()

    create.mockResolvedValue({ id: 'pe1' })
    fireEvent.change(screen.getByPlaceholderText('e.g. API layer expert'), { target: { value: 'API expert' } })
    fireEvent.click(screen.getByRole('button', { name: /Create persona/ }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({ project_id: 'p1', name: 'API expert', description: '' }))
    expect(await screen.findByText('persona detail')).toBeTruthy()
    expect(onClose).toHaveBeenCalled()
  })

  it('file pattern mode: preview lists proposals as rows; tapping one reuses its name', async () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: 'From a file pattern' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. src/api/**/*.rs'), { target: { value: 'src/api/**' } })
    detect.mockResolvedValue({
      proposals: [{ suggested_name: 'API layer', sample_files: ['src/api/a.rs', 'src/api/b.rs'], file_count: 12, community_id: 3, confidence: 0.91 }],
      count: 1,
      project_id: 'p1',
    })
    fireEvent.click(screen.getByRole('button', { name: /Preview/ }))
    const proposals = await screen.findByRole('list', { name: 'Detected proposals' })
    const row = within(proposals).getAllByRole('listitem')[0]
    expect(within(row).getByText('12 files')).toBeTruthy()
    expect(within(row).getByText('91%')).toBeTruthy()
    expect(within(row).getByText(/src\/api\/a\.rs/)).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'API layer' }))
    expect((screen.getByPlaceholderText('e.g. API layer expert') as HTMLInputElement).value).toBe('API layer')

    autoBuild.mockResolvedValue({ id: 'pe2' })
    fireEvent.click(screen.getByRole('button', { name: /Create persona/ }))
    await waitFor(() =>
      expect(autoBuild).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'p1', name: 'API layer', file_pattern: 'src/api/**' })),
    )
  })

  it('offers a project selector on the last step when several projects exist', () => {
    renderBuilder(vi.fn(), [
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Manual' }))
    fireEvent.click(screen.getByRole('button', { name: /Skip to create/ }))
    expect(screen.getByRole('combobox')).toBeTruthy()
    // Back goes to the configure step for manual mode
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByText('Configure — Manual')).toBeTruthy()
  })
})
