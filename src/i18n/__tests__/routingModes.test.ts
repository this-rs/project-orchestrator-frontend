import { describe, expect, it } from 'vitest'
import { loadLocale } from '../store'
import { createTranslator } from '../translate'
import { LOCALES } from '../locales'
import { ROUTING_MODES } from '@/types/routing'

/**
 * Decision R-S4: "mixed" used to name two things. The settings' mode where the primary pilots
 * and PO routes the sub-agents is `executors_only`; "mixed" is the chat menu's word only (PO
 * routes among the models ticked). Every language names them apart.
 */
describe('routing modes: the settings and the menu name their modes apart (R-S4)', () => {
  it.each(LOCALES)('%s', async (locale) => {
    const t = createTranslator(locale, await loadLocale(locale)).t
    for (const mode of ROUTING_MODES) {
      expect(t(`routing.modes.${mode}.label`), `${locale}: routing.modes.${mode}.label`).not.toBe(`routing.modes.${mode}.label`)
    }
    const executorsOnly = t('routing.modes.executors_only.label')
    const menuMixed = t('routing.menu.modeMixed', { count: 3 })
    const menuSummary = t('routing.menu.summaryMixed', { count: 3 })
    // The settings' label is not the menu's "mixed", nor a prefix of it.
    expect(menuMixed.startsWith(executorsOnly)).toBe(false)
    expect(menuSummary.startsWith(executorsOnly)).toBe(false)
  })
})
