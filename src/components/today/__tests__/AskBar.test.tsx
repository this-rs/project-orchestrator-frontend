import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStore, Provider } from 'jotai'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { activeWorkspaceSlugAtom, chatDraftInputAtom, chatPanelModeAtom } from '@/atoms'
import { ASK_TEXT, buildDayContext } from '../text'
import { AskBar } from '../AskBar'

const renderBar = (props: Partial<React.ComponentProps<typeof AskBar>> = {}) => {
  const store = createStore()
  const view = render(
    <Provider store={store}>
      <MemoryRouter>
        <AskBar lane={null} hasWorkspace={true} {...props} />
      </MemoryRouter>
    </Provider>,
  )
  return { store, view }
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  try {
    window.localStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('AskBar: asking from the top of Today', () => {
  it('submit opens the panel and puts the text in the draft', () => {
    const { store } = renderBar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Organize my day' } })
    fireEvent.submit(screen.getByTestId('askbar'))

    expect(store.get(chatPanelModeAtom)).toBe('open')
    expect(store.get(chatDraftInputAtom)).toBe('Organize my day')
  })

  it('a suggestion sets the text and appends the day context', () => {
    const { store } = renderBar({
      plannedTasks: ['Rédiger le rapport', 'Préparer la démo'],
      waitingRequests: ['Peux-tu valider le plan ?'],
    })
    fireEvent.click(screen.getByRole('button', { name: ASK_TEXT.suggestions[0] }))

    const draft = store.get(chatDraftInputAtom)
    expect(store.get(chatPanelModeAtom)).toBe('open')
    expect(draft).toContain(ASK_TEXT.suggestions[0])
    expect(draft).toContain(ASK_TEXT.context.planned)
    expect(draft).toContain('Rédiger le rapport')
    expect(draft).toContain('Préparer la démo')
    expect(draft).toContain(ASK_TEXT.context.waiting)
    expect(draft).toContain('Peux-tu valider le plan ?')
  })

  it('without any workspace shows the create-workspace link and no field', () => {
    renderBar({ hasWorkspace: false })

    expect(screen.getByTestId('askbar-create-workspace')).toBeTruthy()
    expect(screen.getByRole('link', { name: ASK_TEXT.createWorkspace })).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByTestId('askbar')).toBeNull()
  })

  it('opens the chat in the lane workspace when one is filtered', () => {
    const { store } = renderBar({ lane: 'acme' })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a question' } })
    fireEvent.submit(screen.getByTestId('askbar'))

    expect(store.get(activeWorkspaceSlugAtom)).toBe('acme')
  })
})

describe('buildDayContext', () => {
  it('lists planned tasks and waiting requests, and is empty when there is nothing', () => {
    const text = buildDayContext(['A', 'B'], ['W1'])
    expect(text).toContain(ASK_TEXT.context.title)
    expect(text).toContain('A, B')
    expect(text).toContain('W1')
    expect(buildDayContext([], [])).toBe('')
  })
})
