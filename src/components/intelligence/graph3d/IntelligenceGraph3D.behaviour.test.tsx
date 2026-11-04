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
import { graphScaleAtom, hoveredNodeIdAtom, selectedNodeIdAtom, showCommunityHullsAtom } from '@/atoms/intelligence'

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
  agents: [] as Array<Record<string, unknown>>,
}))

// The live agents, as GET /api/agents/live would list them.
vi.mock('@/hooks/useLiveAgents', () => ({
  useLiveAgents: () => ({ data: { agents: lib.agents }, status: 'ready', stale: false }),
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
  // The library's own camera: `new PerspectiveCamera()` (fov 50).
  const camera = new THREE.PerspectiveCamera()
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
  lib.agents = []
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
  mediaListeners.clear()
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: (_type: string, fn: () => void) => {
      if (!mediaListeners.has(query)) mediaListeners.set(query, new Set())
      mediaListeners.get(query)!.add(fn)
    },
    removeEventListener: (_type: string, fn: () => void) => {
      mediaListeners.get(query)?.delete(fn)
    },
  })) as unknown as typeof window.matchMedia
  rect = { width: 800, height: 600 }
  lib.fg = null as unknown as FakeGraph
  // SpriteText labels draw on a 2D canvas jsdom does not implement: a context
  // that accepts every call and measures text as 8 px per character.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, {
    get: (_t, key) => (key === 'measureText' ? (t: string) => ({ width: t.length * 8 }) : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, right: rect.width, bottom: rect.height, width: rect.width, height: rect.height, toJSON: () => ({}),
  }) as DOMRect)
})

/** Live matchMedia 'change' listeners, by query. */
const mediaListeners = new Map<string, Set<() => void>>()
const armed = (query: string) => mediaListeners.get(query)?.size ?? 0

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

/** Move the camera to k × its current offset from the orbit target, then end the gesture. */
function zoomTo(k: number, home: THREE.Vector3, target: THREE.Vector3) {
  const camera = lib.fg.camera()
  camera.position.copy(target).add(home.clone().sub(target).multiplyScalar(k))
  const controls = lib.fg.controls()
  act(() => {
    controls.dispatchEvent({ type: 'start' })
    controls.dispatchEvent({ type: 'change' })
    controls.dispatchEvent({ type: 'end' })
  })
}

/** What is drawn: elements (real nodes + groups) and how many are real nodes. */
function drawnCounts() {
  const nodes = (lib.props.graphData as { nodes: Array<{ id: string }> }).nodes
  return { elements: nodes.length, real: nodes.filter((n) => !n.id.startsWith('cl:')).length }
}

// Above the HLOD budget the scale is DYNAMIC (decision b7e6a1ad): no global
// level any more — these keep what the old level tests protected, measured on
// what is drawn.
describe('IntelligenceGraph3D — camera listeners', () => {
  it('attach when the library mounts AFTER the data (zoom out regroups)', async () => {
    await mountGraph(makeGraph(4200))
    await flush(3000)
    const home = lib.fg.camera().position.clone()
    const target = lib.fg.controls().target.clone()
    const before = drawnCounts()
    zoomTo(10, home, target)
    await flush(500)
    expect(drawnCounts().elements).toBeLessThan(before.elements)
  }, 60_000)
})

