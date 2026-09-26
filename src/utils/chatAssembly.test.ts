/**
 * Tests for the `background_output` grouping logic in `chatAssembly`
 * (F6 of plan 5985a7c4). The assembler attaches a tick to its parent
 * `tool_use` block via `correlation_id ↔ tool_call_id` matching,
 * surfacing as `metadata.child_outputs` for ToolCallBlock to render
 * (F5).
 */
import { describe, it, expect } from 'vitest'
import { historyEventsToMessages } from './chatAssembly'

describe('historyEventsToMessages — background_output grouping (F6)', () => {
  it('attaches a background_output to its parent tool_use by correlation_id', () => {
    const events = [
      {
        type: 'tool_use',
        id: 'toolu_M1',
        tool: 'Monitor',
        input: { command: 'tail -F /tmp/x.log', description: 'watch logs' },
        created_at: 1_700_000_000,
      },
      {
        type: 'background_output',
        source: 'Monitor',
        content: 'EVENT 1',
        received_at: '2026-05-01T10:00:01Z',
        correlation_id: 'toolu_M1',
        created_at: 1_700_000_001,
      },
      {
        type: 'background_output',
        source: 'Monitor',
        content: 'EVENT 2',
        received_at: '2026-05-01T10:00:05Z',
        correlation_id: 'toolu_M1',
        created_at: 1_700_000_005,
      },
    ]
    const messages = historyEventsToMessages(events)
    expect(messages).toHaveLength(1)
    const toolBlock = messages[0].blocks.find(
      (b) => b.type === 'tool_use' && b.metadata?.tool_call_id === 'toolu_M1',
    )
    expect(toolBlock).toBeDefined()
    const outputs = toolBlock?.metadata?.child_outputs as
      | Array<{ source: string; content: string }>
      | undefined
    expect(outputs).toHaveLength(2)
    expect(outputs?.[0].content).toBe('EVENT 1')
    expect(outputs?.[1].content).toBe('EVENT 2')
  })

  it('never attaches an orphan background_output to a tool_use (F10 folds it into background_activity)', () => {
    const events = [
      {
        type: 'background_output',
        source: 'Monitor',
        content: 'orphan event',
        received_at: '2026-05-01T10:00:00Z',
        correlation_id: 'toolu_NEVER_SEEN',
        created_at: 1_700_000_000,
      },
    ]
    const messages = historyEventsToMessages(events)
    // No tool_use was emitted, so nothing to attach to — no spurious
    // tool_use block, and the tick is kept as a background_activity block.
    const toolBlocks = messages.flatMap((m) =>
      m.blocks.filter((b) => b.type === 'tool_use'),
    )
    expect(toolBlocks).toHaveLength(0)
    const orphanBlocks = messages.flatMap((m) =>
      m.blocks.filter((b) => b.type === 'background_activity'),
    )
    expect(orphanBlocks).toHaveLength(1)
  })

  it('does not attach a background_output without correlation_id to a tool_use', () => {
    const events = [
      {
        type: 'tool_use',
        id: 'toolu_M1',
        tool: 'Monitor',
        input: {},
        created_at: 1_700_000_000,
      },
      {
        type: 'background_output',
        source: 'Monitor',
        content: 'no correlation',
        received_at: '2026-05-01T10:00:00Z',
        // correlation_id intentionally omitted
        created_at: 1_700_000_001,
      },
    ]
    const messages = historyEventsToMessages(events)
    const toolBlock = messages[0].blocks.find(
      (b) => b.type === 'tool_use' && b.metadata?.tool_call_id === 'toolu_M1',
    )
    expect(toolBlock?.metadata?.child_outputs).toBeUndefined()
    // …but it is still visible, as a background_activity block (F10).
    expect(messages[0].blocks.filter((b) => b.type === 'background_activity')).toHaveLength(1)
  })

  it('keeps multiple ticks in chronological insertion order', () => {
    const events = [
      {
        type: 'tool_use',
        id: 'toolu_M1',
        tool: 'Monitor',
        input: {},
        created_at: 1_700_000_000,
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        type: 'background_output',
        source: 'Monitor',
        content: `EVENT ${i + 1}`,
        received_at: `2026-05-01T10:00:0${i}Z`,
        correlation_id: 'toolu_M1',
        created_at: 1_700_000_001 + i,
      })),
    ]
    const messages = historyEventsToMessages(events)
    const toolBlock = messages[0].blocks.find(
      (b) => b.type === 'tool_use' && b.metadata?.tool_call_id === 'toolu_M1',
    )
    const outputs = toolBlock?.metadata?.child_outputs as
      | Array<{ content: string }>
      | undefined
    expect(outputs?.map((o) => o.content)).toEqual([
      'EVENT 1',
      'EVENT 2',
      'EVENT 3',
      'EVENT 4',
      'EVENT 5',
    ])
  })

  it('handles BashOutput source the same way as Monitor', () => {
    const events = [
      {
        type: 'tool_use',
        id: 'toolu_B1',
        tool: 'Bash',
        input: { command: 'cargo watch -x test', run_in_background: true },
        created_at: 1_700_000_000,
      },
      {
        type: 'background_output',
        source: 'BashOutput',
        content: 'compiling foo v0.1.0',
        received_at: '2026-05-01T10:00:01Z',
        correlation_id: 'toolu_B1',
        created_at: 1_700_000_001,
      },
    ]
    const messages = historyEventsToMessages(events)
    const bashBlock = messages[0].blocks.find(
      (b) => b.type === 'tool_use' && b.metadata?.tool_call_id === 'toolu_B1',
    )
    const outputs = bashBlock?.metadata?.child_outputs as
      | Array<{ source: string }>
      | undefined
    expect(outputs).toHaveLength(1)
    expect(outputs?.[0].source).toBe('BashOutput')
  })
})

