import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { EntityGroupPanel } from '../EntityGroupPanel'
import { highlightedGroupAtom } from '@/atoms/intelligence'
import { ENTITY_GROUP_CONFIGS, type EntityGroup, type GroupMode } from '@/types/fractal-graph'

const counts = { core: 5, code: 1200, knowledge: 3, git: 0, sessions: 2, features: 1, behavioral: 4 } as Record<EntityGroup, number>

function setup(
  modes: Array<[EntityGroup, GroupMode]> = [],
  props: Partial<React.ComponentProps<typeof EntityGroupPanel>> = {},
) {
  const store = createStore()
  const onCycle = vi.fn()
  const onEnableAll = vi.fn()
  const onResetDefaults = vi.fn()
  render(
    <Provider store={store}>
      <EntityGroupPanel
        groups={ENTITY_GROUP_CONFIGS}
        groupModes={new Map(modes)}
        counts={counts}
        onCycle={onCycle}
        onEnableAll={onEnableAll}
        onResetDefaults={onResetDefaults}
        {...props}
      />
    </Provider>,
  )
  return { store, onCycle, onEnableAll, onResetDefaults }
}

describe('EntityGroupPanel', () => {
  afterEach(() => vi.useRealTimers())

  it('renders nothing with a single group', () => {
    const { container } = render(
      <Provider store={createStore()}>
        <EntityGroupPanel groups={ENTITY_GROUP_CONFIGS.slice(0, 1)} groupModes={new Map()} counts={counts} onCycle={vi.fn()} onEnableAll={vi.fn()} onResetDefaults={vi.fn()} />
      </Provider>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('names every group with its count and mode; core cannot be toggled', () => {
    const { onCycle } = setup([['code', 'connections'], ['knowledge', 'expanded']])
    const core = screen.getByLabelText('Core: 5 entities, Expanded') as HTMLButtonElement
    expect(core.disabled).toBe(true)
    fireEvent.click(core)
    expect(onCycle).not.toHaveBeenCalled()
    const code = screen.getByLabelText('Code: 1200 entities, Connections — click to cycle')
    expect(code.textContent).toContain('1k+')
    expect(code.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(code)
    expect(onCycle).toHaveBeenCalledWith('code')
    const knowledge = screen.getByLabelText('Knowledge: 3 entities, Expanded — click to cycle')
    expect(knowledge.getAttribute('aria-pressed')).toBe('true')
    // an off group shows no count
    expect(screen.getByLabelText('Git: 0 entities, Off — click to cycle').textContent).toBe('')
  })

  it('offers to expand all, or to reset when all are expanded', () => {
    const a = setup()
    fireEvent.click(screen.getByText('All'))
    expect(a.onEnableAll).toHaveBeenCalled()
  })

  it('resets to defaults when every group is expanded', () => {
    const all = ENTITY_GROUP_CONFIGS.map((g) => [g.id, 'expanded'] as [EntityGroup, GroupMode])
    const a = setup(all)
    fireEvent.click(screen.getByText('All'))
    expect(a.onResetDefaults).toHaveBeenCalled()
  })

  it('shows a tooltip on hover without highlighting when hover is disabled', () => {
    const { store } = setup()
    const btn = screen.getByLabelText(/^Code: /)
    fireEvent.mouseEnter(btn)
    expect(screen.getByText(/1200 entities · Off · click to cycle/)).toBeTruthy()
    expect(store.get(highlightedGroupAtom)).toBeNull()
    fireEvent.mouseLeave(btn)
    expect(screen.queryByText(/1200 entities · Off/)).toBeNull()
  })

  it('highlights the hovered group, then clears it after a debounce', () => {
    vi.useFakeTimers()
    const { store } = setup([], { enableHover: true, direction: 'vertical' })
    const btn = screen.getByLabelText(/^Code: /)
    fireEvent.mouseEnter(btn)
    expect(store.get(highlightedGroupAtom)).toBeInstanceOf(Set)
    fireEvent.mouseLeave(btn)
    // re-entering cancels the pending clear
    fireEvent.mouseEnter(btn)
    act(() => { vi.advanceTimersByTime(300) })
    expect(store.get(highlightedGroupAtom)).not.toBeNull()
    fireEvent.mouseLeave(btn)
    act(() => { vi.advanceTimersByTime(300) })
    expect(store.get(highlightedGroupAtom)).toBeNull()
  })
})
