import { describe, expect, it } from 'vitest'
import { createTranslator } from '../translate'
import { bundleOf } from '../store'
import { DEFAULT_LOCALE } from '../locales'

describe('intelligence namespaces', () => {
  const { t } = createTranslator(DEFAULT_LOCALE, bundleOf(DEFAULT_LOCALE)!)

  it('interpolates the timeline and trajectory messages', () => {
    expect(t('intelTimeline.eventsProgress', { shown: 3, total: 10 })).toBe('Events: 3 / 10')
    expect(t('intelLearning.trajectory.projectSummary', { active: 2, done: 5 })).toBe('2 active · 5 finished')
  })
})
