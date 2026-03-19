/**
 * ProjectHealthWidget — MoatScene driven by real project health data.
 *
 * Integrates into ProjectDetailPage → "Health Overview" section.
 * Compact: 300×200px default.
 */

import { ParticleViz } from '../ParticleViz';
import type { MoatData } from '../adapters/types';

export interface ProjectHealthWidgetProps {
  data?: MoatData;
  className?: string;
  height?: number;
}

export function ProjectHealthWidget({
  data,
  className = '',
  height = 200,
}: ProjectHealthWidgetProps) {
  return (
    <ParticleViz
      scene="moat"
      data={data}
      height={height}
      className={className}
    />
  );
}
