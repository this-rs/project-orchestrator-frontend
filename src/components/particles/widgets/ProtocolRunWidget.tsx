/**
 * ProtocolRunWidget — FeedbackLoopScene driven by protocol run data.
 *
 * Integrates into ProtocolDetailPage during active runs.
 * Inline.
 */

import { ParticleViz } from '../ParticleViz';
import type { FeedbackLoopData } from '../adapters/types';

export interface ProtocolRunWidgetProps {
  data?: FeedbackLoopData;
  className?: string;
  height?: number;
}

export function ProtocolRunWidget({
  data,
  className = '',
  height = 300,
}: ProtocolRunWidgetProps) {
  return (
    <ParticleViz
      scene="feedback-loop"
      data={data}
      height={height}
      className={className}
    />
  );
}
