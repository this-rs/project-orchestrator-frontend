/**
 * Generic drag by ROUTE: any <a href> to an entity page is that entity, with
 * no declaration in the screen that draws it. jsdom dispatches dragstart; the
 * real drag is checked in a browser.
 *
 * Run with: npx vitest run src/refs/source/__tests__/routeDetect.test.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { projectsAtom } from '@/atoms/projects'
import { workspacesAtom } from '@/atoms/workspaces'
import { chatDraftInputAtom, chatPanelModeAtom, chatServerFeaturesAtom } from '@/atoms'
import fixture from '../../__fixtures__/kinds_response.json'
import { HISTORICAL_KINDS, clearRefKinds, parseKindsResponse, setActiveKinds } from '../../kinds'
import { ReferenceSourceHost, draggingRefAtom, useReferenceSource } from '..'
import { PLAN_ID, TASK_ID, makeDataTransfer } from './testDnd'

const PERSONA_ID = '9a2c4e6f-0b1d-4385-a7c9-d1e3f5a7b9c0'
let store: ReturnType<typeof createStore>

function Row({ id, children }: { id: string; children: React.ReactNode }) {
  const props = useReferenceSource({ kind: 'task', id, label: 'A task' })
  return <div data-testid="row" {...props}>{children}</div>
}

function mount(ui: React.ReactNode, features: string[] | null = ['refs_v1']) {
  if (features) store.set(chatServerFeaturesAtom, features)
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ReferenceSourceHost />
        {ui}
      </MemoryRouter>
    </Provider>,
  )
}
const drag = (el: Element) => {
  const dt = makeDataTransfer({ 'text/uri-list': 'http://x/', 'text/plain': 'native' })
  fireEvent.dragStart(el, { dataTransfer: dt })
  return dt
}
const payload = (dt: DataTransfer) => (dt.getData('application/x-po-ref') ? JSON.parse(dt.getData('application/x-po-ref')) : null)

beforeEach(() => {
  store = createStore()
  setActiveKinds(parseKindsResponse(fixture.response)!)
})
afterEach(() => {
  vi.useRealTimers()
  clearRefKinds()
})

describe('drag of a link to an entity route', () => {
  it('turns a bare <a href> to a plan into the plan, with the link text as its display label', () => {
    mount(<a href={`/workspace/po/plans/${PLAN_ID}`}>Auth flow</a>)
    const dt = drag(screen.getByText('Auth flow'))
    expect(payload(dt)).toEqual({ kind: 'plan', id: PLAN_ID })
    expect(dt.getData('text/plain')).toBe(`#plan:${PLAN_ID}`)
    expect(dt.getData('text/uri-list')).toBe('')
    expect(store.get(draggingRefAtom)).toEqual({ kind: 'plan', id: PLAN_ID, label: 'Auth flow' })
  })

  it('works from an element nested in the link', () => {
    mount(<a href={`/workspace/po/tasks/${TASK_ID}`}><span><b>deep</b></span></a>)
    expect(payload(drag(screen.getByText('deep')))).toEqual({ kind: 'task', id: TASK_ID })
  })

  it('an actor link designates the actor, token with @', () => {
    mount(<a href={`/workspace/po/personas/${PERSONA_ID}`}>Reviewer</a>)
    const dt = drag(screen.getByText('Reviewer'))
    expect(payload(dt)).toEqual({ kind: 'persona', id: PERSONA_ID })
    expect(dt.getData('text/plain')).toBe(`@persona:${PERSONA_ID}`)
  })

  it('leaves a link that is not an entity alone: its native payload survives', () => {
    mount(<a href="/workspace/po/plans">All plans</a>)
    const dt = drag(screen.getByText('All plans'))
    expect(payload(dt)).toBeNull()
    expect(dt.getData('text/plain')).toBe('native')
    expect(store.get(draggingRefAtom)).toBeNull()
  })

  it('leaves an external link alone', () => {
    mount(<a href={`https://example.com/workspace/po/plans/${PLAN_ID}`}>ext</a>)
    expect(payload(drag(screen.getByText('ext')))).toBeNull()
  })

  it('a link to a kind the server does not resolve is not an entity (older server)', () => {
    setActiveKinds(HISTORICAL_KINDS)
    mount(<a href={`/workspace/po/personas/${PERSONA_ID}`}>Reviewer</a>)
    expect(payload(drag(screen.getByText('Reviewer')))).toBeNull()
  })

  it('does nothing without refs_v1', () => {
    mount(<a href={`/workspace/po/plans/${PLAN_ID}`}>Auth flow</a>, null)
    expect(payload(drag(screen.getByText('Auth flow')))).toBeNull()
  })

  it('data-po-ref="none" opts a link (or a whole region) out', () => {
    mount(<div data-po-ref="none"><a href={`/workspace/po/plans/${PLAN_ID}`}>nope</a></div>)
    expect(payload(drag(screen.getByText('nope')))).toBeNull()
  })

  it('data-po-ref-drag="off" on a link keeps its own drag', () => {
    mount(<a data-po-ref-drag="off" href={`/workspace/po/plans/${PLAN_ID}`}>mine</a>)
    expect(payload(drag(screen.getByText('mine')))).toBeNull()
  })
})

describe('slug pages (a project, a workspace) resolve from the lists the app holds', () => {
  const PROJECT_ID = '00333b5f-2d0a-4467-9c98-155e55d2b7e5'
  const WORKSPACE_ID = '7a1d9c34-52e8-4b6f-a0c3-1e8f4d2b6a95'

  it('a link to a project page is the project, by its slug', () => {
    store.set(projectsAtom, [{ id: PROJECT_ID, slug: 'my-project', name: 'P' } as never])
    mount(<a href="/workspace/po/projects/my-project">P</a>)
    expect(payload(drag(screen.getByText('P')))).toEqual({ kind: 'project', id: PROJECT_ID })
  })

  it('a link to a workspace overview is the workspace', () => {
    store.set(workspacesAtom, [{ id: WORKSPACE_ID, slug: 'po', name: 'PO' } as never])
    mount(<a href="/workspace/po/overview">PO</a>)
    expect(payload(drag(screen.getByText('PO')))).toEqual({ kind: 'workspace', id: WORKSPACE_ID })
  })

  it('an unknown slug (list not loaded) is not a reference', () => {
    mount(<a href="/workspace/po/projects/ghost">ghost</a>)
    expect(payload(drag(screen.getByText('ghost')))).toBeNull()
  })
})

describe('annotation and route together', () => {
  it('a link to ANOTHER entity inside a declared row is what was grabbed (the parent plan in a task row)', () => {
    mount(
      <Row id={TASK_ID}>
        <span>title</span>
        <a href={`/workspace/po/plans/${PLAN_ID}`}>parent plan</a>
      </Row>,
    )
    expect(payload(drag(screen.getByText('parent plan')))).toEqual({ kind: 'plan', id: PLAN_ID })
    expect(payload(drag(screen.getByText('title')))).toEqual({ kind: 'task', id: TASK_ID })
  })

  it('a link that is not an entity inside a declared row still drags the row', () => {
    mount(
      <Row id={TASK_ID}>
        <a href="/workspace/po/code">code</a>
      </Row>,
    )
    expect(payload(drag(screen.getByText('code')))).toEqual({ kind: 'task', id: TASK_ID })
  })
})

describe('the other ways in, for a plain link', () => {
  it('Alt+Shift+A on a focused entity link adds it to the chat', () => {
    mount(<a href={`/workspace/po/plans/${PLAN_ID}`}>Auth flow</a>)
    fireEvent.keyDown(screen.getByText('Auth flow'), { key: 'A', code: 'KeyA', altKey: true, shiftKey: true })
    expect(store.get(chatDraftInputAtom)).toContain(`#plan:${PLAN_ID}`)
    expect(store.get(chatPanelModeAtom)).toBe('open')
  })

  it('a long touch press on an entity link adds it, and the click that follows is swallowed', () => {
    vi.useFakeTimers()
    mount(<a href={`/workspace/po/plans/${PLAN_ID}`}>Auth flow</a>)
    const a = screen.getByText('Auth flow')
    fireEvent.pointerDown(a, { pointerType: 'touch', pointerId: 1, clientX: 5, clientY: 5 })
    vi.advanceTimersByTime(600)
    expect(store.get(chatDraftInputAtom)).toContain(`#plan:${PLAN_ID}`)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })
})
