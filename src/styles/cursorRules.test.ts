import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Tailwind v4 resets `cursor` to `default` on buttons. The hand for everything that acts is ONE base rule in buttons.css (shared with the
 * site). The cascade cannot be computed here (no browser), so the test pins what the rule must cover and what it must leave alone.
 */
const css = readFileSync(join(__dirname, 'buttons.css'), 'utf8')
const baseBlock = /@layer base\s*\{([\s\S]*?)\n\}\n/.exec(css)?.[1] ?? ''
const pointerRule = /([^{}]+)\{\s*cursor:\s*pointer;\s*\}/.exec(baseBlock)?.[1] ?? ''
const forbiddenRule = /([^{}]+)\{\s*cursor:\s*not-allowed;\s*\}/.exec(baseBlock)?.[1] ?? ''

describe('pointer cursor (base rule in buttons.css)', () => {
  it('lives in the base layer, so a `cursor-*` utility on one element still wins', () => {
    expect(baseBlock).not.toBe('')
  })

  it.each([
    ['button:not(:disabled)', 'a button, and the trigger of a Select'],
    ['select:not(:disabled)', 'a native <select>'],
    ["[role='option']", 'an option of a list'],
    ["[role='menuitem']", 'an item of a menu'],
    ["[role='tab']", 'a tab'],
    ["[role='switch']", 'a switch'],
    ['summary', 'a disclosure'],
    ['label[for]', 'a label of a control'],
    ["[type='checkbox']", 'a checkbox'],
  ])('covers %s (%s)', (selector) => {
    expect(pointerRule).toContain(selector)
  })

  it('leaves text inputs on the text cursor (a combobox that is an <input> is not targeted)', () => {
    expect(pointerRule).toContain("[role='combobox']:not(input):not(textarea)")
    expect(pointerRule).not.toMatch(/(^|,)\s*input\s*(,|$)/)
    expect(pointerRule).not.toMatch(/textarea\s*(,|$)(?!:)/)
  })

  it('shows not-allowed on a disabled control', () => {
    for (const s of ['button:disabled', 'select:disabled', "[aria-disabled='true']"]) expect(forbiddenRule).toContain(s)
  })
})
