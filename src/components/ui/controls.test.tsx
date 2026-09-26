import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Box } from 'lucide-react'
import { TabLayout } from './TabLayout'
import { ViewTabs } from './ViewTabs'
import { ViewToggle } from './ViewToggle'
import { RowCheckbox } from './RowCheckbox'
import { ProgressLine } from './ProgressLine'
import { Meter, StatTiles } from './Metrics'
import { ToneText } from './Status'
import { PageHeader } from './PageHeader'
import { EntityRow, ListGroup } from './EntityRow'
import { Section } from './Section'
import { Input } from './Input'
import { Textarea } from './Textarea'

describe('TabLayout', () => {
  it('scrolls its strip, labels the panel by the active tab and switches tabs', () => {
    const onTabChange = vi.fn()
    render(
      <TabLayout
        label="Plan sections"
        tabs={[
          { id: 'tasks', label: 'Tasks', count: 3 },
          { id: 'notes', label: 'Notes' },
        ]}
        activeTab="tasks"
        onTabChange={onTabChange}
      >
        body
      </TabLayout>,
    )
    const list = screen.getByRole('tablist', { name: 'Plan sections' })
    expect(list.className).toContain('overflow-x-auto')
    const active = screen.getByRole('tab', { name: 'Tasks 3' })
    expect(active.getAttribute('aria-selected')).toBe('true')
    expect(active.id).toBe('tab-tasks')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('tab-tasks')
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    expect(onTabChange).toHaveBeenCalledWith('notes')
  })
})

describe('ViewTabs', () => {
  it('is a labelled segmented tablist', () => {
    const onChange = vi.fn()
    render(
      <ViewTabs
        label="Protocol views"
        value="runs"
        onChange={onChange}
        tabs={[
          { id: 'protocols', label: 'Protocols' },
          { id: 'runs', label: 'Runs', count: 2 },
        ]}
      />,
    )
    expect(screen.getByRole('tablist', { name: 'Protocol views' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Runs 2' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Protocols' }))
    expect(onChange).toHaveBeenCalledWith('protocols')
  })
})

describe('ViewToggle', () => {
  it('is a labelled group of two pressed/unpressed icon buttons', () => {
    const onChange = vi.fn()
    render(<ViewToggle value="list" onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'View mode' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe('true')
    const board = screen.getByRole('button', { name: 'Board view' })
    expect(board.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(board)
    expect(onChange).toHaveBeenCalledWith('kanban')
  })
})

describe('RowCheckbox', () => {
  it('is a checkbox that reports shift-clicks and never bubbles to the row', () => {
    const onToggle = vi.fn()
    const rowClick = vi.fn()
    render(
      <div onClick={rowClick}>
        <RowCheckbox checked={false} onToggle={onToggle} label="Select Auth flow" />
      </div>,
    )
    const box = screen.getByRole('checkbox', { name: 'Select Auth flow' })
    expect(box.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(box, { shiftKey: true })
    expect(onToggle).toHaveBeenCalledWith(true)
    expect(rowClick).not.toHaveBeenCalled()
  })
})

describe('ProgressLine', () => {
  it('clamps the value and exposes a progressbar', () => {
    render(<ProgressLine value={140} label="Step progress" />)
    const bar = screen.getByRole('progressbar', { name: 'Step progress' })
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
  })
})

describe('Meter / StatTiles', () => {
  it('renders a labelled meter, an inline value and a bare bar', () => {
    const { rerender, container } = render(<Meter label="Energy" value={0.62} />)
    const meter = screen.getByRole('meter', { name: 'Energy' })
    expect(meter.getAttribute('aria-valuenow')).toBe('62')
    expect(screen.getByText('62%')).toBeTruthy()
    rerender(<Meter size="inline" value={0.5} display="cohesion 50%" />)
    expect(screen.getByRole('meter', { name: 'cohesion 50%' })).toBeTruthy()
    rerender(<Meter size="bar" value={0.25} tone="warning" />)
    expect(screen.queryByRole('meter')).toBeNull()
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-hidden')).toBe('true')
  })

  it('skips hidden tiles', () => {
    render(<StatTiles items={[{ label: 'Files', value: 12 }, { label: 'Hidden', value: 0, hidden: true }]} />)
    expect(screen.getByText('Files')).toBeTruthy()
    expect(screen.queryByText('Hidden')).toBeNull()
  })
})

describe('ToneText', () => {
  it('shows the label in a tone with an optional dot', () => {
    const { container, rerender } = render(<ToneText tone="danger" label="Circuit open" />)
    expect(screen.getByText('Circuit open')).toBeTruthy()
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
    rerender(<ToneText tone="success" label="Allowed" dot={false} />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})

describe('PageHeader parent links', () => {
  it('names the link "<label>: <name>"', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Auth flow" parentLinks={[{ icon: Box, label: 'Project', name: 'Alpha', href: '/p/alpha' }]} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Project: Alpha' }).getAttribute('href')).toBe('/p/alpha')
  })
})

describe('EntityRow expanded rows', () => {
  it('exposes aria-expanded on the title control and keeps the menu name free of state', () => {
    render(
      <ul>
        <EntityRow
          title="Rotate keys often"
          onClick={() => {}}
          ariaLabel="Note: Rotate keys often"
          expanded={false}
          actions={[{ label: 'Remove', onClick: () => {} }]}
        />
      </ul>,
    )
    expect(screen.getByRole('button', { name: 'Note: Rotate keys often', expanded: false })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Actions for Note: Rotate keys often' })).toBeTruthy()
  })

  it('uses menuLabel when the title is not plain text', () => {
    render(
      <MemoryRouter>
        <ul>
          <EntityRow title={<em>x</em>} href="/x" ariaLabel="Open x" menuLabel="x" actions={[{ label: 'Edit', onClick: () => {} }]} />
        </ul>
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Actions for x' })).toBeTruthy()
  })
})

describe('ListGroup / Section headings', () => {
  it('separate the title from the count in the accessible name', () => {
    render(
      <>
        <ListGroup title="Enabled" count={1}>
          <li>a</li>
        </ListGroup>
        <Section title="Members" count={4}>
          b
        </Section>
      </>,
    )
    const group = screen.getByRole('region', { name: 'Enabled 1' })
    expect(within(group).getByRole('heading', { level: 3 }).textContent).toBe('Enabled 1')
    expect(screen.getByRole('region', { name: 'Members 4' })).toBeTruthy()
  })
})

describe('Input / Textarea', () => {
  it('are 16px on phones (no iOS zoom) and 14px from md', () => {
    render(
      <>
        <Input aria-label="Name" />
        <Textarea aria-label="Body" />
      </>,
    )
    expect(screen.getByLabelText('Name').className).toContain('text-base md:text-sm')
    expect(screen.getByLabelText('Body').className).toContain('text-base md:text-sm')
  })
})
