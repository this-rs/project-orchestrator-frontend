/**
 * CommunityVizWidget — EmbeddingsScene driven by community data.
 *
 * Integrates into Intelligence page → "Communities" tab.
 * Full width. Supports interactive mode (opt-in).
 */

import { ParticleViz } from '../ParticleViz';
import type { ParticleHitInfo } from '../ParticleViz';
import type { EmbeddingsData } from '../adapters/types';

export interface CommunityVizWidgetProps {
  data?: EmbeddingsData;
  className?: string;
  height?: number;
  /** Enable interactive mode: hover tooltips, click handlers */
  interactive?: boolean;
  /** Called when a particle is clicked */
  onParticleClick?: (info: ParticleHitInfo) => void;
}

export function CommunityVizWidget({
  data,
  className = '',
  height = 400,
  interactive = false,
  onParticleClick,
}: CommunityVizWidgetProps) {
  return (
    <ParticleViz
      scene="embeddings"
      data={data}
      height={height}
      className={`w-full ${className}`}
      interactive={interactive}
      onParticleClick={onParticleClick}
    />
  );
}
