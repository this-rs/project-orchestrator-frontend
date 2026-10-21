/**
 * `math` viz — the LAZY chunk: KaTeX, its stylesheet (fonts are fetched by the browser
 * only for the glyphs a formula uses), and the sanitizer. Loaded by `LazyMathViz` only
 * when a formula appears in a conversation.
 *
 * Data: `{ tex: string, display?: boolean }` (display by default). A formula KaTeX refuses
 * shows KaTeX's reason and the TeX: in a sentence, the TeX itself, underlined, with the
 * reason as its tooltip.
 */
import { useMemo } from 'react'
import 'katex/dist/katex.min.css'
import { useT } from '@/i18n'
import type { VizBlockProps } from '../registry'
import { ReprRefusal } from '../ReprRefusal'
import { renderTex } from './katex'

export default function MathViz({ data, fallbackText, title }: VizBlockProps) {
  const { t } = useT()
  const tex = typeof data.tex === 'string' ? data.tex : ''
  const display = data.display !== false
  const result = useMemo(() => (tex ? renderTex(tex, display) : null), [tex, display])

  if (!result || !result.ok) {
    const error = result && !result.ok ? result.error : t('chatA-tools.viz.math.empty')
    if (!display) {
      return (
        <code className="po-math-refused underline decoration-amber-400/60 decoration-wavy" title={error} data-testid="math-refused">
          {tex || fallbackText}
        </code>
      )
    }
    return <ReprRefusal testId="math-refused" reason={t('chatA-tools.viz.math.refused')} detail={error} source={tex || fallbackText} />
  }
  // Sanitized above (`renderTex` → `sanitizeMath`): KaTeX with `trust: false`, then DOMPurify.
  return display ? (
    <div className="po-math my-2 overflow-x-auto overflow-y-hidden text-gray-100" role="math" aria-label={title ?? tex} data-testid="math-display" dangerouslySetInnerHTML={{ __html: result.html }} />
  ) : (
    <span className="po-math" role="math" aria-label={tex} data-testid="math-inline" dangerouslySetInnerHTML={{ __html: result.html }} />
  )
}
