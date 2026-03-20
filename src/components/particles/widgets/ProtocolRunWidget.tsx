/**
 * ProtocolRunWidget — FeedbackLoopScene driven by protocol run data.
 *
 * Integrates into ProtocolDetailPage during active runs.
 * Supports interactive mode: click on a version marker → callback with state info.
 */

import { ParticleViz } from '../ParticleViz';
import type { ParticleHitInfo } from '../ParticleViz';
import type { FeedbackLoopData } from '../adapters/types';

export interface ProtocolRunWidgetProps {
  data?: FeedbackLoopData;
  className?: string;
  height?: number;
  /** Enable interactive mode (hit-testing on markers). Default false for backward compat. */
  interactive?: boolean;
  /** Called when a marker is clicked — metadata includes state_id, state_name, markerIndex */
  onMarkerClick?: (info: ParticleHitInfo) => void;
  /** Called on marker hover */
  onMarkerHover?: (info: ParticleHitInfo | null) => void;
}

export function ProtocolRunWidget({
  data,
  className = '',
  height = 300,
  interactive = false,
  onMarkerClick,
  onMarkerHover,
}: ProtocolRunWidgetProps) {
  return (
    <ParticleViz
      scene="feedback-loop"
      data={data}
      height={height}
      className={className}
      interactive={interactive}
      onParticleClick={onMarkerClick}
      onParticleHover={onMarkerHover}
    />
  );
}
