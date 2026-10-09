/**
 * Tables of texts that are read when used, for modules that export a constant (a label per mode, per status,
 * per error code…) and are not components. Each entry is a getter: the text is looked up in the language on
 * screen at the moment it is read, so the table follows the language without its consumers changing.
 */
import { activeTranslator } from './active'
import type { MessageKey, Vars } from './catalog'

/** The text of a key in the language on screen. */
export function tr(key: MessageKey, vars?: Vars): string {
  return activeTranslator().t(key, vars)
}

/** `{ a: 'ns.a', b: 'ns.b' }` → an object whose `a` and `b` read the catalog on access. */
export function lazyTexts<K extends string>(keys: Readonly<Record<K, MessageKey>>): Readonly<Record<K, string>> {
  const out = {} as Record<K, string>
  for (const k of Object.keys(keys) as K[]) {
    Object.defineProperty(out, k, { enumerable: true, get: () => tr(keys[k]) })
  }
  return out
}
