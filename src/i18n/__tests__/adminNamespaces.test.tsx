import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '..'
import { loadLocale } from '../store'
import { createTranslator } from '../translate'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ConfirmPanel } from '@/components/settings/ConfirmPanel'
import { SettingsErrorCard } from '@/components/settings/SettingsErrorCard'
import { CreateVault } from '@/pages/VaultPage'
import { validateInstanceId, wizardErrorMessage } from '@/constants/providerWizard'
import { validateSshHost } from '@/constants/remoteClaudeCode'

/**
 * The administration screens (auth, vault, providers, settings…) read their text from the catalog:
 * one small check per area, in a language other than English.
 */
async function inLocale(locale: 'fr' | 'ja', ui: React.ReactElement) {
  await loadLocale(locale)
  await act(async () => {
    render(<I18nProvider initial={locale}>{ui}</I18nProvider>)
  })
}

describe('administration namespaces', () => {
  it('auth: the not-found page', async () => {
    await inLocale('fr', <MemoryRouter><NotFoundPage embedded /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Page introuvable' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Retour à l.accueil/  })).toBeTruthy()
  })

  it('settingsShared: the default cancel label and the provider error card', async () => {
    await inLocale(
      'fr',
      <MemoryRouter>
        <ConfirmPanel title="?" confirmLabel="ok" onConfirm={() => {}} onCancel={() => {}} />
        <SettingsErrorCard error={{ code: 'credentials_locked', message: '' }} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy()
    expect(screen.getByText('Coffre verrouillé')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Déverrouiller le coffre' })).toBeTruthy()
  })

  it('vault: the creation form', async () => {
    await inLocale('ja', <CreateVault onDone={() => {}} />)
    expect(screen.getByRole('button', { name: 'ボールトを作成' })).toBeTruthy()
  })

  it('providers: validators and typed errors speak the translator language', async () => {
    const fr = createTranslator('fr', await loadLocale('fr')).t
    expect(validateInstanceId('Mon_ID', [], fr)).toContain('Lettres minuscules')
    expect(validateSshHost('-x', fr)).toContain('« - »')
    expect(wizardErrorMessage(new Error('boom'), fr)).toBe('boom')
  })
})
