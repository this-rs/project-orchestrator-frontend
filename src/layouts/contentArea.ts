/**
 * Routes whose page fills the content area and scrolls inside itself (a
 * conversation: fixed header, scrolling messages).
 *
 * For those the layout must NOT be a scroller as well. Two nested scrollers
 * of the same height, with the layout's footer added under the page, let the
 * outer one move by the footer's height: the whole page slides up behind the
 * conversation and leaves an empty band at the bottom of the screen.
 */
const CONTENT_AREA_ROUTES = [/\/chat\/[^/]+\/?$/]

export function ownsContentArea(pathname: string): boolean {
  return CONTENT_AREA_ROUTES.some((route) => route.test(pathname))
}
