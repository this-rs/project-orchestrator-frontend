import { describe, it, expect } from 'vitest'
import { isProjectWatched, unlinkedWatchedPaths } from '../watch'
import type { WatchStatus } from '@/types'

const REAL = '/Users/me/.openclaw/skills/po'
const LINK = '/Users/me/projects/po/backend'

const status: WatchStatus = {
  running: true,
  watched_paths: [REAL, '/tmp/other'],
  watched_projects: [{ project_id: 'p1', slug: 'po-backend', path: REAL }],
}

describe('isProjectWatched', () => {
  it('matches on project id even when root_path is a symlink to the watched path', () => {
    expect(isProjectWatched(status, 'p1', LINK)).toBe(true)
  })

  it('does not report another project as watched', () => {
    expect(isProjectWatched(status, 'p2', '/Users/me/projects/other')).toBe(false)
  })

  it('falls back to paths for a backend without watched_projects', () => {
    const legacy: WatchStatus = { running: true, watched_paths: [REAL] }
    expect(isProjectWatched(legacy, 'p1', REAL)).toBe(true)
    expect(isProjectWatched(legacy, 'p1', LINK)).toBe(false)
  })

  it('is false without a status or without anything to match', () => {
    expect(isProjectWatched(null, 'p1', REAL)).toBe(false)
    expect(isProjectWatched({ running: false, watched_paths: [] }, undefined, undefined)).toBe(false)
  })
})

describe('unlinkedWatchedPaths', () => {
  it('does not list a path that a watched project owns through a symlink', () => {
    expect(unlinkedWatchedPaths(status, [{ id: 'p1', root_path: LINK }])).toEqual(['/tmp/other'])
  })

  it('tolerates projects without a root_path', () => {
    expect(unlinkedWatchedPaths(status, [{ id: 'p9' }])).toEqual(['/tmp/other'])
  })
})
