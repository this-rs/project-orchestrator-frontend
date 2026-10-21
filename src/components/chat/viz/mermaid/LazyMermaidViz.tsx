/**
 * The `mermaid` entry of the viz registry: a few bytes in the chat bundle. Mermaid itself,
 * the chat's diagram theme and the SVG sanitizer (`MermaidViz`) are a separate chunk,
 * fetched the first time a diagram appears in a conversation.
 */
import { lazy, Suspense } from 'react'
import { Network } from 'lucide-react'
import { useT } from '@/i18n'
import type { VizBlockProps } from '../registry'

const MermaidViz = lazy(() => import('./MermaidViz'))

export function MermaidPlaceholder({ label }: { label?: string }) {
  const { t } = useT()
  return (
    <div className="flex h-[120px] w-full items-center justify-center gap-1.5 text-[11px] text-gray-500" data-testid="mermaid-loading">
      <Network className="w-3.5 h-3.5 animate-pulse" aria-hidden />
      <span>{label ?? t('chatA-tools.viz.mermaid.loading')}</span>
    </div>
  )
}

export function LazyMermaidViz(props: VizBlockProps) {
  return (
    <Suspense fallback={<MermaidPlaceholder />}>
      <MermaidViz {...props} />
    </Suspense>
  )
}
