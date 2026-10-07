/**
 * Locales of the app: same codes, same metadata as website/src/i18n/locales.ts so that the site
 * and the app speak the same languages. English is the source; every other language falls back
 * to it key by key (see merge.ts).
 */
export const LOCALES = ['en', 'fr', 'es', 'pt', 'de', 'zh', 'ja', 'ko', 'vi', 'ru', 'uk', 'hi', 'ar'] as const
export type LocaleCode = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: LocaleCode = 'en'

export interface LocaleMeta {
  readonly code: LocaleCode
  /** Name in its own language (language picker). */
  readonly nativeName: string
  /** Value of `<html lang>`. */
  readonly htmlLang: string
  readonly dir: 'ltr' | 'rtl'
  /** BCP 47 tag given to Intl (Latin digits forced, like the site). */
  readonly intl: string
}

export const LOCALE_META: Readonly<Record<LocaleCode, LocaleMeta>> = {
  en: { code: 'en', nativeName: 'English', htmlLang: 'en', dir: 'ltr', intl: 'en-GB-u-nu-latn' },
  fr: { code: 'fr', nativeName: 'Français', htmlLang: 'fr', dir: 'ltr', intl: 'fr-FR-u-nu-latn' },
  es: { code: 'es', nativeName: 'Español', htmlLang: 'es', dir: 'ltr', intl: 'es-ES-u-nu-latn' },
  pt: { code: 'pt', nativeName: 'Português (Brasil)', htmlLang: 'pt-BR', dir: 'ltr', intl: 'pt-BR-u-nu-latn' },
  de: { code: 'de', nativeName: 'Deutsch', htmlLang: 'de', dir: 'ltr', intl: 'de-DE-u-nu-latn' },
  zh: { code: 'zh', nativeName: '简体中文', htmlLang: 'zh-Hans', dir: 'ltr', intl: 'zh-Hans-CN-u-nu-latn' },
  ja: { code: 'ja', nativeName: '日本語', htmlLang: 'ja', dir: 'ltr', intl: 'ja-JP-u-nu-latn' },
  ko: { code: 'ko', nativeName: '한국어', htmlLang: 'ko', dir: 'ltr', intl: 'ko-KR-u-nu-latn' },
  vi: { code: 'vi', nativeName: 'Tiếng Việt', htmlLang: 'vi', dir: 'ltr', intl: 'vi-VN-u-nu-latn' },
  ru: { code: 'ru', nativeName: 'Русский', htmlLang: 'ru', dir: 'ltr', intl: 'ru-RU-u-nu-latn' },
  uk: { code: 'uk', nativeName: 'Українська', htmlLang: 'uk', dir: 'ltr', intl: 'uk-UA-u-nu-latn' },
  hi: { code: 'hi', nativeName: 'हिन्दी', htmlLang: 'hi', dir: 'ltr', intl: 'hi-IN-u-nu-latn' },
  ar: { code: 'ar', nativeName: 'العربية', htmlLang: 'ar', dir: 'rtl', intl: 'ar-u-nu-latn' },
}

export function isLocale(value: string | null | undefined): value is LocaleCode {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Best supported locale for a list of BCP 47 tags (`navigator.languages`): `pt-BR` → `pt`, `zh-Hans-CN` → `zh`. */
export function matchLocale(tags: readonly string[]): LocaleCode {
  for (const tag of tags) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return DEFAULT_LOCALE
}
