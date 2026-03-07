/**
 * VizBlock module — auto-registers built-in visualization components.
 *
 * Import this module to ensure all core viz components are registered
 * in the vizRegistry before any rendering occurs.
 *
 * Pattern Federation modules can register additional components separately
 * by importing { vizRegistry } from './registry' and calling register().
 */
import { vizRegistry, VIZ_TYPES } from './registry'
import { ReasoningTreeViz } from './ReasoningTreeViz'
import { ImpactGraphViz } from './ImpactGraphViz'
import { ProgressBarViz } from './ProgressBarViz'
import { ContextRadarViz } from './ContextRadarViz'
import { KnowledgeCardViz } from './KnowledgeCardViz'

// ============================================================================
// Register built-in viz components
// ============================================================================

vizRegistry.register(VIZ_TYPES.REASONING_TREE, ReasoningTreeViz, 'Reasoning Tree')
vizRegistry.register(VIZ_TYPES.IMPACT_GRAPH, ImpactGraphViz, 'Impact Graph')
vizRegistry.register(VIZ_TYPES.PROGRESS_BAR, ProgressBarViz, 'Progress Bar')
vizRegistry.register(VIZ_TYPES.CONTEXT_RADAR, ContextRadarViz, 'Context Radar')
vizRegistry.register(VIZ_TYPES.KNOWLEDGE_CARD, KnowledgeCardViz, 'Knowledge Card')

// ============================================================================
// Re-exports
// ============================================================================

export { VizBlockRenderer } from './VizBlockRenderer'
export { vizRegistry, VIZ_TYPES } from './registry'
export type { VizBlockProps, VizType, ContentBlock as VizContentBlock, VizBlock } from './registry'
