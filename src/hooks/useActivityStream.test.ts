/**
 * Tests for `useActivityStream` — the React hook that combines the REST
 * snapshot with the live WS stream.
 *
 * The hook is heavily side-effecting, so we exercise the *reducer* directly
 * for unit-level coverage (snapshot seed, event apply, lag resync, replay
 * idempotency) and rely on the WebSocket tests in `activityWs.test.ts` for
 * the network layer. This split keeps these tests fast and deterministic.
 *
 * Run with: npx vitest run src/hooks/useActivityStream.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  activityStreamReducer,
  initialActivityStreamState,
  type ActivityStreamState,
} from './useActivityStream'
import type {
  ActivityEvent,
  ActivitySnapshot,
  PlanRunSummary,
  ProtocolRunSummary,
} from '@/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const planRun: PlanRunSummary = {
  run_id: 'run-1',
  plan_id: 'plan-1',
  plan_title: 'Bootstrap',
  total_tasks: 4,
  current_wave: 1,
  completed_tasks: 0,
  failed_tasks: 0,
  status: 'running',
  cost_usd: 0,
  started_at: '2026-05-21T10:00:00Z',
}

const protoRun: ProtocolRunSummary = {
  id: 'proto-1',
  protocol_id: 'p-uuid',
  protocol_name: 'Review',
  current_state: 's-uuid',
  state_name: 'InReview',
  status: 'running',
  states_visited: 0,
  started_at: '2026-05-21T10:05:00Z',
  depth: 0,
}

const sampleSnapshot: ActivitySnapshot = {
  plan_runs: [planRun],
  protocol_runs: [protoRun],
  chat_sessions: [],
  last_event_seq: 10,
}

function runnerEvent(seq: number, run_id = 'run-1', overrides: Partial<{ event: string }> = {}): ActivityEvent {
  return {
    kind: 'runner',
    seq,
    timestamp: '2026-05-21T10:01:00Z',
    run_id,
    event: {
      event: (overrides.event as 'task_started') ?? 'task_started',
      run_id,
      task_id: 't-' + seq,
      task_title: 'Task ' + seq,
      wave_number: 1,
    } as ActivityEvent extends { kind: 'runner'; event: infer R } ? R : never,
  }
}

// ---------------------------------------------------------------------------
// Reducer — load_success seeds the runs Map from snapshot
// ---------------------------------------------------------------------------

describe('activityStreamReducer — load_success', () => {
  it('seeds runs Map with one entry per plan_run + protocol_run', () => {
    const next = activityStreamReducer(initialActivityStreamState, {
      type: 'load_success',
      snapshot: sampleSnapshot,
    })

    expect(next.status).toBe('live')
    expect(next.error).toBeNull()
    expect(next.snapshot).toBe(sampleSnapshot)
    expect(next.lastEventSeq).toBe(10)

    expect(next.runs.size).toBe(2)
    expect(next.runs.get('run-1')?.kind).toBe('plan')
    expect(next.runs.get('run-1')?.title).toBe('Bootstrap')
    expect(next.runs.get('proto-1')?.kind).toBe('protocol')
    expect(next.runs.get('proto-1')?.state_name).toBe('InReview')
  })

  it('starts in loading status on load_start', () => {
    const next = activityStreamReducer(initialActivityStreamState, { type: 'load_start' })
    expect(next.status).toBe('loading')
  })

  it('transitions to error on load_error and stores the message', () => {
    const next = activityStreamReducer(initialActivityStreamState, {
      type: 'load_error',
      error: 'boom',
    })
    expect(next.status).toBe('error')
    expect(next.error).toBe('boom')
  })
})

// ---------------------------------------------------------------------------
// Reducer — event application
// ---------------------------------------------------------------------------

describe('activityStreamReducer — event application', () => {
  function seeded(): ActivityStreamState {
    return activityStreamReducer(initialActivityStreamState, {
      type: 'load_success',
      snapshot: sampleSnapshot,
    })
  }

  it('applies a task_started runner event to the existing run entry', () => {
    const before = seeded()
    const after = activityStreamReducer(before, {
      type: 'event',
      event: {
        kind: 'runner',
        seq: 11,
        timestamp: '2026-05-21T10:02:00Z',
        run_id: 'run-1',
        event: {
          event: 'task_started',
          run_id: 'run-1',
          task_id: 't-99',
          task_title: 'Build the universe',
          wave_number: 2,
        },
      },
    })

    expect(after.lastEventSeq).toBe(11)
    expect(after.runs.get('run-1')?.current_task_id).toBe('t-99')
    expect(after.runs.get('run-1')?.current_task_title).toBe('Build the universe')
    expect(after.runs.get('run-1')?.current_wave).toBe(2)
    // The events ring buffer must contain the new event.
    expect(after.events).toHaveLength(1)
  })

  it('increments completed_tasks and cost on task_completed', () => {
    const before = seeded()
    const after = activityStreamReducer(before, {
      type: 'event',
      event: {
        kind: 'runner',
        seq: 12,
        timestamp: '2026-05-21T10:03:00Z',
        run_id: 'run-1',
        event: {
          event: 'task_completed',
          run_id: 'run-1',
          task_id: 't-99',
          task_title: 'X',
          cost_usd: 0.42,
          duration_secs: 17,
        },
      },
    })
    expect(after.runs.get('run-1')?.completed_tasks).toBe(1)
    expect(after.runs.get('run-1')?.cost_usd).toBeCloseTo(0.42)
  })

  it('updates protocol run on protocol_progress event', () => {
    const before = seeded()
    const after = activityStreamReducer(before, {
      type: 'event',
      event: {
        kind: 'protocol_progress',
        seq: 13,
        timestamp: '2026-05-21T10:04:00Z',
        run_id: 'proto-1',
        protocol_id: 'p-uuid',
        current_state: 'new-state-uuid',
        state_name: 'Approved',
        status: 'running',
      },
    })
    expect(after.runs.get('proto-1')?.state_name).toBe('Approved')
    expect(after.runs.get('proto-1')?.current_state).toBe('new-state-uuid')
    expect(after.runs.get('proto-1')?.last_seq).toBe(13)
  })

  it('drops re-applied events whose seq <= lastEventSeq (idempotent replay)', () => {
    // Snapshot says last_event_seq=10. Replaying seq=5 must not mutate runs.
    const before = seeded()
    const initialRunsRef = before.runs
    const after = activityStreamReducer(before, {
      type: 'event',
      event: runnerEvent(5),
    })
    // Same Map reference → React skips re-renders.
    expect(after.runs).toBe(initialRunsRef)
    // But the event was still pushed to the buffer (for the replay log).
    expect(after.events).toHaveLength(1)
    expect(after.events[0]?.seq).toBe(5)
    expect(after.lastEventSeq).toBe(10)
  })

  it('applies events strictly newer than the snapshot cursor', () => {
    const before = seeded()
    // seq=11 > lastEventSeq=10 → applied.
    const after = activityStreamReducer(before, {
      type: 'event',
      event: runnerEvent(11),
    })
    expect(after.lastEventSeq).toBe(11)
    expect(after.runs.get('run-1')?.last_seq).toBe(11)
  })

  it('caps the events buffer at 500 entries', () => {
    let st = activityStreamReducer(initialActivityStreamState, {
      type: 'load_success',
      snapshot: { ...sampleSnapshot, last_event_seq: 0 },
    })
    for (let i = 1; i <= 600; i++) {
      st = activityStreamReducer(st, { type: 'event', event: runnerEvent(i) })
    }
    expect(st.events.length).toBe(500)
    // Newest should be seq=600, oldest seq=101 (i.e. we dropped 1..100).
    expect(st.events[st.events.length - 1].seq).toBe(600)
    expect(st.events[0].seq).toBe(101)
  })
})

// ---------------------------------------------------------------------------
// Reducer — lag_resync re-seeds the state
// ---------------------------------------------------------------------------

describe('activityStreamReducer — lag_resync', () => {
  it('replaces snapshot + runs Map and advances lastEventSeq', () => {
    const before: ActivityStreamState = activityStreamReducer(initialActivityStreamState, {
      type: 'load_success',
      snapshot: sampleSnapshot,
    })

    const fresh: ActivitySnapshot = {
      plan_runs: [{ ...planRun, run_id: 'run-2', completed_tasks: 3 }],
      protocol_runs: [],
      chat_sessions: [],
      last_event_seq: 42,
    }

    const after = activityStreamReducer(before, { type: 'lag_resync', snapshot: fresh })

    expect(after.lastEventSeq).toBe(42)
    expect(after.runs.size).toBe(1)
    expect(after.runs.get('run-2')?.completed_tasks).toBe(3)
    expect(after.runs.get('run-1')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Reducer — WS status mapping
// ---------------------------------------------------------------------------

describe('activityStreamReducer — ws_status', () => {
  it('maps WS connected → live when previously reconnecting', () => {
    const before: ActivityStreamState = {
      ...initialActivityStreamState,
      status: 'reconnecting',
    }
    const after = activityStreamReducer(before, { type: 'ws_status', status: 'connected' })
    expect(after.status).toBe('live')
  })

  it('maps WS disconnected → reconnecting after a previous live state', () => {
    const before: ActivityStreamState = {
      ...initialActivityStreamState,
      status: 'live',
    }
    const after = activityStreamReducer(before, { type: 'ws_status', status: 'disconnected' })
    expect(after.status).toBe('reconnecting')
  })

  it('keeps idle status when WS reports disconnected with no prior load', () => {
    const after = activityStreamReducer(initialActivityStreamState, {
      type: 'ws_status',
      status: 'disconnected',
    })
    expect(after.status).toBe('idle')
  })
})