describe('IntelligenceGraph3D — dynamic zoom at the default framing', () => {
  it('a rotation at the framing distance changes nothing that is drawn', async () => {
    await mountGraph(makeGraph(4200))
    await flush(3000)
    expect(lib.fg.cameraPosition).toHaveBeenCalled()
    const before = lib.props.graphData
    const controls = lib.fg.controls()
    act(() => {
      controls.dispatchEvent({ type: 'start' })
      controls.dispatchEvent({ type: 'change' })
      controls.dispatchEvent({ type: 'end' })
    })
    await flush(500)
    // It used to fall to the raw detail on the first orbit (20 000 points,
    // 40 000 links); now the same cut must keep the same graph object.
    expect(lib.props.graphData).toBe(before)
  }, 60_000)

  it('zooming in opens more detail, zooming out regroups (monotone)', async () => {
    await mountGraph(makeGraph(4200))
    await flush(3000)
    const camera = lib.fg.camera()
    const controls = lib.fg.controls()
    const home = camera.position.clone()
    const target = controls.target.clone()
    const at = async (k: number) => {
      camera.position.copy(target).add(home.clone().sub(target).multiplyScalar(k))
      act(() => { controls.dispatchEvent({ type: 'end' }) })
      await flush(500)
      return drawnCounts()
    }
    const near = await at(0.4)
    const mid = await at(1)
    const far = await at(3)
    expect(near.real).toBeGreaterThanOrEqual(mid.real)
    expect(mid.real).toBeGreaterThanOrEqual(far.real)
    expect(near.real).toBeGreaterThan(far.real)
    expect(far.elements).toBeLessThan(near.elements)
  }, 60_000)
})

describe('IntelligenceGraph3D — a WebSocket flush does not rebuild the scene', () => {
  const sceneObjects = () => new Set(lib.fg.scene().children)
  /** Everything the component added (the library's lights excluded). */
  const drawn = () => [...sceneObjects()].filter((o) => !(o instanceof THREE.Light))
  /** Which of `before` were replaced (identity), named for the failure message. */
  const replaced = (before: Set<THREE.Object3D>) => {
    const after = sceneObjects()
    return [...before].filter((o) => !after.has(o)).map((o) => o.name || o.type)
  }

  it('detail tier: same entities → the same Points and link objects, updated in place', async () => {
    const g = makeGraph(2500)
    const view = await mountGraph(g)
    await flush(3000)
    const before = sceneObjects()
    // Points + links + the (empty) agent-marker group. The links must be there
    // although the library mounted after the data.
    expect(drawn().map((o) => o.type)).toEqual(expect.arrayContaining(['Points']))
    expect(drawn().length).toBeGreaterThanOrEqual(3)
    view.rerender(refresh(g))
    await flush(3000)
    expect(replaced(before)).toEqual([])
    expect(sceneObjects().size).toBe(before.size)
  }, 60_000)

  it('aggregated tier: same groups → the same labels / tubes / points', async () => {
    const g = makeGraph(4200)
    const view = await mountGraph(g)
    await flush(3000)
    const before = sceneObjects()
    view.rerender(refresh(g))
    await flush(3000)
    expect(replaced(before)).toEqual([])
    expect(sceneObjects().size).toBe(before.size)
  }, 60_000)

  it('a real change of the node set still rebuilds', async () => {
    const view = await mountGraph(makeGraph(2500))
    await flush(3000)
    const before = sceneObjects()
    view.rerender(makeGraph(2500, 'm'))
    await flush(3000)
    const after = sceneObjects()
    expect([...after].some((o) => !before.has(o))).toBe(true)
  }, 60_000)
})

describe('IntelligenceGraph3D — a kept scene follows a drag after a flush', () => {
  /** True when some vertex drawn by the component sits near `p`. */
  const drawnNear = (p: THREE.Vector3, tolerance = 60) => {
    let hit = false
    lib.fg.scene().traverse((o) => {
      const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
      const pos = geo?.getAttribute?.('position') as THREE.BufferAttribute | undefined
      if (!pos || hit) return
      const v = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i)
        if (v.distanceTo(p) < tolerance) { hit = true; return }
      }
    })
    return hit
  }

  it('the links of a node dragged after a same-structure flush move with it', async () => {
    const g = makeGraph(600) // sprite tier (draggable), optimized links
    const view = await mountGraph(g)
    await flush(3000)
    view.rerender(refresh(g))
    await flush(3000)
    // The library drags ITS node objects: those of the latest graphData prop.
    const nodes = (lib.props.graphData as { nodes: Array<{ id: string; x: number; y: number; z: number }> }).nodes
    const dragged = nodes[300]
    const far = new THREE.Vector3(9000, 9000, 9000)
    expect(drawnNear(far)).toBe(false)
    dragged.x = far.x
    dragged.y = far.y
    dragged.z = far.z
    act(() => { (lib.props.onNodeDrag as (n: unknown) => void)(dragged) })
    expect(drawnNear(far)).toBe(true)
  }, 60_000)
})

