/**
 * The `math` entry of the viz registry: a few bytes in the chat bundle. KaTeX and its
 * stylesheet (`MathViz`) are a separate chunk, fetched the first time a formula appears.
 * Until then the TeX itself stands in (inline: as code; display: dimmed).
 */
import { lazy, Suspense } from 'react'
import type { VizBlockProps } from '../registry'

const MathViz = lazy(() => import('./MathViz'))

export function MathPlaceholder({ tex, display, label }: { tex: string; display: boolean; label?: string }) {
  if (!display) return <code data-testid="math-loading">{tex}</code>
  return (
    <div className="my-2 text-[12px] text-gray-500" data-testid="math-loading">
      {label && <div className="mb-1 text-[11px] animate-pulse">{label}</div>}
      <pre className="whitespace-pre-wrap font-mono leading-relaxed !bg-transparent !border-0 !p-0 !m-0">{tex}</pre>
    </div>
  )
}

export function LazyMathViz(props: VizBlockProps) {
  const tex = typeof props.data.tex === 'string' ? props.data.tex : props.fallbackText
  return (
    <Suspense fallback={<MathPlaceholder tex={tex} display={props.data.display !== false} />}>
      <MathViz {...props} />
    </Suspense>
  )
}
