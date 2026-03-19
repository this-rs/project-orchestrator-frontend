/**
 * CommunityVizWidget — EmbeddingsScene driven by community data.
 *
 * Integrates into Intelligence page → "Communities" tab.
 * Full width.
 */

import { ParticleViz } from '../ParticleViz';
import type { EmbeddingsData } from '../adapters/types';

export interface CommunityVizWidgetProps {
  data?: EmbeddingsData;
  className?: string;
  height?: number;
}

export function CommunityVizWidget({
  data,
  className = '',
  height = 400,
}: CommunityVizWidgetProps) {
  return (
    <ParticleViz
      scene="embeddings"
      data={data}
      height={height}
      className={`w-full ${className}`}
    />
  );
}