describe('IntelligenceGraph3D — an agent waiting on the user stays lit', () => {
  const actOf = (index: number) => {
    const points = lib.fg.scene().children.find((o) => o instanceof THREE.Points) as THREE.Points
    return (points.geometry.getAttribute('aAct') as THREE.BufferAttribute).getX(index)
  }

  it('a bulk restyle (selection) keeps the waiting_input activation on its node', async () => {
    lib.agents = [{ session_id: 'n7', title: 'agent', state: 'waiting_input' }]
    const view = await mountGraph(makeGraph(2500))
    await flush(3000)
    expect(actOf(7)).toBeGreaterThan(0.4)
    act(() => { view.store.set(selectedNodeIdAtom, 'n3') })
    await flush(500)
    expect(actOf(7)).toBeGreaterThan(0.4)
    act(() => { view.store.set(selectedNodeIdAtom, null) })
    await flush(500)
    expect(actOf(7)).toBeGreaterThan(0.4)
  }, 60_000)
})

describe('IntelligenceGraph3D — screen changes', () => {
  it('re-arms the resolution watch after a DPR change (a second move is still seen)', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    await mountGraph(makeGraph(60))
    await flush(500)
    expect(armed('(resolution: 2dppx)')).toBe(1)
    // The window is dragged to a 1× screen: the 2dppx query stops matching.
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 })
    act(() => { [...mediaListeners.get('(resolution: 2dppx)')!].forEach((fn) => fn()) })
    // The watch now follows the NEW ratio; the old one is released.
    expect(armed('(resolution: 1dppx)')).toBe(1)
    expect(armed('(resolution: 2dppx)')).toBe(0)
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 })
  })
})

