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
import { Button } from './Button'
import { HaloPointer } from './HaloPointer'

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

describe('Button', () => {
  it('is the glass recipe: `btn btn-<variant>`, a 36px target in size sm', () => {
    const { rerender } = render(<Button size="sm">Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    const has = (...cls: string[]) => cls.every((c) => btn.classList.contains(c))
    expect(has('btn', 'btn-primary', 'min-h-9')).toBe(true)
    expect(has('btn-flat')).toBe(false)
    expect(btn.className).not.toContain('btn-glow')
    rerender(<Button variant="secondary">Save</Button>)
    expect(has('btn', 'btn-secondary')).toBe(true)
    rerender(<Button variant="danger">Save</Button>)
    expect(has('btn', 'btn-danger')).toBe(true)
    rerender(<Button variant="ghost">Save</Button>)
    expect(has('btn', 'btn-ghost')).toBe(true)
  })

  it('`flat` drops the blur for dense rows and `loading` disables the button', () => {
    render(
      <Button size="sm" variant="secondary" flat loading>
        Start
      </Button>,
    )
    const btn = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement
    expect(btn.className).toContain('btn-flat')
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
  })
})

describe('HaloPointer', () => {
  it('installs nothing without a fine pointer', () => {
    const original = window.matchMedia
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
    const add = vi.spyOn(document, 'addEventListener')
    try {
      const { unmount } = render(<HaloPointer />)
      expect(add).not.toHaveBeenCalledWith('pointermove', expect.anything(), expect.anything())
      unmount()
    } finally {
      add.mockRestore()
      window.matchMedia = original
    }
  })

  it('writes --mx / --my on the hovered .btn with a fine pointer', () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: fine)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })
    try {
      const { unmount } = render(
        <>
          <HaloPointer />
          <Button>Glass</Button>
        </>,
      )
      const btn = screen.getByRole('button', { name: 'Glass' })
      fireEvent.pointerMove(btn, { pointerType: 'mouse', clientX: 12, clientY: 7 })
      expect(btn.style.getPropertyValue('--mx')).toBe('12px')
      expect(btn.style.getPropertyValue('--my')).toBe('7px')
      unmount()
    } finally {
      raf.mockRestore()
      window.matchMedia = original
    }
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
    const list = screen.getByRole('tablist', { name: 'Protocol views' })
    expect(list.className).toContain('seg')
    const active = screen.getByRole('tab', { name: 'Runs 2' })
    expect(active.className).toContain('seg-item')
    expect(active.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Protocols' }).getAttribute('aria-selected')).toBe('false')
    fireEvent.click(screen.getByRole('tab', { name: 'Protocols' }))
    expect(onChange).toHaveBeenCalledWith('protocols')
  })
})

describe('ViewToggle', () => {
  it('is a labelled group of two pressed/unpressed icon buttons', () => {
    const onChange = vi.fn()
    render(<ViewToggle value="list" onChange={onChange} />)
    expect(screen.getByRole('group', { name: 'View mode' })).toBeTruthy()
    const list = screen.getByRole('button', { name: 'List view' })
    expect(list.getAttribute('aria-pressed')).toBe('true')
    for (const c of ['btn', 'btn-ghost', 'btn-icon', 'size-9', 'md:size-8']) expect(list.classList.contains(c)).toBe(true)
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
