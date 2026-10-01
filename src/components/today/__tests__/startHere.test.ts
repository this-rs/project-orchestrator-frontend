import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { parseAttentionResponse } from '@/services/attention'
import type { AttentionResponse } from '@/types/attention'
import { buildBands } from '../bands'
import { ageText, recommendStart } from '../startHere'

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
  it('words a duration in plain French', () => {
    expect(ageText(10)).toBe("moins d'une minute")
    expect(ageText(12 * 60)).toBe('12 min')
    expect(ageText(7 * 3600 + 120)).toBe('7 h')
    expect(ageText(3 * 86400 + 5)).toBe('3 j')
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
    expect(r.why).toContain('un agent vivant attend ta réponse depuis')
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
    expect(r.kind === 'waiting' && r.why).toBe('un agent vivant attend ta réponse depuis 7 h')
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
    expect(r.why).toContain('ce fil est à l\'arrêt depuis 1 j')
  })

  it('ties on age go to the smallest id, whatever the payload order', () => {
    const a = { ...stuckThread, id: 'a-thread', age_secs: 5000 }
    const b = { ...stuckThread, id: 'b-thread', age_secs: 5000 }
    for (const threads of [[a, b], [b, a]]) {
      const r = recommendStart(buildBands({ ...nothing(base), threads }))
      expect(r.kind === 'stuck' && r.entry.kind === 'stuck' && r.entry.thread.id).toBe('a-thread')
    }
  })

  it('an orphan request is resumable too, and says the session stopped', () => {
    const o = fixture('orphan')
    const r = recommendStart(buildBands({ ...nothing(o), orphans: o.orphans, threads: o.threads }))
    expect(r.kind).toBe('stuck')
    expect(r.kind === 'stuck' && r.why).toMatch(/restée sans réponse|à l'arrêt/)
  })

  it('a stuck thread with a running thread alongside is still (b), not (c)', () => {
    const four = fixture('four_bands')
    const running = four.threads.filter((t) => t.band === 'running')
    const r = recommendStart(buildBands({ ...nothing(four), threads: [...running, stuckThread] }))
    expect(r.kind).toBe('stuck')
  })
})

describe('recommendStart (c) nothing blocks, some threads advance alone', () => {
  const four = fixture('four_bands')
  const running = four.threads.filter((t) => t.band === 'running')
  const calm = buildBands({ ...nothing(four), threads: running })

  it('says "Rien ne te bloque : N fils avancent seuls"', () => {
    const r = recommendStart(calm)
    expect(r.kind).toBe('calm')
    if (r.kind !== 'calm') return
    expect(r.running).toBe(calm.counts.running)
    expect(r.title).toBe(
      `Rien ne te bloque : ${calm.counts.running} ${calm.counts.running === 1 ? 'fil avance seul' : 'fils avancent seuls'}`,
    )
  })

  it('agrees in the singular', () => {
    const one = buildBands({ ...nothing(four), threads: [running[0]] })
    const r = recommendStart(one)
    expect(r.kind === 'calm' && r.title).toBe('Rien ne te bloque : 1 fil avance seul')
  })

  it('does NOT claim calm when the source of "À traiter" or "À reprendre" failed', () => {
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
