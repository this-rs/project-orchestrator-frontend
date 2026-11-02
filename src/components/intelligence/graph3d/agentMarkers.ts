// ============================================================================
// agentMarkers — the agents running now, drawn on the node they work on
// ============================================================================
//
// WHERE THE DATA COMES FROM. The real-time socket does NOT push the list of
// agents nor what they work on: `chat_session updated {is_streaming}` says a
// session started or stopped a turn, nothing more. The list is REST —
// `GET /api/agents/live` (useLiveAgents: 5 s poll while the tab is visible,
// re-read at once on `attention_changed`). Each agent names its session, its
// state (`waiting_input` / `streaming` / `idle`), and the work it declared:
// `task_id` (runner / delegate origin), `associated_task_ids` /
// `associated_plan_ids` (ASSOCIATED_WITH, set when the agent moves a task to
// in_progress), `plan_id`.
//
// WHERE IT IS DRAWN. The project graph export gives every LIVE session its
// `chat_session` node (id = session UUID, chat layer, DISCUSSED edges to the
// files it mentioned), so the first choice is that node: the agent then sits
// on its own conversation, linked to what it touched. Without it (chat layer
// hidden, session of another project) the marker falls back to the task it
// works on, then its plan. An agent with no node on screen is NOT drawn — it
// is counted in `unplaced` so the UI can say so instead of inventing a spot.
//
// The marker is a billboard label (three-spritetext, as superNodeLabels) in a
// colour derived from the session id, above the node. The node itself is lit
// by the Points shader's `aAct` through useAgentMarkers (breathing while the
// agent streams, steady while it waits, nothing while idle).
// ============================================================================

import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import type { Graph3DNode } from './useGraph3DLayout'

/** The fields of a live agent this module reads (subset of LiveAgent). */
export interface AgentLike {
  session_id: string
  title: string
  state: 'waiting_input' | 'streaming' | 'idle'
  task_id?: string | null
  plan_id?: string | null
  associated_task_ids?: string[] | null
  associated_plan_ids?: string[] | null
}

export interface PlacedAgent {
  session_id: string
  title: string
  state: AgentLike['state']
  /** Id of the graph node the marker sits on. */
  nodeId: string
  /** Why this node: the session's own node, or a fallback. */
  anchor: 'session' | 'task' | 'plan'
  /** CSS colour of the marker, stable per session. */
  color: string
}

export interface AgentPlacement {
  placed: PlacedAgent[]
  /** Agents with no node on screen (reported, never drawn somewhere invented). */
  unplaced: string[]
}

/** Deterministic hue per session: the same session keeps its colour across polls. */
export function agentColor(sessionId: string): string {
  let h = 2166136261
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  const hue = h % 360
  return `hsl(${hue}, 85%, 62%)`
}

/** Hex-free RGB (0..1) of `agentColor`, for the Points shader. */
export function agentRgb(sessionId: string): { r: number; g: number; b: number } {
  const c = new THREE.Color(agentColor(sessionId))
  return { r: c.r, g: c.g, b: c.b }
}

/**
 * Resolve each agent to a node of the graph. Pure: `hasNode` is the only
 * contact with the graph. Idle agents are placed too (they have a node) but
 * the caller decides what an idle marker looks like.
 */
export function placeAgents(agents: readonly AgentLike[], hasNode: (id: string) => boolean): AgentPlacement {
  const placed: PlacedAgent[] = []
  const unplaced: string[] = []
  for (const a of agents) {
    let nodeId: string | null = null
    let anchor: PlacedAgent['anchor'] = 'session'
    if (hasNode(a.session_id)) {
      nodeId = a.session_id
    } else {
      const tasks = [a.task_id, ...(a.associated_task_ids ?? [])].filter((t): t is string => !!t)
      const task = tasks.find(hasNode)
      if (task) {
        nodeId = task
        anchor = 'task'
      } else {
        const plans = [a.plan_id, ...(a.associated_plan_ids ?? [])].filter((p): p is string => !!p)
        const plan = plans.find(hasNode)
        if (plan) {
          nodeId = plan
          anchor = 'plan'
        }
      }
    }
    if (!nodeId) {
      unplaced.push(a.session_id)
      continue
    }
    placed.push({
      session_id: a.session_id,
      title: a.title,
      state: a.state,
      nodeId,
      anchor,
      color: agentColor(a.session_id),
    })
  }
  return { placed, unplaced }
}

