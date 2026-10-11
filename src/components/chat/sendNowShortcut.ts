/**
 * The composer's "send now" shortcut, as the user's keyboard says it.
 *
 * Both Cmd+Enter and Ctrl+Enter work everywhere (`handleKeyDown` reads
 * `metaKey || ctrlKey`); the hint and `aria-keyshortcuts` name the one the
 * platform uses: ⌘ on Apple systems, Ctrl elsewhere.
 */

interface NavigatorLike {
  platform?: string
  userAgentData?: { platform?: string }
}

/** macOS, iPadOS, iOS — read from the browser, best effort (no navigator: not Apple). */
export function isApplePlatform(nav: NavigatorLike | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  const platform = nav?.userAgentData?.platform || nav?.platform || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

export interface SendNowShortcut {
  /** What the hint shows before "+Enter": `⌘` or `Ctrl`. */
  key: string
  /** The `aria-keyshortcuts` value (WAI-ARIA key names). */
  aria: string
}

export function sendNowShortcut(apple: boolean = isApplePlatform()): SendNowShortcut {
  return apple ? { key: '⌘', aria: 'Meta+Enter' } : { key: 'Ctrl', aria: 'Control+Enter' }
}
