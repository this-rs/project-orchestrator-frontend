/**
 * VizBlock Registry — dynamic dispatch for visualization components.
 *
 * Allows runtime registration of React components for rendering VizBlocks.
 * Pattern Federation modules register their components during initialization.
 *
 * @example
 * ```ts
 * import { vizRegistry } from './registry';
 * import { ReasoningTreeViz } from './ReasoningTreeViz';
 *
 * // Register a built-in component
 * vizRegistry.register('reasoning_tree', ReasoningTreeViz);
 *
 * // Register a custom component (Pattern Federation)
 * vizRegistry.register('protocol_run', ProtocolRunViz);
 *
 * // Check if a type is registered
 * vizRegistry.has('reasoning_tree'); // true
 *
 * // Get the component for a viz type
 * const Component = vizRegistry.get('reasoning_tree');
 * ```
 */

import type { ComponentType } from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * Props passed to every VizBlock component.
 *
 * The `data` field contains the structured JSON payload from the backend.
 * The `fallbackText` is available for accessibility or error fallback.
 */
export interface VizBlockProps {
  /** Structured data payload (schema depends on vizType). */
  data: Record<string, unknown>;
  /** Whether the viz is in expanded (modal) mode. */
  expanded?: boolean;
  /** Human-readable fallback text for non-visual rendering. */
  fallbackText: string;
  /** Optional title for the visualization. */
  title?: string;
  /** Whether the viz supports interaction. */
  interactive?: boolean;
  /** Maximum height in compact mode (px). */
  maxHeight?: number;
}

/**
 * A registered viz component with its metadata.
 */
interface VizRegistryEntry {
  /** The React component that renders this viz type. */
  component: ComponentType<VizBlockProps>;
  /** Optional display name for debugging. */
  displayName?: string;
}

// ============================================================================
// VizRegistry class
// ============================================================================

/**
 * Registry for mapping viz types to React components.
 *
 * Thread-safe for single-threaded JS runtime. Components are registered
 * at module load time (boot) and then read-only during rendering.
 */
class VizRegistry {
  private entries = new Map<string, VizRegistryEntry>();

  /**
   * Register a component for a viz type.
   * Overwrites any previously registered component for the same type.
   */
  register(vizType: string, component: ComponentType<VizBlockProps>, displayName?: string): void {
    this.entries.set(vizType, { component, displayName: displayName ?? vizType });
  }

  /**
   * Unregister a component for a viz type.
   */
  unregister(vizType: string): boolean {
    return this.entries.delete(vizType);
  }

  /**
   * Check if a component is registered for the given viz type.
   */
  has(vizType: string): boolean {
    return this.entries.has(vizType);
  }

  /**
   * Get the component for a viz type.
   * Returns undefined if not registered.
   */
  get(vizType: string): ComponentType<VizBlockProps> | undefined {
    return this.entries.get(vizType)?.component;
  }

  /**
   * Get all registered viz types.
   */
  registeredTypes(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Get the number of registered components.
   */
  get size(): number {
    return this.entries.size;
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

/**
 * Global viz registry instance.
 *
 * Import this singleton to register or look up viz components:
 * ```ts
 * import { vizRegistry } from '@/components/chat/viz/registry';
 * ```
 */
export const vizRegistry = new VizRegistry();

// ============================================================================
// VizBlock types (mirrors backend VizType enum)
// ============================================================================

/**
 * Known viz type constants.
 * Matches the backend `VizType` enum in `src/chat/viz.rs`.
 */
export const VIZ_TYPES = {
  // Core types (TP3)
  IMPACT_GRAPH: 'impact_graph',
  REASONING_TREE: 'reasoning_tree',
  PROGRESS_BAR: 'progress_bar',
  CONTEXT_RADAR: 'context_radar',
  KNOWLEDGE_CARD: 'knowledge_card',
  DEPENDENCY_TREE: 'dependency_tree',

  // Pattern Federation reserved (T1-T6)
  PROTOCOL_RUN: 'protocol_run',
  FSM_STATE: 'fsm_state',
  CONTEXT_ROUTING: 'context_routing',
  WAVE_PROGRESS: 'wave_progress',
} as const;

export type VizType = (typeof VIZ_TYPES)[keyof typeof VIZ_TYPES] | string;

// ============================================================================
// ContentBlock types (mirrors backend ContentBlock enum)
// ============================================================================

/**
 * A text block in a chat response.
 */
export interface TextBlock {
  block_type: 'text';
  content: string;
}

/**
 * A visualization block in a chat response.
 */
export interface VizBlock {
  block_type: 'viz';
  viz_type: VizType;
  data: Record<string, unknown>;
  interactive: boolean;
  fallback_text: string;
  title?: string;
  max_height?: number;
}

/**
 * A content block in a chat response (text or viz).
 */
export type ContentBlock = TextBlock | VizBlock;

/**
 * Type guard for VizBlock.
 */
export function isVizBlock(block: ContentBlock): block is VizBlock {
  return block.block_type === 'viz';
}

/**
 * Type guard for TextBlock.
 */
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.block_type === 'text';
}
