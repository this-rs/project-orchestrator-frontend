import { useT, type MessageKey } from '@/i18n'
import type { NeighborhoodLayer } from '@/services/neighborhood'
import { ENTITY_TYPE_LABELS } from './entityVisuals'

/** Entity type, layer and relation names in the viewer's language (an unknown code reads as itself). */
export function useEntityLabels() {
  const { t } = useT()
  return {
    typeLabel: (type: string) => (type in ENTITY_TYPE_LABELS ? t(`graph.types.${type}` as MessageKey) : type),
    layerLabel: (layer: NeighborhoodLayer) => t(`graph.layers.${layer}.label` as MessageKey),
    layerDescription: (layer: NeighborhoodLayer) => t(`graph.layers.${layer}.description` as MessageKey),
  }
}
