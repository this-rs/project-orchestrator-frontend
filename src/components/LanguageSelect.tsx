import { Globe } from 'lucide-react'
import { LOCALES, LOCALE_META, isLocale, useT } from '@/i18n'

/**
 * Language picker. A native <select> laid over an icon: keyboard, screen readers and the OS picker
 * come for free, it needs no floating-menu positioning, and it survives a right-to-left layout.
 * Option labels are the languages' own names, so a user who cannot read the current one can still find theirs.
 */
export function LanguageSelect({ showName = false }: { showName?: boolean }) {
  const { t, requested, setLocale } = useT()
  const name = LOCALE_META[requested].nativeName
  return (
    <label
      className="relative flex min-h-9 items-center gap-2 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-gray-200 focus-within:ring-2 focus-within:ring-indigo-500/60"
      title={t('common.language.current', { name })}
    >
      <Globe className="h-5 w-5 shrink-0" aria-hidden="true" />
      {showName && <span className="truncate text-sm text-gray-300">{name}</span>}
      <select
        aria-label={t('common.language.choose')}
        value={requested}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value)
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} lang={LOCALE_META[code].htmlLang} dir={LOCALE_META[code].dir}>
            {LOCALE_META[code].nativeName}
          </option>
        ))}
      </select>
    </label>
  )
}
