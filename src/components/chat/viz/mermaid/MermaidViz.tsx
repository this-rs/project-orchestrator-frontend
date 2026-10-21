/**
 * `mermaid` viz — the LAZY chunk: Mermaid (which itself fetches each diagram type's code
 * on first use), the chat's diagram theme, and the SVG sanitizer. Loaded by
 * `LazyMermaidViz` only when a diagram appears in a conversation.
 *
 * - `securityLevel: 'strict'`, no HTML labels, theme and security locked against
 *   `%%{init}%%`/front matter (`./theme.ts`).
 * - Mermaid's SVG is sanitized again (`../sanitize.ts`: no link, no foreign content, no
 *   network) before it reaches the DOM.
 * - A diagram Mermaid refuses shows Mermaid's reason and the text: never a crash, never
 *   Mermaid's error SVG.
 * - Rendered once per source and theme (the expand dialog and a re-mount reuse it).
 */
import { useEffect, useState } from 'react'
import { useT } from '@/i18n'
import type { VizBlockProps } from '../registry'
import { ReprRefusal } from '../ReprRefusal'
import { MermaidPlaceholder } from './LazyMermaidViz'
import { renderMermaid, type MermaidResult } from './render'

export default function MermaidViz({ data, fallbackText, expanded = false, title }: VizBlockProps) {
  const { t } = useT()
  const source = typeof data.source === 'string' ? data.source : ''
  const [state, setState] = useState<{ source: string; result: MermaidResult } | null>(null)
  useEffect(() => {
    let live = true
    if (source) void renderMermaid(source).then((result) => live && setState({ source, result }))
    return () => {
      live = false
    }
  }, [source])

  if (!source) return <ReprRefusal testId="mermaid-refused" reason={t('chatA-tools.viz.mermaid.empty')} source={fallbackText} />
  const result = state?.source === source ? state.result : null
  if (!result) return <MermaidPlaceholder />
  if (!result.ok) return <ReprRefusal testId="mermaid-refused" reason={t('chatA-tools.viz.mermaid.refused')} detail={result.error} source={source} />
  return (
    <div
      className={`po-mermaid flex w-full justify-center [&_svg]:h-auto [&_svg]:max-w-full ${expanded ? '[&_svg]:max-h-[75vh]' : ''}`}
      role="img"
      aria-label={title ?? fallbackText}
      data-testid="mermaid-diagram"
      // Sanitized above (`sanitizeSvg`): Mermaid's strict output, then DOMPurify's SVG profile.
      dangerouslySetInnerHTML={{ __html: result.svg }}
    />
  )
}
