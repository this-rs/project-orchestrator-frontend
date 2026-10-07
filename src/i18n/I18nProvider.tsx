import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_LOCALE, LOCALE_META, type LocaleCode } from './locales'
import { bundleOf, loadLocale } from './store'
import { createTranslator } from './translate'
import { I18nContext, type I18nValue } from './context'
import { initialLocale, rememberLocale } from './preference'

/**
 * The page keeps showing the current language until the requested one is loaded: switching never flashes
 * English. `<html lang dir>` follows the language actually shown, so Arabic flips the whole layout.
 */
export function I18nProvider({ children, initial }: { children: ReactNode; initial?: LocaleCode }) {
  const [requested, setRequested] = useState<LocaleCode>(() => initial ?? initialLocale())
  const [shown, setShown] = useState<LocaleCode>(() => (bundleOf(requested) ? requested : DEFAULT_LOCALE))

  useEffect(() => {
    let live = true
    void loadLocale(requested).then(() => {
      if (live) setShown(requested)
    })
    return () => {
      live = false
    }
  }, [requested])

  useEffect(() => {
    const meta = LOCALE_META[shown]
    document.documentElement.lang = meta.htmlLang
    document.documentElement.dir = meta.dir
  }, [shown])

  const setLocale = useCallback((locale: LocaleCode) => {
    rememberLocale(locale)
    setRequested(locale)
  }, [])

  const value = useMemo<I18nValue>(() => {
    const bundle = bundleOf(shown) ?? bundleOf(DEFAULT_LOCALE)!
    return { ...createTranslator(shown, bundle), requested, setLocale }
  }, [shown, requested, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

