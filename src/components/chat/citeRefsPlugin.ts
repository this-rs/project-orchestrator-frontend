import { findRefTokens } from '@/utils/messageRefs'

/** Minimal mdast shape: enough to walk and rewrite text nodes without a new dependency. */
interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: Record<string, unknown>
}

/** Nodes whose text is never a citation: code, link text/targets, raw html. */
const OPAQUE = new Set(['code', 'inlineCode', 'link', 'linkReference', 'definition', 'html', 'image', 'imageReference'])

function split(node: MdNode): MdNode[] | null {
  const text = node.value ?? ''
  const tokens = findRefTokens(text)
  if (tokens.length === 0) return null
  const out: MdNode[] = []
  let at = 0
  for (const t of tokens) {
    if (t.start > at) out.push({ type: 'text', value: text.slice(at, t.start) })
    out.push({
      type: 'poCitedRef',
      data: { hName: 'po-cited-ref', hProperties: { kind: t.kind, id: t.id, raw: t.raw } },
    })
    at = t.end
  }
  if (at < text.length) out.push({ type: 'text', value: text.slice(at) })
  return out
}

function walk(node: MdNode): void {
  if (!node.children || OPAQUE.has(node.type)) return
  const next: MdNode[] = []
  for (const child of node.children) {
    if (child.type === 'text') next.push(...(split(child) ?? [child]))
    else {
      walk(child)
      next.push(child)
    }
  }
  node.children = next
}

/**
 * remark plugin: a `#kind:id` token in the text of the agent becomes a
 * `po-cited-ref` element. Same token reader as the composer (`findRefTokens`),
 * so what the user can write is what the agent can cite.
 */
export const remarkCiteRefs = () => (tree: MdNode) => walk(tree)
