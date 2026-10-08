import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseAttentionResponse } from '@/services/attention'
import type { AttentionResponse } from '@/types/attention'
import { STUCK_LABEL, buildBands } from '../bands'
import { ageText, headline, recommendStart } from '../startHere'

const fixture = (name: string): AttentionResponse =>
  parseAttentionResponse(
    JSON.parse(readFileSync(join(__dirname, '../../../services/__fixtures__/attention', `${name}.json`), 'utf8')),
  )

const nothing = (base: AttentionResponse): AttentionResponse => ({
  ...base,
  threads: [],
  waiting: [],
  orphans: [],
  thinking: [],
  unattached: [],
})

describe('ageText', () => {
  it('words a duration in plain English', () => {
    expect(ageText(10)).toBe('under a minute')
    expect(ageText(12 * 60)).toBe('12 min')
    expect(ageText(7 * 3600 + 120)).toBe('7 h')
    expect(ageText(3 * 86400 + 5)).toBe('3 d')
  })
})

describe('recommendStart (a) a LIVE agent waits on the user', () => {
  const data = fixture('four_bands')

  it('picks the OLDEST live request and says why, in words', () => {
    const bands = buildBands(data)
    const oldest = [...bands.waiting].sort((a, b) => b.request.age_secs - a.request.age_secs)[0]
    const r = recommendStart(bands)
    expect(r.kind).toBe('waiting')
    if (r.kind !== 'waiting') return
    expect(r.entry.request.request_id).toBe(oldest.request.request_id)
    expect(r.why).toContain('an assistant has been waiting for your answer for')
  })

  it('wins over a stuck thread, even an older one', () => {
    const bands = buildBands(data)
    expect(bands.stuck.length).toBeGreaterThan(0)
    expect(recommendStart(bands).kind).toBe('waiting')
  })

  it('names the request in hours when it waited hours', () => {
    const bands = buildBands(data)
    const e = { ...bands.waiting[0], request: { ...bands.waiting[0].request, age_secs: 7 * 3600 + 30 } }
    const r = recommendStart({ ...bands, waiting: [e] })
    expect(r.kind === 'waiting' && r.why).toBe('an assistant has been waiting for your answer for 7 h')
  })

  it('ties on age go to the smallest request id, whatever the payload order', () => {
    const base = buildBands(data)
    const a = { ...base.waiting[0], request: { ...base.waiting[0].request, request_id: 'req_a', age_secs: 500 } }
    const b = { ...base.waiting[0], request: { ...base.waiting[0].request, request_id: 'req_b', age_secs: 500 } }
    const pick = (list: typeof base.waiting) => {
      const r = recommendStart({ ...base, waiting: list })
      return r.kind === 'waiting' ? r.entry.request.request_id : null
    }
    expect(pick([a, b])).toBe('req_a')
    expect(pick([b, a])).toBe('req_a')
  })

  it('a dead session never is the recommendation (a): it is a stuck item', () => {
    const base = fixture('unattached_waiting')
    const live = base.unattached.find((u) => u.state === 'live' && u.pending.length > 0)!
    const dead = { ...live, state: 'dead' as const }
    const r = recommendStart(buildBands({ ...nothing(base), unattached: [dead] }))
    expect(r.kind).toBe('stuck')
  })
})

describe('recommendStart (b) the oldest stuck or resumable item', () => {
  const base = fixture('blocked_task')
  const stuckThread = base.threads.find((t) => t.band === 'stuck')!

  it('without any live request, picks the oldest stuck thread with the cause', () => {
    const older = { ...stuckThread, id: 'older', age_secs: 90000 }
    const younger = { ...stuckThread, id: 'younger', age_secs: 100 }
    const r = recommendStart(buildBands({ ...nothing(base), threads: [younger, older] }))
    expect(r.kind).toBe('stuck')
    if (r.kind !== 'stuck') return
    expect(r.entry.kind === 'stuck' && r.entry.thread.id).toBe('older')
    expect(r.why).toBe(`this plan has been stopped for 1 d: ${STUCK_LABEL.task_blocked.toLowerCase()}`)
  })

  it('ties on age go to the smallest id, whatever the payload order', () => {
    const a = { ...stuckThread, id: 'a-thread', age_secs: 5000 }
    const b = { ...stuckThread, id: 'b-thread', age_secs: 5000 }
    for (const threads of [[a, b], [b, a]]) {
      const r = recommendStart(buildBands({ ...nothing(base), threads }))
      expect(r.kind === 'stuck' && r.entry.kind === 'stuck' && r.entry.thread.id).toBe('a-thread')
    }
  })

  it('an orphan request is resumable too, and says the conversation stopped', () => {
    const o = fixture('orphan')
    const r = recommendStart(buildBands({ ...nothing(o), orphans: o.orphans, threads: o.threads }))
    expect(r.kind).toBe('stuck')
    expect(r.kind === 'stuck' && r.why).toMatch(/left unanswered|has been stopped/)
    expect(r.why).not.toMatch(/session|\bCLI\b/i)
  })

  it('a stuck thread with a running thread alongside is still (b), not (c)', () => {
    const four = fixture('four_bands')
    const running = four.threads.filter((t) => t.band === 'running')
    const r = recommendStart(buildBands({ ...nothing(four), threads: [...running, stuckThread] }))
    expect(r.kind).toBe('stuck')
  })
})

