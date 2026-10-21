/**
 * A ```mermaid fenced block of the agent's text, shown as a `mermaid` viz block (same
 * frame, expand dialog and error boundary as every viz of the chat).
 *
 * - While the block is being written (no closing fence yet), a placeholder ("composing"),
 *   never a parse error of a half-written diagram.
 * - An empty or too large block is refused here, with its text.
 * - Anything else goes to the lazy viz: Mermaid checks it, and a diagram it refuses shows
 *   Mermaid's reason and the text.
 */
import { useMemo } from 'react'
import type { ContentBlock } from '@/types'
import { useT } from '@/i18n'
// The viz module itself (not just its renderer): it registers `mermaid` before any render.
import { VizBlockRenderer, VIZ_TYPES } from '..'
import { ReprRefusal } from '../ReprRefusal'
import { parseMermaidFence, MERMAID_MAX_CHARS } from './fence'
import { MermaidPlaceholder } from './LazyMermaidViz'

export function MermaidFence({ source, streaming = false }: { source: string; streaming?: boolean }) {
  const { t } = useT()
  const parsed = useMemo(() => parseMermaidFence(source), [source])
  const fallbackTitle = t('chatA-tools.viz.mermaid.title')
  const block = useMemo<ContentBlock | null>(() => {
    if (!parsed.ok) return null
    return {
      id: 'mermaid-fence',
      type: 'viz',
      content: parsed.source,
      metadata: { viz_type: VIZ_TYPES.MERMAID, viz_data: { source: parsed.source }, viz_title: parsed.title ?? fallbackTitle, viz_max_height: 480 },
    }
  }, [parsed, fallbackTitle])

  if (parsed.ok === false && parsed.reason === 'too_large') {
    return <ReprRefusal testId="mermaid-refused" reason={t('chatA-tools.viz.mermaid.tooLarge', { max: MERMAID_MAX_CHARS })} source={source} />
  }
  if (streaming) {
    return (
      <div className="my-2 rounded-lg border border-white/[0.08] bg-white/[0.02]">
        <MermaidPlaceholder label={t('chatA-tools.viz.mermaid.composing')} />
      </div>
    )
  }
  if (!block) return <ReprRefusal testId="mermaid-refused" reason={t('chatA-tools.viz.mermaid.empty')} source={source} />
  return <VizBlockRenderer block={block} />
}
