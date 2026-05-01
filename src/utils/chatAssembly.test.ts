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

  it('drops a background_output when correlation_id matches no block (V1)', () => {
    // F10 will buffer + fall back to flat rendering; for V1 the orphan
    // simply doesn't attach anywhere — no crash, no flat rendering yet.
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
    // No tool_use was emitted, so nothing to attach to. The assembler
    // creates an empty assistant message at most; the key assertion is
    // that nothing crashed and no spurious block leaked through.
    const toolBlocks = messages.flatMap((m) =>
      m.blocks.filter((b) => b.type === 'tool_use'),
    )
    expect(toolBlocks).toHaveLength(0)
  })

  it('drops a background_output without correlation_id (no parent linkage possible)', () => {
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
