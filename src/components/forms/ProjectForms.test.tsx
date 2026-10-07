/**
 * Project forms — the first question is the kind of project. "With code"
 * needs a folder; "Without code" hides it and sends `profile: "work"`
 * with no `root_path` (create) or an empty one (update, which clears it).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateProjectForm, type CreateProjectFormData } from './CreateProjectForm'
import { EditProjectForm, type EditProjectFormData } from './EditProjectForm'

vi.mock('@/services/env', () => ({ isTauri: false }))

const onCreate = vi.fn<(d: CreateProjectFormData) => Promise<void>>()
const onEdit = vi.fn<(d: EditProjectFormData) => Promise<void>>()

function CreateHarness() {
  const form = CreateProjectForm({ onSubmit: onCreate, workspaceName: 'Main' })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      {form.fields}
      <button type="submit">Create</button>
    </form>
  )
}

function EditHarness(props: { profile?: 'software' | 'work'; root_path?: string }) {
  const form = EditProjectForm({
    initialValues: { name: 'Q3 Marketing', slug: 'q3-marketing', description: 'Launch', ...props },
    onSubmit: onEdit,
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.submit()
      }}
    >
      {form.fields}
      <button type="submit">Save</button>
    </form>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  onCreate.mockResolvedValue()
  onEdit.mockResolvedValue()
})

describe('CreateProjectForm', () => {
  it('asks for the kind of project first, with code by default, and requires the folder', async () => {
    render(<CreateHarness />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['software', 'work'])
    expect(screen.getByRole('radio', { name: /With code/ })).toHaveProperty('checked', true)
    // the type sits above the name
    const type = screen.getByText('Type')
    const name = screen.getByLabelText('Name')
    expect(type.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.change(name, { target: { value: 'Backend' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByText('A project with code needs its folder')).toBeTruthy()
    expect(onCreate).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: '/src/backend' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate.mock.calls[0][0]).toEqual({
      name: 'Backend',
      slug: 'backend',
      profile: 'software',
      root_path: '/src/backend',
      description: '',
    })
  })

  it('"Without code" hides the folder and sends profile=work with no root_path', async () => {
    render(<CreateHarness />)
    expect(screen.getByLabelText('Folder')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Without code/ }))
    expect(screen.queryByLabelText('Folder')).toBeNull()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Q3 Marketing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onCreate.mock.calls[0][0]).toEqual({
      name: 'Q3 Marketing',
      slug: 'q3-marketing',
      profile: 'work',
      root_path: undefined,
      description: '',
    })
  })
})

describe('EditProjectForm', () => {
  it('starts from the project profile; a work project has no folder field', () => {
    render(<EditHarness profile="work" />)
    expect(screen.getByRole('radio', { name: /Without code/ })).toHaveProperty('checked', true)
    expect(screen.queryByLabelText('Folder')).toBeNull()
  })

  it('a project without profile is a codebase; switching it to work clears the folder', async () => {
    render(<EditHarness root_path="/src/backend" />)
    expect(screen.getByRole('radio', { name: /With code/ })).toHaveProperty('checked', true)
    expect((screen.getByLabelText('Folder') as HTMLInputElement).value).toBe('/src/backend')

    fireEvent.click(screen.getByRole('radio', { name: /Without code/ }))
    expect(screen.queryByLabelText('Folder')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1))
    expect(onEdit.mock.calls[0][0]).toEqual({
      name: 'Q3 Marketing',
      slug: 'q3-marketing',
      description: 'Launch',
      profile: 'work',
      root_path: '',
    })
  })
})
