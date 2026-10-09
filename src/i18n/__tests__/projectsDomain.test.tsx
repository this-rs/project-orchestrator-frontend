import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '..'
import { loadLocale } from '../store'
import { createTranslator } from '../translate'
import { CodeArchitectureFullTab } from '@/components/code/CodeArchitectureFullTab'

describe('projects domain catalogs (projects, code, architecture, graph, featureGraphs)', () => {
  it('reads each namespace in French, with interpolation, and in English by default', async () => {
    const en = createTranslator('en', await loadLocale('en'))
    const fr = createTranslator('fr', await loadLocale('fr'))
    const keys = [
      ['projects.list.newProject', {}],
      ['projects.workspace.deleteDescription', { name: 'X' }],
      ['code.page.tabs.health', {}],
      ['architecture.legend.required', {}],
      ['graph.unified.fullscreen', {}],
      ['featureGraphs.list.autoBuild', {}],
    ] as const
    for (const [key, vars] of keys) {
      expect(fr.t(key, vars)).not.toBe(key)
      expect(fr.t(key, vars)).not.toBe(en.t(key, vars))
    }
    expect(en.t('projects.list.newProject')).toBe('New project')
    expect(fr.t('projects.workspace.deleteDescription', { name: 'X' })).toContain('« X »')
  })

  it('renders a code section in the language of the provider', async () => {
    window.localStorage.clear()
    render(
      <I18nProvider initial="fr">
        <CodeArchitectureFullTab projectSlug={null} workspaceSlug="ws" onOpenFile={() => {}} />
      </I18nProvider>
    )
    expect(await screen.findByText("Vue d'ensemble")).toBeTruthy()
  })
})