/** Marker text: a state glyph and the title, bounded. */
export function agentLabelText(a: Pick<PlacedAgent, 'title' | 'state'>, maxChars = 28): string {
  const glyph = a.state === 'streaming' ? '▶' : a.state === 'waiting_input' ? '⏸' : '·'
  const title = (a.title || '').trim() || '…'
  const cut = title.length > maxChars ? title.slice(0, maxChars - 1) + '…' : title
  return `${glyph} ${cut}`
}

// ── Three.js part ─────────────────────────────────────────────────────────────

/** World-unit height of a marker label. */
const MARKER_TEXT_HEIGHT = 3.2
/** Gap between the node and its label, world units. */
const MARKER_OFFSET = 6

type SpriteTextInstance = SpriteText & THREE.Object3D

export interface AgentMarkers {
  readonly group: THREE.Group
  /** Replace the drawn set; sprites are reused per session id. */
  set: (placed: readonly PlacedAgent[], nodeById: (id: string) => Graph3DNode | undefined) => void
  /** Re-anchor every label above its (mutable) node position. */
  updatePositions: () => void
  /** Number of markers drawn. */
  readonly count: number
  dispose: () => void
}

export function createAgentMarkers(): AgentMarkers {
  const group = new THREE.Group()
  group.renderOrder = 20
  const sprites = new Map<string, { sprite: SpriteTextInstance; nodeId: string; text: string }>()
  let resolve: (id: string) => Graph3DNode | undefined = () => undefined

  const disposeSprite = (s: SpriteTextInstance) => {
    const mat = s.material as THREE.SpriteMaterial | undefined
    mat?.map?.dispose()
    mat?.dispose()
  }

  const set: AgentMarkers['set'] = (placed, nodeById) => {
    resolve = nodeById
    const keep = new Set<string>()
    for (const p of placed) {
      keep.add(p.session_id)
      const text = agentLabelText(p)
      const cur = sprites.get(p.session_id)
      if (cur) {
        cur.nodeId = p.nodeId
        if (cur.text !== text) {
          cur.text = text
          cur.sprite.text = text
        }
        continue
      }
      const sprite = new SpriteText(text) as SpriteTextInstance
      sprite.textHeight = MARKER_TEXT_HEIGHT
      sprite.color = p.color
      sprite.backgroundColor = 'rgba(10, 12, 18, 0.78)'
      sprite.borderColor = p.color
      sprite.borderWidth = 0.4
      sprite.borderRadius = 4
      sprite.padding = [6, 3]
      sprite.renderOrder = 20
      group.add(sprite)
      sprites.set(p.session_id, { sprite, nodeId: p.nodeId, text })
    }
    for (const [sid, entry] of sprites) {
      if (keep.has(sid)) continue
      group.remove(entry.sprite)
      disposeSprite(entry.sprite)
      sprites.delete(sid)
    }
    updatePositions()
  }

  const updatePositions = () => {
    for (const entry of sprites.values()) {
      const n = resolve(entry.nodeId)
      if (!n) {
        entry.sprite.visible = false
        continue
      }
      entry.sprite.visible = true
      entry.sprite.position.set(n.x ?? 0, (n.y ?? 0) + MARKER_OFFSET, n.z ?? 0)
    }
  }

  const dispose = () => {
    for (const entry of sprites.values()) {
      group.remove(entry.sprite)
      disposeSprite(entry.sprite)
    }
    sprites.clear()
  }

  return {
    group,
    set,
    updatePositions,
    get count() {
      return sprites.size
    },
    dispose,
  }
}
