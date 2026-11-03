/**
 * The fullscreen contract, guarded at the source level.
 *
 * The user asked, on 03/11/2026: « si je passe en fullscreen ou que j'en sors,
 * je veux rester sur la même projection, actuellement ça reset ». The cause was
 * the re-frame effect: with `dimensions` in its dependency array, every viewport
 * change (a fullscreen toggle) re-framed the camera, so the projection was lost.
 *
 * The effect lives inside a React component wired to three-render-objects; a
 * rendered test would need a WebGL context that CI does not have. So the contract
 * is checked on the source itself — the same technique the graph client's own
 * selftest uses for invariants that only a hostile grid can see. It fails the
 * day someone puts `dimensions` back into that dependency array.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, 'IntelligenceGraph3D.tsx'), 'utf8')

/** The `useEffect` block whose body frames the camera (`fg.cameraPosition`). */
function reframeEffect(code: string): string {
  const start = code.indexOf('cameraPosition(')
  expect(start, 'the re-frame effect must exist').toBeGreaterThan(-1)
  const open = code.lastIndexOf('useEffect(', start)
  expect(open, 'the re-frame call must sit inside a useEffect').toBeGreaterThan(-1)
  // From the call, walk forward to the end of that effect's dependency array.
  const tail = code.slice(start)
  const deps = tail.indexOf('}, [')
  expect(deps, 'the effect must declare its dependencies').toBeGreaterThan(-1)
  // The dependency ARRAY only: the body may legitimately mention `dimensions`
  // (a comment, a log), what matters is whether the effect RE-RUNS on it.
  return tail.slice(deps, tail.indexOf(']', deps) + 1)
}

describe('fullscreen keeps the projection', () => {
  it('the re-frame effect does not depend on the viewport size', () => {
    const effect = reframeEffect(source)
    expect(effect).not.toContain('dimensions')
    expect(effect, 'a dataset change must still re-frame').toContain('nodeSetKey')
  })

  it('the resize path updates the aspect ratio without moving the camera', () => {
    const resize = source.slice(source.indexOf('camera.aspect'), source.indexOf('camera.aspect') + 400)
    expect(resize).toContain('camera.aspect')
    expect(resize, 'resizing must not re-position the camera').not.toContain('cameraPosition(')
  })
})
