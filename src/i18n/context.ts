import { createContext, useContext } from 'react'
import { DEFAULT_LOCALE, type LocaleCode } from './locales'
import { bundleOf } from './store'
import { createTranslator, type Translator } from './translate'

export interface I18nValue extends Translator {
  /** Language the user asked for (may still be loading). */
  readonly requested: LocaleCode
  setLocale: (locale: LocaleCode) => void
}

/** Without a provider (isolated component tests) everything reads in English: no test needs wrapping. */
export const I18nContext = createContext<I18nValue>({
  ...createTranslator(DEFAULT_LOCALE, bundleOf(DEFAULT_LOCALE)!),
  requested: DEFAULT_LOCALE,
  setLocale: () => {},
})

export function useT(): I18nValue {
  return useContext(I18nContext)
}
