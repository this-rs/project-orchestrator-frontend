/**
 * An ```iso-scene fenced block of the agent's text, shown as an `iso_scene` viz block
 * (same frame, expand dialog and error boundary as every viz of the chat).
 *
 * - While the message streams, a block whose JSON is not complete yet is a placeholder
 *   ("composing"), not an error.
 * - Once complete, unparsable JSON is refused with the reason and the source as fallback.
 * - Valid JSON goes to the lazy viz, which checks the scene itself.
 */
import { useMemo } from 'react'
import type { ContentBlock } from '@/types'
import { useT } from '@/i18n'
// The viz module itself (not just its renderer): it registers `iso_scene` before any render.
import { VizBlockRenderer, VIZ_TYPES } from '..'
import { parseIsoSceneFence, isoSceneFallback, ISO_SCENE_MAX_CHARS } from './fence'
import { IsoScenePlaceholder } from './LazyIsoSceneViz'

export function IsoSceneFence({ source, streaming = false }: { source: string; streaming?: boolean }) {
  const { t } = useT()
  const parsed = useMemo(() => parseIsoSceneFence(source.trim()), [source])
  const block = useMemo<ContentBlock | null>(() => {
    if (!parsed.ok) return null
    const title = typeof parsed.data.title === 'string' ? parsed.data.title : undefined
    return {
      id: `iso-fence`,
      type: 'viz',
      content: isoSceneFallback(parsed.data, source),
      metadata: { viz_type: VIZ_TYPES.ISO_SCENE, viz_data: parsed.data, viz_title: title, viz_max_height: 280 },
    }
  }, [parsed, source])

  if (block) return <VizBlockRenderer block={block} />
  if (streaming && parsed.ok === false && parsed.reason !== 'too_large') {
    return (
      <div className="my-2 rounded-lg border border-white/[0.08] bg-white/[0.02]">
        <IsoScenePlaceholder label={t('chatA-tools.viz.iso.composing')} />
      </div>
    )
  }
  const reason =
    parsed.ok === false && parsed.reason === 'too_large'
      ? t('chatA-tools.viz.iso.tooLarge', { max: ISO_SCENE_MAX_CHARS })
      : parsed.ok === false && parsed.reason === 'not_object'
        ? t('chatA-tools.viz.iso.notObject')
        : t('chatA-tools.viz.iso.notJson', { detail: parsed.ok === false ? (parsed.detail ?? '') : '' })
  return (
    <div className="my-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2" role="note" data-testid="iso-scene-refused">
      <div className="text-xs text-amber-300/90">{reason}</div>
      <pre className="mt-2 max-h-40 overflow-auto text-[11px] text-gray-500 whitespace-pre-wrap font-mono leading-relaxed">{source}</pre>
    </div>
  )
}
