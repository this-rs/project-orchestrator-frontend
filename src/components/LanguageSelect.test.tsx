import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n'
import { LanguageSelect } from './LanguageSelect'

describe('LanguageSelect', () => {
  it('offers the 13 languages under their own name and switches the document', async () => {
    window.localStorage.clear()
    render(
      <I18nProvider initial="en">
        <LanguageSelect showName />
      </I18nProvider>,
    )
    const select = screen.getByLabelText('Choose a language') as HTMLSelectElement
    expect(select.options).toHaveLength(13)
    expect([...select.options].map((o) => o.text)).toContain('العربية')
    fireEvent.change(select, { target: { value: 'fr' } })
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'))
    expect(screen.getByLabelText('Choisir une langue')).toBeTruthy()
    expect(window.localStorage.getItem('po.locale')).toBe('fr')
  })
})
