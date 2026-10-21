/**
 * A formula of the agent's text (```math, `$$…$$`), rendered by KaTeX in the text flow:
 * no viz frame around an equation. Same contract as every typed block of the chat:
 *
 * - While the block is being written (no closing fence yet): its TeX, dimmed, with
 *   "writing the formula…", never a parse error of half a formula.
 * - Empty or too large: refused here, with the text.
 * - Anything else goes to the lazy renderer, under the viz error boundary.
 */
import { useMemo } from 'react'
import { useT } from '@/i18n'
import { VizErrorBoundary } from '../VizBlockRenderer'
import { ReprRefusal } from '../ReprRefusal'
import { parseMathFence, MATH_MAX_CHARS } from './fence'
import { LazyMathViz, MathPlaceholder } from './LazyMathViz'

export function MathFence({ source, streaming = false, inline = false }: { source: string; streaming?: boolean; inline?: boolean }) {
  const { t } = useT()
  const parsed = useMemo(() => parseMathFence(source), [source])
  const data = useMemo(() => (parsed.ok ? { tex: parsed.tex, display: !inline } : null), [parsed, inline])

  if (!data) {
    if (inline) return <code>{source}</code>
    const tooLarge = parsed.ok === false && parsed.reason === 'too_large'
    if (streaming && !tooLarge) return <MathPlaceholder tex={source} display label={t('chatA-tools.viz.math.composing')} />
    const reason = tooLarge ? t('chatA-tools.viz.math.tooLarge', { max: MATH_MAX_CHARS }) : t('chatA-tools.viz.math.empty')
    return <ReprRefusal testId="math-refused" reason={reason} source={source} />
  }
  if (streaming) return <MathPlaceholder tex={data.tex} display label={t('chatA-tools.viz.math.composing')} />
  return (
    <VizErrorBoundary fallbackText={data.tex}>
      <LazyMathViz data={data} fallbackText={data.tex} />
    </VizErrorBoundary>
  )
}
