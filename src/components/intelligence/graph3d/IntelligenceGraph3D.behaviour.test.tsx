/**
 * IntelligenceGraph3D, rendered — with the WebGL library replaced by a stand-in.
 *
 * `react-force-graph-3d` needs a WebGL context that jsdom does not have. The
 * stand-in below exposes exactly the ref methods the component calls (scene,
 * camera, controls, renderer, cameraPosition, zoomToFit, …) on REAL three.js
 * objects, records the camera moves, and reproduces the one library behaviour
 * these tests are about: with `cooldownTicks = 0`, three-forcegraph fires
 * `onEngineStop` on the first frame after EVERY prop update (its `update`
 * sets `engineRunning = true`). Everything else is the production component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import * as THREE from 'three'
import type { IntelligenceNode, IntelligenceEdge } from '@/types/intelligence'
import { hoveredNodeIdAtom } from '@/atoms/intelligence'

// ── The library stand-in ──────────────────────────────────────────────────────

class FakeControls extends THREE.EventDispatcher<{ start: object; end: object; change: object }> {
  target = new THREE.Vector3()
  maxDistance = Infinity
  enabled = true
  update() {}
}

interface FakeGraph {
  scene: () => THREE.Scene
  camera: () => THREE.PerspectiveCamera
  controls: () => FakeControls
  renderer: () => { setPixelRatio: (r: number) => void; getPixelRatio: () => number; setSize: () => void }
  cameraPosition: ReturnType<typeof vi.fn>
  zoomToFit: ReturnType<typeof vi.fn>
  cooldownTicks: ReturnType<typeof vi.fn>
  d3Force: () => null
  pauseAnimation: () => void
  resumeAnimation: () => void
}

const lib = vi.hoisted(() => ({
  fg: null as unknown as FakeGraph,
  props: {} as Record<string, unknown>,
  engineStops: 0,
  saves: 0,
}))

// savePositions, counted: it is the O(N) cost an idle onEngineStop must not pay.
vi.mock('./useGraph3DLayout', async (importOriginal) => {
  const React = await import('react')
  const m = await importOriginal<typeof import('./useGraph3DLayout')>()
  return {
    ...m,
    useGraph3DLayout: (...args: Parameters<typeof m.useGraph3DLayout>) => {
      const r = m.useGraph3DLayout(...args)
      const inner = r.savePositions
      const savePositions = React.useCallback((nodes: Parameters<typeof inner>[0]) => {
        lib.saves++
        inner(nodes)
      }, [inner])
      return { ...r, savePositions }
    },
  }
})

function makeFakeGraph(): FakeGraph {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 800 / 600, 1, 5000)
  camera.position.set(0, 0, 1000)
  const controls = new FakeControls()
  let ratio = 1
  const fg: FakeGraph = {
    scene: () => scene,
    camera: () => camera,
    controls: () => controls,
    renderer: () => ({ setPixelRatio: (r: number) => { ratio = r }, getPixelRatio: () => ratio, setSize: () => {} }),
    // A tween, collapsed to its end state: the camera lands where it was sent.
    cameraPosition: vi.fn((pos?: { x: number; y: number; z: number }, lookAt?: { x: number; y: number; z: number }) => {
      if (pos) camera.position.set(pos.x, pos.y, pos.z)
      if (lookAt) controls.target.set(lookAt.x, lookAt.y, lookAt.z)
      controls.dispatchEvent({ type: 'change' })
    }),
    zoomToFit: vi.fn(),
    cooldownTicks: vi.fn(),
    d3Force: () => null,
    pauseAnimation: () => {},
    resumeAnimation: () => {},
  }
  return fg
}

vi.mock('react-force-graph-3d', async () => {
  const React = await import('react')
  const Fake = React.forwardRef(function FakeForceGraph3D(props: Record<string, unknown>, ref) {
    const [fg] = React.useState(makeFakeGraph)
    lib.fg = fg
    lib.props = props
    React.useImperativeHandle(ref, () => fg, [fg])
    // three-forcegraph: any prop update restarts the (frozen) engine, which
    // stops again on the next frame → onEngineStop, every time.
    const values = Object.values(props)
    React.useEffect(() => {
      const id = setTimeout(() => {
        lib.engineStops++
        ;(props.onEngineStop as (() => void) | undefined)?.()
      }, 16)
      return () => clearTimeout(id)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, values)
    return null
  })
  return { default: Fake }
})

// Louvain runs in a Worker jsdom does not have: the fallback grouping is enough.
class NoWorker {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
}

// ── Environment ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  lib.engineStops = 0
  lib.saves = 0
  ;(globalThis as { Worker?: unknown }).Worker = NoWorker
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  rect = { width: 800, height: 600 }
  lib.fg = null as unknown as FakeGraph
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, right: rect.width, bottom: rect.height, width: rect.width, height: rect.height, toJSON: () => ({}),
  }) as DOMRect)
})

/** The container's size, as getBoundingClientRect reports it. */
let rect = { width: 800, height: 600 }

