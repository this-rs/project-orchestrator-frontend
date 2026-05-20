/**
 * Tests for the minimal ANSI parser.
 */

import { describe, expect, it } from 'vitest'
import { parseAnsi, stripAnsi } from './ansi'

describe('parseAnsi', () => {
  it('returns a single segment for a plain string', () => {
    const segs = parseAnsi('hello world')
    expect(segs).toHaveLength(1)
    expect(segs[0].text).toBe('hello world')
    expect(segs[0].color).toBeUndefined()
  })

  it('parses a basic red FG color', () => {
    const segs = parseAnsi('\x1b[31merror\x1b[0m')
    expect(segs).toHaveLength(1)
    expect(segs[0].text).toBe('error')
    expect(segs[0].color).toBeDefined()
  })

  it('preserves segments before/after a reset', () => {
    const segs = parseAnsi('prefix \x1b[32mok\x1b[0m suffix')
    expect(segs).toHaveLength(3)
    expect(segs[0].text).toBe('prefix ')
    expect(segs[1].text).toBe('ok')
    expect(segs[1].color).toBeDefined()
    expect(segs[2].text).toBe(' suffix')
    expect(segs[2].color).toBeUndefined()
  })

  it('handles bold + color', () => {
    const segs = parseAnsi('\x1b[1;33mbold yellow\x1b[0m')
    expect(segs).toHaveLength(1)
    expect(segs[0].bold).toBe(true)
    expect(segs[0].color).toBeDefined()
  })

  it('handles 256-color foreground', () => {
    const segs = parseAnsi('\x1b[38;5;208morange\x1b[0m')
    expect(segs[0].text).toBe('orange')
    expect(segs[0].color).toMatch(/^#/)
  })

  it('handles truecolor foreground', () => {
    const segs = parseAnsi('\x1b[38;2;10;20;30mhex\x1b[0m')
    expect(segs[0].color?.toLowerCase()).toBe('#0a141e')
  })

  it('ignores unknown background codes', () => {
    const segs = parseAnsi('\x1b[41mred bg\x1b[0m')
    expect(segs[0].text).toBe('red bg')
    // background is ignored — color stays undefined
    expect(segs[0].color).toBeUndefined()
  })

  it('returns empty for empty input', () => {
    expect(parseAnsi('')).toEqual([])
  })
})

describe('stripAnsi', () => {
  it('removes all SGR escapes', () => {
    expect(stripAnsi('\x1b[31mhello\x1b[0m world')).toBe('hello world')
    expect(stripAnsi('plain')).toBe('plain')
    expect(stripAnsi('')).toBe('')
  })
})
