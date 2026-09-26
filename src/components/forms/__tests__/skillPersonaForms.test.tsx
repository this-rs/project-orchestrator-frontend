/**
 * Forms owned by the Skills / Personas pages: ImportSkillForm (package
 * validation + accessible drop zone), CreateSkillForm, EditPersonaForm.
 * Each form returns `{ fields, submit }`; the harness renders `fields` and
 * exposes `submit` through a button, like FormDialog does.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ImportSkillForm, isSkillPackage } from '../ImportSkillForm'
import { CreateSkillForm } from '../CreateSkillForm'
import { EditPersonaForm } from '../EditPersonaForm'
import type { Persona, SkillPackage } from '@/types'

const projects = [
  { id: 'p1', name: 'Alpha' },
  { id: 'p2', name: 'Beta' },
]

const pkg: SkillPackage = {
  schema_version: 1,
  metadata: {
    format: 'skill',
    exported_at: '2026-01-01',
    source_project: 'Origin',
    stats: { note_count: 2, decision_count: 1, trigger_count: 0, activation_count: 3 },
  },
  skill: { name: 'Auth tokens', description: 'JWT handling', trigger_patterns: [], tags: ['auth', 'jwt', 'security', 'api'], cohesion: 0.6 },
  notes: [
    { note_type: 'gotcha', importance: 'high', content: 'Rotate keys', tags: [] },
    { note_type: 'pattern', importance: 'medium', content: 'Use refresh tokens', tags: [] },
  ],
  decisions: [{ description: 'Use RS256', rationale: 'asymmetric', alternatives: [] }],
  protocols: [],
}

function Harness({ form }: { form: { fields: ReactNode; submit: () => Promise<false | void> } }) {
  return (
    <div>
      {form.fields}
      <button type="button" onClick={() => void form.submit()}>
        submit
      </button>
    </div>
  )
}

describe('isSkillPackage', () => {
  it('accepts a well-formed package and rejects partial objects', () => {
    expect(isSkillPackage(pkg)).toBe(true)
    expect(isSkillPackage(null)).toBe(false)
    expect(isSkillPackage({ ...pkg, schema_version: '1' })).toBe(false)
    expect(isSkillPackage({ ...pkg, skill: { name: '' } })).toBe(false)
    expect(isSkillPackage({ ...pkg, notes: 'nope' })).toBe(false)
    expect(isSkillPackage({ ...pkg, decisions: undefined })).toBe(false)
  })
})

describe('ImportSkillForm', () => {
  function ImportHarness({ onSubmit }: { onSubmit: (d: unknown) => Promise<void> }) {
    const form = ImportSkillForm({ projects, onSubmit })
    return <Harness form={form} />
  }

  it('blocks submit until a package is chosen (button drop zone, error announced)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ImportHarness onSubmit={onSubmit} />)
    expect(screen.getByRole('button', { name: 'Skill package' })).toBeTruthy()
    fireEvent.click(screen.getByText('submit'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('parses a dropped .json package, previews it and submits with project + strategy', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ImportHarness onSubmit={onSubmit} />)
    const file = new File([JSON.stringify(pkg)], 'auth.json', { type: 'application/json' })
    fireEvent.drop(screen.getByRole('button', { name: 'Skill package' }), { dataTransfer: { files: [file] } })
    expect(await screen.findByText('Auth tokens')).toBeTruthy()
    expect(screen.getByText('2 notes')).toBeTruthy()
    expect(screen.getByText('1 decision')).toBeTruthy()
    expect(screen.getByText('from Origin')).toBeTruthy()
    expect(screen.getByText('#auth #jwt #security +1')).toBeTruthy()
    fireEvent.click(screen.getByText('submit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ project_id: 'p1', package: pkg, conflict_strategy: 'skip' }))
  })

  it('rejects a non-package JSON file with a readable error', async () => {
    render(<ImportHarness onSubmit={vi.fn()} />)
    const file = new File(['{"hello":1}'], 'x.json', { type: 'application/json' })
    fireEvent.drop(screen.getByRole('button', { name: 'Skill package' }), { dataTransfer: { files: [file] } })
    expect((await screen.findByRole('alert')).textContent).toMatch(/Not a skill package/)
  })
})

describe('CreateSkillForm', () => {
  function CreateHarness({ onSubmit }: { onSubmit: (d: unknown) => Promise<void> }) {
    const form = CreateSkillForm({ projects, onSubmit })
    return <Harness form={form} />
  }

  it('requires a name and splits tags', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateHarness onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('submit'))
    expect(await screen.findByText('Name is required')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText(/Auth tokens/), { target: { value: '  Retry policy ' } })
    fireEvent.change(screen.getByPlaceholderText('Comma-separated (optional)'), { target: { value: 'a, b ,,c' } })
    fireEvent.click(screen.getByText('submit'))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ project_id: 'p1', name: 'Retry policy', description: undefined, tags: ['a', 'b', 'c'] }),
    )
  })
})

describe('EditPersonaForm', () => {
  const persona: Persona = {
    id: 'pe1',
    project_id: 'p1',
    name: 'API expert',
    description: 'Knows the API layer',
    status: 'active',
    model_preference: 'opus',
    timeout_secs: 120,
    max_cost_usd: 2.5,
    energy: 0.5,
    cohesion: 0.5,
    activation_count: 1,
    success_rate: 1,
    avg_duration_secs: 10,
    origin: 'manual',
    created_at: '2026-01-01T00:00:00Z',
  }

  function EditHarness({ onSubmit }: { onSubmit: (d: unknown) => Promise<void> }) {
    const form = EditPersonaForm({ initial: persona, onSubmit })
    return <Harness form={form} />
  }

  it('is pre-filled with the persona and validates numbers', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<EditHarness onSubmit={onSubmit} />)
    const name = screen.getByDisplayValue('API expert') as HTMLInputElement
    expect(screen.getByDisplayValue('opus')).toBeTruthy()
    expect(screen.getByDisplayValue('120')).toBeTruthy()
    fireEvent.change(screen.getByDisplayValue('2.5'), { target: { value: '-1' } })
    fireEvent.click(screen.getByText('submit'))
    expect(await screen.findByText('Must be a positive number')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.change(screen.getByDisplayValue('-1'), { target: { value: '' } })
    fireEvent.change(name, { target: { value: ' Renamed ' } })
    fireEvent.click(screen.getByText('submit'))
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Renamed',
        description: 'Knows the API layer',
        complexity_default: undefined,
        timeout_secs: 120,
        max_cost_usd: undefined,
        model_preference: 'opus',
        system_prompt_override: undefined,
      }),
    )
  })
})