/** Mount with a 0×0 container (layout not done yet); `measure()` gives it a size. */
async function mountGraphUnmeasured(g: { nodes: IntelligenceNode[]; edges: IntelligenceEdge[] }) {
  rect = { width: 0, height: 0 }
  return mountGraph(g)
}
function measure() {
  rect = { width: 800, height: 600 }
  act(() => { window.dispatchEvent(new Event('resize')) })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── Fixtures ──────────────────────────────────────────────────────────────────

export function makeGraph(count: number, prefix = 'n'): { nodes: IntelligenceNode[]; edges: IntelligenceEdge[] } {
  const nodes: IntelligenceNode[] = []
  const edges: IntelligenceEdge[] = []
  for (let i = 0; i < count; i++) {
    const id = `${prefix}${i}`
    nodes.push({
      id,
      type: 'default',
      position: { x: 0, y: 0 },
      data: { label: id, entityType: 'file', layer: 'code', entityId: id, path: `src/dir${i % 7}/${id}.ts` },
    } as IntelligenceNode)
    if (i > 0) {
      edges.push({
        id: `e${i}`,
        source: `${prefix}${i - 1}`,
        target: id,
        data: { relationType: 'IMPORTS', layer: 'code' },
      } as IntelligenceEdge)
    }
  }
  return { nodes, edges }
}

/** A WebSocket flush: the SAME entities, as new objects (what the store hands over). */
export function refresh(g: { nodes: IntelligenceNode[]; edges: IntelligenceEdge[] }) {
  return {
    nodes: g.nodes.map((n) => ({ ...n, data: { ...n.data } })),
    edges: g.edges.map((e) => ({ ...e, data: { ...e.data! } })),
  }
}

let IntelligenceGraph3D: typeof import('./IntelligenceGraph3D').default

export async function mountGraph(g: { nodes: IntelligenceNode[]; edges: IntelligenceEdge[] }) {
  IntelligenceGraph3D ??= (await import('./IntelligenceGraph3D')).default
  const store = createStore()
  const view = render(
    <Provider store={store}>
      <IntelligenceGraph3D nodes={g.nodes} edges={g.edges} />
    </Provider>,
  )
  const rerender = (next: { nodes: IntelligenceNode[]; edges: IntelligenceEdge[] }) =>
    view.rerender(
      <Provider store={store}>
        <IntelligenceGraph3D nodes={next.nodes} edges={next.edges} />
      </Provider>,
    )
  return { ...view, store, rerender }
}

export const flush = (ms = 2000) => act(() => { vi.advanceTimersByTime(ms) })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IntelligenceGraph3D — first framing', () => {
  it('frames a graph whose data was there before the canvas was measured', async () => {
    // Opening the 3D view from the code map: the data is already loaded, the
    // library mounts only once the container has a size. The framing effect
    // must run on that mount, not only on a data change.
    await mountGraph(makeGraph(60))
    await flush(3000)
    expect(lib.fg.cameraPosition).toHaveBeenCalledTimes(1)
  })

  it('frames on mount even when the last update was a small one (needsRelayout = false)', async () => {
    // Loaded, then a WebSocket update adding one node (< 20 %: no relayout),
    // THEN the canvas gets its size: the view must still be framed once.
    const g = makeGraph(60)
    const view = await mountGraphUnmeasured(g)
    const grown = makeGraph(61)
    view.rerender(grown)
    await flush(500)
    expect(lib.fg).toBeNull()
    measure()
    await flush(3000)
    expect(lib.fg.cameraPosition).toHaveBeenCalledTimes(1)
  })

  it('a fullscreen toggle keeps the projection (no re-frame on a size change)', async () => {
    await mountGraph(makeGraph(60))
    await flush(3000)
    lib.fg.cameraPosition.mockClear()
    rect = { width: 1600, height: 1000 }
    await act(async () => { document.dispatchEvent(new Event('fullscreenchange')) })
    await flush(3000)
    expect(lib.fg.cameraPosition).not.toHaveBeenCalled()
    expect(lib.fg.camera().aspect).toBeCloseTo(1.6)
  })

  it('frames the graph with ONE camera move, never a second zoomToFit tween', async () => {
    const view = await mountGraph({ nodes: [], edges: [] })
    await flush(500)
    view.rerender(makeGraph(60))
    await flush(3000)
    expect(lib.fg.cameraPosition).toHaveBeenCalledTimes(1)
    // zoomToFit(800, 80) is the padding-80 framing the comments call a bug: it
    // used to land 100 ms after the computed framing and win.
    expect(lib.fg.zoomToFit).not.toHaveBeenCalled()
  })
})

describe('IntelligenceGraph3D — onEngineStop', () => {
  it('a hover re-fires onEngineStop (library) but costs no savePositions pass', async () => {
    const view = await mountGraph(makeGraph(60))
    await flush(3000)
    const saves = lib.saves
    const stops = lib.engineStops
    expect(saves).toBeGreaterThan(0) // the real layout was saved once
    act(() => { view.store.set(hoveredNodeIdAtom, 'n3') })
    await flush(100)
    act(() => { view.store.set(hoveredNodeIdAtom, 'n4') })
    await flush(100)
    act(() => { view.store.set(hoveredNodeIdAtom, null) })
    await flush(100)
    expect(lib.engineStops).toBeGreaterThan(stops) // the library did call back
    expect(lib.saves).toBe(saves)
  })

  it('still saves once a new layout lands', async () => {
    const g = makeGraph(60)
    const view = await mountGraph(g)
    await flush(3000)
    const saves = lib.saves
    view.rerender(makeGraph(80))
    await flush(3000)
    expect(lib.saves).toBe(saves + 1)
  })
})
