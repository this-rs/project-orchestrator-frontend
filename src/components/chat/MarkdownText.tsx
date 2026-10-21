import { createContext, memo, useContext, useMemo, type ComponentType } from 'react'
import ReactMarkdown, { type Options as MarkdownOptions } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeHighlight from 'rehype-highlight'
type PluggableList = NonNullable<MarkdownOptions['rehypePlugins']>
import { ExternalLink } from '@/components/ui/ExternalLink'
import type { ChatReference } from '@/refs/types'
import { CitedRefChip } from './CitedRefChip'
import { KnownRefsContext } from './citedRef'
import { remarkCiteRefs } from './citeRefsPlugin'
import { fenceClosed, fenceLang, hastText } from './viz/iso/fence'
import { MATH_LANG } from './viz/math/fence'

/**
 * A component that renders a fenced code block of one language instead of the code
 * (```iso-scene → a 3D scene, ```mermaid → a diagram, ```math / $$…$$ → a formula).
 * `streaming`: the block is still being written (its closing fence has not arrived).
 * `inline`: the block is inline (`$$x$$` in a sentence — only math is ever inline).
 */
export type FenceRenderer = ComponentType<{ source: string; streaming: boolean; inline?: boolean }>

/**
 * Markdown link component: uses ExternalLink which renders differently
 * in Tauri (no href, onClick only) vs browser (normal <a>).
 */
const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: ({ href, children, ...props }: any) => (
    <ExternalLink href={href} {...props}>
      {children}
    </ExternalLink>
  ),
}

const citingComponents = {
  ...markdownComponents,
  'po-cited-ref': ({ kind, id, raw }: { kind: string; id: string; raw: string }) => (
    <CitedRefChip kind={kind} id={id} raw={raw} />
  ),
}
/**
 * The markdown being streamed, for `fenceClosed`. A context, not an argument of the
 * overrides: they must stay the same components from one delta to the next, or every
 * diagram of the message would be re-mounted (and re-rendered) at each delta.
 */
const StreamingTextContext = createContext('')

/**
 * The `pre` and `code` overrides that hand a fenced block of a known language to its
 * renderer (and inline math, `$$x$$`, to the math renderer); any other block renders as
 * before.
 */
