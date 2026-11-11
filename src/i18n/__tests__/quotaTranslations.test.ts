import { describe, expect, it } from 'vitest'
import { LOCALES } from '../locales'
import { flatten, placeholdersOf } from '../merge'
import english from '../messages/en/providerAdmin'
import identicalOk from '../identical-ok.json'

/**
 * The quota card is an escape hatch: its sentences decide whether a person dares to clear an
 * exclusion. English copied into a language and whitelisted in `identical-ok.json` is not a
 * translation — that file is for proper nouns, code and cognates.
 */
const QUOTA = Object.entries(flatten({ quota: english.quota }))

describe('the quota card is translated, not whitelisted', () => {
  it('whitelists none of its keys as "legitimately the same as English"', () => {
    expect(identicalOk.keys.filter((k) => k.includes('providerAdmin.quota.'))).toEqual([])
  })

  it.each(LOCALES.filter((l) => l !== 'en'))('%s says every sentence in its own words, with the same markers', async (locale) => {
    const messages = flatten((await import(`../messages/${locale}/providerAdmin.ts`)).default)
    for (const [key, source] of QUOTA) {
      const text = messages[key]
      expect(text, `${locale}: providerAdmin.${key} is missing`).toBeTruthy()
      expect(text, `${locale}: providerAdmin.${key} is the English text`).not.toBe(source)
      expect(placeholdersOf(text), `${locale}: providerAdmin.${key}`).toEqual(placeholdersOf(source))
    }
  })
})
