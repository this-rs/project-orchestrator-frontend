/** Remembered language choice. Reading and writing never throw (private mode, blocked storage). */
import { DEFAULT_LOCALE, isLocale, matchLocale, type LocaleCode } from './locales'

export const LOCALE_STORAGE_KEY = 'po.locale'

export function storedLocale(): LocaleCode | null {
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(v) ? v : null
  } catch {
    return null
  }
}

export function rememberLocale(locale: LocaleCode): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    /* not remembered */
  }
}

/** Explicit choice first, then the browser's languages, then English. */
export function initialLocale(): LocaleCode {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  return storedLocale() ?? matchLocale(window.navigator.languages ?? [window.navigator.language])
}
