import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider, activeTranslator } from '..'
import { setActiveTranslator } from '../active'
import { loadLocale } from '../store'
import { createTranslator } from '../translate'
import { DEFAULT_LOCALE, type LocaleCode } from '../locales'
import { NOMENCLATURE, segmentLabel } from '@/constants/nomenclature'
import { glossary } from '@/lib/glossary'
import { formatRelativeShort, formatDay, formatDurationMs, groupByRecency } from '@/components/ui/format'
import { getStatusMeta, statusLabel, getPriorityMeta } from '@/components/ui/statusMeta'
import { SearchInput } from '@/components/ui/Input'
import { CreateTaskForm } from '@/components/forms/CreateTaskForm'
import { COMPOSER_MODE_LABELS } from '@/constants/toolPolicy'
import { PROJECT_PROFILE_TEXT } from '@/constants/projectProfile'
import { ROLE_META, relationStyle } from '@/utils/featureGraphModel'
import { PROVIDER_ERROR_TITLES, providerErrorExplanation } from '@/constants/providerErrors'
import { LAYERS } from '@/constants/intelligence'
import { OIDC_PROVIDERS } from '@/atoms/setup'
import { ACTIVITY_STATUS_META } from '@/utils/backgroundActivity'
import { PROVIDER_KIND_LABELS } from '@/types/provider'

/** Switches the language that non-component code reads (what `I18nProvider` does on a language change). */
async function speak(locale: LocaleCode) {
  setActiveTranslator(createTranslator(locale, await loadLocale(locale)))
}

afterEach(() => speak(DEFAULT_LOCALE))

describe('registries read when used (getters), not when imported', () => {
  it('speak English by default and never echo a key', () => {
    for (const c of Object.values(NOMENCLATURE)) {
      for (const text of [c.singular, c.plural, c.description, c.explain.what, c.explain.why, c.explain.different]) {
        expect(text).not.toMatch(/^(nomenclature|nav)\./)
        expect(text.length).toBeGreaterThan(2)
      }
    }
    for (const g of Object.values(glossary)) {
      expect(g.label).not.toMatch(/^glossary\./)
      expect(g.description).not.toMatch(/^glossary\./)
    }
    expect(NOMENCLATURE.plans.explain.what).toBe('A plan says how an objective gets done, as ordered tasks and steps.')
    expect(segmentLabel('runner')).toBe('Runner')
    expect(getStatusMeta('task', 'in_progress').label).toBe('In progress')
    expect(getPriorityMeta(9)?.label).toBe('Priority 9 (critical)')
    expect(PROJECT_PROFILE_TEXT.software.label).toBe('With code')
    expect(COMPOSER_MODE_LABELS.claude.auto_edits).toBe('Accept Edits')
    expect(ROLE_META.entry_point.label).toBe('Entry Points')
    expect(relationStyle('CALLS').label).toBe('Calls')
    expect(PROVIDER_ERROR_TITLES.rate_limited).toBe('Rate limited')
    expect(providerErrorExplanation({ code: 'rate_limited', message: '', retry_after_ms: 12_000 })).toBe(
      'The provider is rate limiting requests. Try again in 12 s.',
    )
    expect(LAYERS.knowledge.label).toBe('Knowledge')
    expect(OIDC_PROVIDERS.okta.tenantLabel).toBe('Okta Domain')
    expect(ACTIVITY_STATUS_META.running.label).toBe('Running')
    expect(PROVIDER_KIND_LABELS.acp).toBe('ACP agent')
  })

  it('follow the language on screen', async () => {
    await speak('fr')
    expect(activeTranslator().locale).toBe('fr')
    expect(NOMENCLATURE.plans.singular).toBe('Plan')
    expect(NOMENCLATURE.tasks.explain.what).not.toBe('A task is one unit of work inside a plan, with its steps.')
    expect(getStatusMeta('task', 'blocked').label).toBe('Bloqué')
    expect(statusLabel('Pass')).toBe('Réussi')
    expect(getPriorityMeta(9)?.label).toContain('critique')
    expect(PROJECT_PROFILE_TEXT.work.label).toBe('Sans code')
    expect(PROVIDER_ERROR_TITLES.rate_limited).not.toBe('Rate limited')
    expect(formatRelativeShort(new Date(Date.now() - 5 * 60_000))).toBe('5 min')
    expect(formatDurationMs(90 * 60_000)).toBe('1 h 30 min')
    expect(groupByRecency([{ d: new Date() }], (x) => x.d)[0].label).toBe("Aujourd'hui")
  })

  it('gives the date its order and its month names per language', async () => {
    const date = new Date(2026, 8, 12)
    const now = new Date(2026, 8, 24)
    expect(formatDay(date, now)).toBe('12 Sep')
    await speak('fr')
    expect(formatDay(date, now)).toBe('12 sept.')
    await speak('ja')
    expect(formatDay(date, now)).toBe('9月12日')
  })
})

describe('components speak the language of the provider', () => {
  it('SearchInput placeholder', async () => {
    const { rerender } = render(<SearchInput />)
    expect(screen.getByPlaceholderText('Search...')).toBeTruthy()
    rerender(
      <I18nProvider initial="fr">
        <SearchInput />
      </I18nProvider>,
    )
    await screen.findByPlaceholderText('Rechercher...')
  })

  it('forms: labels and validation messages', async () => {
    function Harness() {
      const form = CreateTaskForm({ onSubmit: async () => {} })
      return (
        <>
          {form.fields}
          <button onClick={() => void form.submit()}>go</button>
        </>
      )
    }
    render(
      <I18nProvider initial="es">
        <Harness />
      </I18nProvider>,
    )
    expect(await screen.findByLabelText('Título')).toBeTruthy()
    screen.getByText('go').click()
    expect(await screen.findByText('La descripción es obligatoria')).toBeTruthy()
  })
})