describe('recommendStart (b) only recommends actions that are possible', () => {
  const base = fixture('blocked_task')
  const stuckThread = base.threads.find((t) => t.band === 'stuck')!
  const busy = {
    status: 'busy' as const,
    busy_with: { plan_id: 'other', plan_title: 'Autre plan', run_id: 'r9', workspace: 'studio', since: '2026-10-01T10:00:00Z' },
  }

  it('busy runner: skips the older thread (Reprendre disabled) for an orphan request, which only needs a message', () => {
    const o = fixture('orphan')
    const older = { ...stuckThread, id: 'older', age_secs: 900000 }
    const bands = buildBands({ ...nothing(o), threads: [older, ...o.threads], orphans: o.orphans })
    const r = recommendStart(bands, [], busy)
    expect(r.kind).toBe('stuck')
    expect(r.kind === 'stuck' && r.entry.kind).not.toBe('stuck')
  })

  it('busy runner, only stuck threads: says honestly nothing can be resumed now, and why', () => {
    const bands = buildBands({ ...nothing(base), threads: [stuckThread] })
    const r = recommendStart(bands, [], busy)
    expect(r.kind).toBe('blocked')
    expect(r.why).toContain('Autre plan')
    expect(r.why).toContain('another plan is already in progress')
    expect(r.why).not.toMatch(/runner/i)
  })

  it('free runner: the oldest thread is still recommended', () => {
    const bands = buildBands({ ...nothing(base), threads: [stuckThread] })
    expect(recommendStart(bands, [], { status: 'free', busy_with: null }).kind).toBe('stuck')
  })
})

describe('recommendStart (c) nothing blocks, some threads advance alone', () => {
  const four = fixture('four_bands')
  const running = four.threads.filter((t) => t.band === 'running')
  const calm = buildBands({ ...nothing(four), threads: running })

  it('says "Nothing is blocking you: N plans are moving on their own"', () => {
    const r = recommendStart(calm)
    expect(r.kind).toBe('calm')
    if (r.kind !== 'calm') return
    expect(r.running).toBe(calm.counts.running)
    expect(r.title).toBe(
      `Nothing is blocking you: ${calm.counts.running} ${calm.counts.running === 1 ? 'plan is moving on its own' : 'plans are moving on their own'}`,
    )
  })

  it('agrees in the singular', () => {
    const one = buildBands({ ...nothing(four), threads: [running[0]] })
    const r = recommendStart(one)
    expect(r.kind === 'calm' && r.title).toBe('Nothing is blocking you: 1 plan is moving on its own')
  })

  it('does NOT claim calm or empty when the "In progress" source failed', () => {
    expect(recommendStart(calm, ['running']).kind).toBe('incomplete')
    expect(recommendStart(buildBands(nothing(four)), ['running']).kind).toBe('incomplete')
  })

  it('does NOT claim calm when the source of "Waiting for you" or "To resume" failed', () => {
    for (const band of ['waiting', 'stuck'] as const) {
      const r = recommendStart(calm, [band])
      expect(r.kind).toBe('incomplete')
    }
    // a failure elsewhere does not change the answer
    expect(recommendStart(calm, ['thinking']).kind).toBe('calm')
  })
})

describe('recommendStart (d) nothing at all', () => {
  it('is the empty state, with a reason', () => {
    const r = recommendStart(buildBands(fixture('empty')))
    expect(r.kind).toBe('empty')
    expect(r.why.length).toBeGreaterThan(0)
  })

  it('only things to follow is still empty for this rule (it recommends no action)', () => {
    const four = fixture('four_bands')
    const r = recommendStart(buildBands({ ...nothing(four), thinking: four.thinking }))
    expect(r.kind).toBe('empty')
  })
})

