/**
 * ProjectHealthWidget — MoatScene driven by real project health data.
 *
 * Integrates into ProjectDetailPage → "Health Overview" section.
 * Compact: 300×200px default.
 *
 * Interactive mode (opt-in):
 *   - Hover on a layer ring → tooltip with layer name + count
 *   - Click on a layer ring → calls onLayerClick(layerName) for scroll-to-section
 */

import { useRef, useState, useCallback } from 'react';
import { ParticleViz } from '../ParticleViz';
import type { MoatData } from '../adapters/types';
import { MoatScene } from '../scenes/MoatScene';

/** Map layer names to human-readable labels */
const LAYER_LABELS: Record<string, string> = {
  code: 'Code',
  knowledge: 'Knowledge',
  skills: 'Skills',
  behavioral: 'Behavioral',
  fabric: 'Fabric',
  neural: 'Neural',
};

export interface ProjectHealthWidgetProps {
  data?: MoatData;
  className?: string;
  height?: number;
  /** Enable interactive mode: hover tooltips + click callbacks. Default: true */
  interactive?: boolean;
  /** Called when a layer ring is clicked. Receives the layer name (e.g. 'code', 'skills') */
  onLayerClick?: (layerName: string) => void;
}

// ── Tooltip styles (cosmos/terminal design system) ──────────
const TOOLTIP_STYLE: React.CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
  zIndex: 10,
  background: 'rgba(0,0,0,0.85)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#ffffff',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '1.4',
  padding: '8px 12px',
  borderRadius: '4px',
  maxWidth: '240px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  transition: 'opacity 120ms ease-out',
};

export function ProjectHealthWidget({
  data,
  className = '',
  height = 320,
  interactive = true,
  onLayerClick,
}: ProjectHealthWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MoatScene | null>(null);
  const lastMoveTime = useRef(0);

  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
    visible: boolean;
  }>({ text: '', x: 0, y: 0, visible: false });

  // Get or create a stable reference to the MoatScene instance
  const getScene = useCallback((): MoatScene | null => {
    // The scene is instantiated by ParticleViz internally via the registry.
    // We need our own instance to call hitTestLayer. We'll create one that
    // mirrors the data but is only used for hit-testing geometry.
    if (!sceneRef.current) {
      sceneRef.current = new MoatScene();
    }
    return sceneRef.current;
  }, []);

  // Keep our hit-test scene in sync with the data
  const scene = getScene();
  if (scene && data) {
    scene.setData(data);
    // Sync canvas dimensions for hit-testing
    const container = containerRef.current;
    if (container) {
      scene.init(container.clientWidth, container.clientHeight);
    }
  }

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!interactive || !scene) return;

      // Throttle to 16ms
      const now = performance.now();
      if (now - lastMoveTime.current < 16) return;
      lastMoveTime.current = now;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Ensure scene knows current dimensions
      scene.init(container.clientWidth, container.clientHeight);

      const layerIdx = scene.hitTestLayer(mouseX, mouseY);

      if (layerIdx >= 0) {
        const info = scene.getLayerInfo(layerIdx);
        if (info) {
          const label = LAYER_LABELS[info.name] || info.name;
          const healthPct = Math.round(info.health * 100);
          setTooltip({
            text: `${label}: ${info.count} active (${healthPct}% health)`,
            x: mouseX,
            y: mouseY,
            visible: true,
          });
          container.style.cursor = 'pointer';
          return;
        }
      }

      // No hit
      if (tooltip.visible) {
        setTooltip((prev) => ({ ...prev, visible: false }));
      }
      container.style.cursor = 'default';
    },
    [interactive, scene, tooltip.visible],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!interactive || !scene || !onLayerClick) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      scene.init(container.clientWidth, container.clientHeight);
      const layerIdx = scene.hitTestLayer(mouseX, mouseY);

      if (layerIdx >= 0) {
        const info = scene.getLayerInfo(layerIdx);
        if (info) {
          onLayerClick(info.name);
        }
      }
    },
    [interactive, scene, onLayerClick],
  );

  const handleMouseLeave = useCallback(() => {
    if (!interactive) return;
    setTooltip((prev) => ({ ...prev, visible: false }));
    if (containerRef.current) {
      containerRef.current.style.cursor = 'default';
    }
  }, [interactive]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onMouseMove={interactive ? handleMouseMove : undefined}
      onClick={interactive ? handleClick : undefined}
      onMouseLeave={interactive ? handleMouseLeave : undefined}
      style={{ position: 'relative' }}
    >
      <ParticleViz
        scene="moat"
        data={data}
        height={height}
      />
      {/* Tooltip overlay */}
      {interactive && tooltip.visible && (
        <div
          style={{
            ...TOOLTIP_STYLE,
            left: Math.min(
              tooltip.x + 12,
              (containerRef.current?.clientWidth ?? 300) - 200,
            ),
            top: tooltip.y - 36,
            opacity: tooltip.visible ? 1 : 0,
          }}
        >
          <span style={{ color: '#22d3ee', marginRight: '6px' }}>●</span>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
