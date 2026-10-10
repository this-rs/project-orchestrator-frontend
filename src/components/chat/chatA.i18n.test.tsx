import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nContext } from '@/i18n/context'
import { loadLocale } from '@/i18n/store'
import { createTranslator } from '@/i18n/translate'
import type { ContentBlock } from '@/types'
import { ContinueIndicatorBlock } from './ContinueIndicatorBlock'
import { CompactBoundaryBlock } from './CompactBoundaryBlock'
import { describeUploadFailure } from './attachmentState'
import { describeAction } from './inputAction'

async function inFrench(ui: ReactNode) {
  const bundle = await loadLocale('fr')
  const value = { ...createTranslator('fr', bundle), requested: 'fr' as const, setLocale: () => {} }
  return { value, ...render(<I18nContext.Provider value={value}>{ui}</I18nContext.Provider>) }
}

const block = (metadata: Record<string, unknown>) => ({ id: 'b', type: 'continue_indicator', content: '', metadata }) as unknown as ContentBlock

describe('chatA namespaces', () => {
  it('renders the divider blocks in the selected language', async () => {
    await inFrench(
      <>
        <ContinueIndicatorBlock block={block({ num_turns: 3 })} />
        <CompactBoundaryBlock block={block({ trigger: 'manual', pre_tokens: 12000 })} />
      </>,
    )
    expect(screen.getByText('Poursuivi')).toBeTruthy()
    expect(screen.getByText('après 3 tours')).toBeTruthy()
    expect(screen.getByText('Contexte compacté')).toBeTruthy()
    expect(screen.getByText('manuel')).toBeTruthy()
  })

  it('pure helpers take the translator of the caller and default to English', async () => {
    const bundle = await loadLocale('fr')
    const { t } = createTranslator('fr', bundle)
    expect(describeUploadFailure(413, undefined, t)).toBe('Fichier trop volumineux')
    expect(describeUploadFailure(413)).toBe('File too large')
    expect(describeAction('stop', undefined, t)).toBe('Arrêter la génération')
    expect(describeAction('stop')).toBe('Stop generating')
  })
})
