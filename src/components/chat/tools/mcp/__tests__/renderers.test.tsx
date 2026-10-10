import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { EntityRenderer } from '../EntityRenderer'
import { CodeRenderer } from '../CodeRenderer'

function mount(node: ReactNode) {
  return render(
    <Provider store={createStore()}>
      <MemoryRouter>{node}</MemoryRouter>
    </Provider>,
  )
}

const tasks = Array.from({ length: 6 }, (_, i) => ({
  task: { id: `task-${i}`, title: i === 5 ? '' : `Task ${i}`, description: `desc ${i}`, status: i % 2 ? 'completed' : 'pending' },
}))

describe('EntityRenderer', () => {
  it('renders nothing for a non-object result', () => {
    const { container } = mount(<EntityRenderer action="get_plan" parsed="text" />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a plan with its tasks and constraints', () => {
    mount(
      <EntityRenderer
        action="get_plan"
        parsed={{
          plan: { id: 'plan-1', title: 'Big plan', status: 'in_progress', priority: 5, description: 'Plan body', project_id: 'proj-1', created_at: '2026-01-01T00:00:00Z' },
          tasks,
          constraints: [{ description: 'c1' }, { description: 'c2' }, { description: 'c3' }, {}],
        }}
      />,
    )
    expect(screen.getByText('Big plan')).toBeTruthy()
    expect(screen.getByText('Plan body')).toBeTruthy()
    expect(screen.getByText('Task 0')).toBeTruthy()
    expect(screen.getByText('c1')).toBeTruthy()
  })

  it('renders a task with criteria, steps and decisions', () => {
    mount(
      <EntityRenderer
        action="get_task"
        parsed={{
          task: { id: 'task-1', title: 'A task', description: 'Task body', status: 'blocked', priority: 2, plan_id: 'plan-1', tags: ['x'] },
          acceptance_criteria: ['a', 'b', 'c', 'd', 'e'],
          steps: [
            { id: 's1', description: 'step one', status: 'completed' },
            { id: 's2', description: 'step two', status: 'in_progress' },
            { id: 's3', description: 'step three', status: 'skipped' },
            { id: 's4', description: 'step four' },
          ],
          decisions: [{ description: 'choose', chosen_option: 'A' }, { description: 'other' }],
        }}
      />,
    )
    expect(screen.getByText('A task')).toBeTruthy()
    expect(screen.getByText('step two')).toBeTruthy()
    expect(screen.getByText('→ A')).toBeTruthy()
  })

  it('renders a task without title by its description', () => {
    mount(<EntityRenderer action="get_task" parsed={{ id: 't', description: 'only a description' }} />)
    expect(screen.getByText('only a description')).toBeTruthy()
  })

  it('renders project, note, milestone, release and step cards', () => {
    mount(
      <>
        <EntityRenderer action="get_project" parsed={{ slug: 'proj', name: 'Project X', description: 'about', root_path: '/src', last_synced: '2026-01-01T00:00:00Z' }} />
        <EntityRenderer action="get_note" parsed={{ id: 'n1', note_type: 'gotcha', importance: 'high', status: 'active', content: 'note text', tags: ['t'], project_id: 'p' }} />
        <EntityRenderer action="get_milestone" parsed={{ id: 'm1', title: 'Milestone', status: 'open', description: 'ms', target_date: '2026-05-01T00:00:00Z', project_id: 'p', tasks }} />
        <EntityRenderer action="get_release" parsed={{ id: 'r1', version: 'v1.2', title: 'Release', status: 'planned', description: 'rel', target_date: '2026-06-01', project_id: 'p' }} />
        <EntityRenderer action="get_step" parsed={{ id: 'st1', description: 'do it', task_id: 'task-77', verification: 'check it' }} />
      </>,
    )
    expect(screen.getByText('Project X')).toBeTruthy()
    expect(screen.getByText('note text')).toBeTruthy()
    expect(screen.getByText('Milestone')).toBeTruthy()
    expect(screen.getByText('v1.2')).toBeTruthy()
    expect(screen.getByText('check it')).toBeTruthy()
  })

  it('renders generic cards, with ids, objects and a field overflow', () => {
    mount(
      <EntityRenderer
        action="get_decision"
        parsed={{ id: 'd1', title: 'T', status: 'accepted', task_id: 'task-1', meta: { a: 1 }, f1: 1, f2: 2, f3: 3, f4: 4, f5: 5, empty: '' }}
      />,
    )
    expect(screen.getByText('T')).toBeTruthy()
    expect(screen.getByText(/more field/i)).toBeTruthy()
  })

  it('renders a created entity with its card, and a created step', () => {
    mount(
      <>
        <EntityRenderer action="create_plan" parsed={{ id: 'plan-9', title: 'Fresh plan' }} />
        <EntityRenderer action="create_step" parsed={{ id: 'st9', description: 'new step' }} />
      </>,
    )
    expect(screen.getByText('Fresh plan')).toBeTruthy()
    expect(screen.getByText('new step')).toBeTruthy()
  })

  it('confirms updates, deletions and links, with the best navigation target', () => {
    mount(
      <>
        <EntityRenderer action="update_task" parsed={{ updated: true }} toolInput={{ task_id: 'task-1', status: 'completed' }} />
        <EntityRenderer action="delete_note" parsed={{ deleted: true }} toolInput={{ note_id: 'note-1' }} />
        <EntityRenderer action="add_step" parsed={{ added: true }} toolInput={{ task_id: 'task-2' }} />
        <EntityRenderer action="add_decision" parsed={{ added: true }} toolInput={{ task_id: 'task-3' }} />
        <EntityRenderer action="add_constraint" parsed={{ added: true }} toolInput={{ plan_id: 'plan-3' }} />
        <EntityRenderer action="link_commit_to_task" parsed={{ added: true }} toolInput={{ task_id: 'task-4' }} />
        <EntityRenderer action="link_commit_to_plan" parsed={{ added: true }} toolInput={{ plan_id: 'plan-4' }} />
        <EntityRenderer action="update_workspace" parsed={{ updated: true }} toolInput={{ slug: 'ws' }} />
        <EntityRenderer action="update_release" parsed={{ updated: true }} toolInput={{ release_id: 'r' }} />
        <EntityRenderer action="update_milestone" parsed={{ updated: true }} toolInput={{ milestone_id: 'm' }} />
        <EntityRenderer action="update_project" parsed={{ updated: true }} toolInput={{ id: 'p' }} />
        <EntityRenderer action="remove_thing" parsed={{ updated: true }} toolInput={{ plan_id: 'x' }} />
        <EntityRenderer action="unlink_note" parsed={{ updated: true }} />
      </>,
    )
    expect(screen.getAllByText(/parent task/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/parent plan/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/linked task/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/linked plan/i).length).toBeGreaterThan(0)
  })

  it('confirms a richer update and a deletion with a title', () => {
    mount(
      <>
        <EntityRenderer action="update_plan" parsed={{ id: 'plan-1', title: 'Renamed', status: 'approved' }} />
        <EntityRenderer action="delete_release" parsed={{ version: 'v0' }} toolInput={{ release_id: 'rel-1' }} />
        <EntityRenderer action="create_commit" parsed={{ sha: 'abc' }} toolInput={{ plan_id: 'plan-2' }} />
      </>,
    )
    expect(screen.getByText('Renamed')).toBeTruthy()
    expect(screen.getByText('v0')).toBeTruthy()
  })
})

describe('CodeRenderer', () => {
  it('renders nothing for an unknown action', () => {
    const { container } = mount(<CodeRenderer action="nope" parsed={{}} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders search results and copies a path', () => {
    Object.assign(navigator, { clipboard: { writeText: () => Promise.resolve() } })
    mount(
      <>
        <CodeRenderer action="search_code" parsed={[]} />
        <CodeRenderer
          action="search_code"
          parsed={[
            { document: { file_path: 'src/a.rs', name: 'runAll', kind: 'function', docstrings: 'fn run() {\n  let x = 1;\n}' } },
            { path: 'src/b.ts', symbol_name: 'go', symbol_type: 'fn', content: 'const a = 1' },
          ]}
        />
      </>,
    )
    expect(screen.getByText('runAll')).toBeTruthy()
    expect(screen.getByText('src/a.rs')).toBeTruthy()
    fireEvent.click(screen.getAllByTitle(/copy/i)[0])
  })

  it('renders file symbols', () => {
    mount(
      <>
        <CodeRenderer action="get_file_symbols" parsed={{}} />
        <CodeRenderer action="get_file_symbols" parsed={{ functions: ['main', { name: 'helper' }], structs: [{ symbol_name: 'Thing' }] }} />
      </>,
    )
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('Thing')).toBeTruthy()
  })

  it('renders references grouped by file', () => {
    mount(
      <>
        <CodeRenderer action="find_references" parsed={{ references: [] }} />
        <CodeRenderer
          action="find_references"
          parsed={{ references: [{ file_path: 'src/x.rs', line: 4, context: 'call x' }, { file_path: 'src/x.rs', line: 9, ref_type: 'import' }, { line: 1 }] }}
        />
      </>,
    )
    expect(screen.getByText('call x')).toBeTruthy()
    expect(screen.getByText(':9')).toBeTruthy()
  })

  it('renders a call graph and its empty state', () => {
    mount(
      <>
        <CodeRenderer action="get_call_graph" parsed={{ callers: ['a', { name: 'b', file_path: 'src/b.rs', depth: 1 }], calls: [{ function: 'c' }] }} />
        <CodeRenderer action="get_call_graph" parsed={null} />
      </>,
    )
    expect(screen.getByText('a')).toBeTruthy()
    expect(screen.getByText('c')).toBeTruthy()
  })

  it('renders an impact analysis and the architecture', () => {
    mount(
      <>
        <CodeRenderer action="analyze_impact" parsed={{ target: 'src/core.rs', impact_level: 'high', caller_count: 3, dependent_files: ['src/d.rs'] }} />
        <CodeRenderer
          action="get_architecture"
          parsed={{ languages: { rust: 10, ts: '5' }, top_files: [{ path: 'src/a.rs', connections: 4 }, { file_path: 'src/b.rs', count: 8 }, { path: 'src/c.rs' }] }}
        />
      </>,
    )
    expect(screen.getByText('src/core.rs')).toBeTruthy()
    expect(screen.getByText('src/d.rs')).toBeTruthy()
    expect(screen.getByText('rust: 10')).toBeTruthy()
  })

  it('renders symbol lists and file dependencies', () => {
    mount(
      <>
        <CodeRenderer action="find_trait_implementations" parsed={[]} />
        <CodeRenderer action="find_type_traits" parsed={{ traits: [{ trait_name: 'Display', file_path: 'src/t.rs' }] }} />
        <CodeRenderer action="get_impl_blocks" parsed={[{ type_name: 'Foo' }]} />
        <CodeRenderer action="get_file_dependencies" parsed={{ imports: ['src/i.rs'], imported_by: ['src/j.rs'] }} />
      </>,
    )
    expect(screen.getByText('Display')).toBeTruthy()
    expect(screen.getByText('Foo')).toBeTruthy()
    expect(screen.getByText('src/i.rs')).toBeTruthy()
    expect(screen.getByText('src/j.rs')).toBeTruthy()
  })
})
