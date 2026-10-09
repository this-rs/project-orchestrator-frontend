/**
 * The translator of the language on screen, for code that is not a component or a hook:
 * formatters (`formatRelativeShort`), status registries, constants read at call time.
 * `I18nProvider` keeps it in step with the language shown; without a provider (tests) it is English.
 *
 * Components still use `useT()`: it re-renders them when the language changes. This is only the
 * way for a pure function to read the same language at the moment it runs.
 */
import { DEFAULT_LOCALE } from './locales'
import { bundleOf } from './store'
import { createTranslator, type Translator } from './translate'

let current: Translator = createTranslator(DEFAULT_LOCALE, bundleOf(DEFAULT_LOCALE)!)

export function activeTranslator(): Translator {
  return current
}

export function setActiveTranslator(translator: Translator): void {
  current = translator
}