// ---------------------------------------------------------------------------
// F10 — orphan tolerance
// ---------------------------------------------------------------------------

const orphanTick = (correlationId: string, i: number, source = 'Monitor') => ({
  type: 'background_output',
  source,
  content: `${correlationId} EVENT ${i}`,
  received_at: `2026-05-01T10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
  correlation_id: correlationId,
  created_at: 1_700_000_000 + i,
})

type ActivityMeta = {
  correlation_id?: string
  source: string
  count: number
  first_received_at: string
  last_received_at: string
  subagent_type?: string
  description?: string
  entries: Array<{ source: string; content: string; received_at: string }>
}

function activityBlocks(messages: ReturnType<typeof historyEventsToMessages>) {
  return messages.flatMap((m) => m.blocks.filter((b) => b.type === 'background_activity'))
}

describe('historyEventsToMessages — orphan background output (F10)', () => {
  it('folds 50 orphan ticks sharing one correlation_id into ONE background_activity block', () => {
    const events = Array.from({ length: 50 }, (_, i) => orphanTick('toolu_GONE', i))
    const messages = historyEventsToMessages(events)

    // The orphans are the only thing in the window: they must still
    // produce a renderable assistant message, not an empty conversation.
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('assistant')

    const blocks = activityBlocks(messages)
    expect(blocks).toHaveLength(1)
    const meta = blocks[0].metadata as unknown as ActivityMeta
    expect(meta.correlation_id).toBe('toolu_GONE')
    expect(meta.source).toBe('Monitor')
    expect(meta.count).toBe(50)
    expect(meta.first_received_at).toBe('2026-05-01T10:00:00Z')
    expect(meta.last_received_at).toBe('2026-05-01T10:00:49Z')
    // Only the last 20 entries are retained, oldest first.
    expect(meta.entries).toHaveLength(20)
    expect(meta.entries[0].content).toBe('toolu_GONE EVENT 30')
    expect(meta.entries[19].content).toBe('toolu_GONE EVENT 49')
    // The block's content mirrors the latest tick for the collapsed summary.
    expect(blocks[0].content).toBe('toolu_GONE EVENT 49')
    // No tool_use block was fabricated.
    expect(messages[0].blocks.filter((b) => b.type === 'tool_use')).toHaveLength(0)
  })

  it('keeps two interleaved correlation_ids as two blocks', () => {
    const events: unknown[] = []
    for (let i = 0; i < 10; i++) {
      events.push(orphanTick('toolu_A', i))
      events.push(orphanTick('toolu_B', i, 'BashOutput'))
    }
    const messages = historyEventsToMessages(events)
    const blocks = activityBlocks(messages)
    expect(blocks).toHaveLength(2)
    const metas = blocks.map((b) => b.metadata as unknown as ActivityMeta)
    expect(metas.map((m) => m.correlation_id)).toEqual(['toolu_A', 'toolu_B'])
    expect(metas.map((m) => m.count)).toEqual([10, 10])
    expect(metas.map((m) => m.source)).toEqual(['Monitor', 'BashOutput'])
    expect(metas[0].entries.every((e) => e.content.startsWith('toolu_A'))).toBe(true)
    expect(metas[1].entries.every((e) => e.content.startsWith('toolu_B'))).toBe(true)
  })

  it('starts a fresh block on the next assistant message (a user turn ends the group)', () => {
    const events = [
      orphanTick('toolu_A', 0),
      orphanTick('toolu_A', 1),
      { type: 'user_message', content: 'hello', created_at: 1_700_000_010 },
      orphanTick('toolu_A', 2),
    ]
    const messages = historyEventsToMessages(events)
    expect(messages.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant'])
    const blocks = activityBlocks(messages)
    expect(blocks).toHaveLength(2)
    expect((blocks[0].metadata as unknown as ActivityMeta).count).toBe(2)
    expect((blocks[1].metadata as unknown as ActivityMeta).count).toBe(1)
  })

  it('still nests a tick under its parent tool_use when the parent IS in the window (no regression)', () => {
    const events = [
      {
        type: 'tool_use',
        id: 'toolu_M1',
        tool: 'Monitor',
        input: { command: 'tail -F /tmp/x.log' },
        created_at: 1_700_000_000,
      },
      orphanTick('toolu_M1', 1),
      orphanTick('toolu_M1', 2),
      // A genuine orphan in the same window must not disturb the match.
      orphanTick('toolu_ELSEWHERE', 3),
      orphanTick('toolu_M1', 4),
    ]
    const messages = historyEventsToMessages(events)
    expect(messages).toHaveLength(1)
    const toolBlock = messages[0].blocks.find(
      (b) => b.type === 'tool_use' && b.metadata?.tool_call_id === 'toolu_M1',
    )
    const outputs = toolBlock?.metadata?.child_outputs as Array<{ content: string }> | undefined
    expect(outputs?.map((o) => o.content)).toEqual([
      'toolu_M1 EVENT 1',
      'toolu_M1 EVENT 2',
      'toolu_M1 EVENT 4',
    ])
    // Exactly one orphan block, for the id with no parent — none for toolu_M1.
    const blocks = activityBlocks(messages)
    expect(blocks).toHaveLength(1)
    expect((blocks[0].metadata as unknown as ActivityMeta).correlation_id).toBe('toolu_ELSEWHERE')
  })

  it('does not drop a workflow event (Workflow tool task_progress) and keys it by data.tool_use_id', () => {
    const progress = (i: number) => ({
      type: 'workflow',
      subtype: 'task_progress',
      data: {
        description: 'Research the codebase',
        last_tool_name: i % 2 ? 'Grep' : 'Read',
        task_id: 'task_1',
        tool_use_id: 'toolu_WF1',
        usage: { duration_ms: 1000 * i, tool_uses: i, total_tokens: 500 * i },
        subagent_type: 'researcher',
      },
      created_at: 1_700_000_100 + i,
    })
    const events = [progress(1), progress(2), progress(3)]
    const messages = historyEventsToMessages(events)
    expect(messages).toHaveLength(1)
    const blocks = activityBlocks(messages)
    expect(blocks).toHaveLength(1)
    const meta = blocks[0].metadata as unknown as ActivityMeta
    expect(meta.correlation_id).toBe('toolu_WF1')
    expect(meta.source).toBe('Workflow')
    expect(meta.count).toBe(3)
    expect(meta.subagent_type).toBe('researcher')
    expect(meta.description).toBe('Research the codebase')
    expect(meta.entries).toHaveLength(3)
    expect(meta.entries[2].content).toContain('task_progress')
    expect(meta.entries[2].content).toContain('Research the codebase')
    expect(meta.entries[2].content).toContain('Grep')
    // received_at falls back to the event timestamp when the payload has none.
    expect(meta.first_received_at).toBe(new Date(1_700_000_101 * 1000).toISOString())
  })

  it('nests a workflow tick under the Workflow tool_use when it is in the window', () => {
    const events = [
      { type: 'tool_use', id: 'toolu_WF1', tool: 'Workflow', input: {}, created_at: 1_700_000_000 },
      {
        type: 'workflow',
        subtype: 'task_progress',
        data: { description: 'x', tool_use_id: 'toolu_WF1', subagent_type: 'researcher' },
        created_at: 1_700_000_001,
      },
    ]
    const messages = historyEventsToMessages(events)
    const toolBlock = messages[0].blocks.find((b) => b.type === 'tool_use')
    expect(toolBlock?.metadata?.child_outputs).toHaveLength(1)
    expect(activityBlocks(messages)).toHaveLength(0)
  })
})
