import { describe, expect, it } from 'vitest'
import { loadLocale } from '@/i18n/store'
import { createTranslator } from '@/i18n/translate'
import { routingRejectionLabel } from './routing'

const enT = createTranslator('en', await loadLocale('en')).t
const frT = createTranslator('fr', await loadLocale('fr')).t
const en = (rejected: string, why?: string | null) => routingRejectionLabel(enT, rejected, why)
const fr = (rejected: string, why?: string | null) => routingRejectionLabel(frT, rejected, why)

describe('routingRejectionLabel', () => {
  it('window_unknown (backend #649) reads as words, not as the raw code', () => {
    expect(en('window_unknown')).toBe('Context window unknown')
    expect(fr('window_unknown')).toBe('Fenêtre de contexte inconnue')
  })

  it('window_unknown says why when the cause is known', () => {
    expect(en('window_unknown', 'catalog_offline')).toBe('Context window unknown: catalog offline')
    expect(en('window_unknown', 'not_in_catalog')).toBe('Context window unknown: model not in the catalog')
    expect(fr('window_unknown', 'catalog_offline')).toBe('Fenêtre de contexte inconnue : catalogue hors ligne')
    expect(fr('window_unknown', 'not_in_catalog')).toBe('Fenêtre de contexte inconnue : modèle absent du catalogue')
  })

  it('an unknown cause falls back to the plain label, never hidden', () => {
    expect(en('window_unknown', 'brand_new_cause')).toBe('Context window unknown')
  })

  it('known codes use their label, an unknown code stays visible', () => {
    expect(en('no_tools')).toBe('Cannot call tools')
    expect(en('brand_new_reason')).toBe('brand new reason')
  })
})
