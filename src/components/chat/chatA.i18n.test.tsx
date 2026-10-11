import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nContext } from '@/i18n/context'
import { setActiveTranslator } from '@/i18n/active'
import { loadLocale } from '@/i18n/store'
import { createTranslator } from '@/i18n/translate'
import { DEFAULT_LOCALE, type LocaleCode } from '@/i18n'
import type { ContentBlock } from '@/types'
import { ContinueIndicatorBlock } from './ContinueIndicatorBlock'
import { CompactBoundaryBlock } from './CompactBoundaryBlock'
import { describeUploadFailure } from './attachmentState'
import { describeAction } from './inputAction'
import { spawnLabel } from './sessionListUtils'

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

/** Switches the language non-component code reads (what `I18nProvider` does). */
async function speak(locale: LocaleCode) {
  setActiveTranslator(createTranslator(locale, await loadLocale(locale)))
}

describe('spawn labels', () => {
  afterEach(() => speak(DEFAULT_LOCALE))

  it('names every origin of the backend enum, in English by default', () => {
    expect(spawnLabel({ type: 'runner', run_id: 'r', task_id: 't' }).label).toBe('runner')
    expect(spawnLabel({ type: 'conversation', parent_session_id: 'p' }).label).toBe('spawned')
    expect(spawnLabel({ type: 'delegation', plan_id: 'p', task_id: 't' }).label).toBe('delegated')
    expect(spawnLabel({ type: 'pipeline', run_id: 'r', task_id: 't', wave: 0 }).label).toBe('pipeline')
    expect(spawnLabel({ type: 'gate', run_id: 'r', task_id: 't', gate_name: 'tests', attempt: 1 }).label).toBe('gate')
    expect(spawnLabel({ type: 'trigger', trigger_id: 'tr' }).label).toBe('trigger')
    // An origin nobody knows reads as a sub-conversation, as it always has.
    expect(spawnLabel({ type: 'telepathy' }).label).toBe('spawned')
  })

  it('follows the language on screen instead of showing English in all thirteen', async () => {
    await speak('fr')
    expect(spawnLabel({ type: 'conversation', parent_session_id: 'p' }).label).toBe('engendrée')
    expect(spawnLabel({ type: 'delegation', plan_id: 'p', task_id: 't' }).label).toBe('déléguée')
    await speak('de')
    expect(spawnLabel({ type: 'conversation', parent_session_id: 'p' }).label).toBe('abgezweigt')
    // The colour is not a translation: it stays whatever the origin's is.
    expect(spawnLabel({ type: 'runner', run_id: 'r', task_id: 't' }).text).toBe('text-blue-400')
  })

  it('never echoes a key', async () => {
    for (const locale of ['fr', 'de', 'ja', 'ar'] as LocaleCode[]) {
      await speak(locale)
      for (const type of ['runner', 'conversation', 'delegation', 'pipeline', 'gate', 'trigger']) {
        expect(spawnLabel({ type }).label).not.toMatch(/^chatA-messages\./)
      }
    }
  })
})
