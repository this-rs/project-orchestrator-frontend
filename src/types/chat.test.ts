import { describe, it, expect } from 'vitest'
import type {
  BackgroundTaskInfo,
  BackgroundTaskKind,
  CancelTaskResult,
  ChatEvent,
} from './chat'

/**
 * Wire-format compatibility tests for the new background-tasks types
 * (F1 of plan 5985a7c4). These assert that JSON payloads matching the
 * backend's `BackgroundTaskInfo` / `ChatEvent::ActiveTasksUpdate` /
 * `CancelTaskResult` serde output parse cleanly into the TypeScript
 * shapes — catches snake_case ↔ camelCase mismatches early.
 *
 * The backend reference shapes live in `src/chat/types.rs` and
 * `src/chat/manager.rs` of the PO backend (plan 754a1379).
 */
describe('background tasks wire format', () => {
  it('parses a BackgroundTaskInfo payload from the backend', () => {
    const payload = {
      id: 'toolu_01ABC',
      kind: 'monitor',
      description: 'tail -F /tmp/build.log',
      started_at: '2026-05-01T10:00:00Z',
      last_seen_at: '2026-05-01T10:00:05Z',
      pid: null,
      parent_tool_use_id: 'toolu_01ABC',
    }
    const info = payload as BackgroundTaskInfo
    expect(info.id).toBe('toolu_01ABC')
    expect(info.kind).toBe<BackgroundTaskKind>('monitor')
    expect(info.description).toBe('tail -F /tmp/build.log')
    expect(info.started_at).toBe('2026-05-01T10:00:00Z')
    expect(info.last_seen_at).toBe('2026-05-01T10:00:05Z')
    expect(info.pid).toBeNull()
    expect(info.parent_tool_use_id).toBe('toolu_01ABC')
  })

  it('accepts the bash_background kind variant', () => {
    const payload = {
      id: 'toolu_02XYZ',
      kind: 'bash_background',
      description: 'cargo watch -x test',
      started_at: '2026-05-01T11:00:00Z',
      last_seen_at: '2026-05-01T11:00:00Z',
    } as BackgroundTaskInfo
    expect(payload.kind).toBe<BackgroundTaskKind>('bash_background')
  })

  it('parses recovered entries with placeholder description', () => {
    // After a server restart the backend lazy-recovers via
    // `track_background_task_recovery_if_orphan` — recovered entries
    // carry this exact description placeholder.
    const payload = {
      id: 'toolu_recovered',
      kind: 'monitor',
      description: '(recovered after restart)',
      started_at: '2026-05-01T12:00:00Z',
      last_seen_at: '2026-05-01T12:00:00Z',
      pid: null,
      parent_tool_use_id: 'toolu_recovered',
    } as BackgroundTaskInfo
    expect(payload.description).toBe('(recovered after restart)')
  })

  it('parses an active_tasks_update ChatEvent', () => {
    const event: ChatEvent = {
      type: 'active_tasks_update',
      tasks: [
        {
          id: 'toolu_01ABC',
          kind: 'monitor',
          description: 'tail',
          started_at: '2026-05-01T10:00:00Z',
          last_seen_at: '2026-05-01T10:00:00Z',
        },
      ],
    }
    if (event.type === 'active_tasks_update') {
      expect(event.tasks).toHaveLength(1)
      expect(event.tasks[0].id).toBe('toolu_01ABC')
    } else {
      throw new Error('expected active_tasks_update variant')
    }
  })

  it('accepts an empty tasks snapshot (legitimate value)', () => {
    // Backend emits an empty `tasks: []` whenever the map drops to
    // zero entries — the frontend uses this to clear its toolbar pill.
    const event: ChatEvent = { type: 'active_tasks_update', tasks: [] }
    if (event.type === 'active_tasks_update') {
      expect(event.tasks).toHaveLength(0)
    }
  })

  it('parses a CancelTaskResult', () => {
    const result: CancelTaskResult = {
      task_id: 'toolu_abc',
      killed_pids: [],
      capped: false,
    }
    expect(result.task_id).toBe('toolu_abc')
    expect(result.killed_pids).toHaveLength(0)
    expect(result.capped).toBe(false)
  })

  it('parses a CancelTaskResult with capped=true (rate cap hit)', () => {
    const result: CancelTaskResult = {
      task_id: 'toolu_xyz',
      killed_pids: [],
      capped: true,
    }
    expect(result.capped).toBe(true)
    expect(result.killed_pids).toHaveLength(0)
  })

  it('still parses background_output with correlation_id (3-name aliasing)', () => {
    // Sanity: F1 must NOT have broken the existing background_output
    // shape — its `correlation_id` is what binds it to a
    // BackgroundTaskInfo.id on the frontend.
    const event: ChatEvent = {
      type: 'background_output',
      source: 'Monitor',
      content: 'EVENT 1',
      received_at: '2026-05-01T10:00:00Z',
      correlation_id: 'toolu_01ABC',
    }
    if (event.type === 'background_output') {
      expect(event.correlation_id).toBe('toolu_01ABC')
    }
  })
})
