import { describe, it, expect } from 'vitest'
import { agentColor, agentLabelText, agentRgb, placeAgents, type AgentLike } from './agentMarkers'

const agent = (p: Partial<AgentLike> & { session_id: string }): AgentLike => ({
  title: 'Session',
  state: 'streaming',
  task_id: null,
  plan_id: null,
  ...p,
})

describe('agentColor', () => {
  it('is stable per session and differs between sessions', () => {
    expect(agentColor('s-1')).toBe(agentColor('s-1'))
    expect(agentColor('s-1')).not.toBe(agentColor('s-2'))
    expect(agentColor('s-1')).toMatch(/^hsl\(\d+, 85%, 62%\)$/)
  })

  it('agentRgb is a normalised colour', () => {
    const c = agentRgb('s-1')
    for (const v of [c.r, c.g, c.b]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

describe('placeAgents', () => {
  const has = (ids: string[]) => (id: string) => ids.includes(id)

  it('prefers the session node: the agent sits on its own conversation', () => {
    const r = placeAgents([agent({ session_id: 's-1', task_id: 't-1' })], has(['s-1', 't-1']))
    expect(r.placed).toHaveLength(1)
    expect(r.placed[0]).toMatchObject({ session_id: 's-1', nodeId: 's-1', anchor: 'session' })
    expect(r.unplaced).toEqual([])
  })

  it('falls back to the task (origin task_id, then associated), then the plan', () => {
    const byTask = placeAgents([agent({ session_id: 's-1', task_id: 't-1', plan_id: 'p-1' })], has(['t-1', 'p-1']))
    expect(byTask.placed[0]).toMatchObject({ nodeId: 't-1', anchor: 'task' })

    const byAssociated = placeAgents(
      [agent({ session_id: 's-1', task_id: 't-gone', associated_task_ids: ['t-2'], plan_id: 'p-1' })],
      has(['t-2', 'p-1']),
    )
    expect(byAssociated.placed[0]).toMatchObject({ nodeId: 't-2', anchor: 'task' })

    const byPlan = placeAgents([agent({ session_id: 's-1', plan_id: 'p-1' })], has(['p-1']))
    expect(byPlan.placed[0]).toMatchObject({ nodeId: 'p-1', anchor: 'plan' })

    const byAssociatedPlan = placeAgents([agent({ session_id: 's-1', associated_plan_ids: ['p-2'] })], has(['p-2']))
    expect(byAssociatedPlan.placed[0]).toMatchObject({ nodeId: 'p-2', anchor: 'plan' })
  })

  it('never invents a spot: an agent with no node on screen is reported, not drawn', () => {
    const r = placeAgents([agent({ session_id: 's-1', task_id: 't-1' }), agent({ session_id: 's-2' })], has(['s-2']))
    expect(r.placed.map((p) => p.session_id)).toEqual(['s-2'])
    expect(r.unplaced).toEqual(['s-1'])
  })

  it('keeps the state and gives each agent its colour', () => {
    const r = placeAgents([agent({ session_id: 's-1', state: 'waiting_input' })], has(['s-1']))
    expect(r.placed[0].state).toBe('waiting_input')
    expect(r.placed[0].color).toBe(agentColor('s-1'))
  })
})

describe('agentLabelText', () => {
  it('prefixes the state glyph and bounds the title', () => {
    expect(agentLabelText({ title: 'Fix the graph', state: 'streaming' })).toBe('▶ Fix the graph')
    expect(agentLabelText({ title: 'Waiting', state: 'waiting_input' })).toBe('⏸ Waiting')
    expect(agentLabelText({ title: 'Idle', state: 'idle' })).toBe('· Idle')
    const long = agentLabelText({ title: 'x'.repeat(60), state: 'idle' }, 10)
    expect(long).toBe('· ' + 'x'.repeat(9) + '…')
    expect(agentLabelText({ title: '   ', state: 'idle' })).toBe('· …')
  })
})
