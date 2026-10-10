import { DEFAULT_LOCALE } from '@/i18n/locales'
import { bundleOf } from '@/i18n/store'
import { createTranslator, type Translator } from '@/i18n/translate'

export type TFn = Translator['t']

/**
 * English translator, for the pure helpers of this folder that take an optional `t`
 * (callers inside a component pass theirs; tests and non-React callers get English).
 */
export const defaultT: TFn = createTranslator(DEFAULT_LOCALE, bundleOf(DEFAULT_LOCALE)!).t
