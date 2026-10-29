import { describe, expect, it } from 'vitest'
import { retainFiles, withFile } from './attachmentFiles'

const file = (name: string) => new File([name], name, { type: 'image/png' })

describe('retainFiles', () => {
  it('drops the entries whose attachment is gone', () => {
    const shot = file('a.png')
    const map = new Map([
      ['l1', shot],
      ['l2', file('b.png')],
    ])

    const kept = retainFiles(map, ['l1'])

    expect([...kept.keys()]).toEqual(['l1'])
    expect(kept.get('l1')).toBe(shot)
  })

  it('returns the same map when there is nothing to prune', () => {
    const map = new Map([['l1', file('a.png')]])
    // Identity, not equality: a new Map on every list change would re-render
    // the whole attachment row for nothing.
    expect(retainFiles(map, ['l1', 'l2'])).toBe(map)
  })

  it('survives an empty list', () => {
    expect(retainFiles(new Map(), [])).toEqual(new Map())
  })
})

describe('withFile', () => {
  it('adds the file and drops stale entries in the same pass', () => {
    const old = file('old.png')
    const fresh = file('new.png')
    const map = new Map([['l0', old]])

    const next = withFile(map, ['l1'], 'l1', fresh)

    expect([...next.keys()]).toEqual(['l1'])
    expect(next.get('l1')).toBe(fresh)
    // The input is not mutated: React state stays immutable.
    expect(map.get('l0')).toBe(old)
  })
})
