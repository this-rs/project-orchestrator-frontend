/**
 * The `@` composer: same component, same rules as `#`, other sigil and other
 * kinds (the actors the server lists: persona, skill). Search answers are
 * mocked; the kinds are the backend's kinds fixture.
 *
 * Run with: npx vitest run src/components/chat/ChatInput.at.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { chatDraftInputAtom, chatSelectedProjectAtom, chatServerFeaturesAtom } from '@/atoms'
import kindsFixture from '@/refs/__fixtures__/kinds_response.json'
import { HISTORICAL_KINDS, clearRefKinds, parseKindsResponse, setActiveKinds } from '@/refs/kinds'
import { clearRefSearchCache } from '@/refs/useRefSearch'
import type { RefSearchItem } from '@/refs/refsApi'
import { ChatInput } from './ChatInput'

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }))
vi.mock('@/hooks', () => ({ useIsMobile: () => false }))
vi.mock('@/services/chat', () => ({ chatApi: { getPermissionConfig: () => Promise.resolve({ mode: 'default' }) } }))
vi.mock('@/services/documents', () => ({ documentsApi: { upload: vi.fn() } }))
vi.mock('@/refs/refsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/refs/refsApi')>()
  return { ...actual, refsApi: { search: searchMock } }
})

const PERSONA_ID = '57cf05c9-25b6-495d-ab07-de4b11d64736'
const SKILL_ID = '9a2c4e6f-0b1d-4385-a7c9-d1e3f5a7b9c0'
const PROJECT = { id: '00333b5f-2d0a-4467-9c98-155e55d2b7e5', slug: 'po', name: 'PO' }
const actors: RefSearchItem[] = [
  { kind: 'persona', id: PERSONA_ID, label: 'Reviewer', subtitle: 'Reviews diffs' },
  { kind: 'skill', id: SKILL_ID, label: 'Refactor' },
]

type Store = ReturnType<typeof createStore>
let store: Store
let onSend: ReturnType<typeof vi.fn>

function mount() {
  store.set(chatServerFeaturesAtom, ['refs_v1'])
  return render(
    <Provider store={store}>
      <ChatInput onSend={onSend} onQueue={vi.fn()} onQueueOp={() => {}} onInterrupt={() => {}} isStreaming={false} sessionId="s1" />
    </Provider>,
  )
}
const box = () => screen.getByRole('combobox') as HTMLTextAreaElement
const type = (text: string) => {
  const ta = box()
  fireEvent.change(ta, { target: { value: text } })
  ta.setSelectionRange(text.length, text.length)
  fireEvent.select(ta)
}
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(160) })
const key = (k: string) => fireEvent.keyDown(box(), { key: k })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  store = createStore()
  onSend = vi.fn()
  searchMock.mockReset()
  searchMock.mockResolvedValue(actors)
  clearRefSearchCache()
  localStorage.clear()
  setActiveKinds(parseKindsResponse(kindsFixture.response)!)
  store.set(chatSelectedProjectAtom, PROJECT)
})
afterEach(() => {
  vi.useRealTimers()
  clearRefKinds()
})

describe('ChatInput — @ actors', () => {
  it('opens on @, searches ONLY the actor kinds inside the project in view, and lists them', async () => {
    mount()
    type('ask @rev')
    expect(screen.getByTestId('ref-picker')).toBeTruthy()
    await settle()
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock.mock.calls[0][0]).toMatchObject({ q: 'rev', kinds: ['persona', 'skill'], projectId: PROJECT.id })
    const list = screen.getByRole('listbox', { name: 'Actors' })
    expect(box().getAttribute('aria-controls')).toBe(list.id)
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining('Reviewer'), expect.stringContaining('Refactor')])
    expect(options[0].textContent).toContain('Persona')
    expect(box().getAttribute('aria-activedescendant')).toBe(options[0].id)
  })

  it('Enter inserts @persona:uuid and a chip; the wire reference stays {kind, id}', async () => {
    mount()
    type('ask @')
    await settle()
    key('Enter')
    expect(box().value).toBe(`ask @persona:${PERSONA_ID} `)
    expect(screen.getByTestId('reference-chip').getAttribute('data-kind')).toBe('persona')
    key('Enter')
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend.mock.calls[0][0]).toBe(`ask @persona:${PERSONA_ID}`)
    expect(onSend.mock.calls[0][2]).toEqual([expect.objectContaining({ kind: 'persona', id: PERSONA_ID })])
    expect(Object.keys(onSend.mock.calls[0][2][0]).sort()).toEqual(expect.arrayContaining(['id', 'kind']))
  })

  it('a click on a skill inserts @skill:uuid', async () => {
    mount()
    type('@')
    await settle()
    fireEvent.click(screen.getAllByRole('option')[1])
    expect(box().value).toContain(`@skill:${SKILL_ID}`)
  })

  it('is not a trigger in an email, in a word or in code', async () => {
    mount()
    for (const text of ['write me@example.com', 'abc@x', '`@x', '```\n@x']) {
      type(text)
      await settle()
      expect(screen.queryByTestId('ref-picker'), text).toBeNull()
    }
    expect(searchMock).not.toHaveBeenCalled()
  })

  it('Escape closes it for this @, and the text is untouched', async () => {
    mount()
    type('@re')
    await settle()
    key('Escape')
    expect(screen.queryByTestId('ref-picker')).toBeNull()
    expect(box().value).toBe('@re')
  })

  it('says so when no project is in view and nothing comes back: actors are only suggested inside a project', async () => {
    store.set(chatSelectedProjectAtom, null)
    searchMock.mockResolvedValue([])
    mount()
    type('@')
    await settle()
    expect(searchMock.mock.calls[0][0].projectId).toBeUndefined()
    expect(screen.getByTestId('ref-picker-status').textContent).toBe('Select a project to search personas and skills')
  })

  it('says "No results" when a project is in view and nobody matches', async () => {
    searchMock.mockResolvedValue([])
    mount()
    type('@zzz')
    await settle()
    expect(screen.getByTestId('ref-picker-status').textContent).toBe('No results')
  })

  it('shows an honest empty state, and searches nothing, on a server that lists no actor kind', async () => {
    setActiveKinds(HISTORICAL_KINDS)
    mount()
    type('@')
    await settle()
    expect(screen.getByTestId('ref-picker-status').textContent).toBe('No actors available on this server')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByTestId('ref-picker-spinner')).toBeNull()
    expect(searchMock).not.toHaveBeenCalled()
    // Enter keeps its meaning: the message is sent, as typed.
    key('Enter')
    expect(onSend).toHaveBeenCalledWith('@', [])
  })

  it('# is unchanged: it searches the entity kinds and never the actors', async () => {
    mount()
    type('#')
    await settle()
    const asked = searchMock.mock.calls[0][0].kinds as string[]
    expect(asked).toContain('milestone')
    expect(asked).not.toContain('persona')
    expect(asked).not.toContain('skill')
    expect(searchMock.mock.calls[0][0].projectId).toBeUndefined()
  })

  it('a draft restored with an @ token shows its chip', () => {
    store.set(chatDraftInputAtom, `hello @persona:${PERSONA_ID}`)
    mount()
    expect(screen.getByTestId('reference-chip').getAttribute('data-kind')).toBe('persona')
  })
})
