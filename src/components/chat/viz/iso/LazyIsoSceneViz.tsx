/**
 * The `iso_scene` entry of the viz registry: a few bytes in the chat bundle. The engine,
 * its checks and the WebGL canvas (`IsoSceneViz`) are a separate chunk, fetched the first
 * time a scene appears in a conversation.
 */
import { lazy, Suspense } from 'react'
import { Box } from 'lucide-react'
import { useT } from '@/i18n'
import type { VizBlockProps } from '../registry'
import { isLiveData } from './fence'

const IsoSceneViz = lazy(() => import('./IsoSceneViz'))
// A live scene of a plan (`{"live": {"plan": "<uuid>"}}`): its own lazy chunk, sharing the engine's.
const LivePlanViz = lazy(() => import('./LivePlanViz'))

export function IsoScenePlaceholder({ label }: { label?: string }) {
  const { t } = useT()
  return (
    <div className="flex h-[220px] w-full items-center justify-center gap-1.5 text-[11px] text-gray-500" data-testid="iso-scene-loading">
      <Box className="w-3.5 h-3.5 animate-pulse" />
      <span>{label ?? t('chatA-tools.viz.iso.loading')}</span>
    </div>
  )
}

export function LazyIsoSceneViz(props: VizBlockProps) {
  return (
    <Suspense fallback={<IsoScenePlaceholder />}>
      {isLiveData(props.data) ? <LivePlanViz {...props} /> : <IsoSceneViz {...props} />}
    </Suspense>
  )
}
