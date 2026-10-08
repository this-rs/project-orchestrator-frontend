/**
 * Smoke / behaviour tests for the smaller layout primitives:
 * MetaLine, RelativeTime, FilterBar, Switch, Section, Facts, PageShell,
 * PageHeader, EmptyState, EntityListSkeleton.
 */
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Folder } from 'lucide-react'
import { MetaLine, RelativeTime } from './MetaLine'
import { FilterBar } from './FilterBar'
import { Switch } from './Switch'
import { Section, Facts } from './Section'
import { PageShell, PageContainer } from './PageShell'
import { PageHeader } from './PageHeader'
import { EmptyState } from './EmptyState'
import { EntityListSkeleton } from './Skeleton'

describe('MetaLine', () => {
  it('joins non-empty items with separators', () => {
    render(<MetaLine items={['a', null, false, '', 'b', <span key="c">c</span>]} />)
    expect(screen.getByText('a')).toBeTruthy()
    expect(screen.getByText('c')).toBeTruthy()
    expect(screen.getAllByText('·')).toHaveLength(2)
  })

  it('accepts children and renders nothing when empty', () => {
    const { container } = render(<MetaLine>{null}</MetaLine>)
    expect(container.innerHTML).toBe('')
  })
})

describe('RelativeTime', () => {
  it('renders a <time> with ISO datetime and absolute title', () => {
    const d = new Date(Date.now() - 3 * 3600_000)
    const { container } = render(<RelativeTime date={d.toISOString()} prefix="updated " />)
    const time = container.querySelector('time')!
    expect(time.getAttribute('dateTime')).toBe(d.toISOString())
    expect(time.textContent).toBe('updated 3h')
    expect(time.getAttribute('title')).toMatch(/\d{4}, \d{2}:\d{2}$/)
  })

  it('renders nothing for missing dates', () => {
    const { container } = render(<RelativeTime date={null} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('FilterBar', () => {
  function Harness({ onClear }: { onClear: () => void }) {
    const [q, setQ] = useState('')
    return (
      <FilterBar
        search={q}
        onSearchChange={setQ}
        searchPlaceholder="Search decisions…"
        filters={<div>panel content</div>}
        activeCount={1}
        activeLabels={['Accepted']}
        onClear={onClear}
      />
    )
  }

  it('search is controlled and clearable', () => {
    render(<Harness onClear={() => {}} />)
    const input = screen.getByRole('searchbox', { name: 'Search decisions' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'auth' } })
    expect(input.value).toBe('auth')
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(input.value).toBe('')
    fireEvent.change(input, { target: { value: 'x' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('')
  })

  it('filter button shows active count, toggles the panel, summary + Clear', () => {
    const onClear = vi.fn()
    render(<Harness onClear={onClear} />)
    const btn = screen.getByRole('button', { name: 'Filters (1 active)' })
    for (const c of ['btn', 'btn-ghost', 'btn-icon', 'size-9', 'md:size-8']) expect(btn.classList.contains(c)).toBe(true)
    // open by default because a filter is active
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('panel content')).toBeTruthy()
    fireEvent.click(btn)
    expect(screen.queryByText('panel content')).toBeNull()
    expect(screen.getByText('Accepted')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onClear).toHaveBeenCalled()
  })

  it('hides search and filter button when not configured', () => {
    render(<FilterBar trailing={<button>view</button>} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Filters/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'view' })).toBeTruthy()
  })
})

describe('Switch', () => {
  it('toggles and is labelled', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Show archived" />)
    const sw = screen.getByRole('switch', { name: 'Show archived' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('Section / Facts', () => {
  it('renders header with count and action, collapses', () => {
    render(
      <Section title="Tasks" count={4} action={<button>Add</button>} collapsible id="tasks">
        <p>body</p>
      </Section>,
    )
    expect(screen.getByRole('region', { name: /Tasks/ }).id).toBe('tasks')
    expect(screen.getByText('4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tasks/ }))
    expect(screen.queryByText('body')).toBeNull()
  })

  it('Facts skips empty values', () => {
    render(
      <Facts
        items={[
          { label: 'Owner', value: 'alice' },
          { label: 'Empty', value: '' },
          { label: 'Hidden', value: 'x', hidden: true },
        ]}
      />,
    )
    expect(screen.getByText('Owner')).toBeTruthy()
    expect(screen.queryByText('Empty')).toBeNull()
    expect(screen.queryByText('Hidden')).toBeNull()
  })
})

describe('PageShell / PageContainer', () => {
  it('renders title, count, actions and filters', () => {
    render(
      <PageShell title="Decisions" count={12} description="desc" actions={<button>New</button>} filters={<div>toolbar</div>}>
        <p>content</p>
      </PageShell>,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Decisions12')
    expect(screen.getByRole('button', { name: 'New' })).toBeTruthy()
    expect(screen.getByText('toolbar')).toBeTruthy()
    expect(screen.getByText('content')).toBeTruthy()
  })

  it('PageContainer applies the width preset', () => {
    const { container } = render(<PageContainer width="narrow">x</PageContainer>)
    expect((container.firstElementChild as HTMLElement).className).toContain('max-w-3xl')
  })
})

describe('PageHeader', () => {
  it('renders parents, title, key facts (status + meta + legacy metadata) and overflow', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Auth flow"
          parentLinks={[{ icon: Folder, label: 'Project', name: 'Backend', href: '/p/backend' }]}
          status={<span>Accepted</span>}
          meta={['P8']}
          metadata={[{ label: 'Created', value: '12 Sep' }]}
          actions={<button>Run</button>}
          overflowActions={[{ label: 'Delete', onClick: () => {} }]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Auth flow' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Project:\s*Backend/ })).toBeTruthy()
    expect(screen.getByText('Accepted')).toBeTruthy()
    expect(screen.getByText('P8')).toBeTruthy()
    expect(screen.getByText('Created')).toBeTruthy()
    expect(screen.getByText('12 Sep')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Actions for Auth flow' })).toBeTruthy()
  })
})

describe('EmptyState / skeleton', () => {
  it('renders md and sm variants', () => {
    const { rerender } = render(<EmptyState title="No decisions" description="Nothing yet" action={<button>Create</button>} />)
    expect(screen.getByRole('heading', { name: 'No decisions' })).toBeTruthy()
    rerender(<EmptyState size="sm" title="No tasks" />)
    expect(screen.getByText('No tasks')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('page variant: display-3 title, lead text, one action, no dashed box', () => {
    const { container } = render(
      <EmptyState size="page" title="No projects yet" description="Create the first one." action={<button>New project</button>} />,
    )
    const h = screen.getByRole('heading', { level: 2, name: 'No projects yet' })
    expect(h.className).toContain('display-3')
    expect(screen.getByText('Create the first one.').className).toContain('text-gray-400')
    expect(screen.getByRole('button', { name: 'New project' })).toBeTruthy()
    expect(container.querySelector('.border-dashed')).toBeNull()
  })

  it('md variant keeps its dashed box and base-size title', () => {
    const { container } = render(<EmptyState title="No decisions" />)
    expect(container.querySelector('.border-dashed')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3 }).className).not.toContain('display-3')
  })

  it('EntityListSkeleton exposes a loading status', () => {
    render(<EntityListSkeleton rows={3} />)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy()
  })
})
