import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import fixture from '../__fixtures__/kinds_response.json'
import { ENTITY_PATH, ENTITY_ROUTES, NON_ENTITY_ID_ROUTES, routeToRef } from '../entityRoutes'
import { HISTORICAL_KINDS, clearRefKinds, parseKindsResponse, setActiveKinds } from '../kinds'

const ID = '57cf05c9-25b6-495d-ab07-de4b11d64736'
const base = 'http://localhost:3000/'

beforeEach(() => setActiveKinds(parseKindsResponse(fixture.response)!))
afterEach(() => clearRefKinds())

describe('routeToRef (the one table route -> kind)', () => {
  it('reads every entity route of the table', () => {
    const expected: Record<string, string> = {
      'plans/:planId': 'plan',
      'tasks/:taskId': 'task',
      'notes/:noteId': 'note',
      'decisions/:decisionId': 'decision',
      'rfcs/:rfcId': 'rfc',
      'project-milestones/:milestoneId': 'milestone',
      'protocols/:protocolId': 'protocol',
      'personas/:id': 'persona',
      'skills/:id': 'skill',
      'chat/:sessionId': 'conversation',
    }
    expect(ENTITY_ROUTES.map((r) => r.path).sort()).toEqual(Object.keys(expected).sort())
    for (const [path, kind] of Object.entries(expected)) {
      const href = `/workspace/po/${path.replace(/:\w+$/, ID)}`
      expect(routeToRef(href, base), href).toEqual({ kind, id: ID })
    }
  })

  it('accepts an absolute same-origin URL, a query and a hash; the id is as written', () => {
    expect(routeToRef(`http://localhost:3000/workspace/po/tasks/${ID}?tab=steps#x`, base)).toEqual({ kind: 'task', id: ID })
  })

  it('is null for another origin, a list page, a sub-view, a slug route, junk and nothing', () => {
    for (const href of [
      `https://evil.example/workspace/po/plans/${ID}`,
      '/workspace/po/plans',
      `/workspace/po/plans/${ID}/runner`,
      `/workspace/po/plans/${ID}/extra/segments`,
      '/workspace/po/projects/my-project',
      `/plans/${ID}`,
      `/workspace/po/milestones/${ID}`,
      '/workspace/po/plans/not-a-uuid',
      `/workspace/po/plans/00000000-0000-0000-0000-000000000000`,
      'http://[',
      '',
      null,
      undefined,
    ]) {
      expect(routeToRef(href as string, base), String(href)).toBeNull()
    }
  })

  it('only designates a kind THIS server resolves: an older server sees plans and tasks, not personas', () => {
    setActiveKinds(HISTORICAL_KINDS)
    expect(routeToRef(`/workspace/po/personas/${ID}`, base)).toBeNull()
    expect(routeToRef(`/workspace/po/project-milestones/${ID}`, base)).toBeNull()
    expect(routeToRef(`/workspace/po/rfcs/${ID}`, base)).toEqual({ kind: 'rfc', id: ID })
  })
})

describe('the table is the router (App.tsx cannot drift from it)', () => {
  const app = readFileSync('src/App.tsx', 'utf8')
  const routePaths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1])
  const usedKeys = [...app.matchAll(/path=\{ENTITY_PATH\.(\w+)\}/g)].map((m) => m[1])

  it('App.tsx builds a Route from every entry of the table', () => {
    expect(usedKeys.sort()).toEqual(Object.keys(ENTITY_PATH).sort())
  })

  it('every other route that ends in an id parameter is explained: not an entity, or keyed by a slug', () => {
    const idRoutes = routePaths.filter((p) => /\/:(\w*Id|id)$/.test(p))
    expect(idRoutes.length).toBeGreaterThan(0)
    for (const p of idRoutes) expect(p in NON_ENTITY_ID_ROUTES, `${p} is an id route: add it to ENTITY_PATH or explain it in NON_ENTITY_ID_ROUTES`).toBe(true)
  })

  it('every explained route still exists in App.tsx', () => {
    for (const p of Object.keys(NON_ENTITY_ID_ROUTES)) expect(routePaths, p).toContain(p)
  })
})
