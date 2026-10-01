import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('EntityType contract with the backend', () => {
  const src = readFileSync(resolve(__dirname, 'events.ts'), 'utf8')
  it.each(['environment', 'deployment'])('declares %s', (name) => {
    expect(src).toContain(`| '${name}'`)
  })
})
