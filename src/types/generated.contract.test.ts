import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Source-level contract test: the first DTO batch (Note, Task, TaskStatus,
// Project, Plan) must come from the generated files, not from hand-written
// copies. It reads `index.ts` as text so it fails as soon as someone restores
// a manual definition or drops the generated re-export.
describe('DTO contract: the first batch is generated, not hand-copied', () => {
  const src = readFileSync(resolve(__dirname, 'index.ts'), 'utf8')

  it.each(['Note', 'Task', 'TaskStatus', 'Project', 'Plan'])(
    'index.ts imports %s from ./generated/',
    (name) => {
      expect(src).toContain(`from './generated/${name}'`)
    },
  )

  it('index.ts has no hand-written definition for the switched types', () => {
    expect(src).not.toContain('export interface Note {')
    expect(src).not.toContain('export interface Project {')
    expect(src).not.toContain('export interface Plan {')
    expect(src).not.toContain('export interface Task {')
    expect(src).not.toContain('export type TaskStatus = ')
  })
})
