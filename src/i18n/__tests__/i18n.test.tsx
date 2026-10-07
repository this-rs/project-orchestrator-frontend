import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { I18nProvider, useT } from '..'
import { LOCALES, LOCALE_META, matchLocale } from '../locales'
import { NAMESPACES } from '../catalog'
import { checkDomain, STRUCTURE_KINDS } from '../check'
import { loadLocale, domain } from '../store'
import { createTranslator } from '../translate'
import identical from '../identical-ok.json'

const messagesDir = join(__dirname, '..', 'messages')

describe('catalogs', () => {
  it('has a folder for every language and no stray one', () => {
    expect(readdirSync(messagesDir).sort()).toEqual([...LOCALES].sort())
  })

  it('every language is structurally sound and fully translated', async () => {
    const en = await loadLocale('en')
    const english = Object.fromEntries(NAMESPACES.map((ns) => [ns, domain(en, ns)]))
    const issues = []
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      for (const ns of NAMESPACES) {
        const mod = await import(`../messages/${locale}/${ns}.ts`)
        issues.push(...checkDomain(locale, ns, english[ns], mod.default, new Set(identical.keys)))
      }
    }
    expect(issues).toEqual([])
    expect(STRUCTURE_KINDS.length).toBeGreaterThan(0)
  })

  it('maps browser tags to supported languages', () => {
    expect(matchLocale(['pt-BR'])).toBe('pt')
    expect(matchLocale(['zh-Hans-CN'])).toBe('zh')
    expect(matchLocale(['xx', 'de-AT'])).toBe('de')
    expect(matchLocale(['xx'])).toBe('en')
  })
})

describe('translator', () => {
  it('interpolates, and renders the key itself when it is missing', async () => {
    const tr = createTranslator('fr', await loadLocale('fr'))
    expect(tr.t('common.language.current', { name: 'Français' })).toBe('Langue : Français')
    expect(tr.t('nav.nope' as never)).toBe('nav.nope')
  })

  it('falls back to English key by key', async () => {
    const bundle = await loadLocale('en')
    expect(createTranslator('en', bundle).t('nav.groups.plan')).toBe('Plan')
  })
})

describe('provider', () => {
  function Probe() {
    const { t, locale, setLocale } = useT()
    return (
      <div>
        <span data-testid="text">{t('nav.concepts.tasks')}</span>
        <span data-testid="locale">{locale}</span>
        <button onClick={() => setLocale('ar')}>ar</button>
      </div>
    )
  }

  it('switches language, remembers it, and flips the document to right-to-left for Arabic', async () => {
    window.localStorage.clear()
    render(
      <I18nProvider initial="en">
        <Probe />
      </I18nProvider>,
    )
    expect(screen.getByTestId('text').textContent).toBe('Tasks')
    expect(document.documentElement.dir).toBe('ltr')
    await act(async () => {
      screen.getByText('ar').click()
    })
    expect(screen.getByTestId('text').textContent).toBe('المهام')
    expect(document.documentElement.lang).toBe(LOCALE_META.ar.htmlLang)
    expect(document.documentElement.dir).toBe('rtl')
    expect(window.localStorage.getItem('po.locale')).toBe('ar')
  })
})