describe('IntelligenceGraph3D — hull hover', () => {
  it('a raised hull is lowered when the pick effect re-subscribes (selection change)', async () => {
    const view = await mountGraph(makeGraph(1200))
    act(() => {
      view.store.set(graphScaleAtom, 1)
      view.store.set(showCommunityHullsAtom, true)
    })
    await flush(3000)
    const fills: THREE.Mesh[] = []
    lib.fg.scene().traverse((o) => {
      if (o instanceof THREE.Mesh && typeof (o.userData as { communityId?: number }).communityId === 'number') fills.push(o)
    })
    expect(fills.length).toBeGreaterThan(0)
    // Aim at a point just inside a hull's edge, far from the super-node at its centre.
    const camera = lib.fg.camera()
    camera.updateMatrixWorld()
    const container = view.container.firstElementChild as HTMLElement
    let raised: THREE.Mesh | null = null
    for (const fill of fills) {
      const pos = fill.geometry.getAttribute('position') as THREE.BufferAttribute
      fill.geometry.computeBoundingSphere()
      const c = fill.geometry.boundingSphere!.center
      const v = new THREE.Vector3().fromBufferAttribute(pos, 0).lerp(c, 0.1).project(camera)
      const before = (fill.material as THREE.MeshBasicMaterial).opacity
      act(() => {
        container.dispatchEvent(new PointerEvent('pointermove', {
          clientX: ((v.x + 1) / 2) * 800, clientY: ((1 - v.y) / 2) * 600, buttons: 0,
        }))
      })
      await flush(100)
      if ((fill.material as THREE.MeshBasicMaterial).opacity > before) { raised = fill; break }
    }
    expect(raised, 'no hull could be hovered').not.toBeNull()
    const lifted = (raised!.material as THREE.MeshBasicMaterial).opacity
    // A selection change re-subscribes the pick effect.
    act(() => { view.store.set(selectedNodeIdAtom, 'n1') })
    await flush(100)
    expect((raised!.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(lifted)
  }, 60_000)
})

describe('IntelligenceGraph3D — dynamic scale (HLOD)', () => {
  type Drawn = { nodes: Array<{ id: string; x: number; y: number; z: number; data: Record<string, unknown> }>; links: unknown[] }
  const drawn = () => lib.props.graphData as Drawn
  const isGroup = (id: string) => id.startsWith('cl:')

  it('a big graph opens as groups AND details chosen per element, not one global level', async () => {
    await mountGraph(makeGraph(9000))
    await flush(3000)
    const g = drawn()
    expect(g.nodes.length).toBeGreaterThan(0)
    // within the drawing budget (5 000 elements on a desktop), far below the 9 000 nodes
    expect(g.nodes.length).toBeLessThanOrEqual(5000)
    expect(g.nodes.length).toBeLessThan(9000)
    expect(g.nodes.some((n) => isGroup(n.id))).toBe(true)
  })

  it('flying close to a group opens it into its real nodes; the rest stays grouped', async () => {
    await mountGraph(makeGraph(9000))
    await flush(3000)
    const before = drawn()
    const target = before.nodes.filter((n) => isGroup(n.id)).sort((a, b) => (b.data.count as number) - (a.data.count as number))[0]
    expect(target).toBeDefined()
    const camera = lib.fg.camera()
    const controls = lib.fg.controls()
    const r = Math.max(1, (target.data.clusterRadius as number) ?? 1)
    act(() => {
      camera.position.set(target.x, target.y, target.z + r * 1.5)
      controls.target.set(target.x, target.y, target.z)
      controls.dispatchEvent({ type: 'end' })
    })
    await flush(100)
    const after = drawn()
    expect(after.nodes.some((n) => n.id === target.id)).toBe(false)
    expect(after.nodes.some((n) => !isGroup(n.id))).toBe(true)
    expect(after.nodes.some((n) => isGroup(n.id))).toBe(true)
  })

  it('an orbit that changes nothing on screen does not rebuild the drawn graph', async () => {
    await mountGraph(makeGraph(9000))
    await flush(3000)
    const before = drawn()
    act(() => { lib.fg.controls().dispatchEvent({ type: 'end' }) })
    await flush(100)
    expect(drawn()).toBe(before)
  })

  it('clicking a group flies the camera to it, and the group opens in place', async () => {
    await mountGraph(makeGraph(9000))
    await flush(3000)
    const camera = lib.fg.camera()
    camera.aspect = 800 / 600
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    // the group nearest to the camera: nothing stands in front of it
    const d = (n: { x: number; y: number; z: number }) => camera.position.distanceTo(new THREE.Vector3(n.x, n.y, n.z))
    const target = drawn().nodes
      .filter((n) => isGroup(n.id))
      .filter((n) => Math.abs(new THREE.Vector3(n.x, n.y, n.z).project(camera).x) < 0.9)
      .sort((a, b) => d(a) - d(b))[0]
    const v = new THREE.Vector3(target.x, target.y, target.z).project(camera)
    const clientX = ((v.x + 1) / 2) * 800
    const clientY = ((1 - v.y) / 2) * 600
    const el = document.querySelector('.absolute.inset-0.overflow-hidden') as HTMLElement
    act(() => {
      el.dispatchEvent(new MouseEvent('click', { clientX, clientY, bubbles: true }))
    })
    expect(lib.fg.cameraPosition).toHaveBeenLastCalledWith(
      expect.anything(),
      { x: target.x, y: target.y, z: target.z },
      900,
    )
    await flush(500)
    expect(drawn().nodes.some((n) => n.id === target.id)).toBe(false)
  })

  it('a moving camera does not re-cut (no rebuild mid-flight); the cut follows once it settles', async () => {
    await mountGraph(makeGraph(9000))
    await flush(3000)
    const camera = lib.fg.camera()
    const controls = lib.fg.controls()
    const target = controls.target.clone()
    const home = camera.position.clone()
    const before = lib.props.graphData
    // a 1 s flight towards the target, one 'change' every 50 ms
    for (let k = 1; k <= 20; k++) {
      camera.position.copy(target).add(home.clone().sub(target).multiplyScalar(1 - k * 0.045))
      act(() => { controls.dispatchEvent({ type: 'change' }) })
      await flush(50)
      expect(lib.props.graphData).toBe(before)
    }
    await flush(300)
    expect(lib.props.graphData).not.toBe(before)
  })

  it('a small graph is drawn as is (no tree, no grouping)', async () => {
    await mountGraph(makeGraph(200))
    await flush(3000)
    expect(drawn().nodes.length).toBe(200)
    expect(drawn().nodes.some((n) => isGroup(n.id))).toBe(false)
  })
})

describe('IntelligenceGraph3D — a late re-placement re-frames, unless the user moved', () => {
  /** The same nodes, now carrying backend communities: their groups change, they are re-placed. */
  const withCommunities = (g: { nodes: IntelligenceNode[]; edges: IntelligenceEdge[] }) => ({
    nodes: g.nodes.map((n, i) => ({ ...n, data: { ...n.data, community_id: i % 3, community_label: `m${i % 3}` } })),
    edges: g.edges,
  })

  it('re-frames a compact re-placement when nobody touched the camera', async () => {
    const g = makeGraph(60)
    const view = await mountGraph(g)
    await flush(3000)
    const framings = lib.fg.cameraPosition.mock.calls.length
    view.rerender(withCommunities(g))
    await flush(3000)
    expect(lib.fg.cameraPosition.mock.calls.length).toBe(framings + 1)
  })

  it('keeps the user\'s view when the camera was moved before the re-placement', async () => {
    const g = makeGraph(60)
    const view = await mountGraph(g)
    await flush(3000)
    const controls = lib.fg.controls()
    act(() => {
      controls.dispatchEvent({ type: 'start' })
      controls.dispatchEvent({ type: 'end' })
    })
    const framings = lib.fg.cameraPosition.mock.calls.length
    view.rerender(withCommunities(g))
    await flush(3000)
    expect(lib.fg.cameraPosition.mock.calls.length).toBe(framings)
  })
})

describe('IntelligenceGraph3D — the scale is read, not pressed', () => {
  it('shows what is drawn (nodes · groups) as a status next to the layers, with no button', async () => {
    await mountGraph(makeGraph(9000))
    await flush(3000)
    const el = document.querySelector('[data-testid="graph-scale-indicator"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('role')).toBe('status')
    expect(el.querySelector('button')).toBeNull()
    expect(el.className).toMatch(/top-3/)
    const nodes = (lib.props.graphData as { nodes: Array<{ id: string }> }).nodes
    const groups = nodes.filter((n) => n.id.startsWith('cl:')).length
    expect(groups).toBeGreaterThan(0)
    expect(el.textContent).toContain(String(groups))
  })
})

describe('IntelligenceGraph3D — framing in portrait (a phone)', () => {
  it('backs off enough for the graph to fit the NARROW horizontal angle', async () => {
    rect = { width: 390, height: 844 }
    await mountGraph(makeGraph(300))
    const camera = lib.fg.camera()
    camera.aspect = 390 / 844
    camera.updateProjectionMatrix()
    await flush(3000)
    const target = lib.fg.controls().target
    const nodes = (lib.props.graphData as { nodes: Array<{ x: number; y: number; z: number }> }).nodes
    let radius = 0
    for (const n of nodes) radius = Math.max(radius, Math.hypot(n.x - target.x, n.y - target.y, n.z - target.z))
    const vfov = (camera.fov * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect)
    const distance = camera.position.distanceTo(target)
    // the whole sphere inside the horizontal angle (the vertical alone let it overflow)
    expect(distance).toBeGreaterThanOrEqual(radius / Math.sin(hfov / 2))
  })
})
