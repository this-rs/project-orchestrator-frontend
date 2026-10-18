import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSnapshot, cleanSnapshotText, SNAPSHOT_NAME_MAX } from '../snapshot'

const anchors = vi.hoisted(() => ({ list: vi.fn(), add: vi.fn() }))
vi.mock('@/services/anchors', async (orig) => ({ ...(await orig<typeof import('@/services/anchors')>()), anchorsApi: anchors }))

import { AnchorConflictError, AnchorRefusedError, AnchorsUnavailableError } from '@/services/anchors'
import { placeAnchors } from '../placeAnchors'

const PLAN = '22222222-2222-4222-8222-222222222222'

describe('the snapshot « Demander ici » sends', () => {
  it('is an allow-list: type, id, a focus role and the cleaned name — nothing else', () => {
    const s = buildSnapshot({ kind: 'plan', id: PLAN, label: '  Auth\n flow\u0007 ' }, '[x]')
    expect(s).toEqual({ anchor: { target_type: 'plan', target_id: PLAN, roles: ['focus'], snapshot_name: 'Auth flow' }, redacted: false })
  })

  it('hides what looks like a secret and says so', () => {
    const s = buildSnapshot({ kind: 'note', id: PLAN, label: 'Key sk-ant-abcdefghijklmnopqrstuv and ghp_abcdefghijklmnopqrstuvwxyz' }, '[x]')
    expect(s.anchor?.snapshot_name).toBe('Key [x] and [x]')
    expect(s.redacted).toBe(true)
    expect(cleanSnapshotText('token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4', '•').text).toBe('token •')
  })

  it('caps the name in characters, not bytes', () => {
    const long = 'é'.repeat(SNAPSHOT_NAME_MAX + 10)
    const out = cleanSnapshotText(long, '•').text
    expect(Array.from(out)).toHaveLength(SNAPSHOT_NAME_MAX)
    expect(out.endsWith('…')).toBe(true)
  })

  it('a kind the server cannot anchor gives no anchor; no label gives no name', () => {
    expect(buildSnapshot({ kind: 'rfc', id: PLAN }, '•')).toEqual({ anchor: null, redacted: false })
    expect(buildSnapshot({ kind: 'task', id: PLAN }, '•').anchor).toEqual({ target_type: 'task', target_id: PLAN, roles: ['focus'] })
  })
})

describe('placeAnchors', () => {
  beforeEach(() => vi.clearAllMocks())
  const input = { target_type: 'plan' as const, target_id: PLAN, roles: ['focus' as const] }

  it('reads the version, then adds each anchor with the version the previous answer gave', async () => {
    anchors.list.mockResolvedValue({ version: 1, anchors: [] })
    anchors.add.mockResolvedValueOnce({ version: 2 }).mockResolvedValueOnce({ version: 3 })
    await expect(placeAnchors('s1', [input, { ...input, target_type: 'task' }])).resolves.toBe(true)
    expect(anchors.add.mock.calls.map((c) => c[2])).toEqual([1, 2])
  })

  it('on a conflict, adds once more on the current version (an add overwrites nothing)', async () => {
    anchors.list.mockResolvedValue({ version: 1, anchors: [] })
    anchors.add.mockRejectedValueOnce(new AnchorConflictError({ version: 5, anchors: [] })).mockResolvedValueOnce({ version: 6 })
    await expect(placeAnchors('s1', [input])).resolves.toBe(true)
    expect(anchors.add.mock.calls.map((c) => c[2])).toEqual([1, 5])
  })

  it('says false when an anchor was refused, true when the server has no anchors at all', async () => {
    anchors.list.mockResolvedValue({ version: 1, anchors: [] })
    anchors.add.mockRejectedValueOnce(new AnchorRefusedError(409, 'focus_cap_reached', 'cap'))
    await expect(placeAnchors('s1', [input])).resolves.toBe(false)
    anchors.list.mockRejectedValueOnce(new AnchorsUnavailableError())
    await expect(placeAnchors('s1', [input])).resolves.toBe(true)
    anchors.list.mockRejectedValueOnce(new Error('offline'))
    await expect(placeAnchors('s1', [input])).resolves.toBe(false)
    anchors.list.mockResolvedValue({ version: 1, anchors: [] })
    anchors.add.mockRejectedValueOnce(new AnchorsUnavailableError())
    await expect(placeAnchors('s1', [input])).resolves.toBe(true)
  })
})
