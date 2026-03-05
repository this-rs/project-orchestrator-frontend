import type { EdgeTypes } from '@xyflow/react'
import { SynapseEdge } from './SynapseEdge'

export { SynapseEdge }

/**
 * Registry of custom intelligence edge types for ReactFlow.
 * Only special edges need custom components — others use default.
 */
export const intelligenceEdgeTypes: EdgeTypes = {
  synapse: SynapseEdge,
}