function fencedComponents(fences: Readonly<Record<string, FenceRenderer>>, streaming: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function Pre({ node, children, ...props }: any) {
    const text = useContext(StreamingTextContext)
    const code = node?.children?.find((c: { type?: string; tagName?: string }) => c.type === 'element' && c.tagName === 'code')
    const lang = code ? fenceLang(code.properties?.className) : null
    const Fence = lang ? fences[lang] : undefined
    if (Fence) return <Fence source={hastText(code)} streaming={streaming && !fenceClosed(text, node?.position)} />
    return <pre {...props}>{children}</pre>
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function Code({ node, children, ...props }: any) {
    const classes = node?.properties?.className
    const inlineMath = Array.isArray(classes) && classes.includes('math-inline')
    const Fence = inlineMath ? fences[MATH_LANG] : undefined
    if (Fence) return <Fence source={hastText(node)} streaming={false} inline />
    return <code {...props}>{children}</code>
  }
  return { pre: Pre, code: Code }
}

const DEFAULT_REHYPE: PluggableList = [rehypeHighlight]
const PLAIN_PLUGINS = [remarkGfm]
const CITING_PLUGINS = [remarkGfm, remarkCiteRefs]
/**
 * `$$…$$` is math (inline or on its own lines); a single `$` never is: "$5 and $10" stays
 * prose. Only for the agent's words, when a math renderer is given.
 */
const MATH_PLUGIN = [remarkMath, { singleDollarTextMath: false }] as const
const PLAIN_MATH_PLUGINS = [remarkGfm, MATH_PLUGIN]
const CITING_MATH_PLUGINS = [remarkGfm, MATH_PLUGIN, remarkCiteRefs]


/**
 * Trailing, still-incomplete line made only of `-` or `=` (up to 3 leading
 * spaces, optional trailing blanks) that directly follows another line.
 */
const SETEXT_UNDERLINE_TAIL = /\n {0,3}(?:-+|=+)[ \t]*$/

/**
 * Hold back an ambiguous trailing line while the block is still streaming.
 *
 * LLMs constantly write "Voici les étapes :\n- première étape". Mid-stream,
 * the text often ends at "Voici les étapes :\n-": CommonMark reads a lone
 * `-` (or `=`) line under a paragraph as a SETEXT HEADING underline, so the
 * whole previous line flashes as a big <h2> for a frame or two until the
 * next delta turns it into a list item — visible flicker. Deferring that
 * single unterminated line until the next delta (or the newline that
 * completes it) removes the flash; once the line is complete it renders
 * exactly as CommonMark says, so a real `Title\n---` heading is unaffected.
 */
function holdBackAmbiguousTail(content: string): string {
  const m = SETEXT_UNDERLINE_TAIL.exec(content)
  return m ? content.slice(0, m.index + 1) : content
}

/**
 * Memoized markdown renderer for chat text blocks.
 *
 * ReactMarkdown + rehype-highlight is EXPENSIVE (full md parse + syntax
 * highlighting of every code block). During streaming, a stream_delta event
 * arrives several times per second and updates the messages array — without
 * memoization every text block of every message re-parsed its entire content
 * on every delta: O(conversation size × delta rate) main-thread work. On
 * mobile this saturated the CPU (device heating up) and starved the chat
 * input of frames (laggy typing).
 *
 * With memo, only the single block whose `content` string actually changed
 * (the one being streamed into) re-parses; every completed block is a
 * reference-equality cache hit.
 *
 * `isStreaming` must only be set on the block currently receiving deltas.
 */
export const MarkdownText = memo(function MarkdownText({
  content,
  isStreaming = false,
  citeRefs = false,
  knownRefs,
  fences,
}: {
  content: string
  isStreaming?: boolean
  /**
   * The text is the agent's own words: a `#kind:id` in it becomes a chip.
   * Off by default — a note body, a tool result or a document is untrusted
   * and never gets chips.
   */
  citeRefs?: boolean
  /** Labels already resolved by the server for this conversation. */
  knownRefs?: readonly ChatReference[]
  /**
   * Fenced blocks rendered by a component instead of as code, by language
   * (`{ 'iso-scene': IsoSceneFence }`). Pass a STABLE object (module constant).
   * Only for the agent's own words, like `citeRefs`. With a `math` renderer, `$$…$$`
   * is math too.
   */
  fences?: Readonly<Record<string, FenceRenderer>>
}) {
  const base = citeRefs ? (citingComponents as typeof markdownComponents) : markdownComponents
  const text = isStreaming ? holdBackAmbiguousTail(content) : content
  const components = useMemo(() => (fences ? { ...base, ...fencedComponents(fences, isStreaming) } : base), [base, fences, isStreaming])
  // A fence a component renders is never highlighted (its language is unknown to highlight.js).
  const rehype = useMemo<PluggableList>(() => (fences ? [[rehypeHighlight, { plainText: Object.keys(fences) }]] : DEFAULT_REHYPE), [fences])
  const math = !!fences?.[MATH_LANG]
  const remark = (math ? (citeRefs ? CITING_MATH_PLUGINS : PLAIN_MATH_PLUGINS) : citeRefs ? CITING_PLUGINS : PLAIN_PLUGINS) as PluggableList
  const md = (
    <ReactMarkdown
      remarkPlugins={remark}
      rehypePlugins={rehype}
      components={components}
    >
      {text}
    </ReactMarkdown>
  )
  const withRefs = citeRefs && knownRefs?.length ? <KnownRefsContext.Provider value={knownRefs}>{md}</KnownRefsContext.Provider> : md
  // Only while streaming: whether the last block is closed yet (`fenceClosed`).
  return fences && isStreaming ? <StreamingTextContext.Provider value={text}>{withRefs}</StreamingTextContext.Provider> : withRefs
})