describe('recommendStart never invents data', () => {
  it('the recommended item is always one of the bands items', () => {
    for (const name of ['four_bands', 'orphan', 'unattached_waiting', 'forty_threads', 'runner_busy']) {
      const bands = buildBands(fixture(name))
      const r = recommendStart(bands)
      if (r.kind === 'waiting') expect(bands.waiting).toContain(r.entry)
      if (r.kind === 'stuck') expect(bands.stuck).toContain(r.entry)
    }
  })
})

describe('headline: the day in a few words, the reason under it, and where it points', () => {
  const four = fixture('four_bands')
  const blockedData = fixture('blocked_task')
  const stuckThread = blockedData.threads.find((t) => t.band === 'stuck')!
  const of = (bands: ReturnType<typeof buildBands>, ...rest: [Parameters<typeof recommendStart>[1]?, Parameters<typeof recommendStart>[2]?]) =>
    headline(recommendStart(bands, ...rest), bands)

  it('ONE live request: singular, since when, points at "Waiting for you"', () => {
    const base = buildBands(four)
    const e = { ...base.waiting[0], request: { ...base.waiting[0].request, age_secs: 7 * 3600 } }
    const bands = { ...base, waiting: [e] }
    expect(of(bands)).toEqual({ title: 'An assistant is waiting for your answer', why: 'It has been waiting for 7 h.', band: 'waiting' })
  })

  it('SEVERAL live requests: the count, the age of the oldest, points at "Waiting for you"', () => {
    const base = buildBands(four)
    const a = { ...base.waiting[0], request: { ...base.waiting[0].request, request_id: 'req_a', age_secs: 12 * 60 } }
    const b = { ...base.waiting[0], request: { ...base.waiting[0].request, request_id: 'req_b', age_secs: 3 * 86400 } }
    const bands = { ...base, waiting: [a, b] }
    expect(of(bands)).toEqual({
      title: '2 assistants are waiting for your answer',
      why: 'The oldest has been waiting for 3 d.',
      band: 'waiting',
    })
  })

  it('stuck: counts what is to resume, gives the capitalised reason of the recommended one, points at "To resume"', () => {
    const one = buildBands({ ...nothing(blockedData), threads: [{ ...stuckThread, age_secs: 90000 }] })
    expect(of(one)).toEqual({
      title: 'Something is waiting to be resumed',
      why: `This plan has been stopped for 1 d: ${STUCK_LABEL.task_blocked.toLowerCase()}.`,
      band: 'stuck',
    })
    const two = buildBands({
      ...nothing(blockedData),
      threads: [
        { ...stuckThread, id: 'a', age_secs: 90000 },
        { ...stuckThread, id: 'b', age_secs: 100 },
      ],
    })
    const h = of(two)
    expect(h.title).toBe('2 things are waiting to be resumed')
    expect(h.why).toMatch(/^This plan has been stopped for 1 d: .+\.$/)
    expect(h.band).toBe('stuck')
  })

  it('calm: the title of the recommendation, points at "In progress"', () => {
    const bands = buildBands({ ...nothing(four), threads: four.threads.filter((t) => t.band === 'running') })
    const start = recommendStart(bands)
    expect(start.kind).toBe('calm')
    const h = headline(start, bands)
    expect(h.title).toBe(start.kind === 'calm' && start.title)
    expect(h.why).toBe('No assistant is waiting for your answer and nothing is to resume.')
    expect(h.band).toBe('running')
  })

  it('empty, incomplete and blocked point nowhere and keep their own title', () => {
    const empty = buildBands(fixture('empty'))
    const busy = {
      status: 'busy' as const,
      busy_with: { plan_id: 'other', plan_title: 'Autre plan', run_id: 'r9', workspace: 'studio', since: '2026-10-01T10:00:00Z' },
    }
    const onlyStuck = buildBands({ ...nothing(blockedData), threads: [stuckThread] })
    const cases = [
      ['empty', empty, recommendStart(empty)],
      ['incomplete', empty, recommendStart(empty, ['running'])],
      ['blocked', onlyStuck, recommendStart(onlyStuck, [], busy)],
    ] as const
    for (const [kind, bands, start] of cases) {
      expect(start.kind).toBe(kind)
      const h = headline(start, bands)
      expect(h.band).toBeNull()
      expect(h.title).toBe('title' in start && start.title)
      // the reason is a sentence: capitalised, ended by a full stop
      expect(h.why).toBe(`${start.why.charAt(0).toUpperCase()}${start.why.slice(1)}.`)
    }
  })
})
