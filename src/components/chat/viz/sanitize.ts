/**
 * Sanitizing what a renderer of the agent's text produces (a Mermaid SVG, a KaTeX tree)
 * before it reaches the DOM. LAZY: only the renderer chunks import it (DOMPurify is not in
 * the initial chat bundle).
 *
 * A private DOMPurify instance (Mermaid installs and removes hooks on the shared one), and
 * on top of DOMPurify's own allow-lists:
 * - no link, no form, no embedded HTML, no image or media, no `<use>`, no animation:
 *   nothing to click, nothing fetched (a link inside the SVG would navigate the desktop
 *   webview);
 * - no `href`/`src` at all, and no CSS `url(…)` other than a local `#id`, no `@import`:
 *   a diagram's styles cannot load anything from the network.
 */
import DOMPurify, { type Config } from 'dompurify'

/** CSS of the agent's text: `url(…)` other than `url(#local)` and `@import` are removed. */
export function cleanCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '(')
}

const FORBID_TAGS = ['a', 'img', 'picture', 'video', 'audio', 'source', 'form', 'input', 'button', 'textarea', 'link', 'meta', 'foreignObject', 'image', 'use', 'iframe', 'object', 'embed', 'script', 'animate', 'set', 'animateMotion', 'animateTransform', 'feImage']
const FORBID_ATTR = ['href', 'xlink:href', 'src', 'srcset', 'action', 'formaction']

let instance: ReturnType<typeof DOMPurify> | null = null
function purifier() {
  if (instance) return instance
  const p = DOMPurify(window)
  p.addHook('uponSanitizeElement', (node) => {
    if (node.nodeName.toLowerCase() === 'style' && node.textContent) node.textContent = cleanCss(node.textContent)
  })
  p.addHook('uponSanitizeAttribute', (_node, data) => {
    if (typeof data.attrValue === 'string' && /url\(|@import|expression\s*\(/i.test(data.attrValue)) data.attrValue = cleanCss(data.attrValue)
  })
  instance = p
  return p
}

function run(dirty: string, config: Config): string {
  return String(purifier().sanitize(dirty, { ...config, FORBID_TAGS, FORBID_ATTR, RETURN_TRUSTED_TYPE: false }))
}

/**
 * A Mermaid SVG: SVG and its filters only (Mermaid renders its labels as SVG text). A link
 * (`click A href …`) becomes a plain group first: Mermaid positions the node inside it, so
 * dropping the element would misplace the node; its `href` goes with FORBID_ATTR. (Markup in
 * a label is escaped text in the serialized SVG: only real elements start with `<a`.)
 */
export function sanitizeSvg(svg: string): string {
  const unlinked = svg.replace(/<a(?=[\s>])/g, '<g').replace(/<\/a>/g, '</g>')
  return run(unlinked, { USE_PROFILES: { svg: true, svgFilters: true } })
}

/** KaTeX output: its spans and inline styles, and the few SVG paths it draws (radicals, arrows). */
export function sanitizeMath(html: string): string {
  return run(html, { USE_PROFILES: { html: true, svg: true } })
}
