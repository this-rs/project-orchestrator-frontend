import type { EdgeTypes } from '@xyflow/react'
import { SynapseEdge } from './SynapseEdge'
import { CoChangedEdge } from './CoChangedEdge'
import { AffectsEdge } from './AffectsEdge'

export { SynapseEdge, CoChangedEdge, AffectsEdge }

/**
 * Registry of custom intelligence edge types for ReactFlow.
 * Only special edges need custom components — others use default.
 */
export const intelligenceEdgeTypes: EdgeTypes = {
  synapse: SynapseEdge,
  co_changed: CoChangedEdge,
  affects: AffectsEdge,
}
