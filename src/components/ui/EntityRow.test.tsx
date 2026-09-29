import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { EntityRow, EntityList, ListGroup } from './EntityRow'
import { StatusDot } from './Status'

function renderInRouter(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/list']}>
      <Routes>
        <Route path="/list" element={ui} />
        <Route path="/items/:id" element={<div>detail page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('EntityRow', () => {
  it('renders title, trailing, description, meta line and context', () => {
    render(
      <ul>
        <EntityRow
          title="Auth flow"
          trailing="3h"
          description="Rework the login"
          meta={['backend', null, '3 tasks']}
          context={<span>ctx</span>}
        />
      </ul>,
    )
    expect(screen.getByText('Auth flow')).toBeTruthy()
    expect(screen.getByText('3h')).toBeTruthy()
    expect(screen.getByText('Rework the login')).toBeTruthy()
    expect(screen.getByText('backend')).toBeTruthy()
    expect(screen.getByText('3 tasks')).toBeTruthy()
    expect(screen.getByText('ctx')).toBeTruthy()
    // null meta item skipped → exactly one separator
    expect(screen.getAllByText('·')).toHaveLength(1)
  })

  it('navigates via its stretched link', () => {
    renderInRouter(
      <ul>
        <EntityRow title="Item 1" href="/items/1" />
      </ul>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'Item 1' }))
    expect(screen.getByText('detail page')).toBeTruthy()
  })

  it('calls onClick when rendered as a button row', () => {
    const onClick = vi.fn()
    render(
      <ul>
        <EntityRow title="Pick me" onClick={onClick} selected />
      </ul>,
    )
    const btn = screen.getByRole('button', { name: 'Pick me' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders a ⋯ menu from an actions array, named after the row', () => {
    render(
      <ul>
        <EntityRow title="Item 1" actions={[{ label: 'Edit', onClick: () => {} }]} />
      </ul>,
    )
    expect(screen.getByRole('button', { name: 'Actions for Item 1' })).toBeTruthy()
  })

  it('does not trigger the row when an inner control is used (click or Enter)', () => {
    const onRow = vi.fn()
    const onEdit = vi.fn()
    render(
      <ul>
        <EntityRow title="Row" onClick={onRow} actions={[{ label: 'Edit', onClick: onEdit }]} />
      </ul>,
    )
    const trigger = screen.getByRole('button', { name: 'Actions for Row' })
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onRow).not.toHaveBeenCalled()
  })

  it('does not navigate when the ⋯ menu inside a link row is used', () => {
    const onEdit = vi.fn()
    renderInRouter(
      <ul>
        <EntityRow title="Item 1" href="/items/1" actions={[{ label: 'Edit', onClick: onEdit }]} />
      </ul>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Item 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalled()
    expect(screen.queryByText('detail page')).toBeNull()
  })

  it('renders leading content and uses ariaLabel for non-string titles', () => {
    render(
      <ul>
        <EntityRow
          title={<strong>Rich</strong>}
          ariaLabel="Rich title"
          onClick={() => {}}
          leading={<StatusDot kind="task" status="failed" label="Failed" />}
          actions={[{ label: 'Delete', onClick: () => {} }]}
        />
      </ul>,
    )
    expect(screen.getByRole('img', { name: 'Failed' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rich title' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Actions for Rich title' })).toBeTruthy()
  })
})

describe('EntityList / ListGroup', () => {
  it('renders a list with rows', () => {
    render(
      <EntityList aria-label="Things">
        <EntityRow title="A" />
        <EntityRow title="B" />
      </EntityList>,
    )
    expect(screen.getByRole('list', { name: 'Things' })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows a titled group with count and collapses', () => {
    render(
      <ListGroup title="Today" count={2} collapsible>
        <EntityRow title="A" />
        <EntityRow title="B" />
      </ListGroup>,
    )
    expect(screen.getByRole('region', { name: /Today/ })).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: /Today/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(screen.queryByText('A')).toBeNull()
  })
})
